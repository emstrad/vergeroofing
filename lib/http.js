import { createHash } from 'node:crypto'

export function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  // no-store unless the route has already said otherwise: the cacheable routes
  // (address lookup, reviews) set their own and must not be overwritten here.
  if (!res.getHeader || !res.getHeader('Cache-Control')) {
    res.setHeader('Cache-Control', 'no-store')
  }
  res.end(JSON.stringify(body))
}

export function requireMethod(req, res, method) {
  if (req.method === method) return true
  res.setHeader('Allow', method)
  json(res, 405, { error: 'method_not_allowed' })
  return false
}

// There is no Access-Control-Allow-Origin header anywhere on this site, so a
// cross-origin browser fetch cannot read a response. This is the write-side
// half: a request that declares a foreign Origin is refused outright.
export function requireSameOrigin(req, res) {
  const origin = req.headers.origin
  if (!origin) return true // same-origin form posts and server probes send none
  const host = req.headers['x-forwarded-host'] || req.headers.host
  let originHost = ''
  try {
    originHost = new URL(origin).host
  } catch {
    originHost = ''
  }
  if (originHost && host && originHost === host) return true
  json(res, 403, { error: 'bad_origin' })
  return false
}

// api/admin/[action].js and friends: the action is the last path segment.
export function actionFrom(req) {
  const fromQuery = req.query && (req.query.action || req.query.slug)
  if (typeof fromQuery === 'string' && fromQuery) return fromQuery
  if (Array.isArray(fromQuery) && fromQuery.length) return fromQuery[fromQuery.length - 1]
  const path = (req.url || '').split('?')[0].replace(/\/+$/, '')
  return path.slice(path.lastIndexOf('/') + 1)
}

export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim()
  return req.socket?.remoteAddress || ''
}

// Never store a raw IP. Without the salt a sha256 of an IPv4 is brute-forced in
// seconds, at which point the promise is worth nothing, so an unset salt is a
// hard failure rather than a default.
export function ipHash(ip) {
  const salt = process.env.IP_SALT
  if (!salt) throw new Error('IP_SALT is not set')
  if (!ip) return null
  return createHash('sha256').update(ip + salt).digest('hex')
}

export async function readText(req, limitBytes = 64 * 1024) {
  if (typeof req.body === 'string') return req.body
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > limitBytes) throw new Error('body_too_large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function readJson(req, limitBytes) {
  const text = await readText(req, limitBytes)
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// Everything arriving from a browser goes through this before it is looked at:
// trimmed, length-capped, and a string whatever the client sent.
export function str(value, max = 300) {
  if (value === null || value === undefined) return ''
  const text = String(value).trim()
  return text.length > max ? text.slice(0, max) : text
}
