/* One shared code. The route leans on the throttles rather than on the code's
   strength, so the only thing this file must not do is tell an attacker which
   part was wrong. Every failure says the same sentence. */
;(function () {
  const form = document.getElementById('login-form')
  const error = document.getElementById('login-error')
  if (!form) return

  form.addEventListener('submit', async function (event) {
    event.preventDefault()
    error.textContent = ''
    const button = form.querySelector('button')
    button.disabled = true

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: document.getElementById('code').value })
      })
      if (response.ok) {
        location.href = '/staff/dashboard'
        return
      }
      const data = await response.json().catch(function () { return {} })
      error.textContent = data.error === 'rate_limited'
        ? 'Too many attempts. Try again in fifteen minutes.'
        : 'That code was not right.'
    } catch (e) {
      error.textContent = 'Could not reach the server.'
    }
    button.disabled = false
  })
})()
