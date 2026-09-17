import { json, requireMethod, requireSameOrigin, str } from '../http.js'

const MAX_PROXY_BYTES = 4 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']

function safeName(name) {
  const cleaned = str(name, 120).replace(/[^A-Za-z0-9._-]/g, '-').replace(/-+/g, '-')
  return cleaned.slice(-100) || 'upload'
}

// The shape lib/validate.js checks a submitted path against. The two have to
// stay in step: that check is what stops the files column being pointed at
// somebody else's blob.
export function blobPath(sessionId, name) {
  const session = str(sessionId, 40).replace(/[^A-Za-z0-9-]/g, '')
  return `leads/${session}/${Date.now()}-${safeName(name)}`
}

async function readBytes(req, limit) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('too_large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

// The bytes arrive as a raw body with the name in the query string rather than
// as multipart: both ends of this are ours, and a multipart parser is a hundred
// lines that exist only to undo something the browser did for no reason.
export default async function uploadHandler(req, res) {
  if (!requireMethod(req, res, 'POST')) return
  if (!requireSameOrigin(req, res)) return

  // Attachments are optional. Saying so plainly lets the client fall through
  // instead of retrying something that cannot work, and an enquiry without its
  // photos is still an enquiry.
  if (!process.env.BLOB_READ_WRITE_TOKEN) return json(res, 503, { error: 'uploads_unavailable' })

  const url = new URL(req.url, 'https://placeholder.invalid')
  const sessionId = str(url.searchParams.get('session'), 64)
  const name = str(url.searchParams.get('name'), 120)
  const type = str(req.headers['content-type'], 100).split(';')[0]

  if (!sessionId) return json(res, 400, { error: 'missing_session' })
  if (!ALLOWED.includes(type)) return json(res, 415, { error: 'unsupported_type' })

  let bytes
  try {
    bytes = await readBytes(req, MAX_PROXY_BYTES)
  } catch {
    // Vercel will not carry a larger body into a function, so this is the
    // ceiling rather than a policy choice.
    return json(res, 413, { error: 'too_large' })
  }
  if (!bytes.length) return json(res, 400, { error: 'empty' })

  const path = blobPath(sessionId, name)
  const { put } = await import('@vercel/blob')
  await put(path, bytes, {
    // Private: the dashboard serves these through an authenticated route, so a
    // customer's roof photos are not a public URL anyone can walk.
    access: 'private',
    contentType: type,
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN
  })

  return json(res, 200, { path })
}
