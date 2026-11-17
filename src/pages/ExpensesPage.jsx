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
const newExpense = () => ({ expense_date: new Date().toLocaleDateString('en-CA'), amount: '', note: '', file: null })
const money = (value) => Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Your session expired. Sign in again.')
  return session.access_token
}

function ExpensesPage() {
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
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState(null)
  const closePreview = useCallback(() => setPreview(null), [])

  const load = useCallback(async () => {
    const [projectResult, settingResult, expenseResult, documentResult, financialResult] = await Promise.all([
      supabase.from('projects').select('id, name, code_number, total_price, project_base').order('name'),
      supabase.from('project_expense_types').select('project_id, expense_type, enabled'),
      supabase.from('project_expenses').select('id, project_id, expense_type, expense_date, amount, note, created_at').order('expense_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('project_documents').select('id, project_id, expense_id, file_name, content_type').not('expense_id', 'is', null),
      supabase.from('project_financial_settings').select('project_id, tax_percentage, charity_percentage, investor_percentage'),
    ])
    const loadError = [projectResult, settingResult, expenseResult, documentResult, financialResult].find((result) => result.error)?.error
    if (loadError) setError(loadError.message)
    else {
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
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) { setError('Enter a tax percentage from 0 to 100.'); return }
    setBusy(true); setError(''); setNotice('')
    const existing = financialSettings.find((item) => item.project_id === projectId)
    const row = { project_id: projectId, tax_percentage: rate, charity_percentage: existing?.charity_percentage ?? 2.5, investor_percentage: existing?.investor_percentage ?? 20 }
    const { error: saveError } = await supabase.from('project_financial_settings').upsert(row)
    if (saveError) setError(saveError.message)
    else { setFinancialSettings((current) => [...current.filter((item) => item.project_id !== projectId), row]); setNotice('Tax percentage saved for this project.') }
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
    const { data, error: saveError } = await supabase.from('project_expenses').insert({
      project_id: projectId, expense_type: activeType, expense_date: form.expense_date,
      amount: Number(form.amount), note: form.note.trim(),
    }).select('id').single()
    if (saveError) { setError(saveError.message); setBusy(false); return }
    if (form.file) {
      try { await upload(data.id, form.file) }
      catch (uploadError) { setError(`Expense saved, but its attachment failed: ${uploadError.message}`) }
    }
    setForm(newExpense())
    setActiveType('')
    setSelectedType(activeType)
    await load()
    if (!form.file) setNotice('Expense added successfully.')
    setBusy(false)
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
  const isMurabeha = project?.project_base === 'Murabeha'
  const projectExpenses = expenses.filter((item) => item.project_id === projectId)
  const recordedTotal = projectExpenses.reduce((sum, item) => sum + Number(item.amount), 0)
  const taxEnabled = isMurabeha && settings.some((item) => item.project_id === projectId && item.expense_type === 'tax' && item.enabled)
  const taxAmount = taxEnabled ? Math.round(Number(project?.total_price || 0) * Number(taxRate || 0)) / 100 : 0
  const total = recordedTotal + taxAmount
  const availableTypes = isMurabeha ? types : types.filter(([key]) => key !== 'tax')
  const enabledTypes = availableTypes.filter(([key]) => settings.some((item) => item.project_id === projectId && item.expense_type === key && item.enabled))
  const currentType = selectedType && availableTypes.some(([key]) => key === selectedType) ? selectedType : enabledTypes[0]?.[0] || availableTypes[0][0]
  const selectedExpenses = projectExpenses.filter((item) => item.expense_type === currentType)
  const selectedEnabled = enabledTypes.some(([key]) => key === currentType)

  return <section className="investors-page expenses-page" aria-label="Project expenses">
    <header className="investors-header"><div><p className="investors-eyebrow">ASMA AFGHAN</p><h1>Expenses</h1><p className="investors-subtitle">Manage expense types and records for each project. Murabeha tax is calculated by percentage.</p></div></header>
    {notice && <div className="investors-notice" role="status">{notice}</div>}
    {error && <div className="investors-alert" role="alert">{error}</div>}
    {loading ? <div className="investors-state"><span className="loader" /></div> : !projects.length ? <div className="investors-empty"><h2>No projects yet</h2><p>Add a project before recording expenses.</p></div> : <>
      <div className="expense-toolbar"><label>Choose a project<select value={projectId} onChange={(event) => { setProjectId(event.target.value); setActiveType(''); setSelectedType(''); setNotice(''); setError('') }}>{projects.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code_number}</option>)}</select></label><div className="expense-total"><span>Total recorded expenses</span><strong>{money(total)}</strong><small>{projectExpenses.length} recorded {projectExpenses.length === 1 ? 'entry' : 'entries'}{taxEnabled ? ' + tax' : ''}</small></div></div>
      <div className="expense-intro"><div><p className="expense-step">STEP 1 · CHOOSE A TYPE</p><h2>Expenses for {project?.name}</h2><p>Switch on the types this project needs. Choose a type to view its entries.</p></div><span className="expense-enabled-count">{enabledTypes.length} of {availableTypes.length} enabled</span></div>
      <div className="expense-workspace"><div className="expense-type-list">{availableTypes.map(([key, label]) => {
        const enabled = enabledTypes.some(([type]) => type === key)
        const items = projectExpenses.filter((item) => item.expense_type === key)
        return <div className={`expense-type-row ${currentType === key ? 'selected' : ''}`} key={key}>
          <button type="button" className="expense-type-choice" aria-current={currentType === key ? 'true' : undefined} onClick={() => setSelectedType(key)}><span className="expense-type-name">{label}</span><span className="expense-type-meta">{key === 'tax' ? `${taxRate}% · ${money(taxAmount)}` : `${items.length} ${items.length === 1 ? 'entry' : 'entries'} · ${money(items.reduce((sum, item) => sum + Number(item.amount), 0))}`}</span></button>
          <label className="expense-switch"><input type="checkbox" checked={enabled} disabled={busy} aria-label={`${label} expenses for ${project?.name}`} onChange={(event) => toggle(key, event.target.checked)} /><span className="expense-switch-track" aria-hidden="true" /><span className="expense-switch-state">{enabled ? 'On' : 'Off'}</span></label>
        </div>
      })}</div><div className="expense-detail"><div className="expense-detail-header"><div><p className="expense-step">STEP 2 · REVIEW AND ADD</p><h2>{labels[currentType]}</h2><p>{currentType === 'tax' ? 'Calculated from this project’s total price and included in expenses when Tax is on.' : selectedEnabled ? `${selectedExpenses.length} ${selectedExpenses.length === 1 ? 'entry' : 'entries'} recorded for this project` : 'This type is off for this project. Turn it on to add expenses.'}</p></div>{selectedEnabled && currentType !== 'tax' && <button className="add-investor-button" onClick={() => { setActiveType(currentType); setForm(newExpense()); setError('') }}>+ Add expense</button>}</div>
        {currentType === 'tax' && <form className="tax-form" onSubmit={saveTax}><label>Tax percentage<div className="tax-input"><input type="number" min="0" max="100" step="0.01" required value={taxRate} onChange={(event) => setTaxRate(event.target.value)} /><span>%</span></div></label><div className="tax-calculation"><span>{money(project?.total_price || 0)} × {taxRate || 0}%</span><strong>{money(taxAmount)}</strong><small>{taxEnabled ? 'Included in total expenses' : 'Turn on Tax to include this amount'}</small></div><button className="add-investor-button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save tax rate'}</button></form>}
        {currentType !== 'tax' && (selectedExpenses.length ? <div className="expense-records">{selectedExpenses.map((item) => {
          const attachment = documents.find((document) => document.expense_id === item.id)
          return <div className="expense-record" key={item.id}><div><strong>{money(item.amount)}</strong><span>{item.expense_date}</span>{item.note && <p>{item.note}</p>}</div>{attachment && <button type="button" onClick={() => previewDocument(attachment)}>View {attachment.file_name}</button>}</div>
        })}</div> : <div className="expense-detail-empty"><strong>No {labels[currentType].toLowerCase()} expenses yet</strong><p>{selectedEnabled ? 'Use Add expense to record the first one.' : 'Switch this type on when the project needs it.'}</p></div>)}
      </div></div>
    </>}
    <DocumentPreview preview={preview} onClose={closePreview} />
    {activeType && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setActiveType('') }}><section className="investor-modal" role="dialog" aria-modal="true" aria-labelledby="expense-modal-title"><header className="modal-header"><div><p className="investors-eyebrow">{project?.name}</p><h2 id="expense-modal-title">Add {labels[activeType]} expense</h2></div><button className="modal-close" disabled={busy} onClick={() => setActiveType('')} aria-label="Close">×</button></header><form className="investor-form" onSubmit={saveExpense}><div className="form-two-col"><label>Date<input type="date" required value={form.expense_date} onChange={(event) => setForm({ ...form, expense_date: event.target.value })} /></label><label>Amount<input type="number" min="0.01" step="0.01" required value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label></div><label className="full-label investment-note-label">Note<textarea rows="3" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label><label className="expense-upload">Document attachment (optional)<input type="file" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.txt" onChange={(event) => setForm({ ...form, file: event.target.files?.[0] || null })} /><small>Up to 10 MB</small></label><footer className="modal-actions"><button type="button" className="cancel-button" disabled={busy} onClick={() => setActiveType('')}>Cancel</button><button type="submit" className="add-investor-button" disabled={busy}>{busy ? 'Saving…' : 'Save expense'}</button></footer></form></section></div>}
  </section>
}

export default ExpensesPage
