import { sql } from '../../db.js'
import { json, requireMethod, requireSameOrigin, readJson, str } from '../../http.js'
import { readStatement } from '../../bank/csv.js'
import { categoryFor, splitFor, ruleKeyFor } from '../../bank/categorise.js'
import { autoMatch } from '../../bank/match.js'
import { bankBalance } from '../../bank/balance.js'
import { loadSettings } from './settings.js'
import { decorate } from './jobs.js'

async function openJobs(settings) {
  const rows = await sql`
    SELECT j.*, coalesce((SELECT sum(amount_pence) FROM job_payments p WHERE p.job_id = j.id), 0)::bigint AS paid_pence
    FROM jobs j WHERE j.status IN ('quoted','booked','completed')
  `
  return rows.map((row) => decorate(row, settings))
}

async function listTransactions() {
  return sql`
    SELECT t.*, j.customer_name AS job_customer, j.postcode AS job_postcode
    FROM bank_transactions t LEFT JOIN jobs j ON j.id = t.job_id
    ORDER BY t.txn_date DESC, t.id DESC LIMIT 1000
  `
}

// Matching only ever adds a payment. Unmatching removes exactly the payment it
// created, and nothing a person typed.
async function writeMatchPayment(txn, jobId) {
  await sql`
    INSERT INTO job_payments (job_id, amount_pence, paid_on, label, note, bank_txn_id)
    VALUES (${jobId}, ${txn.amount_pence}, ${txn.txn_date}, 'payment', ${'bank: ' + txn.description}, ${txn.id})
    -- The index is partial, so the predicate has to be repeated here for
    -- Postgres to infer it.
    ON CONFLICT (bank_txn_id) WHERE bank_txn_id IS NOT NULL
      DO UPDATE SET job_id = EXCLUDED.job_id, amount_pence = EXCLUDED.amount_pence
  `
}

async function upload(req, res) {
  const body = await readJson(req, 8 * 1024 * 1024)
  if (!body || typeof body.csv !== 'string') return json(res, 400, { error: 'bad_csv' })

  const { rows, skipped } = readStatement(body.csv)
  if (!rows.length) return json(res, 400, { error: 'no_rows', skipped })

  const settings = await loadSettings()
  const jobs = await openJobs(settings)
  const rules = await sql`SELECT * FROM bank_rules`
  const ruleFor = new Map(rules.map((rule) => [rule.key, rule]))

  const statement = (await sql`
    INSERT INTO bank_statements (filename, rows_total) VALUES (${str(body.filename, 200) || 'statement.csv'}, ${rows.length})
    RETURNING id
  `)[0]

  let added = 0
  for (const row of rows) {
    const key = ruleKeyFor(row.description)
    const rule = ruleFor.get(key)
    const category = rule?.category ?? categoryFor(row.description, row.amountPence)
    const split = rule?.split_to ?? splitFor(row.description, row.amountPence, settings.partners)

    const inserted = await sql`
      INSERT INTO bank_transactions (
        statement_id, fingerprint, txn_date, description, amount_pence, balance_pence,
        category, category_kind, split_to, split_kind
      ) VALUES (
        ${statement.id}, ${row.fingerprint}, ${row.txnDate}, ${row.description},
        ${row.amountPence}, ${row.balancePence}, ${category || null},
        ${category ? 'auto' : null},
        ${split && split.length ? split : null}, ${split && split.length ? 'auto' : null}
      )
      -- The fingerprint is what stops overlapping months importing the same
      -- line twice, differently.
      ON CONFLICT (fingerprint) DO NOTHING
      RETURNING *
    `
    if (!inserted.length) continue
    added++

    const txn = inserted[0]
    if (rule?.job_id) {
      await sql`UPDATE bank_transactions SET job_id = ${rule.job_id}, job_kind = 'auto',
                is_materials = ${txn.amount_pence < 0} WHERE id = ${txn.id}`
      if (Number(txn.amount_pence) > 0) await writeMatchPayment(txn, rule.job_id)
      continue
    }
    if (Number(txn.amount_pence) > 0 && !split) {
      const job = autoMatch({ ...row, amountPence: Number(txn.amount_pence) }, jobs)
      if (job) {
        await sql`UPDATE bank_transactions SET job_id = ${job.id}, job_kind = 'auto' WHERE id = ${txn.id}`
        await writeMatchPayment(txn, job.id)
      }
    }
  }

  await sql`UPDATE bank_statements SET rows_new = ${added} WHERE id = ${statement.id}`
  return json(res, 200, {
    statement: statement.id, total: rows.length, added, skipped,
    transactions: await listTransactions(), balance: await bankBalance()
  })
}

// A choice made by hand is stored against the stripped description and applied
// at once to every untouched line with that key, and to every later upload.
async function learn(key, patch) {
  await sql`
    INSERT INTO bank_rules (key, category, split_to, job_id)
    VALUES (${key}, ${patch.category ?? null}, ${patch.split ?? null}, ${patch.jobId ?? null})
    ON CONFLICT (key) DO UPDATE SET
      category = coalesce(EXCLUDED.category, bank_rules.category),
      split_to = coalesce(EXCLUDED.split_to, bank_rules.split_to),
      job_id   = coalesce(EXCLUDED.job_id, bank_rules.job_id),
      updated_at = now()
  `
}

