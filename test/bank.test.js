import test, { before, beforeEach, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { makeReq, makeRes } from './helpers/http.js'
import * as testDb from './helpers/db.js'
import { readStatement, parseCsv } from '../lib/bank/csv.js'
import { categoryFor, splitFor, ruleKeyFor } from '../lib/bank/categorise.js'
import { autoMatch } from '../lib/bank/match.js'

process.env.IP_SALT = 'test-salt'
process.env.SESSION_SECRET = 'test-secret'
process.env.STAFF_ACCESS_CODE = 'let-me-in'

let authHandler
let adminHandler

before(async () => {
  mock.module('../lib/db.js', { namedExports: { sql: testDb.sql, dbHealthy: testDb.dbHealthy } })
  authHandler = (await import('../lib/routes/auth.js')).default
  adminHandler = (await import('../lib/routes/admin.js')).default
})

beforeEach(async () => {
  await testDb.reset()
})

after(async () => {
  await testDb.close()
})

async function login() {
  const res = makeRes()
  await authHandler(makeReq({ url: '/api/auth/login', body: { code: 'let-me-in' } }), res)
  return res.headers['set-cookie'][0].split(';')[0]
}

async function admin(cookie, action, options = {}) {
  const res = makeRes()
  await adminHandler(makeReq({
    url: `/api/admin/${action}${options.query || ''}`,
    method: options.method || (options.body ? 'POST' : 'GET'),
    body: options.body,
    headers: { cookie }
  }), res)
  return res
}

// The identity has to hold after every operation, not just at the end, so this
// is called after each step rather than once at the bottom of a test.
function assertIdentity(balance, label) {
  const people = Object.values(balance.figures).reduce((sum, value) => sum + value, 0)
  const right = people + balance.taxPot + balance.paidOnOpenJobs +
    balance.unmatchedIn + balance.unallocatedOut + balance.difference
  assert.equal(balance.net, right, `the two sides disagree after ${label}`)
}

const CSV = [
  'Type,Completed Date,Description,Amount,Fee,Currency,State,Balance',
  'TRANSFER,2026-09-01,Payment from A GREEN N1 3GZ,4800.00,0.00,GBP,COMPLETED,4800.00',
  'CARD_PAYMENT,2026-09-02,TRAVIS PERKINS 1234,-1500.00,0.00,GBP,COMPLETED,3300.00',
  'CARD_PAYMENT,2026-09-03,TRAVIS PERKINS 5678,-200.00,0.00,GBP,COMPLETED,3100.00',
  'TRANSFER,2026-09-04,Transfer to Tom,-500.00,0.00,GBP,COMPLETED,2600.00',
  'TRANSFER,2026-09-05,Payment from SOMEBODY ELSE,250.00,0.00,GBP,COMPLETED,2850.00',
  'CARD_PAYMENT,2026-09-06,PENDING THING,-50.00,0.00,GBP,PENDING,2800.00',
  'CARD_PAYMENT,2026-09-07,PARIS CAFE,-10.00,0.00,EUR,COMPLETED,2790.00'
].join('\n')

test('the CSV is read by column name, not by position', () => {
  const reordered = [
    'Balance,Description,Completed Date,Currency,State,Amount',
    '100.00,Payment from A GREEN,2026-09-01,GBP,COMPLETED,100.00'
  ].join('\n')
  const { rows } = readStatement(reordered)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].amountPence, 10000)
  assert.equal(rows[0].txnDate, '2026-09-01')
})

test('a paid in and paid out pair becomes one signed amount', () => {
  const twoColumns = [
    'Date,Description,Paid In,Paid Out,Balance',
    '01/09/2026,Customer,1200.00,,1200.00',
    '02/09/2026,Merchant,,340.50,859.50'
  ].join('\n')
  const { rows } = readStatement(twoColumns)
  assert.equal(rows[0].amountPence, 120000)
  assert.equal(rows[1].amountPence, -34050)
})

test('a fee is folded into the amount so the line is the money that moved', () => {
  const withFee = ['Date,Description,Amount,Fee,Currency,State', '2026-09-01,Thing,-100.00,2.50,GBP,COMPLETED'].join('\n')
  const { rows } = readStatement(withFee)
  assert.equal(rows[0].amountPence, -10250)
})

test('pending, declined and foreign currency lines are skipped', () => {
  const { rows, skipped } = readStatement(CSV)
  assert.equal(rows.length, 5)
  assert.equal(skipped, 2)
})

