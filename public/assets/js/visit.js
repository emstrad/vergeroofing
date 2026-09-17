/* Visit identity and first-party attribution. No cookie: this lives in
   sessionStorage, so it dies with the tab and never follows anyone anywhere.
   Everything here is first party, and the server derives the channel anyway. */
;(function () {
  var KEY = 'verge.visit'

  function makeId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID()
    return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  }

  function read() {
    try {
      return JSON.parse(sessionStorage.getItem(KEY) || 'null')
    } catch (e) {
      return null
    }
  }

  /* Captured once per visit. Re-reading the referrer on a later page would
     record an internal link as the source of the enquiry. */
  function start() {
    var existing = read()
    if (existing && existing.id) return existing
    var params = new URLSearchParams(location.search)
    var utm = {}
    ;['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'msclkid']
      .forEach(function (key) {
        var value = params.get(key)
        if (value) utm[key] = value
      })
    var visit = {
      id: makeId(),
      referrer: document.referrer || '',
      landingPage: location.pathname + location.search,
      utm: utm
    }
    try {
      sessionStorage.setItem(KEY, JSON.stringify(visit))
    } catch (e) {
      /* Private mode and blocked storage both land here. The visit still works,
         it simply is not remembered across pages, which costs a metric and
         never an enquiry. */
    }
    return visit
  }

  var visit = start()

  function track(type, detail) {
    var body = {
      sessionId: visit.id,
      type: type,
      detail: detail || {},
      path: location.pathname,
      referrer: visit.referrer,
      utm: visit.utm
    }
    var payload = JSON.stringify(body)
    /* keepalive, so an event fired as the page goes away still leaves. */
    try {
      fetch('/api/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(function () {})
    } catch (e) {}
  }

  window.Verge = window.Verge || {}
  window.Verge.visit = visit
  window.Verge.track = track

  track('page_view', {})

  /* Call and CTA clicks, by placement, so the dashboard can say which button on
     which page is doing the work. */
  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a, button')
    if (!link) return
    var placement = link.getAttribute('data-placement') || ''
    var href = link.getAttribute('href') || ''
    if (href.indexOf('tel:') === 0) track('call_click', { placement: placement })
    else if (link.hasAttribute('data-cta')) track('cta_click', { placement: placement })
  })
})()
