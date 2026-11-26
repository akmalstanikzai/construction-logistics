// Funding percentages use recorded payments. Calculated tax reduces the net
// result but has no recorded payer, so it cannot establish a funding share.
export function allocateMusharekah(expenses, partners, netResult) {
  const sources = new Map([
    ['', { id: '', name: 'Investors balance', expenseCents: 0 }],
    ...partners.map((partner) => [partner.id, { id: partner.id, name: `${partner.first_name} ${partner.last_name}`, expenseCents: 0 }]),
  ])
  for (const expense of expenses) {
    const id = expense.funding_partner_id || ''
    if (!sources.has(id)) sources.set(id, { id, name: 'Partner (record unavailable)', expenseCents: 0 })
    sources.get(id).expenseCents += Math.round(Number(expense.amount || 0) * 100)
  }
  const rows = [...sources.values()]
  const totalCents = rows.reduce((sum, row) => sum + row.expenseCents, 0)
  const resultCents = Math.round(Math.abs(netResult) * 100)
  const sign = netResult < 0 ? -1 : 1
  const allocations = rows.map((row) => {
    const exact = totalCents > 0 ? resultCents * row.expenseCents / totalCents : 0
    return { ...row, amount: row.expenseCents / 100, percentage: totalCents > 0 ? row.expenseCents / totalCents * 100 : 0, cents: Math.floor(exact), remainder: exact - Math.floor(exact) }
  })
  if (totalCents > 0) {
    const remaining = resultCents - allocations.reduce((sum, row) => sum + row.cents, 0)
    const ranked = [...allocations].sort((a, b) => b.remainder - a.remainder)
    for (let index = 0; index < remaining; index++) ranked[index].cents++
  }
  return { totalFunded: totalCents / 100, rows: allocations.map(({ cents, remainder: _remainder, expenseCents: _expenseCents, ...row }) => ({ ...row, allocation: sign * cents / 100 })) }
}
