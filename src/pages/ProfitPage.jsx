import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'

const expenseCategories = [
  ['security', 'Guarantee'],
  ['money_transfer_commission', 'Money transfer commission'],
  ['goods_purchases', "Goods purchases"],
  ['transportation_customs', 'Transportation and customs'],
  ['installation', 'Installation'],
  ['miscellaneous', 'Miscellaneous'],
]

const defaults = { tax_percentage: 0, charity_percentage: 2.5, investor_percentage: 20 }
const muzarebahDefaults = { ...defaults, investor_percentage: 15, company_charity_percentage: 2.5, company_remuneration_percentage: 15, company_shares_loss: false, company_loss_percentage: 50 }
const money = (value) => Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100

function CalculationLabel({ formula, children }) {
  return <span className="profit-calculation-label"><small>{formula}</small>{children}</span>
}

function ProfitPage() {
  const [projects, setProjects] = useState([])
  const [expenses, setExpenses] = useState([])
  const [muzaribs, setMuzaribs] = useState([])
  const [settings, setSettings] = useState([])
  const [taxEnabled, setTaxEnabled] = useState([])
  const [projectId, setProjectId] = useState('')
  const [rates, setRates] = useState(defaults)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    const results = await Promise.all([
      supabase.from('projects').select('id, name, code_number, total_price, project_base, muzarib_id').order('name'),
      supabase.from('project_expenses').select('project_id, expense_type, amount'),
      supabase.from('project_financial_settings').select('project_id, tax_percentage, charity_percentage, investor_percentage, company_charity_percentage, company_remuneration_percentage, company_shares_loss, company_loss_percentage'),
      supabase.from('muzaribs').select('id, first_name, last_name'),
      supabase.from('project_expense_types').select('project_id, expense_type, enabled').eq('expense_type', 'tax'),
    ])
    const failed = results.find((result) => result.error)
    if (failed) setError(failed.error.message)
    else {
      setProjects(results[0].data)
      setExpenses(results[1].data)
      setSettings(results[2].data)
      setMuzaribs(results[3].data)
      setTaxEnabled(results[4].data)
      setProjectId((id) => id || results[0].data[0]?.id || '')
    }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const saved = settings.find((item) => item.project_id === projectId)
    setRates(saved ? { tax_percentage: saved.tax_percentage, charity_percentage: saved.charity_percentage, investor_percentage: saved.investor_percentage, company_charity_percentage: saved.company_charity_percentage, company_remuneration_percentage: saved.company_remuneration_percentage, company_shares_loss: saved.company_shares_loss, company_loss_percentage: saved.company_loss_percentage } : projects.find((item) => item.id === projectId)?.project_base === 'Muzarebah' ? muzarebahDefaults : defaults)
  }, [projectId, settings, projects])

  const project = projects.find((item) => item.id === projectId)
  const muzarib = muzaribs.find((person) => person.id === project?.muzarib_id)
  const isMurabeha = project?.project_base === 'Murabeha'
  const isMuzarebah = project?.project_base === 'Muzarebah'
  const revenue = round(Number(project?.total_price || 0))
  const entries = expenses.filter((item) => item.project_id === projectId)
  const categoryTotals = expenseCategories.map(([key, label]) => {
    const categoryEntries = entries.filter((item) => item.expense_type === key)
    return { key, label, count: categoryEntries.length, amount: round(categoryEntries.reduce((sum, item) => sum + Number(item.amount), 0)) }
  })
  const guarantee = categoryTotals.find((category) => category.key === 'security')?.amount || 0
  const operatingEntries = entries.filter((item) => item.expense_type !== 'security')
  const recorded = round(operatingEntries.reduce((sum, item) => sum + Number(item.amount), 0))
  const taxOn = taxEnabled.some((item) => item.project_id === projectId && item.enabled)
  const tax = taxOn ? round(revenue * Number(rates.tax_percentage || 0) / 100) : 0
  const totalExpenses = round(recorded + tax)
  const result = round(revenue - totalExpenses)
  const profit = Math.max(result, 0)
  const guaranteeProfit = isMuzarebah && totalExpenses + guarantee > 0 ? round(profit * guarantee / (totalExpenses + guarantee)) : 0
  const investmentProfit = isMuzarebah ? round((profit - guaranteeProfit) / 2) : 0
  const investorProfit = isMuzarebah ? round(guaranteeProfit + investmentProfit) : profit
  const charity = round(investorProfit * Number(rates.charity_percentage || 0) / 100)
  const afterCharity = round(investorProfit - charity)
  const remuneration = round(afterCharity * Number(rates.investor_percentage || 0) / 100)
  const remaining = round(afterCharity - remuneration)
  const companyProfit = investmentProfit
  const companyCharity = round(companyProfit * Number(rates.company_charity_percentage || 0) / 100)
  const companyAfterCharity = round(companyProfit - companyCharity)
  const companyRemuneration = round(companyAfterCharity * Number(rates.company_remuneration_percentage || 0) / 100)
  const companyRemaining = round(companyAfterCharity - companyRemuneration)
  const loss = Math.max(-result, 0)
  const companyLoss = rates.company_shares_loss ? round(loss * Number(rates.company_loss_percentage || 0) / 100) : 0
  const investorLoss = round(loss - companyLoss)

  async function resetSettings() {
    if (!window.confirm('Delete the saved percentages and loss allocation for this project?')) return
    setSaving(true); setError(''); setNotice('')
    const { error: deleteError } = await supabase.from('project_financial_settings').delete().eq('project_id', projectId)
    if (deleteError) setError(deleteError.message)
    else { setSettings((current) => current.filter((item) => item.project_id !== projectId)); setNotice('Project settings reset to defaults.') }
    setSaving(false)
  }

  async function save(event) {
    event.preventDefault()
    setError(''); setNotice('')
    const next = Object.fromEntries(Object.entries(rates).map(([key, value]) => [key, key === 'company_shares_loss' ? Boolean(value) : Number(value)]))
    if (Object.entries(next).some(([key, value]) => key !== 'company_shares_loss' && (!Number.isFinite(value) || value < 0 || value > 100))) {
      setError('Enter percentages from 0 to 100.')
      return
    }
    setSaving(true)
    const { error: saveError } = await supabase.from('project_financial_settings').upsert({ project_id: projectId, ...next })
    if (saveError) setError(saveError.message)
    else { setSettings((current) => [...current.filter((item) => item.project_id !== projectId), { project_id: projectId, ...next }]); setNotice('Percentages saved for this project.') }
    setSaving(false)
  }

  return <section className="investors-page profit-page" aria-label="Project profit and loss">
    <header className="investors-header"><div><p className="investors-eyebrow">ASMA AFGHAN</p><h1>Profit & loss</h1><p className="investors-subtitle">A live financial breakdown for each project.</p></div></header>
    {error && <div className="investors-alert" role="alert">{error}</div>}{notice && <div className="investors-notice" role="status">{notice}</div>}
    {loading ? <div className="investors-state"><span className="loader" /></div> : !projects.length ? <div className="investors-empty"><h2>No projects yet</h2><p>Add a project to see its profit and loss.</p></div> : <>
      <div className="profit-picker"><label>Project<select value={projectId} onChange={(event) => { setProjectId(event.target.value); setNotice(''); setError('') }}>{projects.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code_number}</option>)}</select></label><div className="profit-project-type"><span>Project type</span><strong>{project?.project_base || 'Not specified'}</strong></div></div>
      {!isMurabeha && !isMuzarebah ? <div className="profit-pending" role="status"><p className="expense-step">{project?.project_base || 'PROJECT TYPE'}</p><h2>Calculations for this project type are coming later</h2><p>Expense records for this project remain available on the Expenses page.</p></div> : <><div className="profit-summary"><div><span>Project total</span><strong>{money(revenue)}</strong></div><div><span>Total expenses</span><strong>{money(totalExpenses)}</strong></div><div className={result < 0 ? 'profit-negative' : 'profit-positive'}><span>{result < 0 ? 'Loss' : 'Profit'}</span><strong>{money(Math.abs(result))}</strong></div></div>
      <div className="profit-grid"><div className="profit-panel"><p className="expense-step">PROJECT BREAKDOWN</p><h2>How the result is calculated</h2><div className="profit-line"><span>Project total price</span><strong>{money(revenue)}</strong></div><div className="profit-category-heading">Expense categories</div>{categoryTotals.filter((category) => category.key !== 'security').map((category) => <div className="profit-line profit-category" key={category.key}><span>{category.label} <small>({category.count})</small></span><strong>− {money(category.amount)}</strong></div>)}<div className="profit-line profit-subtotal"><span>Recorded expenses <small>({operatingEntries.length} entries)</small></span><strong>− {money(recorded)}</strong></div><div className="profit-line profit-guarantee"><span>Guarantee <small>({entries.length - operatingEntries.length} entries · recoverable, excluded)</small></span><strong>{money(guarantee)}</strong></div><div className="profit-line"><span>Tax <small>({taxOn ? `${rates.tax_percentage || 0}% of project total` : 'off in Expenses'})</small></span><strong>− {money(tax)}</strong></div><div className="profit-line profit-result"><CalculationLabel formula="Project total − expenses (excluding guarantee)">{result < 0 ? 'Net loss' : 'Net profit'}</CalculationLabel><strong>{money(result)}</strong></div></div>
      {(!isMuzarebah || result >= 0) && <form className="profit-panel" onSubmit={save}><p className="expense-step">PROJECT SETTINGS</p><h2>{isMuzarebah ? "Investor’s profit allocation" : "Profit allocation"}</h2><p className="profit-help">Charity is deducted from {isMuzarebah ? 'the investor’s profit' : 'positive profit'} first; remuneration is then calculated from the amount left.</p>{isMuzarebah && <><div className="profit-line"><CalculationLabel formula="Profit ÷ (expenses + guarantee) × guarantee">Guarantee profit</CalculationLabel><strong>{money(guaranteeProfit)}</strong></div><div className="profit-line"><CalculationLabel formula="(Profit − guarantee profit) ÷ 2">Investment profit</CalculationLabel><strong>{money(investmentProfit)}</strong></div><div className="profit-line profit-subtotal"><CalculationLabel formula="Guarantee profit + investment profit">Investor’s profit</CalculationLabel><strong>{money(investorProfit)}</strong></div></>}<div className="profit-line"><span>Profit available for allocation</span><strong>{money(investorProfit)}</strong></div><div className="profit-rate"><label htmlFor="profit-charity"><CalculationLabel formula={`${isMuzarebah ? 'Investor’s profit' : 'Profit'} × charity %`}>Charity</CalculationLabel></label><div><input id="profit-charity" type="number" min="0" max="100" step="0.01" value={rates.charity_percentage} onChange={(event) => setRates({ ...rates, charity_percentage: event.target.value })} /><span>%</span></div><strong>− {money(charity)}</strong></div><div className="profit-line"><CalculationLabel formula={`${isMuzarebah ? 'Investor’s profit' : 'Profit'} − charity`}>Amount after charity</CalculationLabel><strong>{money(afterCharity)}</strong></div><div className="profit-rate"><label htmlFor="profit-remuneration"><CalculationLabel formula="Amount after charity × remuneration %">Remuneration</CalculationLabel></label><div><input id="profit-remuneration" type="number" min="0" max="100" step="0.01" value={rates.investor_percentage} onChange={(event) => setRates({ ...rates, investor_percentage: event.target.value })} /><span>%</span></div><strong>− {money(remuneration)}</strong></div><div className="profit-line profit-result"><CalculationLabel formula="Amount after charity − remuneration">Amount after remuneration</CalculationLabel><strong>{money(remaining)}</strong></div><button type="submit" className="add-investor-button" disabled={saving}>{saving ? 'Saving…' : 'Save percentages'}</button></form>}{isMuzarebah && result >= 0 && <form className="profit-panel" onSubmit={save}><p className="expense-step">PROJECT SETTINGS</p><h2>Company’s profit allocation</h2>{muzarib && <p className="profit-help">Muzarib: {muzarib.first_name} {muzarib.last_name}</p>}<div className="profit-line profit-subtotal"><CalculationLabel formula="(Profit − guarantee profit) ÷ 2">Company’s profit</CalculationLabel><strong>{money(companyProfit)}</strong></div><div className="profit-rate"><label htmlFor="company-charity"><CalculationLabel formula="Company’s profit × charity %">Charity</CalculationLabel></label><div><input id="company-charity" type="number" min="0" max="100" step="0.01" value={rates.company_charity_percentage} onChange={(event) => setRates({ ...rates, company_charity_percentage: event.target.value })} /><span>%</span></div><strong>− {money(companyCharity)}</strong></div><div className="profit-line"><CalculationLabel formula="Company’s profit − charity">Amount after charity</CalculationLabel><strong>{money(companyAfterCharity)}</strong></div><div className="profit-rate"><label htmlFor="company-remuneration"><CalculationLabel formula="Amount after charity × remuneration %">Remuneration</CalculationLabel></label><div><input id="company-remuneration" type="number" min="0" max="100" step="0.01" value={rates.company_remuneration_percentage} onChange={(event) => setRates({ ...rates, company_remuneration_percentage: event.target.value })} /><span>%</span></div><strong>− {money(companyRemuneration)}</strong></div><div className="profit-line profit-result"><CalculationLabel formula="Amount after charity − remuneration">Amount after remuneration</CalculationLabel><strong>{money(companyRemaining)}</strong></div><button type="submit" className="add-investor-button" disabled={saving}>{saving ? 'Saving…' : 'Save percentages'}</button></form>}{isMuzarebah && result < 0 && <form className="profit-panel" onSubmit={save}><p className="expense-step">PROJECT SETTINGS</p><h2>Loss allocation</h2><div className="profit-line profit-subtotal"><CalculationLabel formula="Expenses (excluding guarantee) − project total">Total loss</CalculationLabel><strong>{money(loss)}</strong></div><label className="profit-loss-toggle"><input type="checkbox" checked={Boolean(rates.company_shares_loss)} onChange={(event) => setRates({ ...rates, company_shares_loss: event.target.checked })} /> Company shares the loss</label>{rates.company_shares_loss && <div className="profit-rate"><label htmlFor="company-loss-percentage">Company’s share</label><div><input id="company-loss-percentage" type="number" min="0" max="100" step="0.01" value={rates.company_loss_percentage} onChange={(event) => setRates({ ...rates, company_loss_percentage: event.target.value })} /><span>%</span></div><strong>{money(companyLoss)}</strong></div>}{rates.company_shares_loss ? <div className="profit-rate"><label htmlFor="investor-loss-percentage"><CalculationLabel formula="100% − company’s share">Investor’s share</CalculationLabel></label><div><input id="investor-loss-percentage" type="number" min="0" max="100" step="0.01" value={rates.company_loss_percentage === '' ? '' : round(100 - Number(rates.company_loss_percentage))} onChange={(event) => setRates({ ...rates, company_loss_percentage: event.target.value === '' ? '' : String(round(100 - Number(event.target.value))) })} /><span>%</span></div><strong>{money(investorLoss)}</strong></div> : <div className="profit-line"><CalculationLabel formula="100% of loss">Investor’s share (100%)</CalculationLabel><strong>{money(investorLoss)}</strong></div>}<button type="submit" className="add-investor-button" disabled={saving}>{saving ? 'Saving…' : 'Save loss allocation'}</button></form>}</div><div className="record-actions profit-settings-actions"><button type="button" className="record-delete" disabled={saving} onClick={resetSettings}>Reset saved settings</button></div>
      {result < 0 && <p className="profit-loss-note">This project has a loss, so charity and remuneration are 0.</p>}</>}
    </>}
  </section>
}
export default ProfitPage
