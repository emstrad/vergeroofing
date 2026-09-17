// Channel and device are derived here, on the server, and never accepted from
// the client: a value the browser sends is a value anyone can send, and the
// whole point of the number is deciding where the money goes.

const SEARCH = ['google', 'bing', 'duckduckgo', 'yahoo', 'ecosia', 'brave', 'startpage']
const SOCIAL = ['facebook', 'instagram', 'twitter', 'x', 'linkedin', 'tiktok', 'youtube', 'pinterest', 'nextdoor']
const EMAIL = ['mail.google.com', 'outlook.live.com', 'outlook.office.com', 'mail.yahoo.com', 'webmail']
const DIRECTORY = ['checkatrade', 'trustatrader', 'yell', 'ratedpeople', 'mybuilder', 'which.co.uk', 'trustpilot']

// Match on label boundaries rather than bare substrings: "notgoogle.com" is not
// Google, and "mygoogleads.example.com" is not a search engine.
function hasLabel(host, label) {
  return host === label || host.endsWith('.' + label) || host.split('.').includes(label)
}

export function hostOf(referrer) {
  if (!referrer) return ''
  try {
    return new URL(referrer).host.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function channelFrom(referrer, utm = {}, selfHost = '') {
  const medium = String(utm.utm_medium || '').toLowerCase()
  const source = String(utm.utm_source || '').toLowerCase()
  if (medium === 'cpc' || medium === 'ppc' || medium === 'paid' || utm.gclid) return 'paid'
  if (medium === 'email') return 'email'
  if (medium === 'social') return 'social'
  if (source && !referrer) return 'campaign'

  const host = hostOf(referrer)
  if (!host) return 'direct'
  if (selfHost && (host === selfHost.toLowerCase().replace(/^www\./, ''))) return 'internal'

  // Webmail is checked before search on purpose: mail.google.com is an email
  // click and it contains "google".
  if (EMAIL.some((name) => host === name || host.includes(name))) return 'email'
  if (SEARCH.some((name) => hasLabel(host, name))) return 'organic'
  if (SOCIAL.some((name) => hasLabel(host, name))) return 'social'
  if (DIRECTORY.some((name) => host.includes(name))) return 'directory'
  return 'referral'
}

export function deviceFrom(userAgent = '') {
  const ua = userAgent.toLowerCase()
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)) return 'tablet'
  if (/mobi|iphone|ipod|android|blackberry|windows phone/.test(ua)) return 'mobile'
  if (!ua) return 'unknown'
  return 'desktop'
}

// Only known campaign keys survive, so a crafted query string cannot write
// arbitrary keys into a jsonb column the dashboard then renders.
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'msclkid']

export function filterUtm(input) {
  const out = {}
  if (!input || typeof input !== 'object') return out
  for (const key of UTM_KEYS) {
    const value = input[key]
    if (value === undefined || value === null) continue
    const text = String(value).trim().slice(0, 120)
    if (text) out[key] = text
  }
  return out
}
