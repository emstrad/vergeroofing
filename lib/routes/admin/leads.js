import { json, requireMethod, str } from '../../http.js'
import { rangeStart, recentLeads, timelineFor } from '../../metrics.js'

export default async function leadsHandler(req, res) {
  if (!requireMethod(req, res, 'GET')) return

  const url = new URL(req.url, 'https://placeholder.invalid')
  const sessionId = str(url.searchParams.get('session'), 64)

  // One lead's timeline, expanded inline on the dashboard. Fetched on demand
  // rather than with the table: most rows are never opened.
  if (sessionId) return json(res, 200, { events: await timelineFor(sessionId) })

  const range = str(url.searchParams.get('range'), 10) || '30d'
  return json(res, 200, { leads: await recentLeads(rangeStart(range)) })
}
