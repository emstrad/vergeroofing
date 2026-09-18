/* Steps, validation and submit. The messages here are the same strings the
   server returns, so a client-side check and a 400 say the same thing. */
;(function () {
  var form = document.getElementById('quote-form')
  if (!form) return

  var steps = Array.prototype.slice.call(form.querySelectorAll('.form-step'))
  var current = 1

  function show(step) {
    steps.forEach(function (panel) {
      panel.hidden = Number(panel.getAttribute('data-step')) !== step
    })
    current = step
    window.Verge.track('form_step', { step: String(step) })
    var first = form.querySelector('.form-step:not([hidden]) input, .form-step:not([hidden]) select')
    if (first) first.focus({ preventScroll: true })
  }

  /* The row carries the state, matching the site's CSS, and the message itself
     is the one the API returns for that field. */
  function setError(field, invalid) {
    var box = form.querySelector('#err-' + field)
    if (!box) return
    var row = box.closest('.form-row')
    if (row) row.classList.toggle('has-err', !!invalid)
    var input = form.querySelector('[name="' + field + '"]')
    if (input) input.setAttribute('aria-invalid', invalid ? 'true' : 'false')
    if (invalid) window.Verge.track('form_error', { field: field, step: String(current) })
  }

  function value(name) {
    var input = form.querySelector('.form-step:not([hidden]) [name="' + name + '"]') ||
      form.querySelector('[name="' + name + '"]')
    return input ? input.value.trim() : ''
  }

  function postcodeOk(text) {
    return /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i.test(text.replace(/\s+/g, ' ').trim())
  }

  function checkStepOne() {
    var ok = true
    if (!value('name')) { setError('name', true); ok = false } else setError('name', false)
    if (value('phone').replace(/\D/g, '').length < 10) { setError('phone', true); ok = false }
    else setError('phone', false)
    if (!postcodeOk(value('postcode'))) { setError('postcode', true); ok = false }
    else setError('postcode', false)
    return ok
  }

  function checkStepTwo() {
    var picked = form.querySelectorAll('[name="jobTypes"]:checked').length
    setError('jobTypes', picked === 0)
    return picked > 0
  }

  function checkStepThree() {
    var ok = true
    if (!value('propertyType')) { setError('propertyType', true); ok = false } else setError('propertyType', false)
    if (!postcodeOk(value('postcode2'))) { setError('postcode2', true); ok = false } else setError('postcode2', false)
    if (!value('address1')) { setError('address1', true); ok = false } else setError('address1', false)
    if (!value('town')) { setError('town', true); ok = false } else setError('town', false)
    var email = value('email')
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setError('email', true); ok = false }
    else setError('email', false)
    return ok
  }

  function collect() {
    var jobTypes = Array.prototype.map.call(
      form.querySelectorAll('[name="jobTypes"]:checked'),
      function (box) { return box.value }
    )
    var property = document.getElementById('q-postcode2')
    return {
      name: value('name'),
      phone: value('phone'),
      email: value('email'),
      postcode: (property && property.value.trim()) || value('postcode'),
      address1: value('address1'),
      address2: value('address2'),
      town: value('town'),
      propertyType: value('propertyType'),
      jobTypes: jobTypes,
      notes: value('notes'),
      isInsurance: !!form.querySelector('[name="isInsurance"]:checked'),
      website: value('website')
    }
  }

  form.addEventListener('click', function (event) {
    var next = event.target.getAttribute && event.target.getAttribute('data-next')
    var back = event.target.getAttribute && event.target.getAttribute('data-back')
    if (back) return show(Number(back))
    if (!next) return
    if (current === 1) {
      if (!checkStepOne()) return
      /* Arming happens here and nowhere else: passing step 1 is the moment
         there is enough to ring somebody back. */
      window.Verge.partial.arm({
        name: value('name'), phone: value('phone'), postcode: value('postcode'), step: 1
      })
    }
    if (current === 2 && !checkStepTwo()) return
    /* Prefill the property postcode from step 1. It stays editable, because the
       two are not always the same. */
    var property = document.getElementById('q-postcode2')
    if (property && !property.value) property.value = document.getElementById('q-postcode').value
    show(Number(next))
  })

  var started = false
  form.addEventListener('input', function () {
    if (started) return
    started = true
    window.Verge.track('form_start', {})
  })

  form.addEventListener('submit', async function (event) {
    event.preventDefault()
    if (!checkStepThree()) return
    var submit = form.querySelector('button[type="submit"]')
    submit.disabled = true

    /* Cancelled before anything is sent: someone who completes the form must
       not also arrive as an abandonment. */
    window.Verge.partial.cancel()

    var payload = collect()
    payload.sessionId = window.Verge.visit.id
    payload.stage = 'complete'
    payload.referrer = window.Verge.visit.referrer
    payload.landingPage = window.Verge.visit.landingPage
    payload.utm = window.Verge.visit.utm

    /* Uploads happen here, on submit, one at a time. A file that fails is
       mentioned on the confirmation rather than thrown up as an error to fix:
       a file must never cost somebody an enquiry. */
    var uploaded = { paths: [], failed: 0 }
    if (window.Verge.upload) uploaded = await window.Verge.upload.run()
    payload.files = uploaded.paths

    var id = null
    try {
      var res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      var data = await res.json()
      if (!res.ok) {
        submit.disabled = false
        if (data && data.fields) {
          Object.keys(data.fields).forEach(function (field) { setError(field, true) })
          show(3)
        }
        return
      }
      id = data.id
    } catch (e) {
      submit.disabled = false
      return
    }

    window.Verge.track('form_submit', {})
    finish(id, uploaded.failed)

    /* The email relay is posted from the browser: relays behind Cloudflare
       answer a server-to-server call with a bot challenge and a 403 rather than
       sending anything. A blocked browser therefore costs the email and never
       the enquiry, and /api/notified records which of the two happened. */
    if (window.Verge.relay) {
      window.Verge.relay(payload).then(function () {
        report(id, true, null)
      }).catch(function (error) {
        report(id, false, String(error && error.message || error))
      })
    }
  })

  function report(id, ok, error) {
    if (!id) return
    try {
      fetch('/api/notified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, ok: ok, error: error }),
        keepalive: true
      }).catch(function () {})
    } catch (e) {}
  }

  function finish(id, failedFiles) {
    steps.forEach(function (panel) { panel.hidden = true })
    var done = form.querySelector('[data-done]')
    var message = form.querySelector('[data-done-message]')
    var text = 'We will reply today. Coming out to look costs you nothing, and your photos and fixed written price follow within 48 hours.'
    if (failedFiles) {
      text += ' ' + failedFiles + (failedFiles === 1 ? ' photo' : ' photos') +
        ' did not upload. Reply to our message with it attached and we will add it.'
    }
    message.textContent = text
    done.hidden = false
    done.focus && done.focus()
  }
})()
