/* Optional postcode lookup. The typed fields are the truth and this only fills
   them in, so no key, no results and provider down all end at the same
   sentence: the visitor types the address exactly as they would have anyway. */
;(function () {
  var button = document.querySelector('[data-lookup]')
  var status = document.querySelector('[data-lookup-status]')
  var postcode = document.getElementById('q-postcode2')
  if (!button || !postcode) return

  button.hidden = false

  function say(text) {
    if (status) status.textContent = text
  }

  button.addEventListener('click', async function () {
    var value = postcode.value.trim()
    if (!value) return say('Enter the postcode first, then we can look it up.')
    say('Looking up that postcode')
    try {
      var res = await fetch('/api/address?postcode=' + encodeURIComponent(value))
      if (!res.ok) throw new Error('lookup unavailable')
      var data = await res.json()
      if (!data.addresses || !data.addresses.length) throw new Error('no results')
      var list = document.createElement('select')
      list.className = 'lookup-results'
      list.setAttribute('aria-label', 'Choose the address')
      data.addresses.forEach(function (entry, index) {
        var option = document.createElement('option')
        option.value = String(index)
        /* textContent, not innerHTML: this is a third party response. */
        option.textContent = entry.line1 + (entry.town ? ', ' + entry.town : '')
        list.appendChild(option)
      })
      list.addEventListener('change', function () {
        var chosen = data.addresses[Number(list.value)]
        document.getElementById('q-address1').value = chosen.line1 || ''
        document.getElementById('q-address2').value = chosen.line2 || ''
        document.getElementById('q-town').value = chosen.town || ''
      })
      var old = document.querySelector('.lookup-results')
      if (old) old.remove()
      button.insertAdjacentElement('afterend', list)
      say('Pick your address, or type it if it is not listed.')
    } catch (e) {
      say('Type the address in and we will take it from there.')
    }
  })
})()
