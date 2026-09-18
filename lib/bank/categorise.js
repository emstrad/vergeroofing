// Guesses, and only where the line itself says what it is. Everything guessed
// is stored as 'auto' so a choice made by hand is never overwritten by a rule
// learned somewhere else.

// Built for this trade specifically. A generic merchant list categorises a
// roofer's biggest expense as "shopping".
const MERCHANTS = {
  materials: [
    'travis perkins', 'jewson', 'selco', 'wickes', 'buildbase', 'huws gray',
    'covers', 'lawsons', 'sig roofing', 'burton roofing', 'avonside',
    'roofing supplies', 'builders merchant', 'keyline', 'howarth', 'mkm'
  ],
  'plant-and-hire': ['hss', 'speedy hire', 'brandon hire', 'hire station', 'scaffold', 'scaffolding'],
  waste: ['skip', 'hippo', 'waste', 'recycling', 'tip '],
  tools: ['screwfix', 'toolstation', 'machine mart', 'axminster', 'dewalt', 'makita'],
  fuel: ['bp ', 'shell', 'esso', 'texaco', 'jet ', 'applegreen', 'fuel', 'diesel'],
  vehicle: ['dvla', 'halfords', 'kwik fit', 'national tyres', 'euro car parts', 'insurance', 'breakdown'],
  insurance: ['public liability', 'tradesman insurance', 'simply business', 'hiscox'],
  software: ['google', 'microsoft', 'adobe', 'vercel', 'neon', 'xero', 'quickbooks'],
  phone: ['ee ', 'vodafone', 'o2 ', 'three', 'giffgaff', 'sky', 'bt '],
  tax: ['hmrc', 'hm revenue', 'vat ']
}

export function categoryFor(description, amountPence) {
  const text = ' ' + String(description || '').toLowerCase() + ' '
  for (const [category, needles] of Object.entries(MERCHANTS)) {
    if (needles.some((needle) => text.includes(needle))) return category
  }
  // Money in with nothing else to go on is most likely a customer, and the
  // matcher will confirm or deny it against the open jobs.
  return amountPence > 0 ? 'customer' : null
}

// A split is guessed only where the line itself says whose money it is: a
// transfer out to a partner by name, a top-up from one, a payment to the
// taxman. A card payment to a shop with a partner's name in it is a shop, and a
// transfer in from someone sharing a partner's first name is a customer.
const TRANSFER_WORDS = ['transfer', 'faster payment', 'bank payment', 'standing order', 'to ', 'from ']

export function splitFor(description, amountPence, partners) {
  const text = ' ' + String(description || '').toLowerCase() + ' '

  if (text.includes('hmrc') || text.includes('hm revenue')) return ['tax']

  const looksLikeTransfer = TRANSFER_WORDS.some((word) => text.includes(word))
  const isCardPayment = text.includes('card') || text.includes('contactless') || text.includes('pos ')
  if (!looksLikeTransfer || isCardPayment) return null

  // Money in from a person who happens to share a partner's first name is a
  // customer, so only money out is attributed by name.
  if (amountPence > 0) return null

  const named = partners.filter((partner) => text.includes(' ' + partner.toLowerCase()))
  return named.length === 1 ? named : null
}

// The learning key: the description with its numbers stripped, so
// "TRAVIS PERKINS 1234" and "TRAVIS PERKINS 5678" share one rule.
export function ruleKeyFor(description) {
  return String(description || '')
    .toLowerCase()
    .replace(/\d+/g, '')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}
