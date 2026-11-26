import { allocateMusharekah } from '../lib/musharekah'

const money = (value) => Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function MusharekahAllocation({ entries, partners, revenue, recorded, guarantee, tax, totalExpenses, result, categoryTotals }) {
  const { totalFunded, rows } = allocateMusharekah(entries, partners, result)
  const outcome = result < 0 ? 'Loss' : 'Profit'
  return <>
    <div className="profit-summary"><div><span>Project total</span><strong>{money(revenue)}</strong></div><div><span>Total expenses</span><strong>{money(totalExpenses)}</strong></div><div className={result < 0 ? 'profit-negative' : 'profit-positive'}><span>{outcome}</span><strong>{money(Math.abs(result))}</strong></div></div>
    <div className="profit-grid">
      <section className="profit-panel" aria-label="Musharekah project breakdown">
        <p className="expense-step">PROJECT BREAKDOWN</p><h2>How the result is calculated</h2>
        <div className="profit-line"><span>Project total price</span><strong>{money(revenue)}</strong></div>
        {categoryTotals.filter((category) => category.key !== 'security').map((category) => <div className="profit-line profit-category" key={category.key}><span>{category.label} <small>({category.count})</small></span><strong>− {money(category.amount)}</strong></div>)}
        <div className="profit-line profit-subtotal"><span>Expenses excluding guarantee</span><strong>− {money(recorded)}</strong></div>
        <div className="profit-line"><span>Calculated tax</span><strong>− {money(tax)}</strong></div>
        <div className="profit-line profit-guarantee"><span>Guarantee <small>(recoverable, excluded from net result)</small></span><strong>{money(guarantee)}</strong></div>
        <div className="profit-line profit-result"><span>Net {outcome.toLowerCase()}</span><strong>{money(Math.abs(result))}</strong></div>
      </section>
      <section className="profit-panel" aria-label="Musharekah profit and loss allocation">
        <p className="expense-step">MUSHAREKAH ALLOCATION</p><h2>{outcome} by expense contribution</h2>
        <p className="profit-help">Each partner and the investors share the net profit or loss according to their recorded expenses, including guarantees. Calculated tax reduces the net result and does not change funding percentages.</p>
        <div className="profit-line"><span>Total funded expenses <small>(including guarantees)</small></span><strong>{money(totalFunded)}</strong></div>
        {totalFunded > 0 ? <>
          <div className="musharekah-table-wrap"><table className="musharekah-table"><caption className="sr-only">{outcome} allocated by recorded expense percentage</caption><thead><tr><th scope="col">Funding source</th><th scope="col">Expenses funded</th><th scope="col">Share</th><th scope="col">{outcome} allocated</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><th scope="row">{row.name}</th><td>{money(row.amount)}</td><td>{row.percentage.toFixed(2)}%</td><td>{money(Math.abs(row.allocation))}</td></tr>)}</tbody><tfoot><tr><th scope="row">Total</th><td>{money(totalFunded)}</td><td>100.00%</td><td>{money(Math.abs(result))}</td></tr></tfoot></table></div>
          <p className="profit-help">{outcome} share = net {outcome.toLowerCase()} × expenses funded ÷ total funded expenses. Amounts are rounded to cents so the allocations add up to the full result.</p>
        </> : <div className="expense-detail-empty" role="status"><strong>No funded expenses yet</strong><p>Record expenses and choose who paid on the Expenses page to calculate each participant’s share. The net result remains unallocated until expenses are recorded.</p></div>}
      </section>
    </div>
  </>
}
