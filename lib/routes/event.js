import { sql } from '../db.js'
import { json, requireMethod, requireSameOrigin, readJson, clientIp, ipHash, str } from '../http.js'
import { channelFrom, deviceFrom, filterUtm } from '../attribution.js'
import { checkRate } from '../ratelimit.js'

const TYPES = new Set([
  'page_view', 'form_start', 'form_step', 'form_error', 'form_submit',
  'form_abandon', 'call_click', 'cta_click', 'upload', 'staff_login'
])

// detail is an allow-list, not a free jsonb column: everything the dashboard
// reads out of it has to be something the site put in.
const DETAIL_KEYS = ['step', 'field', 'placement', 'label', 'value', 'reason', 'count']

function cleanDetail(input) {
  const out = {}
  if (!input || typeof input !== 'object') return out
  for (const key of DETAIL_KEYS) {
    if (input[key] === undefined || input[key] === null) continue
    out[key] = str(input[key], 120)
  }
  // Capped at 1KB so a crafted payload cannot make every row expensive to read.
  const text = JSON.stringify(out)
  return text.length > 1024 ? {} : out
}

export default async function eventHandler(req, res) {
  if (!requireMethod(req, res, 'POST')) return
  if (!requireSameOrigin(req, res)) return

  const body = await readJson(req, 8 * 1024)
  if (!body) return json(res, 400, { error: 'bad_json' })

  const sessionId = str(body.sessionId, 64)
  const type = str(body.type, 40)
  if (!sessionId || !TYPES.has(type)) return json(res, 400, { error: 'invalid' })

  const hash = ipHash(clientIp(req))
  const rate = await checkRate('event', hash)
  if (!rate.allowed) return json(res, 429, { error: 'rate_limited' })

  const utm = filterUtm(body.utm)
  const referrer = str(body.referrer, 500)
  const selfHost = str(req.headers['x-forwarded-host'] || req.headers.host || '', 200)

  await sql`
    INSERT INTO events (session_id, type, detail, path, channel, referrer, device, utm, ip_hash)
    VALUES (
      ${sessionId}, ${type}, ${JSON.stringify(cleanDetail(body.detail))},
      ${str(body.path, 300) || null}, ${channelFrom(referrer, utm, selfHost)},
      ${referrer || null}, ${deviceFrom(str(req.headers['user-agent'] || '', 400))},
      ${JSON.stringify(utm)}, ${hash}
    )
  `

  // Nothing useful comes back, and a body invites a client that waits for one.
  res.statusCode = 204
  res.end()
}
