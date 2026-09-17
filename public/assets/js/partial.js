/* The held partial, which is where a large share of the value of this build
   sits. Most trade sites lose the visitor who fills in half a form; this one
   keeps enough to ring them back.

   Armed when step 1 passes, then held. Sent only on genuine abandonment, and
   cancelled by a submission, so someone who completes the form produces one
   enquiry and not two. */
;(function () {
  var HIDDEN_MS = 45000
  var IDLE_MS = 180000

  var armed = null
  var sent = false
  var cancelled = false
  var hiddenTimer = null
  var idleTimer = null

  function post() {
    if (!armed || sent || cancelled) return
    sent = true
    var body = Object.assign({}, armed, {
      sessionId: window.Verge.visit.id,
      stage: 'partial',
      referrer: window.Verge.visit.referrer,
      landingPage: window.Verge.visit.landingPage,
      utm: window.Verge.visit.utm
    })
    try {
      fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true
      }).catch(function () {})
    } catch (e) {}
    window.Verge.track('form_abandon', { step: String(armed.step || 1) })
  }

  function resetIdle() {
    if (!armed || sent || cancelled) return
    clearTimeout(idleTimer)
    idleTimer = setTimeout(post, IDLE_MS)
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      /* Held rather than sent: a tab switch of a few seconds is not an
         abandonment, and a row per tab switch makes the partial worthless. */
      hiddenTimer = setTimeout(post, HIDDEN_MS)
    } else {
      clearTimeout(hiddenTimer)
      resetIdle()
    }
  })

  ;['keydown', 'pointerdown', 'scroll'].forEach(function (name) {
    window.addEventListener(name, resetIdle, { passive: true })
  })

  window.Verge = window.Verge || {}
  window.Verge.partial = {
    arm: function (fields) {
      armed = Object.assign({}, fields)
      resetIdle()
    },
    cancel: function () {
      cancelled = true
      clearTimeout(hiddenTimer)
      clearTimeout(idleTimer)
    }
  }
})()
