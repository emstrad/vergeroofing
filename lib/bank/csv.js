import { createHash } from 'node:crypto'
import { penceFromPounds } from '../splits.js'

// Read by column NAME, never by position, trying each field's known aliases in
// turn. Banks rename and reorder columns between exports, and a positional
// reader turns that into silently wrong money.
const ALIASES = {
  id: ['transaction id', 'id', 'reference id', 'transaction reference'],
  date: ['completed date', 'date', 'transaction date', 'value date', 'posting date', 'date completed'],
  description: ['description', 'narrative', 'details', 'reference', 'merchant', 'payee', 'name', 'transaction description'],
  amount: ['amount', 'value', 'transaction amount'],
  paidIn: ['paid in', 'money in', 'credit', 'credit amount', 'in'],
  paidOut: ['paid out', 'money out', 'debit', 'debit amount', 'out'],
  fee: ['fee', 'fees', 'charges'],
  balance: ['balance', 'running balance', 'balance after'],
  state: ['state', 'status'],
  currency: ['currency', 'ccy'],
  type: ['type', 'transaction type']
}

// A small parser rather than a dependency: quoted fields with embedded commas,
// doubled quotes, and both line endings is the whole of what a bank export uses.
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === ',') { row.push(field); field = '' }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (char !== '\r') field += char
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter((line) => line.some((cell) => cell.trim() !== ''))
}

function indexFor(header, names) {
  for (const name of names) {
    const found = header.indexOf(name)
    if (found !== -1) return found
  }
  return -1
}

function toDate(value) {
  const text = String(value || '').trim()
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const uk = text.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/)
  if (uk) {
    const year = uk[3].length === 2 ? '20' + uk[3] : uk[3]
    return `${year}-${uk[2].padStart(2, '0')}-${uk[1].padStart(2, '0')}`
  }
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

export function fingerprintOf(row) {
  if (row.bankId) return 'id:' + row.bankId
  // No bank id, so the line is identified by everything about it that cannot
  // change. The running balance is what separates two identical payments made
  // on the same day.
  return 'h:' + createHash('sha256')
    .update([row.txnDate, row.amountPence, row.description, row.balancePence].join('|'))
    .digest('hex')
    .slice(0, 32)
}

// A pending line can still change, and would otherwise import again, differently,
// next month. A foreign-currency line is not this account's money in this
// account's terms.
const SKIP_STATES = ['pending', 'declined', 'reverted', 'failed', 'cancelled']

export function readStatement(text) {
  const rows = parseCsv(text)
  if (!rows.length) return { rows: [], skipped: 0 }

  const header = rows[0].map((cell) => cell.trim().toLowerCase())
  const at = {}
  for (const [key, names] of Object.entries(ALIASES)) at[key] = indexFor(header, names)

  const out = []
  let skipped = 0

  for (const line of rows.slice(1)) {
    const cell = (index) => (index === -1 ? '' : String(line[index] ?? '').trim())

    const state = cell(at.state).toLowerCase()
    if (SKIP_STATES.some((bad) => state.includes(bad))) { skipped++; continue }

    const currency = cell(at.currency).toUpperCase()
    if (currency && currency !== 'GBP') { skipped++; continue }

    const txnDate = toDate(cell(at.date))
    if (!txnDate) { skipped++; continue }

    let amountPence
    if (at.amount !== -1 && cell(at.amount) !== '') {
      amountPence = penceFromPounds(cell(at.amount))
    } else {
      // A paid in / paid out pair is one signed number in two columns.
      const inPence = penceFromPounds(cell(at.paidIn))
      const outPence = penceFromPounds(cell(at.paidOut))
      amountPence = inPence - Math.abs(outPence)
    }

    // The fee is folded in, so a line is the money that actually moved rather
    // than the money before the bank took its cut.
    const feePence = Math.abs(penceFromPounds(cell(at.fee)))
    if (feePence) amountPence += amountPence < 0 ? -feePence : -feePence

    const row = {
      bankId: cell(at.id),
      txnDate,
      description: [cell(at.description), cell(at.type)].filter(Boolean).join(' ').slice(0, 300) || 'unknown',
      amountPence,
      balancePence: cell(at.balance) === '' ? null : penceFromPounds(cell(at.balance)),
      type: cell(at.type)
    }
    if (!row.amountPence) { skipped++; continue }
    row.fingerprint = fingerprintOf(row)
    out.push(row)
  }

  return { rows: out, skipped }
}
