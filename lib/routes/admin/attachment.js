import { sql } from '../../db.js'
import { json, requireMethod, str } from '../../http.js'

// The blobs are private, so the dashboard serves them through here rather than
// linking at storage directly. The path is checked against the leads table
// before anything is fetched: a path that no lead claims is not ours to serve,
// whatever it looks like.
export default async function attachmentHandler(req, res) {
  if (!requireMethod(req, res, 'GET')) return

  const url = new URL(req.url, 'https://placeholder.invalid')
  const path = str(url.searchParams.get('path'), 200)
  if (!path) return json(res, 400, { error: 'missing_path' })

  const rows = await sql`SELECT 1 FROM leads WHERE ${path} = ANY(files) LIMIT 1`
  if (!rows.length) return json(res, 404, { error: 'not_found' })

  if (!process.env.BLOB_READ_WRITE_TOKEN) return json(res, 503, { error: 'storage_unavailable' })

  const { head } = await import('@vercel/blob')
  try {
    const blob = await head(path, { token: process.env.BLOB_READ_WRITE_TOKEN })
    const upstream = await fetch(blob.downloadUrl || blob.url)
    if (!upstream.ok) return json(res, 502, { error: 'fetch_failed' })
    res.statusCode = 200
    res.setHeader('Content-Type', blob.contentType || 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-store')
    res.end(Buffer.from(await upstream.arrayBuffer()))
  } catch {
    return json(res, 404, { error: 'not_found' })
  }
}
