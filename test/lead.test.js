import test, { before, beforeEach, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { makeReq, makeRes } from './helpers/http.js'
import * as testDb from './helpers/db.js'

process.env.IP_SALT = 'test-salt'

let leadHandler
let eventHandler
let notifiedHandler

before(async () => {
  mock.module('../lib/db.js', { namedExports: { sql: testDb.sql, dbHealthy: testDb.dbHealthy } })
  leadHandler = (await import('../lib/routes/lead.js')).default
  eventHandler = (await import('../lib/routes/event.js')).default
  notifiedHandler = (await import('../lib/routes/notified.js')).default
})

beforeEach(async () => {
  await testDb.reset()
})

after(async () => {
  await testDb.close()
})

const STEP_ONE = { name: 'Alex', phone: '07700 900123', postcode: 'n1 3gz' }
const FULL = {
  ...STEP_ONE,
  email: 'alex@example.com',
  jobTypes: ['leak-repair'],
  propertyType: 'house',
  address1: '12 Kingsley Road',
  town: 'London'
}

async function post(handler, body, options = {}) {
  const res = makeRes()
  await handler(makeReq({ body, ...options }), res)
  return res
}

test('a complete lead stores and comes back with an id', async () => {
  const res = await post(leadHandler, { ...FULL, sessionId: 's1', stage: 'complete' })
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.id > 0)
  const rows = await testDb.sql`SELECT * FROM leads WHERE id = ${res.body.id}`
  assert.equal(rows[0].stage, 'complete')
  assert.equal(rows[0].postcode, 'N1 3GZ', 'postcode is normalised server side')
  assert.deepEqual(rows[0].files, [])
})

test('a partial then a completion reconcile to one enquiry', async () => {
  const partial = await post(leadHandler, { ...STEP_ONE, sessionId: 's2', stage: 'partial' })
  const complete = await post(leadHandler, { ...FULL, sessionId: 's2', stage: 'complete' })
  assert.notEqual(partial.body.id, complete.body.id)
  const rows = await testDb.sql`SELECT stage FROM leads WHERE session_id = 's2' ORDER BY stage`
  assert.deepEqual(rows.map((r) => r.stage), ['complete', 'partial'])
})

test('a partial flushing late cannot blank the address the completion gave', async () => {
  await post(leadHandler, { ...FULL, sessionId: 's3', stage: 'partial' })
  await post(leadHandler, { ...STEP_ONE, sessionId: 's3', stage: 'partial' })
  const rows = await testDb.sql`SELECT address1, town FROM leads WHERE session_id = 's3'`
  assert.equal(rows[0].address1, '12 Kingsley Road')
  assert.equal(rows[0].town, 'London')
})

test('a filled honeypot is accepted and written nowhere', async () => {
  const res = await post(leadHandler, { ...FULL, sessionId: 's4', stage: 'complete', website: 'spam' })
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.id, null)
  const rows = await testDb.sql`SELECT count(*)::int AS n FROM leads`
  assert.equal(rows[0].n, 0)
})

test('field errors come back with the message already in the markup', async () => {
  const res = await post(leadHandler, { sessionId: 's5', stage: 'complete', name: 'Alex' })
  assert.equal(res.statusCode, 400)
  assert.equal(res.body.fields.postcode, 'Please enter your postcode.')
  assert.equal(res.body.fields.phone, 'Please enter a phone number we can reach you on.')
})

test('an unoffered job type cannot be stored', async () => {
  const res = await post(leadHandler, {
    ...FULL, sessionId: 's6', stage: 'complete', jobTypes: ['leak-repair', 'gold-plating']
  })
  assert.equal(res.statusCode, 200)
  const rows = await testDb.sql`SELECT job_types FROM leads WHERE id = ${res.body.id}`
  assert.deepEqual(rows[0].job_types, ['leak-repair'])
})

test('the lead throttle stops the ninth attempt in the window', async () => {
  for (let i = 0; i < 8; i++) {
    const res = await post(leadHandler, { ...FULL, sessionId: 'burst' + i, stage: 'complete' })
    assert.equal(res.statusCode, 200, 'attempt ' + (i + 1))
  }
  const blocked = await post(leadHandler, { ...FULL, sessionId: 'burst8', stage: 'complete' })
  assert.equal(blocked.statusCode, 429)
})

test('a foreign Origin is refused outright', async () => {
  const res = await post(leadHandler, { ...FULL, sessionId: 's7', stage: 'complete' }, {
    headers: { origin: 'https://evil.example' }
  })
  assert.equal(res.statusCode, 403)
})

test('completing an enquiry back-fills lead_id onto the session events', async () => {
  await post(eventHandler, { sessionId: 's8', type: 'page_view', path: '/' })
  await post(eventHandler, { sessionId: 's8', type: 'form_step', detail: { step: '2' } })
  const lead = await post(leadHandler, { ...FULL, sessionId: 's8', stage: 'complete' })
  const rows = await testDb.sql`SELECT lead_id FROM events WHERE session_id = 's8'`
  assert.equal(rows.length, 2)
  assert.ok(rows.every((row) => Number(row.lead_id) === Number(lead.body.id)))
})

test('channel is derived on the server, and webmail reads as email not search', async () => {
  const res = await post(leadHandler, {
    ...FULL, sessionId: 's9', stage: 'complete',
    referrer: 'https://mail.google.com/mail/u/0/', channel: 'paid'
  })
  const rows = await testDb.sql`SELECT channel FROM leads WHERE id = ${res.body.id}`
  assert.equal(rows[0].channel, 'email')
})

test('the browser reports a blocked email and the row says so', async () => {
  const lead = await post(leadHandler, { ...FULL, sessionId: 's10', stage: 'complete' })
  const res = await post(notifiedHandler, { id: lead.body.id, ok: false, error: 'blocked' })
  assert.equal(res.statusCode, 204)
  const rows = await testDb.sql`SELECT notified_at, notify_error FROM leads WHERE id = ${lead.body.id}`
  assert.equal(rows[0].notified_at, null)
  assert.equal(rows[0].notify_error, 'blocked')
})

test('an unknown event type is refused', async () => {
  const res = await post(eventHandler, { sessionId: 's11', type: 'whatever' })
  assert.equal(res.statusCode, 400)
})
