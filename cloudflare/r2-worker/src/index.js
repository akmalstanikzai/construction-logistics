const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }),
  })
}

function corsHeaders(origin, extra = {}) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    ...extra,
  }
}

async function authenticatedUser(request, env) {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: authorization },
  })
  return response.ok ? response.json() : null
}

async function supabaseRequest(path, env, authorization, init = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: authorization,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
}

const PROJECT_FILE_TYPES = new Set([
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
])

async function projectDocumentRequest(request, env, origin, projectId, documentId) {
  if (!UUID_RE.test(projectId) || (documentId && !UUID_RE.test(documentId))) return json({ error: 'Not found' }, 404, origin)
  if (documentId ? request.method !== 'GET' : request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin)
  const user = await authenticatedUser(request, env)
  if (!user?.id) return json({ error: 'Sign in required' }, 401, origin)
  const authorization = request.headers.get('Authorization')
  const projectResponse = await supabaseRequest(`projects?id=eq.${projectId}&select=id&limit=1`, env, authorization)
  if (!projectResponse.ok) return json({ error: 'Could not verify project access' }, 502, origin)
  if (!(await projectResponse.json()).length) return json({ error: 'Project not found' }, 404, origin)

  if (request.method === 'POST') {
    const declaredLength = Number(request.headers.get('Content-Length') || 0)
    if (declaredLength > MAX_DOCUMENT_SIZE + 32 * 1024) return json({ error: 'File must be 10 MB or smaller' }, 413, origin)
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File) || !file.size || file.size > MAX_DOCUMENT_SIZE) return json({ error: 'Choose a file of 10 MB or less' }, 400, origin)
    const contentType = file.type.toLowerCase()
    if (!PROJECT_FILE_TYPES.has(contentType) && !/^image\/[a-z0-9.+-]+$/.test(contentType)) return json({ error: 'Unsupported document type' }, 415, origin)
    if (contentType === 'application/pdf' && new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !== '%PDF-') return json({ error: 'Invalid PDF file' }, 415, origin)
    const fileName = file.name.replace(/[\r\n/\\]/g, '_').slice(0, 180) || 'document'
    const key = `projects/${projectId}/${crypto.randomUUID()}`
    const saved = await env.NIC_DOCUMENTS.put(key, file, { httpMetadata: { contentType }, customMetadata: { projectId, uploadedBy: user.id } })
    if (!saved) return json({ error: 'Document storage failed' }, 502, origin)
    const insert = await supabaseRequest('project_documents?select=id', env, authorization, {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ project_id: projectId, file_name: fileName, content_type: contentType, r2_key: key }),
    })
    if (!insert.ok) {
      await env.NIC_DOCUMENTS.delete(key)
      return json({ error: 'Document could not be linked to this project' }, 502, origin)
    }
    return json({ id: (await insert.json())[0].id }, 201, origin)
  }

  const documentResponse = await supabaseRequest(`project_documents?id=eq.${documentId}&project_id=eq.${projectId}&select=file_name,content_type,r2_key&limit=1`, env, authorization)
  if (!documentResponse.ok) return json({ error: 'Could not verify document access' }, 502, origin)
  const [document] = await documentResponse.json()
  if (!document) return json({ error: 'Document not found' }, 404, origin)
  const object = await env.NIC_DOCUMENTS.get(document.r2_key)
  if (!object) return json({ error: 'Document file not found' }, 404, origin)
  const safeName = document.file_name.replace(/[^a-z0-9._ -]/gi, '_').replace(/["\r\n]/g, '_')
  return new Response(object.body, { headers: corsHeaders(origin, {
    'Content-Type': document.content_type,
    'Content-Disposition': `attachment; filename="${safeName}"`,
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
  }) })
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin')
    const allowedOrigins = (env.APP_ORIGINS || '').split(',').map((value) => value.trim())
    if (!origin || !allowedOrigins.includes(origin)) return new Response('Forbidden origin', { status: 403 })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })

    const path = new URL(request.url).pathname
    const projectMatch = path.match(/^\/projects\/([0-9a-f-]+)\/documents(?:\/([0-9a-f-]+))?$/i)
    if (projectMatch) {
      try { return await projectDocumentRequest(request, env, origin, projectMatch[1], projectMatch[2]) }
      catch (error) { console.error('Project document request failed', error); return json({ error: 'The document service encountered an error' }, 500, origin) }
    }
    const match = path.match(/^\/investors\/([0-9a-f-]+)\/nic$/i)
    if (!match || !UUID_RE.test(match[1])) return json({ error: 'Not found' }, 404, origin)
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, 405, origin)

    try {
      const user = await authenticatedUser(request, env)
      if (!user?.id) return json({ error: 'Sign in required' }, 401, origin)

      const investorId = match[1]
      const authorization = request.headers.get('Authorization')
      const investorQuery = `investors?id=eq.${investorId}&select=id,nic_r2_key&limit=1`
      const investorResponse = await supabaseRequest(investorQuery, env, authorization)
      if (!investorResponse.ok) return json({ error: 'Could not verify investor access' }, 502, origin)
      const [investor] = await investorResponse.json()
      if (!investor) return json({ error: 'Investor not found' }, 404, origin)

      if (request.method === 'POST') {
        if (investor.nic_r2_key) return json({ error: 'This investor already has a NID document' }, 409, origin)
        const declaredLength = Number(request.headers.get('Content-Length') || 0)
        if (declaredLength > MAX_DOCUMENT_SIZE + 32 * 1024) return json({ error: 'File must be 10 MB or smaller' }, 413, origin)
        const form = await request.formData()
        const file = form.get('file')
        if (!(file instanceof File) || file.size === 0) return json({ error: 'Choose a PDF or image file' }, 400, origin)
        if (file.size > MAX_DOCUMENT_SIZE) return json({ error: 'File must be 10 MB or smaller' }, 413, origin)
        const contentType = file.type.toLowerCase()
        if (contentType !== 'application/pdf' && !/^image\/[a-z0-9.+-]+$/.test(contentType)) return json({ error: 'Only PDF and image files are supported' }, 415, origin)
        const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer())
        if (contentType === 'application/pdf' && new TextDecoder().decode(bytes) !== '%PDF-') return json({ error: 'The selected file is not a valid PDF' }, 415, origin)

        const key = `investors/${investorId}/${crypto.randomUUID()}`
        const storedObject = await env.NIC_DOCUMENTS.put(key, file, {
          httpMetadata: { contentType },
          customMetadata: { investorId, uploadedBy: user.id },
        })
        if (!storedObject) return json({ error: 'R2 did not save the document' }, 502, origin)
        const updateQuery = `investors?id=eq.${investorId}&nic_r2_key=is.null&select=id,nic_r2_key`
        const updateResponse = await supabaseRequest(updateQuery, env, authorization, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ nic_r2_key: key }),
        })
        const updatedRows = updateResponse.ok ? await updateResponse.json() : []
        if (!updateResponse.ok || updatedRows.length !== 1 || updatedRows[0].nic_r2_key !== key) {
          await env.NIC_DOCUMENTS.delete(key)
          return json({ error: 'The document could not be linked to this investor' }, 409, origin)
        }
        return json({ key }, 201, origin)
      }

      if (!investor.nic_r2_key) return json({ error: 'No NID document is attached' }, 404, origin)
      const object = await env.NIC_DOCUMENTS.get(investor.nic_r2_key)
      if (!object) return json({ error: 'NID document was not found in R2' }, 404, origin)
      const contentType = object.httpMetadata?.contentType || 'application/pdf'
      const extension = contentType === 'application/pdf' ? 'pdf' : contentType.split('/')[1]?.replace(/[^a-z0-9]+/gi, '') || 'image'
      return new Response(object.body, {
        headers: corsHeaders(origin, {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="investor-nid.${extension}"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        }),
      })
    } catch (error) {
      console.error('Investor document request failed', error)
      return json({ error: 'The document service encountered an error' }, 500, origin)
    }
  },
}
