import { sql } from '../../db.js'
import { json, requireMethod, requireSameOrigin, readJson, str } from '../../http.js'
import { computeJob } from '../../splits.js'
import { loadSettings } from './settings.js'

const STATUSES = ['quoted', 'booked', 'completed', 'declined', 'cancelled']
const REASONS = ['price', 'timing', 'went-elsewhere', 'no-longer-needed', 'no-reply', 'other']

function money(value) {
  const number = Math.trunc(Number(value))
  return Number.isFinite(number) ? number : 0
}

function date(value) {
  const text = str(value, 20)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

// A card is the job joined to the lead it came from, so the address, phone,
// photographs and reported problem are on it without anyone typing them twice.
// A job entered by hand with no lead still gets a card from its own fields.
async function listJobs(url) {
  const status = str(url.searchParams.get('status'), 20)
  const search = str(url.searchParams.get('q'), 120).toLowerCase().replace(/\s+/g, ' ').trim()
  const settings = await loadSettings()

  const rows = await sql`
    SELECT j.*,
           coalesce((SELECT sum(amount_pence) FROM job_payments p WHERE p.job_id = j.id), 0)::bigint AS paid_pence,
           (SELECT max(paid_on) FROM job_payments p WHERE p.job_id = j.id) AS last_paid_on,
           l.files AS lead_files, l.notes AS lead_notes, l.job_types AS lead_job_types,
           l.channel AS lead_channel, l.email AS lead_email, l.phone AS lead_phone
    FROM jobs j
    LEFT JOIN leads l ON l.id = j.lead_id
    WHERE (${status}::text = '' OR j.status = ${status}::text)
    ORDER BY coalesce(j.job_date, j.quoted_on, j.created_at::date) DESC, j.id DESC
    LIMIT 500
  `

  const decorated = rows.map((row) => decorate(row, settings))
  if (!search) return decorated

  // Every word typed must match, so two words narrow rather than widen, and
  // spaces are ignored inside the haystack so n13gz finds N1 3GZ.
  const words = search.split(' ').filter(Boolean)
  return decorated.filter((job) => {
    const hay = [
      job.customer_name, job.address1, job.address2, job.town, job.postcode,
      job.email, job.phone, job.job_type, job.worker, job.notes
    ].join(' ').toLowerCase()
    const squashed = hay.replace(/\s+/g, '')
    return words.every((word) => hay.includes(word) || squashed.includes(word.replace(/\s+/g, '')))
  })
}

// The earnings are recomputed from the rates stored on the job, never from
// today's settings: raising a percentage next month must not rewrite what
// everyone earned last month.
export function decorate(row, settings) {
  const earnings = computeJob({
    pricePence: Number(row.price_pence),
    materialsPence: row.materials_pence === null ? 0 : Number(row.materials_pence),
    taxPercent: Number(row.tax_percent),
    leadFeePercent: Number(row.lead_fee_percent),
    leadFeeTo: row.lead_fee_to,
    partners: row.partners || settings.partners
  })
  const paid = Number(row.paid_pence || 0)
  return {
    ...row,
    price_pence: Number(row.price_pence),
    materials_pence: row.materials_pence === null ? null : Number(row.materials_pence),
    paid_pence: paid,
    outstanding_pence: Number(row.price_pence) - paid,
    // Paid in full is a computed fact, not a flag somebody remembers to set.
    paid_in_full: paid >= Number(row.price_pence) && Number(row.price_pence) > 0,
    materials_known: row.materials_pence !== null,
    earnings
  }
}

async function createJob(body) {
  const settings = await loadSettings()
  const lead = body.leadId ? (await sql`SELECT * FROM leads WHERE id = ${Number(body.leadId)}`)[0] : null

  const rows = await sql`
    INSERT INTO jobs (
      lead_id, status, job_type, customer_name, phone, email,
      address1, address2, town, postcode, notes, worker,
      price_pence, materials_pence, quoted_on, quote_expires_on, job_date,
      tax_percent, lead_fee_percent, lead_fee_to, partners
    ) VALUES (
      ${lead ? lead.id : null}, 'quoted', ${str(body.jobType, 40) || null},
      ${str(body.customerName, 120) || (lead ? lead.name : null)},
      ${str(body.phone, 40) || (lead ? lead.phone : null)},
      ${str(body.email, 200) || (lead ? lead.email : null)},
      ${str(body.address1, 120) || (lead ? lead.address1 : null)},
      ${str(body.address2, 120) || (lead ? lead.address2 : null)},
      ${str(body.town, 80) || (lead ? lead.town : null)},
      ${str(body.postcode, 12) || (lead ? lead.postcode : null)},
      ${str(body.notes, 2000) || null}, ${str(body.worker, 80) || null},
      ${money(body.pricePence)},
      ${body.materialsPence === null || body.materialsPence === undefined ? null : money(body.materialsPence)},
      ${date(body.quotedOn) || new Date().toISOString().slice(0, 10)},
      ${date(body.quoteExpiresOn)}, ${date(body.jobDate)},
      -- Today's rates, frozen onto the job at the moment it is raised.
      ${settings.taxPercent}, ${settings.leadFeePercent}, ${settings.leadFeeTo}, ${settings.partners}
    ) RETURNING *
  `
  return decorate({ ...rows[0], paid_pence: 0 }, settings)
}

async function updateJob(body) {
  const id = Number(body.id)
  if (!Number.isInteger(id) || id <= 0) return { error: 'invalid_id' }

  const status = STATUSES.includes(str(body.status, 20)) ? str(body.status, 20) : null
  const reason = REASONS.includes(str(body.declinedReason, 30)) ? str(body.declinedReason, 30) : null
  if (status === 'declined' && !reason) return { error: 'declined_needs_reason' }

  const rows = await sql`
    UPDATE jobs SET
      status          = coalesce(${status}, status),
      job_type        = coalesce(${str(body.jobType, 40) || null}, job_type),
      customer_name   = coalesce(${str(body.customerName, 120) || null}, customer_name),
      phone           = coalesce(${str(body.phone, 40) || null}, phone),
      email           = coalesce(${str(body.email, 200) || null}, email),
      address1        = coalesce(${str(body.address1, 120) || null}, address1),
      address2        = coalesce(${str(body.address2, 120) || null}, address2),
      town            = coalesce(${str(body.town, 80) || null}, town),
      postcode        = coalesce(${str(body.postcode, 12) || null}, postcode),
      notes           = coalesce(${str(body.notes, 2000) || null}, notes),
      worker          = coalesce(${str(body.worker, 80) || null}, worker),
      price_pence     = coalesce(${body.pricePence === undefined ? null : money(body.pricePence)}, price_pence),
      -- Left alone when the field was not sent, set to null when it was sent as
      -- null: "not known yet" is a real state and must not become zero.
      materials_pence = CASE WHEN ${body.materialsPence === undefined}::boolean THEN materials_pence
                             ELSE ${body.materialsPence === null ? null : money(body.materialsPence)}::bigint END,
      quoted_on       = coalesce(${date(body.quotedOn)}, quoted_on),
      quote_expires_on= coalesce(${date(body.quoteExpiresOn)}, quote_expires_on),
      job_date        = coalesce(${date(body.jobDate)}, job_date),
      declined_reason = CASE WHEN ${status}::text = 'declined' THEN ${reason}::text
                             WHEN ${status}::text IS NOT NULL THEN NULL
                             ELSE declined_reason END,
      completed_on    = CASE WHEN ${status}::text = 'completed' THEN coalesce(completed_on, current_date)
                             WHEN ${status}::text IS NOT NULL THEN NULL
                             ELSE completed_on END,
      updated_at      = now()
    WHERE id = ${id}
    RETURNING *
  `
  if (!rows.length) return { error: 'not_found' }

  const settings = await loadSettings()
  const paid = await sql`SELECT coalesce(sum(amount_pence),0)::bigint AS paid FROM job_payments WHERE job_id = ${id}`
  return { job: decorate({ ...rows[0], paid_pence: paid[0].paid }, settings) }
}

export default async function jobsHandler(req, res) {
  const url = new URL(req.url, 'https://placeholder.invalid')

  if (req.method === 'GET') {
    return json(res, 200, { jobs: await listJobs(url), types: await sql`SELECT * FROM job_types WHERE active ORDER BY position` })
  }

  if (!requireMethod(req, res, 'POST')) return
  if (!requireSameOrigin(req, res)) return

  const body = await readJson(req, 32 * 1024)
  if (!body) return json(res, 400, { error: 'bad_json' })

  if (body.id) {
    const result = await updateJob(body)
    if (result.error) return json(res, 400, result)
    return json(res, 200, result)
  }

  return json(res, 200, { job: await createJob(body) })
}
