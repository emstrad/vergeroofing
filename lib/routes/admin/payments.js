import { sql } from '../../db.js'
import { json, requireMethod, requireSameOrigin, readJson, str } from '../../http.js'

const LABELS = ['deposit', 'stage', 'balance', 'retention', 'payment']

// A payment is a row, not a tick box. Deposit, a stage or two on a larger job,
// then the balance, each for whatever was agreed. Paid in full falls out of the
// arithmetic rather than being a flag somebody sets.
export async function paymentsFor(jobId) {
  return sql`SELECT * FROM job_payments WHERE job_id = ${jobId} ORDER BY paid_on, id`
}

export default async function paymentsHandler(req, res) {
  const url = new URL(req.url, 'https://placeholder.invalid')

  if (req.method === 'GET') {
    const jobId = Number(url.searchParams.get('job'))
    if (!Number.isInteger(jobId) || jobId <= 0) return json(res, 400, { error: 'invalid_job' })
    return json(res, 200, { payments: await paymentsFor(jobId) })
  }

  if (!requireMethod(req, res, 'POST')) return
  if (!requireSameOrigin(req, res)) return

  const body = await readJson(req, 8 * 1024)
  if (!body) return json(res, 400, { error: 'bad_json' })

  if (body.remove) {
    const id = Number(body.remove)
    // Only a payment somebody typed can be deleted here. A payment created by a
    // matched bank line belongs to that line, and unmatching is what removes it.
    const rows = await sql`DELETE FROM job_payments WHERE id = ${id} AND bank_txn_id IS NULL RETURNING job_id`
    if (!rows.length) return json(res, 400, { error: 'not_removable' })
    return json(res, 200, { payments: await paymentsFor(rows[0].job_id) })
  }

  const jobId = Number(body.jobId)
  if (!Number.isInteger(jobId) || jobId <= 0) return json(res, 400, { error: 'invalid_job' })

  const amount = Math.trunc(Number(body.amountPence))
  if (!Number.isFinite(amount) || amount === 0) return json(res, 400, { error: 'invalid_amount' })

  const label = LABELS.includes(str(body.label, 20)) ? str(body.label, 20) : 'payment'
  const paidOn = /^\d{4}-\d{2}-\d{2}$/.test(str(body.paidOn, 20))
    ? str(body.paidOn, 20) : new Date().toISOString().slice(0, 10)

  await sql`
    INSERT INTO job_payments (job_id, amount_pence, paid_on, label, note)
    VALUES (${jobId}, ${amount}, ${paidOn}, ${label}, ${str(body.note, 300) || null})
  `
  return json(res, 200, { payments: await paymentsFor(jobId) })
}
