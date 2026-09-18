/* Shared primitives. No framework: the whole staff area is four pages of
   tables, and a framework would be more code than the tables.

   Everything that renders a value goes through el() or cell(), which use
   textContent. Lead notes, referrers and campaign names are visitor-supplied,
   so building a cell with innerHTML turns the dashboard into a stored XSS
   sink. */
window.Staff = (function () {
  function $(selector, root) {
    return (root || document).querySelector(selector)
  }

  function el(tag, attrs, text) {
    const node = document.createElement(tag)
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === null || value === undefined || value === false) continue
      if (key === 'class') node.className = value
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value)
      else node.setAttribute(key, value === true ? '' : value)
    }
    if (text !== undefined && text !== null) node.textContent = String(text)
    return node
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild)
    return node
  }

  function money(pence) {
    const value = Number(pence || 0)
    const sign = value < 0 ? '-' : ''
    return sign + '£' + (Math.abs(value) / 100).toLocaleString('en-GB', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    })
  }

  function toPence(text) {
    const cleaned = String(text == null ? '' : text).replace(/[^0-9.-]/g, '')
    if (!cleaned) return 0
    const value = Number(cleaned) * 100
    return value < 0 ? -Math.round(-value) : Math.round(value)
  }

  function date(value) {
    if (!value) return ''
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString('en-GB')
  }

  async function api(action, options) {
    const config = options || {}
    const response = await fetch('/api/admin/' + action + (config.query || ''), {
      method: config.body ? 'POST' : 'GET',
      headers: config.body ? { 'Content-Type': 'application/json' } : undefined,
      body: config.body ? JSON.stringify(config.body) : undefined
    })
    if (response.status === 401) {
      location.href = '/staff'
      throw new Error('signed out')
    }
    const data = await response.json().catch(function () { return {} })
    if (!response.ok) throw Object.assign(new Error(data.error || 'failed'), { data })
    return data
  }

  function table(columns, rows, render) {
    const wrap = el('div', { class: 'scroll' })
    const node = el('table')
    const head = el('thead')
    const headRow = el('tr')
    columns.forEach(function (column) {
      headRow.appendChild(el('th', { class: column.num ? 'num' : null }, column.label))
    })
    head.appendChild(headRow)
    node.appendChild(head)

    const body = el('tbody')
    rows.forEach(function (row, index) {
      body.appendChild(render(row, index))
    })
    node.appendChild(body)
    wrap.appendChild(node)
    return wrap
  }

  function cell(value, options) {
    const config = options || {}
    return el('td', { class: config.num ? 'num' : config.class || null }, value)
  }

  /* A cell starting with =, +, - or @ is a formula to a spreadsheet, so a lead
     note becomes code the moment somebody opens the export. Prefixed with a
     quote, it is text again. */
  function csvCell(value) {
    const text = value === null || value === undefined ? '' : String(value)
    const escaped = /^[=+\-@]/.test(text) ? "'" + text : text
    return '"' + escaped.replace(/"/g, '""') + '"'
  }

  function downloadCsv(filename, header, rows) {
    const lines = [header.map(csvCell).join(',')]
    rows.forEach(function (row) { lines.push(row.map(csvCell).join(',')) })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const link = el('a', { href: URL.createObjectURL(blob), download: filename })
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  function rangePills(onChange, initial) {
    const options = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All']]
    const wrap = el('div', { class: 'pills' })
    let current = initial || '30d'
    options.forEach(function (option) {
      const button = el('button', {
        type: 'button',
        'aria-pressed': option[0] === current ? 'true' : 'false',
        onclick: function () {
          current = option[0]
          wrap.querySelectorAll('button').forEach(function (other, index) {
            other.setAttribute('aria-pressed', options[index][0] === current ? 'true' : 'false')
          })
          onChange(current)
        }
      }, option[1])
      wrap.appendChild(button)
    })
    return wrap
  }

  function markNav() {
    const here = location.pathname.replace(/\/$/, '')
    document.querySelectorAll('.topbar nav a').forEach(function (link) {
      if (link.getAttribute('href').replace(/\/$/, '') === here) link.setAttribute('aria-current', 'page')
    })
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    location.href = '/staff'
  }

  document.addEventListener('DOMContentLoaded', function () {
    markNav()
    const button = $('[data-logout]')
    if (button) button.addEventListener('click', logout)
  })

  return { $: $, el: el, clear: clear, money: money, toPence: toPence, date: date,
    api: api, table: table, cell: cell, downloadCsv: downloadCsv, rangePills: rangePills }
})()
