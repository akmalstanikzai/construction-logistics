const MAX_PDF_SIZE = 10 * 1024 * 1024
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin')
    const allowedOrigins = (env.APP_ORIGINS || '').split(',').map((value) => value.trim())
    if (!origin || !allowedOrigins.includes(origin)) return new Response('Forbidden origin', { status: 403 })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })

    const match = new URL(request.url).pathname.match(/^\/investors\/([0-9a-f-]+)\/nic$/i)
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
        if (investor.nic_r2_key) return json({ error: 'This investor already has a NIC PDF' }, 409, origin)
        const declaredLength = Number(request.headers.get('Content-Length') || 0)
        if (declaredLength > MAX_PDF_SIZE + 32 * 1024) return json({ error: 'PDF must be 10 MB or smaller' }, 413, origin)
        const form = await request.formData()
        const file = form.get('file')
        if (!(file instanceof File) || file.size === 0) return json({ error: 'Choose a PDF file' }, 400, origin)
        if (file.size > MAX_PDF_SIZE) return json({ error: 'PDF must be 10 MB or smaller' }, 413, origin)
        const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer())
        if (new TextDecoder().decode(bytes) !== '%PDF-') return json({ error: 'The selected file is not a valid PDF' }, 415, origin)

        const key = `investors/${investorId}/${crypto.randomUUID()}.pdf`
        const storedObject = await env.NIC_DOCUMENTS.put(key, file, {
          httpMetadata: { contentType: 'application/pdf', contentDisposition: 'inline; filename="investor-nic.pdf"' },
          customMetadata: { investorId, uploadedBy: user.id },
        })
        if (!storedObject) return json({ error: 'R2 did not save the PDF' }, 502, origin)
        const updateQuery = `investors?id=eq.${investorId}&nic_r2_key=is.null&select=id,nic_r2_key`
        const updateResponse = await supabaseRequest(updateQuery, env, authorization, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ nic_r2_key: key }),
        })
        const updatedRows = updateResponse.ok ? await updateResponse.json() : []
        if (!updateResponse.ok || updatedRows.length !== 1 || updatedRows[0].nic_r2_key !== key) {
          await env.NIC_DOCUMENTS.delete(key)
          return json({ error: 'The PDF could not be linked to this investor' }, 409, origin)
        }
        return json({ key }, 201, origin)
      }

      if (!investor.nic_r2_key) return json({ error: 'No NIC PDF is attached' }, 404, origin)
      const object = await env.NIC_DOCUMENTS.get(investor.nic_r2_key)
      if (!object) return json({ error: 'NIC PDF was not found in R2' }, 404, origin)
      return new Response(object.body, {
        headers: corsHeaders(origin, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="investor-nic.pdf"',
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
