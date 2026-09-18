import { json, requireMethod } from '../http.js'

// Google Place Details returns at most five reviews and Google chooses which
// five. There is no paging, so this is the whole of what any site can show
// live, and it is why content/reviews.js exists as well.
export default async function reviewsHandler(req, res) {
  if (!requireMethod(req, res, 'GET')) return

  const key = process.env.GOOGLE_MAPS_API_KEY
  const place = process.env.GOOGLE_PLACE_ID
  if (!key || !place) return json(res, 200, { reviews: [], live: false })

  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(place)}&fields=reviews&key=${encodeURIComponent(key)}`
    const upstream = await fetch(url, { signal: AbortSignal.timeout(4000) })
    const data = await upstream.json()
    const reviews = (data.result?.reviews || []).map((review) => ({
      // Reproduced exactly, typos included. Tidying somebody's words makes them
      // yours. The client escapes before inserting, because this is other
      // people's writing arriving over a network.
      text: String(review.text || '').slice(0, 1200),
      attr: String(review.author_name || '').slice(0, 80),
      src: 'Google'
    })).filter((review) => review.text)

    // A day at the edge, which also keeps this inside the free tier: five
    // reviews that change rarely do not need fetching per visitor.
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400')
    // Below the floor the page keeps the cards the build wrote rather than
    // replacing them with a thinner set.
    return json(res, 200, { reviews: reviews.length >= 5 ? reviews : [], live: true })
  } catch {
    return json(res, 200, { reviews: [], live: false })
  }
}
