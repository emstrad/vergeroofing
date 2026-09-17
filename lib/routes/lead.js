import { sql } from '../db.js'
import { json, requireMethod, requireSameOrigin, readJson, clientIp, ipHash, str } from '../http.js'
import { validateLead } from '../validate.js'
import { channelFrom, deviceFrom, filterUtm, hostOf } from '../attribution.js'
import { checkRate } from '../ratelimit.js'

// One row per (session_id, stage). The coalesce matters: a held partial can
// flush after the completion has already been written, and without it that late
// write blanks the address the completion gave.
async function upsertLead(stage, lead, context) {
  const rows = await sql`
    INSERT INTO leads (
      session_id, stage, name, phone, email, postcode, address1, address2, town,
      property_type, job_types, notes, files, is_insurance,
      channel, referrer, landing_page, device, utm, ip_hash, user_agent
    ) VALUES (
      ${context.sessionId}, ${stage}, ${lead.name}, ${lead.phone}, ${lead.email || null},
      ${lead.postcode}, ${lead.address1 || null}, ${lead.address2 || null}, ${lead.town || null},
      ${lead.propertyType || null}, ${lead.jobTypes}, ${lead.notes || null}, ${lead.files},
      ${lead.isInsurance}, ${context.channel}, ${context.referrer || null},
      ${context.landingPage || null}, ${context.device}, ${JSON.stringify(context.utm)},
      ${context.ipHash}, ${context.userAgent || null}
    )
    ON CONFLICT (session_id, stage) DO UPDATE SET
      name          = COALESCE(NULLIF(EXCLUDED.name, ''), leads.name),
      phone         = COALESCE(NULLIF(EXCLUDED.phone, ''), leads.phone),
      email         = COALESCE(EXCLUDED.email, leads.email),
      postcode      = COALESCE(NULLIF(EXCLUDED.postcode, ''), leads.postcode),
      address1      = COALESCE(EXCLUDED.address1, leads.address1),
      address2      = COALESCE(EXCLUDED.address2, leads.address2),
      town          = COALESCE(EXCLUDED.town, leads.town),
      property_type = COALESCE(EXCLUDED.property_type, leads.property_type),
      job_types     = CASE WHEN cardinality(EXCLUDED.job_types) > 0
                           THEN EXCLUDED.job_types ELSE leads.job_types END,
      notes         = COALESCE(EXCLUDED.notes, leads.notes),
      files         = CASE WHEN cardinality(EXCLUDED.files) > 0
                           THEN EXCLUDED.files ELSE leads.files END,
      is_insurance  = leads.is_insurance OR EXCLUDED.is_insurance,
      updated_at    = now()
    RETURNING id
  `
  return rows[0].id
}

export default async function leadHandler(req, res) {
  if (!requireMethod(req, res, 'POST')) return
  if (!requireSameOrigin(req, res)) return

  const body = await readJson(req)
  if (!body) return json(res, 400, { error: 'bad_json' })

  // A filled honeypot gets a 200 and nothing written: a bot told it failed is a
  // bot that tries again differently.
  if (str(body.website, 100)) return json(res, 200, { ok: true, id: null })

  const sessionId = str(body.sessionId, 64)
  if (!sessionId) return json(res, 400, { error: 'missing_session' })

  const stage = body.stage === 'partial' ? 'partial' : 'complete'
  const hash = ipHash(clientIp(req))

  const rate = await checkRate('lead', hash)
  if (!rate.allowed) return json(res, 429, { error: 'rate_limited' })

  const { lead, errors } = validateLead(body, stage)
  if (Object.keys(errors).length) return json(res, 400, { error: 'invalid', fields: errors })

  const utm = filterUtm(body.utm)
  const referrer = str(body.referrer, 500)
  const selfHost = str(req.headers['x-forwarded-host'] || req.headers.host || '', 200)
  const context = {
    sessionId,
    utm,
    referrer,
    referrerHost: hostOf(referrer),
    landingPage: str(body.landingPage, 300),
    channel: channelFrom(referrer, utm, selfHost),
    device: deviceFrom(str(req.headers['user-agent'] || '', 400)),
    userAgent: str(req.headers['user-agent'] || '', 400),
    ipHash: hash
  }

  const id = await upsertLead(stage, lead, context)

  if (stage === 'complete') {
    // Credit every event in the session to the enquiry it produced. Without
    // this there is no way to tell which channel the booked work came from,
    // which is the only question the ad spend actually asks.
    await sql`UPDATE events SET lead_id = ${id} WHERE session_id = ${sessionId} AND lead_id IS NULL`
  }

  return json(res, 200, { ok: true, id, stage })
}
