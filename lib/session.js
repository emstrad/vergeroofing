import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto'
import { json } from './http.js'

const COOKIE = 'verge_staff'
const EIGHT_HOURS = 8 * 60 * 60 * 1000

// Signed rather than encrypted: the cookie holds nothing secret, and the
// signature is what stops it being edited. Rotating SESSION_SECRET signs
// everyone out, which is the intended emergency exit.
function sign(payload) {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function issue(res) {
  const body = JSON.stringify({ id: randomUUID(), exp: Date.now() + EIGHT_HOURS })
  const payload = Buffer.from(body).toString('base64url')
  const value = `${payload}.${sign(payload)}`
  res.setHeader('Set-Cookie', [
    `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${EIGHT_HOURS / 1000}`
  ])
}

export function clear(res) {
  res.setHeader('Set-Cookie', [`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`])
}

function cookieFrom(req) {
  const header = req.headers.cookie || ''
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === COOKIE) return rest.join('=')
  }
  return ''
}

export function readSession(req) {
  const raw = cookieFrom(req)
  if (!raw) return null
  const [payload, signature] = raw.split('.')
  if (!payload || !signature) return null

  const expected = Buffer.from(sign(payload))
  const given = Buffer.from(signature)
  // Constant time, so the comparison cannot be walked byte by byte.
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return session.exp > Date.now() ? session : null
  } catch {
    return null
  }
}

// Every /api/admin/* route calls this first.
export function requireAuth(req, res) {
  if (readSession(req)) return true
  json(res, 401, { error: 'unauthorised' })
  return false
}
