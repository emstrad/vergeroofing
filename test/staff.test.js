import test, { before, beforeEach, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { makeReq, makeRes } from './helpers/http.js'
import * as testDb from './helpers/db.js'

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

function cookieFrom(res) {
  const header = res.headers['set-cookie']
  return Array.isArray(header) ? header[0].split(';')[0] : ''
}

async function login() {
  const res = makeRes()
  await authHandler(makeReq({ url: '/api/auth/login', body: { code: 'let-me-in' } }), res)
  assert.equal(res.statusCode, 200)
  return cookieFrom(res)
}

async function admin(action, options = {}) {
  const cookie = options.cookie ?? (await login())
  const res = makeRes()
  await adminHandler(makeReq({
    url: `/api/admin/${action}${options.query || ''}`,
    method: options.method || (options.body ? 'POST' : 'GET'),
    body: options.body,
    headers: { cookie }
  }), res)
  return res
}

test('the wrong code and an unknown code fail the same way', async () => {
  const wrong = makeRes()
  await authHandler(makeReq({ url: '/api/auth/login', body: { code: 'nope' } }), wrong)
  assert.equal(wrong.statusCode, 401)
  assert.deepEqual(wrong.body, { error: 'bad_code' })

  const empty = makeRes()
  await authHandler(makeReq({ url: '/api/auth/login', body: {} }), empty)
  assert.equal(empty.statusCode, 401)
  assert.deepEqual(empty.body, { error: 'bad_code' })
})

test('the login throttle fails closed after five attempts', async () => {
  for (let i = 0; i < 5; i++) {
    const res = makeRes()
    await authHandler(makeReq({ url: '/api/auth/login', body: { code: 'nope' } }), res)
    assert.equal(res.statusCode, 401, 'attempt ' + (i + 1))
  }
  const blocked = makeRes()
  await authHandler(makeReq({ url: '/api/auth/login', body: { code: 'let-me-in' } }), blocked)
  assert.equal(blocked.statusCode, 429, 'the right code does not get past the throttle either')
})

test('the admin API refuses an unsigned session', async () => {
  const res = await admin('summary', { cookie: 'verge_staff=forged.signature' })
  assert.equal(res.statusCode, 401)
})

test('a session cookie is httpOnly, Secure and SameSite=Lax', async () => {
  const res = makeRes()
  await authHandler(makeReq({ url: '/api/auth/login', body: { code: 'let-me-in' } }), res)
  const cookie = res.headers['set-cookie'][0]
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /Secure/)
  assert.match(cookie, /SameSite=Lax/)
})

test('a quote can be raised, won, and counted in the conversion rate', async () => {
  const cookie = await login()
  const created = await admin('jobs', {
    cookie, body: { customerName: 'Alex Green', postcode: 'N1 3GZ', jobType: 're-roof', pricePence: 400000 }
  })
  assert.equal(created.statusCode, 200)
  const job = created.body.job
  assert.equal(job.status, 'quoted')
  assert.equal(job.earnings.taxPence, 80000)

  const won = await admin('jobs', { cookie, body: { id: job.id, status: 'booked', jobDate: '2026-10-01' } })
  assert.equal(won.body.job.status, 'booked')

  const summary = await admin('summary', { cookie, query: '?range=all' })
  assert.equal(summary.body.pipeline.quotes_sent, 1)
  assert.equal(summary.body.pipeline.quotes_won, 1)
})

test('a declined quote needs a reason and leaves the earnings untouched', async () => {
  const cookie = await login()
  const job = (await admin('jobs', { cookie, body: { customerName: 'Sam', pricePence: 100000 } })).body.job

  const refused = await admin('jobs', { cookie, body: { id: job.id, status: 'declined' } })
  assert.equal(refused.statusCode, 400)
  assert.deepEqual(refused.body, { error: 'declined_needs_reason' })

  const declined = await admin('jobs', {
    cookie, body: { id: job.id, status: 'declined', declinedReason: 'price' }
  })
  assert.equal(declined.body.job.declined_reason, 'price')

  const summary = await admin('summary', { cookie, query: '?range=all' })
  assert.equal(summary.body.pipeline.quotes_sent, 1)
  assert.equal(summary.body.pipeline.quotes_won, 0)
  assert.equal(summary.body.pipeline.quotes_lost, 1)
})

