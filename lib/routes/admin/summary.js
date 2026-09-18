import { json, requireMethod, str } from '../../http.js'
import {
  rangeStart, headline, funnel, errorsByField, callsByPlacement,
  sources, pipeline, conversionBy, moneyOwed
} from '../../metrics.js'

// Two halves in one response: marketing, and the pipeline. One round trip,
// because the dashboard shows them together and two requests would render the
// page in two stages for no benefit.
export default async function summaryHandler(req, res) {
  if (!requireMethod(req, res, 'GET')) return

  const url = new URL(req.url, 'https://placeholder.invalid')
  const range = str(url.searchParams.get('range'), 10) || '30d'
  const from = rangeStart(range)

  const [counts, steps, errors, calls, source, pipe, byType, byChannel, owed] = await Promise.all([
    headline(from), funnel(from), errorsByField(from), callsByPlacement(from),
    sources(from), pipeline(from), conversionBy(from, 'type'), conversionBy(from, 'channel'),
    moneyOwed()
  ])

  return json(res, 200, {
    range,
    from: from.toISOString(),
    counts,
    funnel: steps,
    errors,
    calls,
    sources: source,
    pipeline: pipe,
    conversion: { byType, byChannel },
    owed
  })
}
