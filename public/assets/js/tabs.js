/* The service tab strip. Every panel is already in the markup; this only
   chooses which one is shown. Nothing here writes innerHTML, because a section
   assembled at runtime is a section most AI crawlers never see. */
;(function () {
  var strip = document.querySelector('.services-pills')
  if (!strip) return

  var tabs = Array.prototype.slice.call(strip.querySelectorAll('[role="tab"]'))

  function select(tab) {
    tabs.forEach(function (other) {
      var panel = document.getElementById(other.getAttribute('aria-controls'))
      var chosen = other === tab
      other.setAttribute('aria-selected', chosen ? 'true' : 'false')
      other.setAttribute('tabindex', chosen ? '0' : '-1')
      if (panel) panel.hidden = !chosen
    })
  }

  strip.addEventListener('click', function (event) {
    var tab = event.target.closest('[role="tab"]')
    if (tab) select(tab)
  })

  /* Arrow keys move between tabs, which is what a tablist is expected to do and
     what someone using the keyboard will try. */
  strip.addEventListener('keydown', function (event) {
    var index = tabs.indexOf(document.activeElement)
    if (index < 0) return
    var next = null
    if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length]
    if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length]
    if (event.key === 'Home') next = tabs[0]
    if (event.key === 'End') next = tabs[tabs.length - 1]
    if (!next) return
    event.preventDefault()
    next.focus()
    select(next)
  })

  tabs.forEach(function (tab) {
    tab.setAttribute('tabindex', tab.getAttribute('aria-selected') === 'true' ? '0' : '-1')
  })
})()
