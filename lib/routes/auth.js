import { timingSafeEqual } from 'node:crypto'
import { sql } from '../db.js'
import { json, requireMethod, requireSameOrigin, readJson, actionFrom, clientIp, ipHash, str } from '../http.js'
import { checkRate } from '../ratelimit.js'
import { issue, clear } from '../session.js'

function sameCode(given, expected) {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

async function login(req, res) {
  if (!requireSameOrigin(req, res)) return
  const body = await readJson(req, 4 * 1024)
  if (!body) return json(res, 400, { error: 'bad_json' })

  const expected = process.env.STAFF_ACCESS_CODE
  if (!expected) return json(res, 503, { error: 'not_configured' })

  const hash = ipHash(clientIp(req))
  // Both throttles fail closed: a login route that keeps working while the
  // counter is down is a login route with no limit at all. The global one
  // exists because a per-address limit alone still lets a pool of addresses
  // walk a short keyspace.
  const perAddress = await checkRate('login', hash)
  const global = await checkRate('loginGlobal', 'all')
  if (!perAddress.allowed || !global.allowed) return json(res, 429, { error: 'rate_limited' })

  const code = str(body.code, 100)
  // Unknown and wrong do the same work and return the same message.
  if (!code || !sameCode(code, expected)) return json(res, 401, { error: 'bad_code' })

  issue(res)
  // Staff logins share the events table but are excluded from every visitor
  // metric, otherwise each sign-in registers as a phantom session and dilutes
  // the conversion rates.
  try {
    await sql`INSERT INTO events (session_id, type, ip_hash) VALUES ('staff', 'staff_login', ${hash})`
  } catch {
    // A logged-in session matters more than its log line.
  }
  return json(res, 200, { ok: true })
}

function logout(req, res) {
  clear(res)
  return json(res, 200, { ok: true })
}

export default async function authHandler(req, res) {
  if (!requireMethod(req, res, 'POST')) return
  const action = actionFrom(req)
  if (action === 'login') return login(req, res)
  if (action === 'logout') return logout(req, res)
  return json(res, 404, { error: 'unknown_action' })
}