test('quoted fields with commas survive the parser', () => {
  const rows = parseCsv('a,b\n"one, two","say ""hi"""')
  assert.deepEqual(rows[1], ['one, two', 'say "hi"'])
})

test('the merchant list is built for this trade', () => {
  assert.equal(categoryFor('TRAVIS PERKINS 1234', -1000), 'materials')
  assert.equal(categoryFor('HSS HIRE', -1000), 'plant-and-hire')
  assert.equal(categoryFor('SOME SKIP CO', -1000), 'waste')
  assert.equal(categoryFor('Payment from anyone', 1000), 'customer')
})

test('a split is guessed only where the line says whose money it is', () => {
  const partners = ['tom', 'steve', 'ben', 'scott']
  assert.deepEqual(splitFor('Transfer to Tom', -50000, partners), ['tom'])
  assert.deepEqual(splitFor('HMRC VAT', -50000, partners), ['tax'])
  // A shop with a partner's name in it is a shop.
  assert.equal(splitFor('CARD PAYMENT TOMS HARDWARE', -5000, partners), null)
  // Money in from someone sharing a first name is a customer.
  assert.equal(splitFor('Transfer from Tom Whoever', 50000, partners), null)
})

test('two lines from one merchant share a learning key', () => {
  assert.equal(ruleKeyFor('TRAVIS PERKINS 1234'), ruleKeyFor('TRAVIS PERKINS 5678'))
})

test('a line only matches automatically when one job clearly wins', () => {
  const txn = { amountPence: 480000, description: 'Payment from A GREEN N1 3GZ', txnDate: '2026-09-01' }
  const clear = [
    { id: 1, status: 'booked', customer_name: 'Alex Green', postcode: 'N1 3GZ', price_pence: 480000, paid_pence: 0, outstanding_pence: 480000, job_date: '2026-09-01' },
    { id: 2, status: 'booked', customer_name: 'Someone Else', postcode: 'SE1 1AA', price_pence: 100, paid_pence: 0, outstanding_pence: 100, job_date: null }
  ]
  assert.equal(autoMatch(txn, clear).id, 1)

  // Two jobs at the same price for the same money is exactly the case that must
  // not match itself: a wrong match marks the wrong customer as paid.
  const ambiguous = [
    { id: 1, status: 'booked', customer_name: 'One', postcode: '', price_pence: 480000, paid_pence: 0, outstanding_pence: 480000, job_date: null },
    { id: 2, status: 'booked', customer_name: 'Two', postcode: '', price_pence: 480000, paid_pence: 0, outstanding_pence: 480000, job_date: null }
  ]
  assert.equal(autoMatch({ ...txn, description: 'Payment received' }, ambiguous), null)
})

test('the full lifecycle, with the identity asserted after every operation', async () => {
  const cookie = await login()

  const job = (await admin(cookie, 'jobs', {
    body: { customerName: 'Alex Green', postcode: 'N1 3GZ', pricePence: 480000, jobDate: '2026-09-01', jobType: 're-roof' }
  })).body.job
  await admin(cookie, 'jobs', { body: { id: job.id, status: 'booked' } })
  assertIdentity((await admin(cookie, 'bank')).body.balance, 'a job being booked')

  const uploaded = await admin(cookie, 'bank', {
    query: '?mode=upload', body: { filename: 'september.csv', csv: CSV }
  })
  assert.equal(uploaded.statusCode, 200)
  assert.equal(uploaded.body.added, 5)
  assertIdentity(uploaded.body.balance, 'the first upload')

  const transactions = uploaded.body.transactions
  const customerLine = transactions.find((row) => row.description.includes('A GREEN'))
  assert.equal(Number(customerLine.job_id), Number(job.id), 'the customer payment matched the job automatically')

  // The same month again: the fingerprints stop it importing twice.
  const again = await admin(cookie, 'bank', { query: '?mode=upload', body: { filename: 'september.csv', csv: CSV } })
  assert.equal(again.body.added, 0)
  assertIdentity(again.body.balance, 'a re-upload of the same month')

  const merchant = transactions.find((row) => row.description.includes('TRAVIS PERKINS 1234'))
  const materials = await admin(cookie, 'bank', { body: { id: merchant.id, action: 'match', jobId: job.id } })
  assertIdentity(materials.body.balance, 'a merchant bill assigned to a job')

  const withMaterials = (await admin(cookie, 'jobs', {})).body.jobs.find((row) => row.id === job.id)
  assert.equal(withMaterials.materials_pence, 150000, 'the spend became a materials cost on the job')

  const stranger = transactions.find((row) => row.description.includes('SOMEBODY ELSE'))
  const split = await admin(cookie, 'bank', {
    body: { id: stranger.id, action: 'split', split: ['tom', 'steve', 'ben', 'scott'] }
  })
  assertIdentity(split.body.balance, 'a line split between the partners')

  const completed = await admin(cookie, 'jobs', { body: { id: job.id, status: 'completed' } })
  assert.equal(completed.body.job.status, 'completed')
  const afterCompletion = (await admin(cookie, 'bank')).body.balance
  assertIdentity(afterCompletion, 'the job being completed')
  assert.equal(afterCompletion.difference, 0, 'a fully paid job with its materials assigned leaves nothing unexplained')

  const unmatched = await admin(cookie, 'bank', { body: { id: merchant.id, action: 'unmatch' } })
  assertIdentity(unmatched.body.balance, 'the merchant bill being unassigned')
  const afterUnmatch = (await admin(cookie, 'jobs', {})).body.jobs.find((row) => row.id === job.id)
  assert.equal(afterUnmatch.materials_pence, 0, 'unassigning took the cost back off the job')
})

