import { sql } from '../db.js'
import { json, requireMethod, requireSameOrigin, readJson, str } from '../http.js'

// The email relay is posted to from the browser, so the server never learns by
// itself whether the enquiry email went out. The browser reports back here, and
// the dashboard can then say "enquiry stored, email blocked" rather than
// leaving someone to find out by silence.
export default async function notifiedHandler(req, res) {
  if (!requireMethod(req, res, 'POST')) return
  if (!requireSameOrigin(req, res)) return

  const body = await readJson(req, 8 * 1024)
  if (!body) return json(res, 400, { error: 'bad_json' })

  const id = Number(body.id)
  if (!Number.isInteger(id) || id <= 0) return json(res, 400, { error: 'invalid' })

  const ok = body.ok === true || body.ok === 'true'
  const error = ok ? null : str(body.error, 300) || 'unknown'

  await sql`
    UPDATE leads
    SET notified_at = ${ok ? new Date().toISOString() : null},
        notify_error = ${error},
        updated_at = now()
    WHERE id = ${id}
  `

  res.statusCode = 204
  res.end()
}
