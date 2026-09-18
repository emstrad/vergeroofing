import { sql } from './db.js'

// Every count here is aggregated in SQL. Nothing pulls a table into JavaScript
// to count it, so the dashboard stays fast as the events table grows.
//
// Staff logins are excluded from every visitor metric: they share the events
// table, and counting them registers each sign-in as a phantom session and
// dilutes the conversion rates.
export function rangeStart(range) {
  // "Today" is a local day, not a UTC one: a job booked at 11pm belongs to the
  // day the person booked it.
  const now = new Date()
  if (range === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (range === '7d') return new Date(Date.now() - 7 * 864e5)
  if (range === '30d') return new Date(Date.now() - 30 * 864e5)
  return new Date('2000-01-01')
}

export async function headline(from) {
  const rows = await sql`
    SELECT
      (SELECT count(*)::int FROM leads WHERE stage = 'complete' AND created_at >= ${from}) AS enquiries,
      (SELECT count(*)::int FROM leads WHERE stage = 'partial' AND created_at >= ${from}) AS partials,
      (SELECT count(DISTINCT session_id)::int FROM events
         WHERE created_at >= ${from} AND session_id <> 'staff') AS sessions,
      (SELECT count(*)::int FROM events
         WHERE type = 'call_click' AND created_at >= ${from}) AS calls,
      (SELECT count(*)::int FROM leads
         WHERE stage = 'complete' AND created_at >= ${from} AND notify_error IS NOT NULL) AS email_failures
  `
  return rows[0]
}

export async function funnel(from) {
  const rows = await sql`
    SELECT type, detail->>'step' AS step, count(DISTINCT session_id)::int AS sessions
    FROM events
    WHERE created_at >= ${from} AND session_id <> 'staff'
      AND type IN ('page_view','form_start','form_step','form_submit','form_abandon')
    GROUP BY type, detail->>'step'
    ORDER BY type, step
  `
  return rows
}

export async function errorsByField(from) {
  return sql`
    SELECT detail->>'field' AS field, count(*)::int AS hits
    FROM events
    WHERE type = 'form_error' AND created_at >= ${from} AND detail->>'field' IS NOT NULL
    GROUP BY 1 ORDER BY hits DESC LIMIT 20
  `
}

export async function callsByPlacement(from) {
  return sql`
    SELECT coalesce(nullif(detail->>'placement',''), 'unknown') AS placement, count(*)::int AS hits
    FROM events
    WHERE type IN ('call_click','cta_click') AND created_at >= ${from}
    GROUP BY 1 ORDER BY hits DESC
  `
}

export async function sources(from) {
  const [channels, hosts, campaigns, landing, devices] = await Promise.all([
    sql`SELECT coalesce(channel,'unknown') AS key, count(*)::int AS leads
        FROM leads WHERE stage = 'complete' AND created_at >= ${from}
        GROUP BY 1 ORDER BY leads DESC`,
    sql`SELECT coalesce(nullif(split_part(split_part(referrer,'//',2),'/',1),''),'direct') AS key,
               count(*)::int AS leads
        FROM leads WHERE stage = 'complete' AND created_at >= ${from}
        GROUP BY 1 ORDER BY leads DESC LIMIT 15`,
    sql`SELECT coalesce(utm->>'utm_campaign','none') AS key, count(*)::int AS leads
        FROM leads WHERE stage = 'complete' AND created_at >= ${from}
        GROUP BY 1 ORDER BY leads DESC LIMIT 15`,
    sql`SELECT coalesce(landing_page,'unknown') AS key, count(*)::int AS leads
        FROM leads WHERE stage = 'complete' AND created_at >= ${from}
        GROUP BY 1 ORDER BY leads DESC LIMIT 15`,
    sql`SELECT coalesce(device,'unknown') AS key, count(*)::int AS leads
        FROM leads WHERE stage = 'complete' AND created_at >= ${from}
        GROUP BY 1 ORDER BY leads DESC`
  ])
  return { channels, hosts, campaigns, landing, devices }
}

// Quote conversion is the headline number of a business that quotes everything,
// and the one nobody measures. Declined quotes stay in the denominator: a
// conversion rate that quietly drops the losses is not a conversion rate.
export async function pipeline(from) {
  const rows = await sql`
    SELECT
      count(*) FILTER (WHERE quoted_on >= ${from})::int AS quotes_sent,
      count(*) FILTER (WHERE quoted_on >= ${from} AND status IN ('booked','completed'))::int AS quotes_won,
      count(*) FILTER (WHERE quoted_on >= ${from} AND status IN ('declined','cancelled'))::int AS quotes_lost,
      coalesce(avg(price_pence) FILTER (WHERE quoted_on >= ${from}), 0)::bigint AS avg_quote_pence,
      coalesce(avg(price_pence) FILTER (WHERE quoted_on >= ${from} AND status IN ('booked','completed')), 0)::bigint AS avg_won_pence,
      coalesce(sum(price_pence) FILTER (WHERE status = 'quoted'), 0)::bigint AS outstanding_quotes_pence,
      count(*) FILTER (WHERE status = 'quoted' AND quoted_on < current_date - 21)::int AS stale_quotes
    FROM jobs
  `
  return rows[0]
}

export async function conversionBy(from, dimension) {
  if (dimension === 'channel') {
    return sql`
      SELECT coalesce(l.channel,'direct') AS key,
             count(*)::int AS quotes,
             count(*) FILTER (WHERE j.status IN ('booked','completed'))::int AS won
      FROM jobs j LEFT JOIN leads l ON l.id = j.lead_id
      WHERE j.quoted_on >= ${from}
      GROUP BY 1 ORDER BY quotes DESC
    `
  }
  return sql`
    SELECT coalesce(job_type,'other') AS key,
           count(*)::int AS quotes,
           count(*) FILTER (WHERE status IN ('booked','completed'))::int AS won
    FROM jobs WHERE quoted_on >= ${from}
    GROUP BY 1 ORDER BY quotes DESC
  `
}

// A job finished but not paid for is the most important row on the dashboard,
// so it is its own query rather than a filter somebody has to remember.
export async function moneyOwed() {
  return sql`
    SELECT j.id, j.customer_name, j.phone, j.postcode, j.completed_on, j.price_pence,
           coalesce((SELECT sum(amount_pence) FROM job_payments p WHERE p.job_id = j.id), 0)::bigint AS paid_pence
    FROM jobs j
    WHERE j.status = 'completed'
    GROUP BY j.id
    HAVING j.price_pence > coalesce((SELECT sum(amount_pence) FROM job_payments p WHERE p.job_id = j.id), 0)
    ORDER BY j.completed_on
  `
}

export async function recentLeads(from, limit = 100) {
  return sql`
    SELECT id, session_id, stage, name, phone, email, postcode, address1, town,
           property_type, job_types, notes, files, is_insurance, channel, referrer,
           landing_page, device, utm, notified_at, notify_error, created_at
    FROM leads
    WHERE created_at >= ${from}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `
}

export async function timelineFor(sessionId) {
  return sql`
    SELECT type, detail, path, created_at
    FROM events WHERE session_id = ${sessionId}
    ORDER BY created_at
  `
}
