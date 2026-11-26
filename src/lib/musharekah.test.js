import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allocateMusharekah } from './musharekah.js'

const partners = [{ id: 'a', first_name: 'Partner', last_name: 'A' }, { id: 'b', first_name: 'Partner', last_name: 'B' }]
const expenses = [{ funding_partner_id: 'a', amount: '500' }, { funding_partner_id: 'b', amount: '200' }, { funding_partner_id: null, amount: '300' }]

test('allocates profit and loss by the requested 50/20/30 shares', () => {
  for (const result of [200, -200]) {
    const allocation = allocateMusharekah(expenses, partners, result)
    assert.equal(allocation.totalFunded, 1000)
    assert.deepEqual(allocation.rows.map((row) => row.percentage), [30, 50, 20])
    assert.deepEqual(allocation.rows.map((row) => row.allocation), [result * 0.3, result * 0.5, result * 0.2])
  }
})

test('cent rounding distributes the entire result for both profit and loss', () => {
  const equal = expenses.map((expense) => ({ ...expense, amount: 1 }))
  for (const result of [0.01, -0.01, 100, -100]) {
    const { rows } = allocateMusharekah(equal, partners, result)
    assert.equal(rows.reduce((sum, row) => sum + Math.round(row.allocation * 100), 0), Math.round(result * 100))
    assert.ok(rows.every((row) => Math.abs(row.allocation) <= Math.abs(result)))
  }
})

test('no funded expenses leaves the result unallocated without invalid percentages', () => {
  const { totalFunded, rows } = allocateMusharekah([{ amount: null }], partners, 100)
  assert.equal(totalFunded, 0)
  assert.ok(rows.every((row) => row.percentage === 0 && row.allocation === 0))
})

test('includes guarantees and multiple entries, with tax deducted from the supplied net result', () => {
  const { rows } = allocateMusharekah([...expenses, { funding_partner_id: 'a', expense_type: 'security', amount: 500 }], partners, 90)
  assert.equal(rows.find((row) => row.id === 'a').allocation, 60)
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 1500)
})

test('keeps an unlisted payer visible and gives unfunded partners no allocation', () => {
  const { rows } = allocateMusharekah([{ funding_partner_id: 'unknown', amount: 100 }], partners, -20)
  assert.equal(rows.find((row) => row.id === 'unknown').allocation, -20)
  assert.ok(rows.filter((row) => row.id !== 'unknown').every((row) => row.allocation === 0))
})
