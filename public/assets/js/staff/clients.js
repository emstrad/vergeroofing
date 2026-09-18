/* A booked job is a client. There is no clients table: a card is the job joined
   to the lead it came from, so the address, phone, photographs and reported
   problem are on it without anyone typing them twice. */
;(function () {
  const S = window.Staff
  const root = document.getElementById('root')
  let state = { search: '', archived: false, jobs: [] }

  function isArchived(job) {
    /* A card archives itself the day after its job date. That is a view, not a
       status change: a date that has passed may have been rescheduled rather
       than worked, and a calendar should not tell the earnings tiles otherwise.
       A completed job with money outstanding stays on the board whatever its
       date, because it is not finished. */
    if (job.status === 'completed' && job.outstanding_pence > 0) return false
    if (!job.job_date) return false
    return new Date(job.job_date).getTime() < Date.now() - 864e5
  }

  function wazeLink(job) {
    const where = [job.address1, job.town, job.postcode].filter(Boolean).join(', ')
    // The button is tapped in a van, and the app in the van is Waze.
    return 'https://waze.com/ul?q=' + encodeURIComponent(where) + '&navigate=yes'
  }

  function card(job) {
    const node = S.el('article', { class: 'panel' })
    const head = S.el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' })
    head.appendChild(S.el('h3', {}, job.customer_name || 'Unnamed job'))
    head.appendChild(S.el('span', { class: 'chip ' + job.status }, job.status))
    if (job.outstanding_pence > 0 && job.status === 'completed') {
      head.appendChild(S.el('span', { class: 'chip owed' }, 'owed ' + S.money(job.outstanding_pence)))
    }
    if (isArchived(job) && job.status !== 'completed') {
      head.appendChild(S.el('span', { class: 'chip passed' }, 'date passed'))
    }
    node.appendChild(head)

    node.appendChild(S.el('p', { class: 'tiny muted' },
      [job.address1, job.town, job.postcode].filter(Boolean).join(', ')))
    node.appendChild(S.el('p', { class: 'tiny' },
      S.money(job.price_pence) + ' quoted, ' + S.money(job.paid_pence) + ' received'))

    node.appendChild(S.el('button', {
      class: 'btn quiet small', type: 'button', onclick: function () { open(job) }
    }, 'Open card'))
    return node
  }

  async function open(job) {
    const dialog = S.el('dialog')
    const head = S.el('div', { class: 'head' })
    head.appendChild(S.el('h2', {}, job.customer_name || 'Job ' + job.id))
    head.appendChild(S.el('span', { class: 'chip ' + job.status }, job.status))
    dialog.appendChild(head)

    const body = S.el('div', { class: 'body' })
    const list = S.el('dl', { class: 'kv' })
    function pair(label, value) {
      if (!value) return
      list.appendChild(S.el('dt', {}, label))
      list.appendChild(S.el('dd', {}, value))
    }
    pair('Phone', job.phone || job.lead_phone)
    pair('Email', job.email || job.lead_email)
    pair('Address', [job.address1, job.address2, job.town, job.postcode].filter(Boolean).join(', '))
    pair('Job type', job.job_type)
    pair('Worker', job.worker)
    pair('Quoted', S.date(job.quoted_on))
    pair('Job date', S.date(job.job_date))
    pair('They asked for', (job.lead_job_types || []).join(', '))
    pair('What they said', job.lead_notes)
    pair('Notes', job.notes)
    pair('Price', S.money(job.price_pence))
    pair('Received', S.money(job.paid_pence))
    pair('Outstanding', S.money(job.outstanding_pence))
    pair('Materials', job.materials_known ? S.money(job.materials_pence) : 'not known yet')
    body.appendChild(list)

    const address = [job.address1, job.town, job.postcode].filter(Boolean).join(', ')
    if (address) {
      body.appendChild(S.el('p', {}, ''))
      body.appendChild(S.el('a', { class: 'btn quiet small', href: wazeLink(job), target: '_blank', rel: 'noopener' }, 'Open in Waze'))
    }

    const files = job.lead_files || []
    if (files.length) {
      body.appendChild(S.el('h3', { style: 'margin-top:18px' }, 'What they sent'))
      const holder = S.el('div', { class: 'tiny' })
      files.forEach(function (path) {
        // The blobs are private, so these go through an authenticated route
        // rather than linking at storage directly.
        holder.appendChild(S.el('a', {
          href: '/api/admin/attachment?path=' + encodeURIComponent(path),
          target: '_blank', rel: 'noopener', style: 'display:block'
        }, path.split('/').pop()))
      })
      body.appendChild(holder)
    }

    body.appendChild(S.el('h3', { style: 'margin-top:18px' }, 'Payments'))
    const payments = S.el('div')
    body.appendChild(payments)

    async function drawPayments() {
      S.clear(payments)
      const data = await S.api('payments', { query: '?job=' + job.id })
      if (!data.payments.length) payments.appendChild(S.el('p', { class: 'tiny muted' }, 'Nothing received yet.'))
      else {
        payments.appendChild(S.table(
          [{ label: 'Date' }, { label: 'Label' }, { label: 'Amount', num: true }, { label: '' }],
          data.payments,
          function (payment) {
            const tr = S.el('tr')
            tr.appendChild(S.cell(S.date(payment.paid_on)))
            tr.appendChild(S.cell(payment.label + (payment.bank_txn_id ? ' (bank)' : '')))
            tr.appendChild(S.cell(S.money(payment.amount_pence), { num: true }))
            const actions = S.el('td')
            if (!payment.bank_txn_id) {
              actions.appendChild(S.el('button', {
                class: 'btn quiet small', type: 'button',
                onclick: async function () {
                  await S.api('payments', { body: { remove: payment.id } })
                  drawPayments()
                }
              }, 'Remove'))
            }
            tr.appendChild(actions)
            return tr
          }
        ))
      }

      const form = S.el('form', { class: 'form-grid', style: 'margin-top:12px' })
      const amount = S.el('input', { type: 'text', name: 'amount', placeholder: 'Amount' })
      const label = S.el('select', { name: 'label' })
      ;['deposit', 'stage', 'balance', 'retention', 'payment'].forEach(function (option) {
        label.appendChild(S.el('option', { value: option }, option))
      })
      const paidOn = S.el('input', { type: 'date', name: 'paidOn', value: new Date().toISOString().slice(0, 10) })
      form.appendChild(amount)
      form.appendChild(label)
      form.appendChild(paidOn)
      form.appendChild(S.el('button', { class: 'btn', type: 'submit' }, 'Record payment'))
      form.addEventListener('submit', async function (event) {
        event.preventDefault()
        const pence = S.toPence(amount.value)
        if (!pence) return
        await S.api('payments', { body: { jobId: job.id, amountPence: pence, label: label.value, paidOn: paidOn.value } })
        const refreshed = await S.api('jobs', {})
        const updated = refreshed.jobs.find(function (row) { return row.id === job.id })
        if (updated) Object.assign(job, updated)
        drawPayments()
      })
      payments.appendChild(form)
    }
    await drawPayments()

    dialog.appendChild(body)
    const foot = S.el('div', { class: 'foot' })
    foot.appendChild(S.el('button', { class: 'btn quiet', type: 'button', onclick: function () { dialog.close() } }, 'Close'))
    dialog.appendChild(foot)

    document.body.appendChild(dialog)
    dialog.addEventListener('close', function () { dialog.remove(); load() })
    dialog.showModal()
  }

  async function load() {
    S.clear(root)

    const controls = S.el('div', { class: 'pills' })
    ;[[false, 'On the board'], [true, 'Archived']].forEach(function (option) {
      controls.appendChild(S.el('button', {
        type: 'button', 'aria-pressed': state.archived === option[0] ? 'true' : 'false',
        onclick: function () { state.archived = option[0]; draw() }
      }, option[1]))
    })
    root.appendChild(controls)

    const search = S.el('input', { type: 'search', placeholder: 'Search name, address, postcode, phone', value: state.search })
    search.addEventListener('change', function () { state.search = search.value; load() })
    root.appendChild(search)

    const holder = S.el('div', { class: 'grid cols-3', style: 'margin-top:14px' })
    root.appendChild(holder)

    const data = await S.api('jobs', { query: '?q=' + encodeURIComponent(state.search) })
    state.jobs = data.jobs.filter(function (job) { return job.status !== 'declined' && job.status !== 'cancelled' })

    function draw() {
      S.clear(holder)
      const rows = state.jobs.filter(function (job) { return isArchived(job) === state.archived })
      if (!rows.length) holder.appendChild(S.el('p', { class: 'muted tiny' }, 'Nothing here.'))
      rows.forEach(function (job) { holder.appendChild(card(job)) })
      root.querySelectorAll('.pills button').forEach(function (button, index) {
        button.setAttribute('aria-pressed', (index === 1) === state.archived ? 'true' : 'false')
      })
    }
    draw()
  }

  load().catch(function (error) {
    root.appendChild(S.el('p', { class: 'bad' }, 'Could not load: ' + error.message))
  })
})()
