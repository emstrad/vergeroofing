// Integration tests swap lib/db.js for this, pointed at a real local Postgres.
// Everything else in the path (validation, throttling, attribution, the SQL
// itself) is the shipping code, so a test failing here is the deployed
// behaviour failing.
import pg from 'pg'

const connectionString =
  process.env.TEST_DATABASE_URL || 'postgres://verge:verge@localhost:5432/verge_test'

const pool = new pg.Pool({ connectionString, max: 4 })

// Same tagged-template shape as the Neon driver, so no handler knows which one
// it is running against.
export function sql(strings, ...values) {
  let text = ''
  strings.forEach((part, i) => {
    text += part
    if (i < values.length) text += '$' + (i + 1)
  })
  return pool.query(text, values).then((result) => result.rows)
}

export async function dbHealthy() {
  try {
    await sql`SELECT 1`
    return true
  } catch {
    return false
  }
}

export async function reset() {
  await sql`TRUNCATE events, leads, rate_hits, jobs, job_payments,
                     bank_transactions, bank_statements, bank_rules RESTART IDENTITY CASCADE`
  // Settings are a single configured row rather than test data, so they are put
  // back to the agreed defaults instead of being emptied.
  await sql`UPDATE job_settings SET tax_percent = 20, lead_fee_percent = 15,
            lead_fee_to = 'scott', partners = ARRAY['tom','steve','ben','scott'],
            deposit_percent = NULL WHERE id = 1`
}

export async function close() {
  await pool.end()
}
