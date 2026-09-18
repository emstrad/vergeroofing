/* Two halves: marketing, then the pipeline. Every number arrives already
   aggregated in SQL, so this file only arranges what it was handed. */
;(function () {
  const S = window.Staff
  const root = document.getElementById('root')
  let range = '30d'

  function tile(label, value, note) {
    const node = S.el('div', { class: 'tile' })
    node.appendChild(S.el('span', { class: 'label' }, label))
    node.appendChild(S.el('div', { class: 'value' }, value))
    if (note) node.appendChild(S.el('div', { class: 'note' }, note))
    return node
  }

  function panel(title, content) {
    const node = S.el('section', { class: 'panel' })
    node.appendChild(S.el('h2', {}, title))
    node.appendChild(content)
    return node
  }

  function keyValueTable(rows, labels, valueKey) {
    if (!rows.length) return S.el('p', { class: 'muted tiny' }, 'Nothing yet.')
    const most = Math.max.apply(null, rows.map(function (row) { return Number(row[valueKey]) || 0 }))
    return S.table(labels, rows, function (row) {
      const tr = S.el('tr')
      tr.appendChild(S.cell(row.key || row.field || row.placement || 'unknown'))
      tr.appendChild(S.cell(Number(row[valueKey]) || 0, { num: true }))
      const barCell = S.el('td')
      const bar = S.el('div', { class: 'bar' })
      const width = most ? Math.round((Number(row[valueKey]) / most) * 100) : 0
      const fill = S.el('span')
      fill.style.width = width + '%'
      bar.appendChild(fill)
      barCell.appendChild(bar)
      tr.appendChild(barCell)
      return tr
    })
  }

  /* The funnel is the part that earns its keep: knowing that 40% of people
     leave at step 2 tells you which field to cut. */
  function funnel(rows) {
    const byKey = {}
    rows.forEach(function (row) {
      const key = row.type === 'form_step' ? 'step ' + row.step : row.type
      byKey[key] = (byKey[key] || 0) + Number(row.sessions)
    })
    const order = ['page_view', 'form_start', 'step 1', 'step 2', 'step 3', 'form_submit', 'form_abandon']
    const labels = {
      page_view: 'Saw a page', form_start: 'Started typing', 'step 1': 'Step 1',
      'step 2': 'Step 2', 'step 3': 'Step 3', form_submit: 'Sent the form',
      form_abandon: 'Abandoned, called back'
    }
    const rowsOut = order.filter(function (key) { return byKey[key] }).map(function (key) {
      return { key: labels[key] || key, sessions: byKey[key] }
    })
    return keyValueTable(rowsOut, [{ label: 'Stage' }, { label: 'Sessions', num: true }, { label: '' }], 'sessions')
  }

  function conversion(rows) {
    if (!rows.length) return S.el('p', { class: 'muted tiny' }, 'No quotes in this period.')
    return S.table(
      [{ label: 'Key' }, { label: 'Quotes', num: true }, { label: 'Won', num: true }, { label: 'Rate', num: true }],
      rows,
      function (row) {
        const tr = S.el('tr')
        const rate = row.quotes ? Math.round((row.won / row.quotes) * 100) : 0
        tr.appendChild(S.cell(row.key))
        tr.appendChild(S.cell(row.quotes, { num: true }))
        tr.appendChild(S.cell(row.won, { num: true }))
        tr.appendChild(S.cell(rate + '%', { num: true }))
        return tr
      }
    )
  }

  function owed(rows) {
    if (!rows.length) return S.el('p', { class: 'muted tiny' }, 'Nothing outstanding on finished work.')
    return S.table(
      [{ label: 'Customer' }, { label: 'Phone' }, { label: 'Finished' },
        { label: 'Price', num: true }, { label: 'Paid', num: true }, { label: 'Owed', num: true }],
      rows,
      function (row) {
        const tr = S.el('tr')
        tr.appendChild(S.cell(row.customer_name || 'unknown'))
        tr.appendChild(S.cell(row.phone || ''))
        tr.appendChild(S.cell(S.date(row.completed_on)))
        tr.appendChild(S.cell(S.money(row.price_pence), { num: true }))
        tr.appendChild(S.cell(S.money(row.paid_pence), { num: true }))
        tr.appendChild(S.cell(S.money(Number(row.price_pence) - Number(row.paid_pence)), { num: true, class: 'num bad' }))
        return tr
      }
    )
  }

  async function leadsTable() {
    const data = await S.api('leads', { query: '?range=' + range })
    const wrap = S.el('div')

    wrap.appendChild(S.el('button', {
      class: 'btn quiet small', type: 'button',
      onclick: function () {
        S.downloadCsv('leads.csv',
          ['created', 'stage', 'name', 'phone', 'email', 'postcode', 'town', 'jobs', 'notes', 'channel', 'email sent'],
          data.leads.map(function (lead) {
            return [lead.created_at, lead.stage, lead.name, lead.phone, lead.email, lead.postcode,
              lead.town, (lead.job_types || []).join(' '), lead.notes, lead.channel,
              lead.notified_at ? 'yes' : (lead.notify_error || 'no')]
          }))
      }
    }, 'Export CSV'))

    wrap.appendChild(S.table(
      [{ label: 'When' }, { label: 'Stage' }, { label: 'Name' }, { label: 'Phone' },
        { label: 'Postcode' }, { label: 'Wants' }, { label: 'Channel' }, { label: 'Email' }, { label: '' }],
      data.leads,
      function (lead) {
        const tr = S.el('tr')
        tr.appendChild(S.cell(S.date(lead.created_at)))
        tr.appendChild(S.cell(lead.stage))
        tr.appendChild(S.cell(lead.name || ''))
        tr.appendChild(S.cell(lead.phone || ''))
        tr.appendChild(S.cell(lead.postcode || ''))
        tr.appendChild(S.cell((lead.job_types || []).join(', ')))
        tr.appendChild(S.cell(lead.channel || ''))
        tr.appendChild(S.cell(lead.notified_at ? 'sent' : (lead.notify_error ? 'blocked' : '')))
        const actions = S.el('td')
        actions.appendChild(S.el('button', {
          class: 'btn quiet small', type: 'button',
          onclick: async function (event) {
            const detail = await S.api('leads', { query: '?session=' + encodeURIComponent(lead.session_id) })
            const holder = S.el('div', { class: 'tiny muted' })
            detail.events.forEach(function (item) {
              holder.appendChild(S.el('div', {}, S.date(item.created_at) + '  ' + item.type + '  ' + (item.path || '')))
            })
            const row = S.el('tr')
            const cellNode = S.el('td', { colspan: '9' })
            cellNode.appendChild(holder)
            row.appendChild(cellNode)
            tr.insertAdjacentElement('afterend', row)
            event.target.disabled = true
          }
        }, 'Timeline'))
        tr.appendChild(actions)
        return tr
      }
    ))
    return wrap
  }

  async function render() {
    S.clear(root)
    root.appendChild(S.rangePills(function (value) { range = value; render() }, range))

    const data = await S.api('summary', { query: '?range=' + range })
    const counts = data.counts
    const pipe = data.pipeline
    const rate = pipe.quotes_sent ? Math.round((pipe.quotes_won / pipe.quotes_sent) * 100) : 0

    const marketing = S.el('div', { class: 'grid cols-4' })
    marketing.appendChild(tile('Enquiries', counts.enquiries))
    marketing.appendChild(tile('Called back', counts.partials, 'Abandoned forms with a number'))
    marketing.appendChild(tile('Sessions', counts.sessions))
    marketing.appendChild(tile('Emails blocked', counts.email_failures, 'Enquiry stored, email did not send'))
    root.appendChild(marketing)

    const pipeline = S.el('div', { class: 'grid cols-4' })
    pipeline.appendChild(tile('Quotes sent', pipe.quotes_sent))
    pipeline.appendChild(tile('Quotes won', pipe.quotes_won, rate + '% conversion'))
    pipeline.appendChild(tile('Average quote', S.money(pipe.avg_quote_pence), 'Won: ' + S.money(pipe.avg_won_pence)))
    pipeline.appendChild(tile('Out in quotes', S.money(pipe.outstanding_quotes_pence),
      pipe.stale_quotes + ' older than three weeks'))
    root.appendChild(pipeline)

    root.appendChild(panel('Money owed on finished work', owed(data.owed)))

    const two = S.el('div', { class: 'grid cols-2' })
    two.appendChild(panel('Conversion by job type', conversion(data.conversion.byType)))
    two.appendChild(panel('Conversion by channel', conversion(data.conversion.byChannel)))
    root.appendChild(two)

    root.appendChild(panel('Form funnel', funnel(data.funnel)))

    const three = S.el('div', { class: 'grid cols-3' })
    three.appendChild(panel('Channels', keyValueTable(data.sources.channels,
      [{ label: 'Channel' }, { label: 'Leads', num: true }, { label: '' }], 'leads')))
    three.appendChild(panel('Referrers', keyValueTable(data.sources.hosts,
      [{ label: 'Host' }, { label: 'Leads', num: true }, { label: '' }], 'leads')))
    three.appendChild(panel('Campaigns', keyValueTable(data.sources.campaigns,
      [{ label: 'Campaign' }, { label: 'Leads', num: true }, { label: '' }], 'leads')))
    root.appendChild(three)

    const three2 = S.el('div', { class: 'grid cols-3' })
    three2.appendChild(panel('Landing pages', keyValueTable(data.sources.landing,
      [{ label: 'Page' }, { label: 'Leads', num: true }, { label: '' }], 'leads')))
    three2.appendChild(panel('Devices', keyValueTable(data.sources.devices,
      [{ label: 'Device' }, { label: 'Leads', num: true }, { label: '' }], 'leads')))
    three2.appendChild(panel('Buttons and calls', keyValueTable(data.calls,
      [{ label: 'Placement' }, { label: 'Clicks', num: true }, { label: '' }], 'hits')))
    root.appendChild(three2)

    root.appendChild(panel('Validation errors by field', keyValueTable(data.errors,
      [{ label: 'Field' }, { label: 'Errors', num: true }, { label: '' }], 'hits')))

    root.appendChild(panel('Leads', await leadsTable()))
  }

  render().catch(function (error) {
    root.appendChild(S.el('p', { class: 'bad' }, 'Could not load: ' + error.message))
  })
})()
