import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'

const emptyProject = { name: '', code_number: '', organization: '', location: '', total_price: '', start_date: '', end_date: '', status: 'in_progress', note: '', files: [] }
const statusLabels = { in_progress: 'In progress', submitted: 'Submitted', completed: 'Completed' }
const workerUrl = import.meta.env.VITE_R2_WORKER_URL?.replace(/\/$/, '')

function formatPrice(value) {
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function token() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Your session expired. Sign in again.')
  return session.access_token
}

function ProjectsPage() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyProject)
  const [saving, setSaving] = useState(false)
  const [uploadingId, setUploadingId] = useState(null)
  const [updatingId, setUpdatingId] = useState(null)

  const loadProjects = useCallback(async () => {
    const { data: rows, error: projectError } = await supabase.from('projects')
      .select('id, name, code_number, organization, location, total_price, start_date, end_date, status, note, created_at')
      .order('created_at', { ascending: false })
    if (projectError) { setError(projectError.message); setLoading(false); return }
    if (!rows.length) { setProjects([]); setError(''); setLoading(false); return }
    const { data: documents, error: documentError } = await supabase.from('project_documents')
      .select('id, project_id, file_name, content_type, created_at')
      .in('project_id', rows.map((row) => row.id))
      .order('created_at', { ascending: false })
    if (documentError) { setError(documentError.message); setLoading(false); return }
    const byProject = new Map()
    for (const document of documents) byProject.set(document.project_id, [...(byProject.get(document.project_id) ?? []), document])
    setProjects(rows.map((row) => ({ ...row, documents: byProject.get(row.id) ?? [] })))
    setError('')
    setLoading(false)
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Load projects on mount.
    loadProjects()
  }, [loadProjects])

  async function uploadDocument(projectId, file) {
    if (!workerUrl) throw new Error('The document Worker URL is not configured.')
    if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Each file must be 10 MB or smaller.')
    const body = new FormData()
    body.append('file', file)
    const response = await fetch(`${workerUrl}/projects/${projectId}/documents`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}` }, body })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || `Upload failed (HTTP ${response.status}).`)
  }

  async function saveProject(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (form.end_date < form.start_date) { setError('End date must be on or after the start date.'); return }
    if (form.files.length && !workerUrl) { setError('The document Worker URL is not configured.'); return }
    setSaving(true)
    const { data: project, error: createError } = await supabase.from('projects').insert({
      name: form.name.trim(), code_number: form.code_number.trim(), organization: form.organization.trim(), location: form.location.trim(),
      total_price: Number(form.total_price), start_date: form.start_date, end_date: form.end_date, status: form.status, note: form.note.trim(),
    }).select('id').single()
    if (createError) { setError(createError.message); setSaving(false); return }
    const failed = []
    for (const file of form.files) {
      try { await uploadDocument(project.id, file) }
      catch (uploadError) { failed.push(`${file.name}: ${uploadError.message}`) }
    }
    setSaving(false)
    setForm(emptyProject)
    setModalOpen(false)
    setExpandedId(project.id)
    await loadProjects()
    if (failed.length) setError(`Project saved, but some documents failed to upload: ${failed.join('; ')}`)
    else setNotice('Project added successfully.')
  }

  async function attachDocuments(project, event) {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return
    setUploadingId(project.id)
    setError('')
    const failed = []
    for (const file of files) {
      try { await uploadDocument(project.id, file) }
      catch (uploadError) { failed.push(`${file.name}: ${uploadError.message}`) }
    }
    await loadProjects()
    setUploadingId(null)
    event.target.value = ''
    if (failed.length) setError(`Some documents failed to upload: ${failed.join('; ')}`)
    else setNotice('Documents attached successfully.')
  }

  async function updateStatus(project, status) {
    setUpdatingId(project.id)
    setError('')
    const { error: updateError } = await supabase.from('projects').update({ status }).eq('id', project.id)
    if (updateError) setError(updateError.message)
    else { await loadProjects(); setNotice('Project status updated.') }
    setUpdatingId(null)
  }

  async function downloadDocument(project, document) {
    try {
      if (!workerUrl) throw new Error('The document Worker URL is not configured.')
      const response = await fetch(`${workerUrl}/projects/${project.id}/documents/${document.id}`, { headers: { Authorization: `Bearer ${await token()}` } })
      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(result.error || 'Could not download document.')
      }
      const url = URL.createObjectURL(await response.blob())
      const link = window.document.createElement('a')
      link.href = url
      link.download = document.file_name
      window.document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (downloadError) { setError(downloadError.message) }
  }

  const visible = projects.filter((project) => `${project.name} ${project.code_number} ${project.organization} ${project.location}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  return <section className="investors-page projects-page" aria-label="Projects">
    <header className="investors-header"><div><p className="investors-eyebrow">ASMA AFGHAN</p><h1>Projects</h1><p className="investors-subtitle">Project records, status, and documents.</p></div><button className="add-investor-button" onClick={() => { setError(''); setModalOpen(true) }}><span aria-hidden="true">+</span> Add project</button></header>
    {notice && <div className="investors-notice" role="status">{notice}</div>}
    {error && <div className="investors-alert" role="alert">{error}</div>}
    <div className="investor-list-heading"><h2>All projects</h2><span>{visible.length} {visible.length === 1 ? 'project' : 'projects'}</span><label className="investor-search"><span className="sr-only">Search projects</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" /></label></div>
    {loading ? <div className="investors-state"><span className="loader" /></div> : projects.length === 0 ? <div className="investors-empty"><h2>No projects yet</h2><p>Add your first project to start the register.</p><button className="add-investor-button secondary" onClick={() => setModalOpen(true)}>Add project</button></div> : visible.length === 0 ? <div className="investors-empty investor-search-empty"><h2>No matching projects</h2></div> : <div className="investor-cards">{visible.map((project) => {
      const expanded = expandedId === project.id
      return <article className="investor-card project-card" key={project.id}>
        <div className="project-card-main"><div className="project-icon" aria-hidden="true">▤</div><div className="project-title"><h2>{project.name}</h2><p>{project.code_number} · {project.organization}</p></div><span className={`project-status status-${project.status}`}>{statusLabels[project.status]}</span></div>
        <div className="project-card-summary"><div><span>Location</span><strong>{project.location}</strong></div><div><span>Total price</span><strong>{formatPrice(project.total_price)}</strong></div><div><span>Dates</span><strong>{project.start_date} – {project.end_date}</strong></div><button type="button" className="investor-expand" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : project.id)}>{expanded ? 'Hide details' : 'View details'} <span aria-hidden="true">{expanded ? '⌃' : '⌄'}</span></button></div>
        {expanded && <div className="project-expanded"><div className="project-status-control"><label>Project status<select value={project.status} disabled={updatingId === project.id} onChange={(event) => updateStatus(project, event.target.value)}><option value="in_progress">In progress</option><option value="submitted">Submitted</option><option value="completed">Completed</option></select></label></div><div className="project-note"><span>Note</span><p>{project.note || '—'}</p></div><div className="project-doc-heading"><div><h3>Documents</h3><p>{project.documents.length} attached</p></div><label className="cancel-button project-attach">{uploadingId === project.id ? 'Uploading…' : '+ Attach documents'}<input type="file" multiple accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.txt" disabled={uploadingId === project.id} onChange={(event) => attachDocuments(project, event)} /></label></div>{project.documents.length ? <div className="project-doc-list">{project.documents.map((document) => <button key={document.id} type="button" onClick={() => downloadDocument(project, document)}><span>▤</span>{document.file_name}<small>Download</small></button>)}</div> : <p className="investment-empty">No documents attached yet.</p>}</div>}
      </article>
    })}</div>}
    {modalOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModalOpen(false) }}><section className="investor-modal project-modal" role="dialog" aria-modal="true" aria-labelledby="project-modal-title"><header className="modal-header"><div><p className="investors-eyebrow">PROJECT REGISTER</p><h2 id="project-modal-title">Add project</h2></div><button className="modal-close" disabled={saving} onClick={() => setModalOpen(false)} aria-label="Close">×</button></header><form className="investor-form" onSubmit={saveProject}>
      <div className="form-two-col"><label>Project name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoFocus /></label><label>Code number<input required value={form.code_number} onChange={(event) => setForm({ ...form, code_number: event.target.value })} /></label></div>
      <div className="form-two-col project-form-row"><label>Respective organization<input required value={form.organization} onChange={(event) => setForm({ ...form, organization: event.target.value })} /></label><label>Location<input required value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></label></div>
      <div className="form-two-col project-form-row"><label>Total price<input type="number" min="0" step="0.01" required value={form.total_price} onChange={(event) => setForm({ ...form, total_price: event.target.value })} /></label><label>Project status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="in_progress">In progress</option><option value="submitted">Submitted</option><option value="completed">Completed</option></select></label></div>
      <div className="form-two-col project-form-row"><label>Start date<input type="date" required value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} /></label><label>End date<input type="date" required min={form.start_date} value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} /></label></div>
      <label className="full-label investment-note-label">Note<textarea rows="3" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
      <label className="project-file-picker">Attach documents (contracts, PDFs, images, or office files)<input type="file" multiple accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.txt" onChange={(event) => setForm({ ...form, files: Array.from(event.target.files ?? []) })} /><span>{form.files.length ? form.files.map((file) => file.name).join(', ') : 'Choose files · 10 MB each'}</span></label>
      <footer className="modal-actions"><button className="cancel-button" type="button" disabled={saving} onClick={() => setModalOpen(false)}>Cancel</button><button className="add-investor-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save project'}</button></footer>
    </form></section></div>}
  </section>
}

export default ProjectsPage