test('a category chosen by hand is learned and applied to the untouched lines', async () => {
  const cookie = await login()
  await admin(cookie, 'bank', { query: '?mode=upload', body: { filename: 'sept.csv', csv: CSV } })

  const before = (await admin(cookie, 'bank')).body.transactions
  const first = before.find((row) => row.description.includes('TRAVIS PERKINS 1234'))
  await admin(cookie, 'bank', { body: { id: first.id, action: 'category', category: 'roofing-supplies' } })

  const after = (await admin(cookie, 'bank')).body.transactions
  const sibling = after.find((row) => row.description.includes('TRAVIS PERKINS 5678'))
  assert.equal(sibling.category, 'roofing-supplies', 'the sibling line took the same category')
  assert.equal(sibling.category_kind, 'auto')
  const chosen = after.find((row) => row.id === first.id)
  assert.equal(chosen.category_kind, 'manual', 'the hand-made choice is marked as one')
})

test('unmatching a customer payment unticks what the money no longer covers', async () => {
  const cookie = await login()
  const job = (await admin(cookie, 'jobs', {
    body: { customerName: 'Alex Green', postcode: 'N1 3GZ', pricePence: 480000, jobDate: '2026-09-01' }
  })).body.job
  await admin(cookie, 'jobs', { body: { id: job.id, status: 'booked' } })
  await admin(cookie, 'bank', { query: '?mode=upload', body: { filename: 'sept.csv', csv: CSV } })

  const paid = (await admin(cookie, 'jobs', {})).body.jobs.find((row) => row.id === job.id)
  assert.equal(paid.paid_in_full, true)

  const line = (await admin(cookie, 'bank')).body.transactions.find((row) => row.description.includes('A GREEN'))
  const after = await admin(cookie, 'bank', { body: { id: line.id, action: 'unmatch' } })
  assertIdentity(after.body.balance, 'unmatching a customer payment')

  const unpaid = (await admin(cookie, 'jobs', {})).body.jobs.find((row) => row.id === job.id)
  assert.equal(unpaid.paid_pence, 0)
  assert.equal(unpaid.paid_in_full, false)
})

test('removing an upload takes its payments with it', async () => {
  const cookie = await login()
  const job = (await admin(cookie, 'jobs', {
    body: { customerName: 'Alex Green', postcode: 'N1 3GZ', pricePence: 480000, jobDate: '2026-09-01' }
  })).body.job
  await admin(cookie, 'jobs', { body: { id: job.id, status: 'booked' } })
  const uploaded = await admin(cookie, 'bank', { query: '?mode=upload', body: { filename: 'sept.csv', csv: CSV } })

  const removed = await admin(cookie, 'bank', { query: '?mode=remove', body: { statementId: uploaded.body.statement } })
  assert.equal(removed.body.transactions.length, 0)
  assertIdentity(removed.body.balance, 'removing the upload')

  const listed = (await admin(cookie, 'jobs', {})).body.jobs.find((row) => row.id === job.id)
  assert.equal(listed.paid_pence, 0)
})
