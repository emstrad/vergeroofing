import { sql } from '../db.js'
import { json, requireMethod } from '../http.js'

// Reports the schema as well as the connection, because the failure that
// actually happens is code deployed ahead of its migration, not a database that
// has gone away.
const EXPECTED = ['leads', 'events', 'staff_users', 'rate_hits']

export default async function healthHandler(req, res) {
  if (!requireMethod(req, res, 'GET')) return
  try {
    const rows = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY(${EXPECTED})
    `
    const present = rows.map((row) => row.table_name)
    const missing = EXPECTED.filter((name) => !present.includes(name))
    return json(res, missing.length ? 503 : 200, {
      ok: missing.length === 0,
      db: 'up',
      missing
    })
  } catch (error) {
    return json(res, 503, { ok: false, db: 'down', error: String(error.message || error) })
  }
}
