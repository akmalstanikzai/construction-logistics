import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import DocumentPreview from '../components/DocumentPreview'

const blank = { first_name: '', last_name: '', phone_number: '', inheritor_name: '', inheritor_phone_number: '', file: null }
const workerUrl = import.meta.env.VITE_R2_WORKER_URL?.replace(/\/$/, '')

async function documentRequest(id, method, file) {
  if (!workerUrl) throw new Error('The document Worker URL is not configured.')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Your session expired. Sign in again.')
  const body = file ? new FormData() : undefined
  if (body) body.append('file', file)
  const response = await fetch(`${workerUrl}/muzaribs/${id}/nic`, { method, headers: { Authorization: `Bearer ${session.access_token}` }, body })
  if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || `Document request failed (HTTP ${response.status}).`) }
  return response
}

function MuzaribsPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [form, setForm] = useState(blank)
  const [editingId, setEditingId] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(null)
  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('muzaribs').select('id, first_name, last_name, phone_number, inheritor_name, inheritor_phone_number, nic_r2_key').order('last_name').order('first_name')
    if (loadError) setError(loadError.message)
    else { setRows(data); setError('') }
    setLoading(false)
  }, [])
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Load records from Supabase on mount.
    load()
  }, [load])
  const visible = rows.filter((row) => `${row.first_name} ${row.last_name}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  async function save(event) {
    event.preventDefault()
    setSaving(true); setError(''); setNotice('')
    try {
      if (form.file && (!form.file.size || form.file.size > 10 * 1024 * 1024 || !(form.file.type === 'application/pdf' || form.file.type.startsWith('image/')))) throw new Error('Choose a PDF or image of 10 MB or less.')
      if (form.file?.type === 'application/pdf' && new TextDecoder().decode(await form.file.slice(0, 5).arrayBuffer()) !== '%PDF-') throw new Error('Choose a valid PDF file.')
      if (form.file && !workerUrl) throw new Error('The document Worker URL is not configured.')
      const { file } = form
      const values = Object.fromEntries(['first_name', 'last_name', 'phone_number', 'inheritor_name', 'inheritor_phone_number'].map((key) => [key, form[key].trim()]))
      const query = editingId ? supabase.from('muzaribs').update(values).eq('id', editingId) : supabase.from('muzaribs').insert(values)
      const { data, error: saveError } = await query.select('id').single()
      if (saveError) throw saveError
      let uploadError = null
      if (file) try { await documentRequest(data.id, 'POST', file) } catch (failure) { uploadError = failure }
      setModalOpen(false); setForm(blank); setEditingId(null)
      await load()
      if (uploadError) setError(`Muzarib saved, but the document upload failed: ${uploadError.message}`)
      else setNotice('Muzarib saved successfully.')
    } catch (failure) { setError(failure.message) }
    setSaving(false)
  }
  async function remove(row) {
    if (!window.confirm(`Delete ${row.first_name} ${row.last_name}? Projects linked to this Muzarib will prevent deletion.`)) return
    try {
      const { count, error: projectError } = await supabase.from('projects').select('id', { count: 'exact', head: true }).eq('muzarib_id', row.id)
      if (projectError) throw projectError
      if (count) throw new Error('This Muzarib is associated with a project. Remove that association before deleting.')
      if (row.nic_r2_key) await documentRequest(row.id, 'DELETE')
      const { error: deleteError } = await supabase.from('muzaribs').delete().eq('id', row.id)
      if (deleteError) throw deleteError
      await load(); setNotice('Muzarib deleted.')
    } catch (failure) { setError(failure.message) }
  }
  async function openDocument(row) {
    try {
      const response = await documentRequest(row.id, 'GET')
      const blob = await response.blob()
      setPreview({ url: URL.createObjectURL(blob), type: blob.type, name: `${row.first_name}-${row.last_name}-document` })
    } catch (failure) { setError(failure.message) }
  }
  return <section className="investors-page" aria-label="Muzaribs">
    <header className="investors-header"><div><p className="investors-eyebrow">ASMA AFGHAN</p><h1>Muzaribs</h1><p className="investors-subtitle">Muzarib records and inheritance contacts.</p></div><button className="add-investor-button" onClick={() => { setForm(blank); setEditingId(null); setModalOpen(true) }}>+ Add Muzarib</button></header>
    {notice && <div className="investors-notice" role="status">{notice}</div>}{error && <div className="investors-alert" role="alert">{error}</div>}
    <div className="investor-list-heading"><h2>Muzaribs</h2><span>{visible.length} {visible.length === 1 ? 'person' : 'people'}</span><label className="investor-search"><span className="sr-only">Search Muzaribs</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Muzaribs" /></label></div>
    {loading ? <div className="investors-state"><span className="loader" /></div> : !rows.length ? <div className="investors-empty"><h2>No Muzaribs yet</h2><p>Add a Muzarib to start your register.</p></div> : <div className="investor-cards">{visible.map((row) => <article className="investor-card" key={row.id}><div className="project-card-main"><div className="project-icon" aria-hidden="true">◇</div><div className="project-title"><h2>{row.first_name} {row.last_name}</h2><p>{row.phone_number}</p></div></div><div className="project-card-summary"><div><span>Inheritor</span><strong>{row.inheritor_name}</strong></div><div><span>Inheritor number</span><strong>{row.inheritor_phone_number}</strong></div><div className="record-actions"><button type="button" onClick={() => { setForm({ ...blank, ...row }); setEditingId(row.id); setModalOpen(true) }}>Edit</button><button type="button" className="record-delete" onClick={() => remove(row)}>Delete</button></div></div><div className="record-actions" style={{ padding: '0 24px 20px' }}>{row.nic_r2_key ? <button type="button" onClick={() => openDocument(row)}>View document</button> : <label className="cancel-button project-attach">Attach document<input type="file" accept="application/pdf,image/*" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { await documentRequest(row.id, 'POST', file); await load(); setNotice('Document attached.') } catch (failure) { setError(failure.message) } event.target.value = '' }} /></label>}</div></article>)}</div>}
    <DocumentPreview preview={preview} onClose={() => setPreview(null)} />
    {modalOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModalOpen(false) }}><section className="investor-modal" role="dialog" aria-modal="true" aria-labelledby="muzarib-modal-title"><header className="modal-header"><div><p className="investors-eyebrow">MUZARIB REGISTER</p><h2 id="muzarib-modal-title">{editingId ? 'Edit Muzarib' : 'Add Muzarib'}</h2></div><button className="modal-close" onClick={() => setModalOpen(false)} aria-label="Close">×</button></header><form className="investor-form" onSubmit={save}><div className="form-two-col"><label>First name<input required value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} /></label><label>Last name<input required value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} /></label></div><label className="full-label">Number<input required type="tel" value={form.phone_number} onChange={(event) => setForm({ ...form, phone_number: event.target.value })} /></label><div className="form-two-col"><label>Inheritor name<input required value={form.inheritor_name} onChange={(event) => setForm({ ...form, inheritor_name: event.target.value })} /></label><label>Inheritor number<input required type="tel" value={form.inheritor_phone_number} onChange={(event) => setForm({ ...form, inheritor_phone_number: event.target.value })} /></label></div>{(!editingId || !rows.find((row) => row.id === editingId)?.nic_r2_key) && <label className="project-file-picker">Document (PDF or image, up to 10 MB)<input type="file" accept="application/pdf,image/*" onChange={(event) => setForm({ ...form, file: event.target.files?.[0] || null })} /><span>{form.file?.name || 'Choose file'}</span></label>}<footer className="modal-actions"><button className="cancel-button" type="button" onClick={() => setModalOpen(false)}>Cancel</button><button className="add-investor-button" disabled={saving}>{saving ? 'Saving…' : 'Save Muzarib'}</button></footer></form></section></div>}
  </section>
}
export default MuzaribsPage