async function classify(req, res) {
  const body = await readJson(req, 32 * 1024)
  if (!body) return json(res, 400, { error: 'bad_json' })

  const id = Number(body.id)
  const rows = await sql`SELECT * FROM bank_transactions WHERE id = ${id}`
  if (!rows.length) return json(res, 404, { error: 'not_found' })
  const txn = rows[0]

  const settings = await loadSettings()
  const people = [...settings.partners, 'tax']

  // Every line is one of two things, never both, so setting one clears the
  // other rather than leaving a line that is counted twice.
  if (body.action === 'split') {
    const split = (Array.isArray(body.split) ? body.split : [])
      .map((name) => str(name, 40).toLowerCase())
      .filter((name) => people.includes(name))
    if (!split.length) return json(res, 400, { error: 'invalid_split' })
    await sql`DELETE FROM job_payments WHERE bank_txn_id = ${id}`
    await sql`UPDATE bank_transactions SET split_to = ${split}, split_kind = 'manual',
              job_id = NULL, job_kind = NULL, is_materials = false WHERE id = ${id}`
    await learn(ruleKeyFor(txn.description), { split })
  } else if (body.action === 'match') {
    const jobId = Number(body.jobId)
    const job = (await sql`SELECT * FROM jobs WHERE id = ${jobId}`)[0]
    if (!job) return json(res, 400, { error: 'unknown_job' })
    const isMaterials = Number(txn.amount_pence) < 0
    await sql`UPDATE bank_transactions SET job_id = ${jobId}, job_kind = 'manual',
              is_materials = ${isMaterials}, split_to = NULL, split_kind = NULL WHERE id = ${id}`
    if (isMaterials) {
      // Money out assigned to a job is a materials cost on it, which is what
      // makes that job's margin real rather than notional.
      await sql`UPDATE jobs SET materials_pence = coalesce(materials_pence, 0) + ${Math.abs(Number(txn.amount_pence))},
                updated_at = now() WHERE id = ${jobId}`
    } else {
      await writeMatchPayment(txn, jobId)
    }
    // Deliberately not learned. A merchant line belongs to the job that was on
    // site that week, not to every future line from that merchant, and a rule
    // here would quietly bill next month's materials to last month's roof.
  } else if (body.action === 'unmatch') {
    await sql`DELETE FROM job_payments WHERE bank_txn_id = ${id}`
    if (txn.job_id && txn.is_materials) {
      await sql`UPDATE jobs SET materials_pence = greatest(coalesce(materials_pence, 0) - ${Math.abs(Number(txn.amount_pence))}, 0),
                updated_at = now() WHERE id = ${txn.job_id}`
    }
    await sql`UPDATE bank_transactions SET job_id = NULL, job_kind = NULL, is_materials = false,
              split_to = NULL, split_kind = NULL WHERE id = ${id}`
  } else if (body.action === 'category') {
    const category = str(body.category, 40) || null
    await sql`UPDATE bank_transactions SET category = ${category}, category_kind = 'manual' WHERE id = ${id}`
    const key = ruleKeyFor(txn.description)
    await learn(key, { category })
    // Applied at once to every untouched line with the same key. The key is
    // computed the same way in JavaScript rather than reimplemented in SQL,
    // because two implementations of one rule drift apart.
    const others = await sql`
      SELECT id, description FROM bank_transactions
      WHERE id <> ${id} AND coalesce(category_kind, 'auto') = 'auto'
    `
    const sameKey = others.filter((row) => ruleKeyFor(row.description) === key).map((row) => row.id)
    if (sameKey.length) {
      // A line somebody has already chosen for is left exactly as they left it.
      await sql`UPDATE bank_transactions SET category = ${category}, category_kind = 'auto'
                WHERE id = ANY(${sameKey})`
    }
  } else {
    return json(res, 400, { error: 'unknown_action' })
  }

  return json(res, 200, { transactions: await listTransactions(), balance: await bankBalance() })
}

async function removeStatement(req, res, id) {
  // Removing an upload unticks what the remaining money no longer covers: the
  // payments it created go with it.
  const txns = await sql`SELECT id FROM bank_transactions WHERE statement_id = ${id}`
  for (const txn of txns) await sql`DELETE FROM job_payments WHERE bank_txn_id = ${txn.id}`
  await sql`DELETE FROM bank_statements WHERE id = ${id}`
  return json(res, 200, { transactions: await listTransactions(), balance: await bankBalance() })
}

export default async function bankHandler(req, res) {
  if (req.method === 'GET') {
    const settings = await loadSettings()
    return json(res, 200, {
      transactions: await listTransactions(),
      statements: await sql`SELECT * FROM bank_statements ORDER BY uploaded_at DESC`,
      jobs: await openJobs(settings),
      balance: await bankBalance(),
      people: [...settings.partners, 'tax']
    })
  }

  if (!requireMethod(req, res, 'POST')) return
  if (!requireSameOrigin(req, res)) return

  const url = new URL(req.url, 'https://placeholder.invalid')
  const mode = str(url.searchParams.get('mode'), 20)
  if (mode === 'upload') return upload(req, res)
  if (mode === 'remove') {
    const body = await readJson(req, 4 * 1024)
    return removeStatement(req, res, Number(body?.statementId))
  }
  return classify(req, res)
}
