// Integer pence everywhere: in the database, in the maths, across the API.
// Pounds are a display format converted at the edge of the browser. Floating
// point cannot hold 0.15 exactly, and a chain of percentage steps in floats
// drifts away from what anyone was actually paid.

// Nearest penny, halves away from zero. Math.round takes -0.5 to -0, which on a
// job that lost money puts the error on whoever is owed least.
export function roundPence(value) {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

export function percentOf(pence, percent) {
  return roundPence((pence * percent) / 100)
}

// An even split in whole pence. The remainder cannot always divide, so the odd
// pennies go to the earliest partners in whichever direction the amount points,
// and the shares therefore always add back to exactly what was split.
export function splitEvenly(pence, ways) {
  if (ways <= 0) return []
  const base = Math.trunc(pence / ways)
  let left = pence - base * ways
  const step = left < 0 ? -1 : 1
  const shares = []
  for (let i = 0; i < ways; i++) {
    let share = base
    if (left !== 0) {
      share += step
      left -= step
    }
    shares.push(share)
  }
  return shares
}

// The waterfall, in order:
//   1. the agreed price
//   2. less tax set aside
//   3. less the lead fee, taken on the post-tax figure
//   4. less materials and subcontract costs actually incurred
//   5. the remainder, split equally between the partners
//
// Step 3 is worth stating out loud: on a 1,000 pound job the lead fee is 15% of
// 800, which is 120 rather than 150.
//
// Step 4 comes out of the shared remainder rather than off the top, so the lead
// fee stays the percentage that was agreed. A split that ignored materials
// would pay people out of money that has already gone to a merchant, which on
// quoted work is the easiest way to distribute more than the business earned.
export function computeJob(input) {
  const price = Math.trunc(input.pricePence || 0)
  const materials = Math.trunc(input.materialsPence || 0)
  const taxPercent = Number(input.taxPercent ?? 20)
  const leadFeePercent = Number(input.leadFeePercent ?? 15)
  const partners = input.partners || []
  const leadFeeTo = input.leadFeeTo || null

  const tax = percentOf(price, taxPercent)
  const postTax = price - tax
  const leadFee = leadFeeTo ? percentOf(postTax, leadFeePercent) : 0
  const remainder = postTax - leadFee - materials
  const shares = splitEvenly(remainder, partners.length)

  const payouts = {}
  partners.forEach((name, index) => {
    payouts[name] = shares[index]
  })
  if (leadFeeTo) payouts[leadFeeTo] = (payouts[leadFeeTo] || 0) + leadFee

  const distributed = Object.values(payouts).reduce((sum, value) => sum + value, 0)

  return {
    pricePence: price,
    taxPence: tax,
    leadFeePence: leadFee,
    materialsPence: materials,
    remainderPence: remainder,
    payouts,
    // Everything the job takes in is accounted for by exactly one of these
    // four. The route tests assert it after every operation they perform.
    balances: distributed + tax + materials === price
  }
}

// Display only, and only at the edge. Nothing downstream ever reads this back.
export function poundsFromPence(pence) {
  const negative = pence < 0
  const absolute = Math.abs(pence)
  const text = (absolute / 100).toFixed(2)
  return (negative ? '-' : '') + text
}

export function penceFromPounds(input) {
  const text = String(input == null ? '' : input).replace(/[^0-9.-]/g, '')
  if (!text) return 0
  return roundPence(Number(text) * 100)
}
