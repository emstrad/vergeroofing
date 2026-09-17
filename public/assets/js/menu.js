/* The mobile menu, which is not a library. The button reports its own state,
   opening moves focus into the panel and closing puts it back, Tab is trapped
   while open, Escape and outside-click and link-follow and resize all close it,
   and the page behind does not scroll. With JavaScript off the markup is a
   plain nav, which is why the head removes the no-js class rather than this
   file building anything. */
;(function () {
  var button = document.querySelector('[data-menu-button]')
  var panel = document.querySelector('[data-menu-panel]')
  if (!button || !panel) return

  var lastFocused = null

  function focusable() {
    return Array.prototype.filter.call(
      panel.querySelectorAll('a[href], button:not([disabled])'),
      function (el) { return el.offsetParent !== null }
    )
  }

  function open() {
    lastFocused = document.activeElement
    panel.hidden = false
    button.setAttribute('aria-expanded', 'true')
    document.body.style.overflow = 'hidden'
    var items = focusable()
    if (items.length) items[0].focus()
    document.addEventListener('keydown', onKeydown)
    document.addEventListener('click', onOutside, true)
  }

  function close() {
    if (panel.hidden) return
    panel.hidden = true
    button.setAttribute('aria-expanded', 'false')
    document.body.style.overflow = ''
    document.removeEventListener('keydown', onKeydown)
    document.removeEventListener('click', onOutside, true)
    if (lastFocused && lastFocused.focus) lastFocused.focus()
  }

  function onKeydown(event) {
    if (event.key === 'Escape') return close()
    if (event.key !== 'Tab') return
    var items = focusable()
    if (!items.length) return
    var first = items[0]
    var last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function onOutside(event) {
    if (panel.contains(event.target) || button.contains(event.target)) return
    close()
  }

  button.addEventListener('click', function () {
    if (panel.hidden) open()
    else close()
  })

  panel.addEventListener('click', function (event) {
    if (event.target.closest('a')) close()
  })

  window.addEventListener('resize', function () {
    if (window.innerWidth > 900) close()
  })

  button.setAttribute('aria-expanded', 'false')
  panel.hidden = true
})()
