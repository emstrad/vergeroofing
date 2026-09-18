import { sql } from '../db.js'
import { json, requireMethod } from '../http.js'

// Monthly. An abandoned form can leave photographs in storage that no lead ever
// claimed, and a file nobody will ever look at should not pay rent forever.
export default async function sweepHandler(req, res) {
  if (!requireMethod(req, res, 'GET')) return

  const secret = process.env.CRON_SECRET
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return json(res, 401, { error: 'unauthorised' })
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) return json(res, 200, { ok: true, swept: 0, note: 'no storage configured' })

  const { list, del } = await import('@vercel/blob')
  const { blobs } = await list({ prefix: 'leads/', token: process.env.BLOB_READ_WRITE_TOKEN })

  // A day's grace, because a blob uploaded seconds ago may belong to a form
  // that is still being filled in.
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const claimed = new Set(
    (await sql`SELECT unnest(files) AS path FROM leads WHERE cardinality(files) > 0`).map((row) => row.path)
  )

  let swept = 0
  for (const blob of blobs) {
    if (claimed.has(blob.pathname)) continue
    if (new Date(blob.uploadedAt).getTime() > cutoff) continue
    await del(blob.url, { token: process.env.BLOB_READ_WRITE_TOKEN })
    swept++
  }

  return json(res, 200, { ok: true, swept })
}
