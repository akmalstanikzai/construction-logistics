import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import DocumentPreview from '../components/DocumentPreview'

const types = [
  ['security', 'Guarantee'],
  ['money_transfer_commission', 'Money transfer commission'],
  ['goods_purchases', "Good's purchases"],
  ['transportation_customs', 'Transportation and customs'],
  ['installation', 'Installation'],
  ['miscellaneous', 'Miscellaneous'],
  ['tax', 'Tax'],
]
const labels = Object.fromEntries(types)
const workerUrl = import.meta.env.VITE_R2_WORKER_URL?.replace(/\/$/, '')
const newExpense = () => ({ expense_date: '', amount: '', note: '', funding_partner_id: '', file: null })
const money = (value) => Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Your session expired. Sign in again.')
  return session.access_token
}

function ExpensesPage() {
  const [partners, setPartners] = useState([])
  const [projects, setProjects] = useState([])
  const [settings, setSettings] = useState([])
  const [expenses, setExpenses] = useState([])
  const [documents, setDocuments] = useState([])
  const [financialSettings, setFinancialSettings] = useState([])
  const [taxRate, setTaxRate] = useState('0')
  const [projectId, setProjectId] = useState('')
  const [activeType, setActiveType] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [form, setForm] = useState(newExpense)
  const [editingExpenseId, setEditingExpenseId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState(null)
  const closePreview = useCallback(() => setPreview(null), [])

  const load = useCallback(async () => {
    const [projectResult, settingResult, expenseResult, documentResult, financialResult, partnerResult] = await Promise.all([
      supabase.from('projects').select('id, name, code_number, total_price, project_base, project_partners(partner_id)').order('name'),
      supabase.from('project_expense_types').select('project_id, expense_type, enabled'),
      supabase.from('project_expenses').select('id, project_id, expense_type, expense_date, amount, note, funding_partner_id, created_at').order('expense_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('project_documents').select('id, project_id, expense_id, file_name, content_type').not('expense_id', 'is', null),
      supabase.from('project_financial_settings').select('project_id, tax_percentage, charity_percentage, investor_percentage'),
      supabase.from('partners').select('id, first_name, last_name').order('last_name'),
    ])
    const loadError = [projectResult, settingResult, expenseResult, documentResult, financialResult, partnerResult].find((result) => result.error)?.error
    if (loadError) setError(loadError.message)
    else {
      setPartners(partnerResult.data)
      setProjects(projectResult.data)
      setSettings(settingResult.data)
      setExpenses(expenseResult.data)
      setDocuments(documentResult.data)
      setFinancialSettings(financialResult.data)
      setProjectId((current) => current || projectResult.data[0]?.id || '')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Load expense records on mount.
    load()
  }, [load])

  useEffect(() => {
    setTaxRate(String(financialSettings.find((item) => item.project_id === projectId)?.tax_percentage ?? 0))
  }, [projectId, financialSettings])

  async function saveTax(event) {
    event.preventDefault()
    const rate = Number(taxRate)
    if (taxRate === '' || !Number.isFinite(rate) || rate < 0 || rate > 100) { setError('Enter a tax percentage from 0 to 100.'); return }
    setBusy(true); setError(''); setNotice('')
    const existing = financialSettings.find((item) => item.project_id === projectId)
    const { error: saveError } = existing
      ? await supabase.from('project_financial_settings').update({ tax_percentage: rate }).eq('project_id', projectId)
      : await supabase.from('project_financial_settings').insert({ project_id: projectId, tax_percentage: rate, investor_percentage: projects.find((item) => item.id === projectId)?.project_base === 'Muzarebah' ? 15 : 20 })
    if (saveError) setError(saveError.message)
    else { setFinancialSettings((current) => [...current.filter((item) => item.project_id !== projectId), { ...existing, project_id: projectId, tax_percentage: rate }]); setNotice('Tax percentage saved for this project.') }
    setBusy(false)
  }

  async function toggle(type, enabled) {
    setBusy(true)
    setError('')
    setNotice('')
    const existing = settings.some((item) => item.project_id === projectId && item.expense_type === type)
    const result = existing
      ? await supabase.from('project_expense_types').update({ enabled }).eq('project_id', projectId).eq('expense_type', type)
      : await supabase.from('project_expense_types').insert({ project_id: projectId, expense_type: type, enabled })
    if (result.error) setError(result.error.message)
    else {
      setSettings((current) => [...current.filter((item) => item.project_id !== projectId || item.expense_type !== type), { project_id: projectId, expense_type: type, enabled }])
      if (!enabled && activeType === type) setActiveType('')
    }
    setBusy(false)
  }

  async function upload(expenseId, file) {
    if (!workerUrl) throw new Error('The document Worker URL is not configured.')
    const body = new FormData()
    body.append('file', file)
    body.append('expense_id', expenseId)
    const response = await fetch(`${workerUrl}/projects/${projectId}/documents`, { method: 'POST', headers: { Authorization: `Bearer ${await accessToken()}` }, body })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || `Upload failed (HTTP ${response.status}).`)
  }

  async function saveExpense(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    if (form.file && (!form.file.size || form.file.size > 10 * 1024 * 1024)) {
      setError('The attachment must be 10 MB or smaller.')
      setBusy(false)
      return
    }
    if (form.file && !workerUrl) { setError('The document Worker URL is not configured.'); setBusy(false); return }
    const payload = {
      project_id: projectId, expense_type: activeType, expense_date: form.expense_date || null,
      funding_partner_id: projects.find((item) => item.id === projectId)?.project_base === 'Musharekah' ? form.funding_partner_id || null : null,
      amount: form.amount === '' ? null : Number(form.amount), note: form.note.trim(),
    }
    const { data, error: saveError } = await (editingExpenseId ? supabase.from('project_expenses').update({ expense_date: payload.expense_date, amount: payload.amount, note: payload.note, funding_partner_id: payload.funding_partner_id }).eq('id', editingExpenseId) : supabase.from('project_expenses').insert(payload)).select('id').single()
    if (saveError) { setError(saveError.message); setBusy(false); return }
    if (form.file) {
      try { await upload(data.id, form.file) }
      catch (uploadError) { setError(`Expense saved, but its attachment failed: ${uploadError.message}`) }
    }
    const wasEditing = Boolean(editingExpenseId)
    setForm(newExpense())
    setEditingExpenseId(null)
    setActiveType('')
    setSelectedType(activeType)
    await load()
    if (!form.file) setNotice(wasEditing ? 'Expense updated successfully.' : 'Expense added successfully.')
    setBusy(false)
  }


  function editExpense(item) {
    setEditingExpenseId(item.id)
    setActiveType(item.expense_type)
    setForm({ expense_date: item.expense_date || '', amount: String(item.amount), note: item.note || '', funding_partner_id: item.funding_partner_id || '', file: null })
    setError('')
  }

  async function deleteExpense(item) {
    if (!window.confirm('Delete this expense and its attachment?')) return
    setBusy(true); setError(''); setNotice('')
    try {
      const attachment = documents.find((document) => document.expense_id === item.id)
      if (attachment) await deleteExpenseDocument(attachment, false)
      const { error: deleteError } = await supabase.from('project_expenses').delete().eq('id', item.id)
      if (deleteError) throw deleteError
      await load()
      setNotice('Expense deleted.')
    } catch (deleteError) { setError(deleteError.message) }
    setBusy(false)
  }

  async function renameExpenseDocument(document) {
    const name = window.prompt('Document name', document.file_name)?.trim()
    if (!name || name === document.file_name) return
    const { error: renameError } = await supabase.from('project_documents').update({ file_name: name }).eq('id', document.id)
    if (renameError) setError(renameError.message)
    else { await load(); setNotice('Attachment renamed.') }
  }

  async function deleteExpenseDocument(document, refresh = true) {
    if (!workerUrl) throw new Error('The document Worker URL is not configured.')
    const response = await fetch(`${workerUrl}/projects/${projectId}/documents/${document.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${await accessToken()}` } })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.error || 'Could not delete attachment.')
    }
    if (refresh) { await load(); setNotice('Attachment deleted.') }
  }

  async function previewDocument(document) {
    try {
      if (!workerUrl) throw new Error('The document Worker URL is not configured.')
      const response = await fetch(`${workerUrl}/projects/${projectId}/documents/${document.id}`, { headers: { Authorization: `Bearer ${await accessToken()}` } })
      if (!response.ok) throw new Error('Could not download the attachment.')
      const blob = await response.blob()
      setPreview({ url: URL.createObjectURL(blob), type: blob.type || document.content_type || '', name: document.file_name })
    } catch (downloadError) { setError(downloadError.message) }
  }

  const project = projects.find((item) => item.id === projectId)
  const projectExpenses = expenses.filter((item) => item.project_id === projectId)
  const recordedTotal = projectExpenses.reduce((sum, item) => sum + Number(item.amount), 0)
  const taxEnabled = settings.some((item) => item.project_id === projectId && item.expense_type === 'tax' && item.enabled)
  const taxAmount = taxEnabled ? round(Number(project?.total_price || 0) * Number(taxRate || 0) / 100) : 0
  const total = recordedTotal + taxAmount
  const isMusharekah = project?.project_base === 'Musharekah'
  const projectPartners = (project?.project_partners || []).map((link) => partners.find((person) => person.id === link.partner_id)).filter(Boolean)
  const fundingTotals = [
    { id: '', name: 'Investors balance' },
    ...projectPartners.map((person) => ({ id: person.id, name: `${person.first_name} ${person.last_name}` })),
  ].map((source) => ({ ...source, amount: projectExpenses.filter((item) => (item.funding_partner_id || '') === source.id).reduce((sum, item) => sum + Number(item.amount), 0) }))
  // Automatic tax has no payer until a payment is recorded; keep it visible separately.
  if (taxAmount) fundingTotals.push({ id: 'tax', name: 'Calculated tax (unassigned)', amount: taxAmount })
  const availableTypes = types
  const enabledTypes = availableTypes.filter(([key]) => settings.some((item) => item.project_id === projectId && item.expense_type === key && item.enabled))
  const currentType = selectedType && availableTypes.some(([key]) => key === selectedType) ? selectedType : enabledTypes[0]?.[0] || availableTypes[0][0]
  const selectedExpenses = projectExpenses.filter((item) => item.expense_type === currentType)
  const selectedEnabled = enabledTypes.some(([key]) => key === currentType)

  return <section className="investors-page expenses-page" aria-label="Project expenses">
    <header className="investors-header"><div><p className="investors-eyebrow">ASMA AFGHAN</p><h1>Expenses</h1><p className="investors-subtitle">Manage expense types and records for each project. Tax is calculated as a percentage of the project total.</p></div></header>
    {notice && <div className="investors-notice" role="status">{notice}</div>}
    {error && <div className="investors-alert" role="alert">{error}</div>}
    {loading ? <div className="investors-state"><span className="loader" /></div> : !projects.length ? <div className="investors-empty"><h2>No projects yet</h2><p>Add a project before recording expenses.</p></div> : <>
      <div className="expense-toolbar"><label>Choose a project<select value={projectId} onChange={(event) => { setProjectId(event.target.value); setActiveType(''); setSelectedType(''); setNotice(''); setError('') }}>{projects.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code_number}</option>)}</select></label><div className="expense-total"><span>Total recorded expenses</span><strong>{money(total)}</strong><small>{projectExpenses.length} recorded {projectExpenses.length === 1 ? 'entry' : 'entries'}{taxEnabled ? ' + tax' : ''}</small></div></div>
      {isMusharekah && <section className="funding-summary" aria-label="Expenses by funding source"><h2>Expenses by funding source</h2><p>Each source’s share of all project expenses, across all expense types. Calculated tax is shown separately until paid.</p>{fundingTotals.map((source) => <div className="profit-line" key={source.id}><span>{source.name}</span><strong>{money(source.amount)} <small>({total > 0 ? (source.amount / total * 100).toFixed(2) : '0.00'}%)</small></strong></div>)}</section>}
      <div className="expense-intro"><div><p className="expense-step">STEP 1 · CHOOSE A TYPE</p><h2>Expenses for {project?.name}</h2><p>Switch on the types this project needs. Choose a type to view its entries.</p></div><span className="expense-enabled-count">{enabledTypes.length} of {availableTypes.length} enabled</span></div>
      <div className="expense-workspace"><div className="expense-type-list">{availableTypes.map(([key, label]) => {
        const enabled = enabledTypes.some(([type]) => type === key)
        const items = projectExpenses.filter((item) => item.expense_type === key)
        return <div className={`expense-type-row ${currentType === key ? 'selected' : ''}`} key={key}>
          <button type="button" className="expense-type-choice" aria-current={currentType === key ? 'true' : undefined} onClick={() => setSelectedType(key)}><span className="expense-type-name">{label}</span><span className="expense-type-meta">{key === 'tax' ? `${taxRate}% · ${money(taxAmount)}` : `${items.length} ${items.length === 1 ? 'entry' : 'entries'} · ${money(items.reduce((sum, item) => sum + Number(item.amount), 0))}`}</span></button>
          <label className="expense-switch"><input type="checkbox" checked={enabled} disabled={busy} aria-label={`${label} expenses for ${project?.name}`} onChange={(event) => toggle(key, event.target.checked)} /><span className="expense-switch-track" aria-hidden="true" /><span className="expense-switch-state">{enabled ? 'On' : 'Off'}</span></label>
        </div>
      })}</div><div className="expense-detail"><div className="expense-detail-header"><div><p className="expense-step">STEP 2 · REVIEW AND ADD</p><h2>{labels[currentType]}</h2><p>{currentType === 'tax' ? 'Calculated from this project’s total price and included in expenses when Tax is on.' : selectedEnabled ? `${selectedExpenses.length} ${selectedExpenses.length === 1 ? 'entry' : 'entries'} recorded for this project` : 'This type is off for this project. Turn it on to add expenses.'}</p></div>{selectedEnabled && currentType !== 'tax' && <button className="add-investor-button" onClick={() => { setEditingExpenseId(null); setActiveType(currentType); setForm(newExpense()); setError('') }}>+ Add expense</button>}</div>
        {currentType === 'tax' && <form className="tax-form" onSubmit={saveTax}><label>Tax percentage<div className="tax-input"><input type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} /><span>%</span></div></label><div className="tax-calculation"><span>{money(project?.total_price || 0)} × {taxRate || 0}%</span><strong>{money(taxAmount)}</strong><small>{taxEnabled ? 'Included in total expenses' : 'Turn on Tax to include this amount'}</small></div><button className="add-investor-button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save tax rate'}</button></form>}
        {currentType !== 'tax' && (selectedExpenses.length ? <div className="expense-records">{selectedExpenses.map((item) => {
          const attachment = documents.find((document) => document.expense_id === item.id)
          return <div className="expense-record" key={item.id}><div><strong>{money(item.amount)}</strong><span>{item.expense_date}</span>{isMusharekah && <p>Paid from: {item.funding_partner_id ? fundingTotals.find((source) => source.id === item.funding_partner_id)?.name || 'Partner' : 'Investors balance'}</p>}{item.note && <p>{item.note}</p>}</div><div className="record-actions"><button type="button" onClick={() => editExpense(item)}>Edit</button><button type="button" className="record-delete" onClick={() => deleteExpense(item)}>Delete</button>{attachment && <><button type="button" onClick={() => previewDocument(attachment)}>View {attachment.file_name}</button><button type="button" onClick={() => renameExpenseDocument(attachment)}>Rename attachment</button><button type="button" className="record-delete" onClick={async () => { if (!window.confirm(`Delete ${attachment.file_name}?`)) return; try { await deleteExpenseDocument(attachment) } catch (deleteError) { setError(deleteError.message) } }}>Delete attachment</button></>}</div></div>
        })}</div> : <div className="expense-detail-empty"><strong>No {labels[currentType].toLowerCase()} expenses yet</strong><p>{selectedEnabled ? 'Use Add expense to record the first one.' : 'Switch this type on when the project needs it.'}</p></div>)}
      </div></div>
    </>}
    <DocumentPreview preview={preview} onClose={closePreview} />
    {activeType && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setActiveType('') }}><section className="investor-modal" role="dialog" aria-modal="true" aria-labelledby="expense-modal-title"><header className="modal-header"><div><p className="investors-eyebrow">{project?.name}</p><h2 id="expense-modal-title">{editingExpenseId ? 'Edit' : 'Add'} {labels[activeType]} expense</h2></div><button className="modal-close" disabled={busy} onClick={() => setActiveType('')} aria-label="Close">×</button></header><form className="investor-form" onSubmit={saveExpense}><div className="form-two-col"><label>Date<input type="date" value={form.expense_date} onChange={(event) => setForm({ ...form, expense_date: event.target.value })} /></label><label>Amount<input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label></div>{isMusharekah && <label className="full-label">Paid from<select value={form.funding_partner_id} onChange={(event) => setForm({ ...form, funding_partner_id: event.target.value })}><option value="">Investors balance</option>{projectPartners.map((person) => <option key={person.id} value={person.id}>{person.first_name} {person.last_name}</option>)}</select></label>}<label className="full-label investment-note-label">Note<textarea rows="3" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label><label className="expense-upload">Document attachment (optional)<input type="file" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.txt" onChange={(event) => setForm({ ...form, file: event.target.files?.[0] || null })} /><small>Up to 10 MB</small></label><footer className="modal-actions"><button type="button" className="cancel-button" disabled={busy} onClick={() => setActiveType('')}>Cancel</button><button type="submit" className="add-investor-button" disabled={busy}>{busy ? 'Saving…' : editingExpenseId ? 'Save changes' : 'Save expense'}</button></footer></form></section></div>}
  </section>
}

export default ExpensesPage
