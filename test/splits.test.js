import test from 'node:test'
import assert from 'node:assert/strict'
import { computeJob, splitEvenly, percentOf, penceFromPounds, poundsFromPence } from '../lib/splits.js'

const PARTNERS = ['tom', 'steve', 'ben', 'scott']
const SETTINGS = { taxPercent: 20, leadFeePercent: 15, leadFeeTo: 'scott', partners: PARTNERS }

test('the worked example: a 1,000 pound job with no materials', () => {
  const job = computeJob({ pricePence: 100000, ...SETTINGS })
  assert.equal(job.taxPence, 20000)
  // 15% of the post-tax 800, not of the 1,000.
  assert.equal(job.leadFeePence, 12000)
  assert.equal(job.remainderPence, 68000)
  assert.equal(job.payouts.tom, 17000)
  assert.equal(job.payouts.steve, 17000)
  assert.equal(job.payouts.ben, 17000)
  assert.equal(job.payouts.scott, 29000)
  assert.ok(job.balances)
})

test('materials come off the shared remainder, not off the lead fee', () => {
  const job = computeJob({ pricePence: 400000, materialsPence: 150000, ...SETTINGS })
  assert.equal(job.taxPence, 80000)
  assert.equal(job.leadFeePence, 48000)
  assert.equal(job.remainderPence, 122000)
  assert.equal(job.payouts.tom, 30500)
  assert.equal(job.payouts.scott, 78500)
  assert.ok(job.balances)
})

test('the odd penny goes to the first partner and the payouts still add back', () => {
  const job = computeJob({ pricePence: 33333, ...SETTINGS })
  const paid = Object.values(job.payouts).reduce((a, b) => a + b, 0)
  assert.equal(paid + job.taxPence + job.materialsPence, job.pricePence)
  assert.ok(job.payouts.tom >= job.payouts.ben)
})

test('a job that lost money splits negative rather than hiding it', () => {
  const job = computeJob({ pricePence: 50000, materialsPence: 90000, ...SETTINGS })
  assert.ok(job.remainderPence < 0)
  assert.ok(job.payouts.tom < 0)
  assert.ok(job.balances)
})

test('the identity holds across a few hundred combinations', () => {
  for (let price = 0; price <= 500000; price += 1237) {
    for (const materials of [0, 1, 999, 15000, price, price * 2]) {
      for (const partners of [PARTNERS, ['tom', 'steve'], ['tom']]) {
        const job = computeJob({
          pricePence: price, materialsPence: materials,
          taxPercent: 20, leadFeePercent: 15, leadFeeTo: 'scott', partners
        })
        const paid = Object.values(job.payouts).reduce((a, b) => a + b, 0)
        assert.equal(
          paid + job.taxPence + job.materialsPence, job.pricePence,
          `price ${price} materials ${materials} partners ${partners.length}`
        )
        assert.ok(job.balances)
      }
    }
  }
})

test('a job with no lead fee recipient pays no lead fee', () => {
  const job = computeJob({ pricePence: 100000, taxPercent: 20, leadFeePercent: 15, partners: PARTNERS })
  assert.equal(job.leadFeePence, 0)
  assert.equal(job.payouts.scott, 20000)
  assert.ok(job.balances)
})

test('splitting is exact in both directions', () => {
  assert.deepEqual(splitEvenly(10, 4), [3, 3, 2, 2])
  assert.deepEqual(splitEvenly(-10, 4), [-3, -3, -2, -2])
  assert.deepEqual(splitEvenly(0, 4), [0, 0, 0, 0])
  for (const total of [-999, -1, 0, 1, 7, 12345]) {
    for (const ways of [1, 2, 3, 4, 7]) {
      assert.equal(splitEvenly(total, ways).reduce((a, b) => a + b, 0), total)
    }
  }
})

test('percentages round halves away from zero', () => {
  assert.equal(percentOf(1, 50), 1)
  assert.equal(percentOf(-1, 50), -1)
  assert.equal(percentOf(333, 15), 50)
})

test('pounds convert at the edge without drifting', () => {
  assert.equal(penceFromPounds('1,234.56'), 123456)
  assert.equal(penceFromPounds('0.15'), 15)
  assert.equal(penceFromPounds(''), 0)
  assert.equal(poundsFromPence(123456), '1234.56')
  assert.equal(poundsFromPence(-500), '-5.00')
})
