import { sql } from '../db.js'
import { splitEvenly, computeJob } from '../splits.js'
import { loadSettings } from '../routes/admin/settings.js'

// The page shows one identity, both sides of it, and whether they agree:
//
//   bank in, less bank out  =  each person's figure
//                            + the tax pot
//                            + payments received on jobs not yet completed
//                            + money in not yet matched or split
//                            + spend not yet split or assigned
//                            + difference
//
// Materials deliberately do NOT appear as their own line, although it is
// tempting. A job's earnings already have materials taken out of the shared
// remainder, so the partners' figures are net of that spend and the bank line
// that paid the merchant has already reduced the left side. Adding a materials
// term would count the same money twice and push the difference off by exactly
// the merchant bill.
//
// Once everything is allocated the only line that can be nonzero is the
// difference: bank money received on completed jobs against what those jobs are
// recorded as worth. That is where a cash-paid job or an overpayment shows up
// rather than vanishing.

export async function bankBalance() {
  const settings = await loadSettings()
  const people = [...settings.partners]

  const [txns, completed, openPayments] = await Promise.all([
    sql`SELECT id, amount_pence, job_id, is_materials, split_to FROM bank_transactions`,
    sql`SELECT j.*,
               coalesce((SELECT sum(amount_pence) FROM job_payments p
                          WHERE p.job_id = j.id AND p.bank_txn_id IS NOT NULL), 0)::bigint AS bank_paid_pence
        FROM jobs j WHERE j.status = 'completed'`,
    sql`SELECT coalesce(sum(p.amount_pence), 0)::bigint AS total
        FROM job_payments p JOIN jobs j ON j.id = p.job_id
        WHERE p.bank_txn_id IS NOT NULL AND j.status <> 'completed'`
  ])

  const figures = Object.fromEntries(people.map((name) => [name, 0]))
  let taxPot = 0
  let bankIn = 0
  let bankOut = 0
  let unmatchedIn = 0
  let unallocatedOut = 0

  for (const txn of txns) {
    const amount = Number(txn.amount_pence)
    if (amount > 0) bankIn += amount
    else bankOut += amount

    const split = txn.split_to || []
    if (split.length) {
      // Equal shares, whole pence, odd pennies to the earliest. Signed, so a
      // spend reduces a person's balance and money in adds to it.
      const shares = splitEvenly(amount, split.length)
      split.forEach((name, index) => {
        if (name === 'tax') taxPot += shares[index]
        else if (name in figures) figures[name] += shares[index]
        // A split to somebody who is no longer a partner lands nowhere, and
        // shows up as difference rather than being quietly dropped.
      })
      continue
    }

    if (txn.job_id) continue // matched to a job, or assigned as materials
    if (amount > 0) unmatchedIn += amount
    else unallocatedOut += amount
  }

  let completedWorth = 0
  let bankPaidOnCompleted = 0
  let assignedMaterials = 0

  for (const job of completed) {
    const earnings = computeJob({
      pricePence: Number(job.price_pence),
      materialsPence: job.materials_pence === null ? 0 : Number(job.materials_pence),
      taxPercent: Number(job.tax_percent),
      leadFeePercent: Number(job.lead_fee_percent),
      leadFeeTo: job.lead_fee_to,
      partners: job.partners || people
    })
    for (const [name, amount] of Object.entries(earnings.payouts)) {
      if (name in figures) figures[name] += amount
    }
    taxPot += earnings.taxPence
    completedWorth += earnings.remainderPence + earnings.leadFeePence + earnings.taxPence
    bankPaidOnCompleted += Number(job.bank_paid_pence)
    assignedMaterials += earnings.materialsPence
  }

  const paidOnOpenJobs = Number(openPayments[0].total)
  const net = bankIn + bankOut

  const accounted =
    Object.values(figures).reduce((sum, value) => sum + value, 0) +
    taxPot + paidOnOpenJobs + unmatchedIn + unallocatedOut

  const difference = net - accounted

  return {
    bankIn,
    bankOut,
    net,
    figures,
    taxPot,
    paidOnOpenJobs,
    unmatchedIn,
    unallocatedOut,
    difference,
    // The two sides always add up by construction; what matters is whether the
    // difference is zero, which it is only when everything has been allocated
    // and the bank agrees with what the jobs say they were worth.
    agrees: difference === 0,
    detail: { completedWorth, bankPaidOnCompleted, assignedMaterials }
  }
}
