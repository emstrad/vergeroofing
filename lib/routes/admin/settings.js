import { sql } from '../../db.js'
import { json, requireMethod, requireSameOrigin, readJson, str } from '../../http.js'

// One row, id 1. These are the rates a NEW job takes; an existing job keeps the
// ones frozen onto it when it was raised.
export async function loadSettings() {
  const rows = await sql`SELECT * FROM job_settings WHERE id = 1`
  const row = rows[0] || {}
  return {
    taxPercent: Number(row.tax_percent ?? 20),
    leadFeePercent: Number(row.lead_fee_percent ?? 15),
    leadFeeTo: row.lead_fee_to ?? 'scott',
    partners: row.partners ?? ['tom', 'steve', 'ben', 'scott'],
    // Null means there is no standard deposit, and nothing derives one from the
    // price. A deposit is whatever was agreed, not half the figure.
    depositPercent: row.deposit_percent === null || row.deposit_percent === undefined
      ? null : Number(row.deposit_percent)
  }
}

function percent(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : fallback
}

export default async function settingsHandler(req, res) {
  if (req.method === 'GET') return json(res, 200, { settings: await loadSettings() })

  if (!requireMethod(req, res, 'POST')) return
  if (!requireSameOrigin(req, res)) return

  const body = await readJson(req, 8 * 1024)
  if (!body) return json(res, 400, { error: 'bad_json' })

  const current = await loadSettings()
  const partners = Array.isArray(body.partners)
    ? body.partners.map((name) => str(name, 40).toLowerCase()).filter(Boolean).slice(0, 8)
    : current.partners
  if (!partners.length) return json(res, 400, { error: 'need_a_partner' })

  const leadFeeTo = str(body.leadFeeTo, 40).toLowerCase() || current.leadFeeTo
  // The lead fee has to go to somebody who is actually in the split, or it
  // quietly leaves the business.
  if (leadFeeTo && !partners.includes(leadFeeTo)) return json(res, 400, { error: 'lead_fee_to_unknown' })

  await sql`
    UPDATE job_settings SET
      tax_percent      = ${percent(body.taxPercent, current.taxPercent)},
      lead_fee_percent = ${percent(body.leadFeePercent, current.leadFeePercent)},
      lead_fee_to      = ${leadFeeTo},
      partners         = ${partners},
      deposit_percent  = ${body.depositPercent === null || body.depositPercent === undefined
                            ? null : percent(body.depositPercent, null)},
      updated_at       = now()
    WHERE id = 1
  `
  return json(res, 200, { settings: await loadSettings() })
}