test('a job keeps the rates it was agreed at when the settings change', async () => {
  const cookie = await login()
  const job = (await admin('jobs', { cookie, body: { customerName: 'Pat', pricePence: 100000 } })).body.job
  assert.equal(job.earnings.leadFeePence, 12000)

  await admin('settings', { cookie, body: { taxPercent: 30, leadFeePercent: 25 } })

  const after = (await admin('jobs', { cookie, query: '?status=quoted' })).body.jobs.find((row) => row.id === job.id)
  assert.equal(Number(after.tax_percent), 20, 'the old job keeps its own rates')
  assert.equal(after.earnings.leadFeePence, 12000)

  const fresh = (await admin('jobs', { cookie, body: { customerName: 'New', pricePence: 100000 } })).body.job
  assert.equal(Number(fresh.tax_percent), 30, 'a new job takes today\'s rates')
})

test('three staged payments reach paid in full exactly, never a penny over', async () => {
  const cookie = await login()
  const job = (await admin('jobs', { cookie, body: { customerName: 'Chris', pricePence: 480000 } })).body.job

  for (const amount of [120000, 180000, 180000]) {
    const res = await admin('payments', { cookie, body: { jobId: job.id, amountPence: amount, label: 'stage' } })
    assert.equal(res.statusCode, 200)
  }

  const listed = (await admin('jobs', { cookie })).body.jobs.find((row) => row.id === job.id)
  assert.equal(listed.paid_pence, 480000)
  assert.equal(listed.outstanding_pence, 0)
  assert.equal(listed.paid_in_full, true)
})

test('a deposit is whatever was agreed, not half the price', async () => {
  const cookie = await login()
  const settings = (await admin('settings', { cookie })).body.settings
  assert.equal(settings.depositPercent, null, 'no standard deposit is assumed')

  const job = (await admin('jobs', { cookie, body: { customerName: 'Jo', pricePence: 300000 } })).body.job
  await admin('payments', { cookie, body: { jobId: job.id, amountPence: 50000, label: 'deposit' } })
  const listed = (await admin('jobs', { cookie })).body.jobs.find((row) => row.id === job.id)
  assert.equal(listed.paid_pence, 50000)
  assert.equal(listed.outstanding_pence, 250000)
})

test('money owed on finished work is surfaced with the phone number', async () => {
  const cookie = await login()
  const job = (await admin('jobs', {
    cookie, body: { customerName: 'Dana', phone: '07700 900999', pricePence: 200000 }
  })).body.job
  await admin('jobs', { cookie, body: { id: job.id, status: 'completed' } })
  await admin('payments', { cookie, body: { jobId: job.id, amountPence: 50000 } })

  const summary = await admin('summary', { cookie, query: '?range=all' })
  assert.equal(summary.body.owed.length, 1)
  assert.equal(summary.body.owed[0].phone, '07700 900999')
  assert.equal(Number(summary.body.owed[0].paid_pence), 50000)
})

test('the lead fee cannot be paid to somebody outside the split', async () => {
  const cookie = await login()
  const res = await admin('settings', { cookie, body: { partners: ['tom', 'steve'], leadFeeTo: 'scott' } })
  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { error: 'lead_fee_to_unknown' })
})

test('search narrows with every word and ignores spaces in a postcode', async () => {
  const cookie = await login()
  await admin('jobs', { cookie, body: { customerName: 'Alex Green', postcode: 'N1 3GZ', pricePence: 1000 } })
  await admin('jobs', { cookie, body: { customerName: 'Alex Brown', postcode: 'SE23 1AA', pricePence: 1000 } })

  const byPostcode = await admin('jobs', { cookie, query: '?q=n13gz' })
  assert.equal(byPostcode.body.jobs.length, 1)

  const twoWords = await admin('jobs', { cookie, query: '?q=alex%20brown' })
  assert.equal(twoWords.body.jobs.length, 1)
  assert.equal(twoWords.body.jobs[0].customer_name, 'Alex Brown')
})
