import { json, requireMethod, str } from '../http.js'
import { normalisePostcode } from '../validate.js'

// Optional. Every failure here ends at the same place in the browser: type the
// address in. That is why no branch below tries harder than the one before it.
export default async function addressHandler(req, res) {
  if (!requireMethod(req, res, 'GET')) return

  const key = process.env.ADDRESS_API_KEY
  if (!key) return json(res, 503, { error: 'lookup_unavailable', addresses: [] })

  const url = new URL(req.url, 'https://placeholder.invalid')
  const postcode = normalisePostcode(str(url.searchParams.get('postcode'), 12))
  if (!postcode) return json(res, 400, { error: 'invalid_postcode', addresses: [] })

  try {
    const upstream = await fetch(
      `https://api.getaddress.io/find/${encodeURIComponent(postcode)}?api-key=${encodeURIComponent(key)}&expand=true`,
      { signal: AbortSignal.timeout(4000) }
    )
    if (!upstream.ok) throw new Error('upstream ' + upstream.status)
    const data = await upstream.json()
    const addresses = (data.addresses || []).slice(0, 60).map((entry) => ({
      line1: str(entry.line_1, 120),
      line2: str(entry.line_2, 120),
      town: str(entry.town_or_city, 80)
    })).filter((entry) => entry.line1)
    // An hour at the edge: a postcode's addresses do not change during a visit,
    // and the free tier is counted in lookups.
    res.setHeader('Cache-Control', 'public, s-maxage=3600')
    return json(res, 200, { postcode, addresses })
  } catch {
    return json(res, 502, { error: 'lookup_failed', addresses: [] })
  }
}
