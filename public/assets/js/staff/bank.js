/* Upload the bank's CSV and settle it against the jobs. The identity at the top
   is the point of the page: if the difference is not zero, something has not
   been allocated, or the bank disagrees with what a job says it was worth. */
;(function () {
  const S = window.Staff
  const root = document.getElementById('root')
  let state = { data: null, filter: 'todo' }

  function identity(balance) {
    const node = S.el('section', { class: 'panel' })
    node.appendChild(S.el('h2', {}, 'Where the money is'))

    const tiles = S.el('div', { class: 'grid cols-4' })
    function tile(label, value, className) {
      const box = S.el('div', { class: 'tile' })
      box.appendChild(S.el('span', { class: 'label' }, label))
      box.appendChild(S.el('div', { class: 'value ' + (className || '') }, S.money(value)))
      tiles.appendChild(box)
    }
    tile('In, less out', balance.net)
    Object.keys(balance.figures).forEach(function (name) {
      tile(name, balance.figures[name])
    })
    tile('Tax pot', balance.taxPot)
    tile('On jobs not finished', balance.paidOnOpenJobs)
    tile('Money in, unallocated', balance.unmatchedIn)
    tile('Spend, unallocated', balance.unallocatedOut)
    tile('Difference', balance.difference, balance.difference === 0 ? 'good' : 'bad')
    node.appendChild(tiles)

    node.appendChild(S.el('p', { class: 'tiny muted' }, balance.difference === 0
      ? 'Both sides agree and everything is allocated.'
      : 'The difference is bank money on finished jobs against what those jobs are recorded as worth. A cash payment or an overpayment shows up here rather than vanishing.'))
    return node
  }

  function uploader() {
    const node = S.el('section', { class: 'panel' })
    node.appendChild(S.el('h2', {}, 'Upload a statement'))
    const input = S.el('input', { type: 'file', accept: '.csv,text/csv' })
    const status = S.el('p', { class: 'tiny muted' })
    node.appendChild(input)
    node.appendChild(status)

    input.addEventListener('change', async function () {
      const file = input.files[0]
      if (!file) return
      status.textContent = 'Reading'
      try {
        const csv = await file.text()
        const result = await S.api('bank', { query: '?mode=upload', body: { filename: file.name, csv: csv } })
        status.textContent = result.added + ' new lines from ' + result.total +
          ', ' + result.skipped + ' skipped as pending, declined or not in pounds.'
        state.data = result
        draw()
      } catch (error) {
        status.textContent = 'Could not read that file: ' + error.message
      }
    })

    if (state.data && state.data.statements && state.data.statements.length) {
      const list = S.el('div', { class: 'tiny', style: 'margin-top:10px' })
      state.data.statements.forEach(function (statement) {
        const row = S.el('div', { style: 'display:flex;gap:10px;align-items:center' })
        row.appendChild(S.el('span', {}, statement.filename + ' (' + statement.rows_new + ' new)'))
        row.appendChild(S.el('button', {
          class: 'btn quiet small', type: 'button',
          onclick: async function () {
            // Removing an upload unticks what the remaining money no longer
            // covers, so this is safe to undo a wrong file with.
            state.data = await S.api('bank', { query: '?mode=remove', body: { statementId: statement.id } })
            refresh()
          }
        }, 'Remove'))
        list.appendChild(row)
      })
      node.appendChild(list)
    }
    return node
  }

  function jobPicker(txn, jobs, onDone) {
    const select = S.el('select')
    select.appendChild(S.el('option', { value: '' }, 'Match to a job'))
    // Suggestions first: scored on amount, name, postcode and date, with the
    // outstanding balance counted as well as the price, so a deposit on a large
    // job is findable.
    const scored = jobs.map(function (job) {
      let score = 0
      const amount = Math.abs(Number(txn.amount_pence))
      if (amount === job.price_pence || amount === job.outstanding_pence) score += 50
      const name = String(job.customer_name || '').toLowerCase().split(' ')[0]
      if (name && String(txn.description).toLowerCase().includes(name)) score += 30
      if (job.postcode && String(txn.description).replace(/\s/g, '').toLowerCase()
        .includes(String(job.postcode).replace(/\s/g, '').toLowerCase())) score += 20
      return { job: job, score: score }
    }).sort(function (a, b) { return b.score - a.score })

    scored.forEach(function (entry) {
      const label = (entry.score >= 50 ? 'suggested: ' : '') +
        (entry.job.customer_name || 'job ' + entry.job.id) + ' ' + S.money(entry.job.price_pence) +
        ' (' + S.money(entry.job.outstanding_pence) + ' owed)'
      select.appendChild(S.el('option', { value: entry.job.id }, label))
    })

    select.addEventListener('change', async function () {
      if (!select.value) return
      state.data = await S.api('bank', { body: { id: txn.id, action: 'match', jobId: Number(select.value) } })
      onDone()
    })
    return select
  }

  function splitPicker(txn, people, onDone) {
    const wrap = S.el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' })
    people.forEach(function (name) {
      wrap.appendChild(S.el('button', {
        class: 'btn quiet small', type: 'button',
        onclick: async function () {
          state.data = await S.api('bank', { body: { id: txn.id, action: 'split', split: [name] } })
          onDone()
        }
      }, name))
    })
    wrap.appendChild(S.el('button', {
      class: 'btn quiet small', type: 'button',
      onclick: async function () {
        state.data = await S.api('bank', { body: { id: txn.id, action: 'split', split: people.filter(function (name) { return name !== 'tax' }) } })
        onDone()
      }
    }, 'all partners'))
    return wrap
  }

  function rows() {
    const data = state.data
    const filtered = data.transactions.filter(function (txn) {
      if (state.filter === 'all') return true
      const done = txn.job_id || (txn.split_to && txn.split_to.length)
      return state.filter === 'todo' ? !done : !!done
    })

    return S.table(
      [{ label: 'Date' }, { label: 'Description' }, { label: 'Amount', num: true },
        { label: 'Category' }, { label: 'Allocated to' }, { label: '' }],
      filtered,
      function (txn) {
        const tr = S.el('tr')
        tr.appendChild(S.cell(S.date(txn.txn_date)))
        tr.appendChild(S.cell(txn.description))
        tr.appendChild(S.cell(S.money(txn.amount_pence), {
          num: true, class: Number(txn.amount_pence) < 0 ? 'num bad' : 'num good'
        }))

        const categoryCell = S.el('td')
        const category = S.el('input', { type: 'text', value: txn.category || '' })
        category.addEventListener('change', async function () {
          state.data = await S.api('bank', { body: { id: txn.id, action: 'category', category: category.value } })
          refresh()
        })
        categoryCell.appendChild(category)
        if (txn.category_kind === 'manual') categoryCell.appendChild(S.el('span', { class: 'chip' }, 'yours'))
        tr.appendChild(categoryCell)

        const allocated = S.el('td')
        if (txn.job_id) {
          allocated.appendChild(S.el('span', {}, (txn.job_customer || 'job ' + txn.job_id) +
            (txn.is_materials ? ' (materials)' : '')))
        } else if (txn.split_to && txn.split_to.length) {
          allocated.appendChild(S.el('span', {}, 'split: ' + txn.split_to.join(', ')))
        } else {
          allocated.appendChild(jobPicker(txn, data.jobs, refresh))
          allocated.appendChild(splitPicker(txn, data.people, refresh))
        }
        tr.appendChild(allocated)

        const actions = S.el('td')
        if (txn.job_id || (txn.split_to && txn.split_to.length)) {
          actions.appendChild(S.el('button', {
            class: 'btn quiet small', type: 'button',
            onclick: async function () {
              state.data = await S.api('bank', { body: { id: txn.id, action: 'unmatch' } })
              refresh()
            }
          }, 'Undo'))
        }
        tr.appendChild(actions)
        return tr
      }
    )
  }

  function draw() {
    S.clear(root)
    root.appendChild(identity(state.data.balance))
    root.appendChild(uploader())

    const filters = S.el('div', { class: 'pills' })
    ;[['todo', 'Needs a decision'], ['done', 'Allocated'], ['all', 'Everything']].forEach(function (option) {
      filters.appendChild(S.el('button', {
        type: 'button', 'aria-pressed': state.filter === option[0] ? 'true' : 'false',
        onclick: function () { state.filter = option[0]; draw() }
      }, option[1]))
    })

    const panel = S.el('section', { class: 'panel' })
    panel.appendChild(S.el('h2', {}, 'Lines'))
    panel.appendChild(filters)
    panel.appendChild(rows())
    root.appendChild(panel)
  }

  async function refresh() {
    state.data = await S.api('bank')
    draw()
  }

  refresh().catch(function (error) {
    root.appendChild(S.el('p', { class: 'bad' }, 'Could not load: ' + error.message))
  })
})()
