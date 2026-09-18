/* The pipeline, and what each job earns. The browser recomputes the same
   waterfall while you type for immediate feedback, but the figure stored is
   always the one the server returned, so the two cannot drift into disagreeing
   about what was paid. */
;(function () {
  const S = window.Staff
  const root = document.getElementById('root')
  const STATUSES = ['quoted', 'booked', 'completed', 'declined', 'cancelled']
  const REASONS = [
    ['price', 'Price'], ['timing', 'Timing'], ['went-elsewhere', 'Went elsewhere'],
    ['no-longer-needed', 'No longer needed'], ['no-reply', 'No reply'], ['other', 'Other']
  ]

  let state = { status: '', search: '', types: [], settings: null }

  function preview(pricePence, materialsPence, settings) {
    const tax = Math.round((pricePence * settings.taxPercent) / 100)
    const postTax = pricePence - tax
    const leadFee = settings.leadFeeTo ? Math.round((postTax * settings.leadFeePercent) / 100) : 0
    const remainder = postTax - leadFee - materialsPence
    const base = Math.trunc(remainder / settings.partners.length)
    let left = remainder - base * settings.partners.length
    const step = left < 0 ? -1 : 1
    const shares = settings.partners.map(function (name) {
      let share = base
      if (left !== 0) { share += step; left -= step }
      return { name: name, share: share + (name === settings.leadFeeTo ? leadFee : 0) }
    })
    return { tax: tax, leadFee: leadFee, remainder: remainder, shares: shares }
  }

  function waterfall(job) {
    const settings = {
      taxPercent: Number(job.tax_percent), leadFeePercent: Number(job.lead_fee_percent),
      leadFeeTo: job.lead_fee_to, partners: job.partners
    }
    const figures = preview(job.price_pence, job.materials_pence || 0, settings)
    const node = S.el('div', { class: 'waterfall' })
    function line(label, value, className) {
      const row = S.el('div', { class: className || null })
      row.appendChild(S.el('span', {}, label))
      row.appendChild(S.el('span', {}, S.money(value)))
      node.appendChild(row)
    }
    line('Price', job.price_pence)
    line('Less tax at ' + Number(job.tax_percent) + '%', -figures.tax)
    if (job.lead_fee_to) line('Less lead fee to ' + job.lead_fee_to, -figures.leadFee)
    line(job.materials_known ? 'Less materials' : 'Materials not known yet',
      -(job.materials_pence || 0), job.materials_known ? null : 'muted')
    figures.shares.forEach(function (share) {
      line(share.name, share.share, 'total')
    })
    return node
  }

  function statusChip(status) {
    return S.el('span', { class: 'chip ' + status }, status)
  }

  function jobRow(job, onOpen) {
    const tr = S.el('tr')
    tr.appendChild(S.cell(job.customer_name || 'unknown'))
    tr.appendChild(S.cell([job.town, job.postcode].filter(Boolean).join(' ')))
    tr.appendChild(S.cell(job.job_type || ''))
    const statusCell = S.el('td')
    statusCell.appendChild(statusChip(job.status))
    if (job.status === 'quoted' && job.quoted_on && (Date.now() - new Date(job.quoted_on)) > 21 * 864e5) {
      // A quote sent three weeks ago with no decision is a follow-up call, not
      // a row that should sit there quietly.
      statusCell.appendChild(S.el('span', { class: 'chip passed' }, 'chase'))
    }
    tr.appendChild(statusCell)
    tr.appendChild(S.cell(S.date(job.job_date)))
    tr.appendChild(S.cell(S.money(job.price_pence), { num: true }))
    tr.appendChild(S.cell(S.money(job.paid_pence), { num: true }))
    tr.appendChild(S.cell(S.money(job.outstanding_pence), {
      num: true, class: job.outstanding_pence > 0 ? 'num bad' : 'num good'
    }))
    const actions = S.el('td')
    actions.appendChild(S.el('button', { class: 'btn quiet small', type: 'button', onclick: function () { onOpen(job) } }, 'Open'))
    tr.appendChild(actions)
    return tr
  }

  function field(label, name, value, options) {
    const config = options || {}
    const wrap = S.el('div', { class: config.wide ? 'wide' : null })
    wrap.appendChild(S.el('label', { for: 'f-' + name }, label))
    let input
    if (config.options) {
      input = S.el('select', { id: 'f-' + name, name: name })
      config.options.forEach(function (option) {
        const node = S.el('option', { value: option[0] }, option[1])
        if (String(value) === String(option[0])) node.setAttribute('selected', '')
        input.appendChild(node)
      })
    } else {
      input = S.el('input', {
        id: 'f-' + name, name: name, type: config.type || 'text',
        value: value === null || value === undefined ? '' : value,
        placeholder: config.placeholder || null
      })
    }
    wrap.appendChild(input)
    if (config.hint) wrap.appendChild(S.el('p', { class: 'tiny muted' }, config.hint))
    return wrap
  }

  function editor(job) {
    const dialog = S.el('dialog')
    const form = S.el('form', { method: 'dialog' })

    const head = S.el('div', { class: 'head' })
    head.appendChild(S.el('h2', {}, job ? 'Job ' + job.id : 'New quote'))
    dialog.appendChild(head)

    const body = S.el('div', { class: 'body' })
    const grid = S.el('div', { class: 'form-grid' })
    const typeOptions = [['', 'Not set']].concat(state.types.map(function (type) { return [type.key, type.label] }))

    grid.appendChild(field('Customer', 'customerName', job ? job.customer_name : ''))
    grid.appendChild(field('Phone', 'phone', job ? job.phone : ''))
    grid.appendChild(field('Email', 'email', job ? job.email : ''))
    grid.appendChild(field('Job type', 'jobType', job ? job.job_type : '', { options: typeOptions }))
    grid.appendChild(field('Address', 'address1', job ? job.address1 : '', { wide: true }))
    grid.appendChild(field('Town', 'town', job ? job.town : ''))
    grid.appendChild(field('Postcode', 'postcode', job ? job.postcode : ''))
    grid.appendChild(field('Price', 'price', job ? (job.price_pence / 100).toFixed(2) : '',
      { hint: 'Every job is quoted, so this is whatever was agreed.' }))
    grid.appendChild(field('Materials', 'materials', job && job.materials_known ? (job.materials_pence / 100).toFixed(2) : '',
      { hint: 'Leave empty if the cost is not known yet.' }))
    grid.appendChild(field('Quoted on', 'quotedOn', job ? job.quoted_on : '', { type: 'date' }))
    grid.appendChild(field('Job date', 'jobDate', job ? job.job_date : '', { type: 'date' }))
    grid.appendChild(field('Who is doing it', 'worker', job ? job.worker : ''))
    if (job) {
      grid.appendChild(field('Status', 'status', job.status,
        { options: STATUSES.map(function (status) { return [status, status] }) }))
      grid.appendChild(field('If declined, why', 'declinedReason', job.declined_reason || '',
        { options: [['', 'Not declined']].concat(REASONS) }))
    }
    grid.appendChild(field('Notes', 'notes', job ? job.notes : '', { wide: true }))
    body.appendChild(grid)

    const figures = S.el('div', { class: 'panel', style: 'margin-top:16px' })
    function refresh() {
      S.clear(figures)
      figures.appendChild(S.el('h3', {}, 'What this job pays'))
      const settings = job ? {
        taxPercent: Number(job.tax_percent), leadFeePercent: Number(job.lead_fee_percent),
        leadFeeTo: job.lead_fee_to, partners: job.partners
      } : state.settings
      figures.appendChild(waterfall({
        price_pence: S.toPence(form.querySelector('[name="price"]').value),
        materials_pence: S.toPence(form.querySelector('[name="materials"]').value),
        materials_known: form.querySelector('[name="materials"]').value !== '',
        tax_percent: settings.taxPercent, lead_fee_percent: settings.leadFeePercent,
        lead_fee_to: settings.leadFeeTo, partners: settings.partners
      }))
    }
    body.appendChild(figures)
    form.appendChild(body)

    const foot = S.el('div', { class: 'foot' })
    const save = S.el('button', { class: 'btn', type: 'submit' }, 'Save')
    foot.appendChild(save)
    foot.appendChild(S.el('button', { class: 'btn quiet', type: 'button', onclick: function () { dialog.close() } }, 'Cancel'))
    const error = S.el('span', { class: 'bad tiny' })
    foot.appendChild(error)
    form.appendChild(foot)

    form.addEventListener('input', refresh)
    form.addEventListener('submit', async function (event) {
      event.preventDefault()
      const data = new FormData(form)
      const materials = data.get('materials')
      const body = {
        id: job ? job.id : undefined,
        customerName: data.get('customerName'), phone: data.get('phone'), email: data.get('email'),
        jobType: data.get('jobType') || undefined, address1: data.get('address1'),
        town: data.get('town'), postcode: data.get('postcode'), worker: data.get('worker'),
        notes: data.get('notes'),
        pricePence: S.toPence(data.get('price')),
        materialsPence: materials === '' ? null : S.toPence(materials),
        quotedOn: data.get('quotedOn') || undefined,
        jobDate: data.get('jobDate') || undefined,
        status: data.get('status') || undefined,
        declinedReason: data.get('declinedReason') || undefined
      }
      try {
        await S.api('jobs', { body: body })
        dialog.close()
        load()
      } catch (failure) {
        error.textContent = failure.message === 'declined_needs_reason'
          ? 'A declined quote needs a reason. It is the most useful field here.'
          : 'Could not save: ' + failure.message
      }
    })

    dialog.appendChild(form)
    document.body.appendChild(dialog)
    dialog.addEventListener('close', function () { dialog.remove() })
    dialog.showModal()
    refresh()
  }

  async function load() {
    S.clear(root)

    const controls = S.el('div', { class: 'pills' })
    controls.appendChild(S.el('button', { class: 'btn', type: 'button', onclick: function () { editor(null) } }, 'New quote'))
    ;[['', 'All'], ['quoted', 'Quoted'], ['booked', 'Booked'], ['completed', 'Completed'], ['declined', 'Declined']]
      .forEach(function (option) {
        controls.appendChild(S.el('button', {
          type: 'button', 'aria-pressed': state.status === option[0] ? 'true' : 'false',
          onclick: function () { state.status = option[0]; load() }
        }, option[1]))
      })
    root.appendChild(controls)

    const search = S.el('input', { type: 'search', placeholder: 'Search name, address, postcode, phone', value: state.search })
    search.addEventListener('change', function () { state.search = search.value; load() })
    root.appendChild(search)

    const data = await S.api('jobs', {
      query: '?status=' + encodeURIComponent(state.status) + '&q=' + encodeURIComponent(state.search)
    })
    state.types = data.types
    if (!state.settings) state.settings = (await S.api('settings')).settings

    root.appendChild(S.table(
      [{ label: 'Customer' }, { label: 'Where' }, { label: 'Type' }, { label: 'Status' },
        { label: 'Date' }, { label: 'Price', num: true }, { label: 'Paid', num: true },
        { label: 'Owed', num: true }, { label: '' }],
      data.jobs,
      function (job) { return jobRow(job, editor) }
    ))
  }

  load().catch(function (error) {
    root.appendChild(S.el('p', { class: 'bad' }, 'Could not load: ' + error.message))
  })
})()
