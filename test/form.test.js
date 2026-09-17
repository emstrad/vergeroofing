import test from 'node:test'
import assert from 'node:assert/strict'
import { renderQuoteForm } from '../scripts/book-form.js'
import { JOB_TYPES, PROPERTY_TYPES, MESSAGES } from '../lib/validate.js'

const html = renderQuoteForm()

// The form and the server validation are generated from the same lists on
// purpose. This is the test that catches the two drifting apart, which is the
// failure the single implementation exists to prevent.
test('every offered job type is one the server will store', () => {
  const offered = [...html.matchAll(/name="jobTypes" value="([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(offered.sort(), [...JOB_TYPES].sort())
})

test('every offered property type is one the server will store', () => {
  const offered = [...html.matchAll(/<option value="([^"]+)">/g)].map((m) => m[1]).filter(Boolean)
  assert.deepEqual(offered.sort(), [...PROPERTY_TYPES].sort())
})

test('each field error message in the markup is the one the API returns', () => {
  for (const [field, message] of Object.entries(MESSAGES)) {
    assert.ok(html.includes(`id="err-${field}"`), `missing error slot for ${field}`)
    assert.ok(html.includes(message), `markup does not carry the API message for ${field}`)
  }
})

test('the form has three steps and a honeypot', () => {
  assert.equal([...html.matchAll(/class="form-step"/g)].length, 3)
  assert.ok(html.includes('name="website"'))
  assert.ok(html.includes('tabindex="-1"'), 'the honeypot stays out of the tab order')
})

test('the property postcode is asked again, below the town', () => {
  assert.ok(html.indexOf('id="q-town"') < html.indexOf('id="q-postcode2"'))
})

test('every input has a label', () => {
  const ids = [...html.matchAll(/<(?:input|select|textarea) id="([^"]+)"/g)].map((m) => m[1])
  for (const id of ids) {
    assert.ok(html.includes(`for="${id}"`), `no label for ${id}`)
  }
})
