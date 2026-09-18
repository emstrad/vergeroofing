// Scoring money in against the open jobs. A wrong match marks the wrong
// customer as paid, which is worse than a line left unmatched, so anything that
// is not a clear win is offered as a suggestion for a person to confirm.

function words(text) {
  return String(text || '').toLowerCase().replace(/[^a-z ]+/g, ' ').split(/\s+/).filter((word) => word.length > 2)
}

function squash(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function daysBetween(a, b) {
  return Math.abs((new Date(a) - new Date(b)) / 864e5)
}

// Staged payments are why this scores against the amounts still outstanding as
// well as the price: a 1,200 line is the deposit on a 4,800 job, and scoring
// only against the price would never see it.
function amountScore(amount, job) {
  const targets = [
    { value: job.price_pence, points: 50 },
    { value: job.outstanding_pence, points: 50 },
    { value: job.price_pence - job.paid_pence, points: 45 },
    { value: Math.round(job.price_pence / 2), points: 25 }
  ]
  let best = 0
  for (const target of targets) {
    if (!target.value) continue
    if (amount === target.value) best = Math.max(best, target.points)
    else if (Math.abs(amount - target.value) <= 100) best = Math.max(best, target.points - 10)
  }
  return best
}

export function scoreJob(txn, job) {
  if (txn.amountPence <= 0) return 0
  if (['declined', 'cancelled'].includes(job.status)) return 0

  let score = amountScore(txn.amountPence, job)

  const description = String(txn.description || '').toLowerCase()
  const flat = squash(txn.description)

  const nameWords = words(job.customer_name)
  if (nameWords.length && nameWords.every((word) => description.includes(word))) score += 30
  else if (nameWords.some((word) => description.includes(word))) score += 12

  if (job.postcode && flat.includes(squash(job.postcode))) score += 20

  const reference = job.job_date || job.quoted_on
  if (reference && daysBetween(txn.txnDate, reference) <= 14) score += 10

  return score
}

export function rank(txn, jobs) {
  return jobs
    .map((job) => ({ job, score: scoreJob(txn, job) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
}

// Automatic only when one job clearly wins and beats the runner-up outright.
// Anything closer goes to the top of the picker instead.
export function autoMatch(txn, jobs) {
  const ranked = rank(txn, jobs)
  if (!ranked.length) return null
  const [best, next] = ranked
  if (best.score < 60) return null
  if (next && best.score - next.score < 20) return null
  return best.job
}
