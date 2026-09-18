// The single implementation of the quote form. The build writes the output of
// this into every page, home page included, between markers. Hand-writing it
// into one page and generating it elsewhere is how the two copies drift, and it
// is found months later when a field added to one is missing from the other.
//
// Class names are the mockup's, so the form inherits the site's design rather
// than carrying a second set of styles that has to be kept in step with it.
import { JOB_TYPES, PROPERTY_TYPES, MESSAGES } from '../lib/validate.js'

const JOB_LABELS = {
  'leak-repair': 'Leak or repair',
  're-roof': 'Full re-roof',
  'flat-roof': 'Flat roof',
  'chimney-leadwork': 'Chimney and leadwork',
  'guttering-fascias': 'Guttering and fascias',
  'not-sure': 'Not sure yet'
}

const PROPERTY_LABELS = {
  house: 'House',
  bungalow: 'Bungalow',
  flat: 'Flat or block of flats',
  commercial: 'Commercial unit',
  'managed-let': 'Managed or let property',
  other: 'Other'
}

const TICK = '<span class="box" aria-hidden="true">&#10003;</span>'

function err(field) {
  return `<p class="err" id="err-${field}">${MESSAGES[field]}</p>`
}

function field(id, label, control, extra = '') {
  return `<div class="form-row" data-row="${id}">
          <label for="q-${id}">${label}</label>
          ${control}
          ${extra}
        </div>`
}

function jobCheckboxes() {
  return JOB_TYPES.map(
    (key) => `<label class="check">
              <input type="checkbox" name="jobTypes" value="${key}" />${TICK}
              <span>${JOB_LABELS[key]}</span>
            </label>`
  ).join('\n            ')
}

function propertyOptions() {
  return PROPERTY_TYPES.map(
    (key) => `<option value="${key}">${PROPERTY_LABELS[key]}</option>`
  ).join('\n            ')
}

export function renderQuoteForm() {
  return `<form id="quote-form" class="quote-form" novalidate data-steps="3">
      <p class="form-intro">Three short steps. We reply the same day.</p>

      <div class="form-step" data-step="1">
        <p class="step-count">Step 1 of 3</p>
        ${field('name', 'First name', '<input id="q-name" name="name" type="text" autocomplete="given-name" required />', err('name'))}
        ${field('phone', 'Phone number', '<input id="q-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required />', err('phone'))}
        ${field('postcode', 'Postcode', '<input id="q-postcode" name="postcode" type="text" autocomplete="postal-code" required />', err('postcode'))}
        <button type="button" class="btn btn--primary" data-next="2">Start my quote</button>
      </div>

      <div class="form-step" data-step="2" hidden>
        <p class="step-count">Step 2 of 3</p>
        <fieldset class="form-row" data-row="jobTypes">
          <legend>What is the job? Tick anything that applies.</legend>
          <div class="checks">
            ${jobCheckboxes()}
          </div>
          ${err('jobTypes')}
        </fieldset>
        ${field('notes', 'Anything we should know? (optional)', '<textarea id="q-notes" name="notes" rows="3"></textarea>')}
        <div class="form-row" data-row="files">
          <label for="q-files">Photos of the problem (optional)</label>
          <input id="q-files" name="files" type="file" multiple
                 accept="image/jpeg,image/png,image/heic,image/webp,application/pdf" />
          <p class="hint">
            A photo of the roof often means we can price it over the phone, and it
            always makes us quicker when we do come out. A previous quote is useful too.
          </p>
          <p class="upload-status" data-upload-status aria-live="polite"></p>
        </div>
        <div class="step-actions">
          <button type="button" class="btn btn--ghost" data-back="1">Back</button>
          <button type="button" class="btn btn--primary" data-next="3">Continue</button>
        </div>
      </div>

      <div class="form-step" data-step="3" hidden>
        <p class="step-count">Step 3 of 3</p>
        ${field('property', 'What sort of property is it?', `<select id="q-property" name="propertyType" required>
            <option value="">Select one</option>
            ${propertyOptions()}
          </select>`, err('propertyType'))}
        ${field('address1', 'Address', '<input id="q-address1" name="address1" type="text" autocomplete="address-line1" required />', err('address1'))}
        ${field('address2', 'Address line 2 (optional)', '<input id="q-address2" name="address2" type="text" autocomplete="address-line2" />')}
        ${field('town', 'Town', '<input id="q-town" name="town" type="text" autocomplete="address-level2" required />', err('town'))}
        <div class="form-row" data-row="postcode2">
          <!-- Asked again, below the town: the step 1 postcode is whatever they
               typed to get started, this one is the property itself. Prefilled
               from step 1, and editable, because the two are not always the same. -->
          <label for="q-postcode2">Postcode of the property</label>
          <input id="q-postcode2" name="postcode2" type="text" autocomplete="postal-code" required />
          <button type="button" class="btn btn--ghost" data-lookup hidden>Find address</button>
          <p class="lookup-status" data-lookup-status aria-live="polite"></p>
          ${err('postcode2')}
        </div>
        ${field('email', 'Email address (optional)', '<input id="q-email" name="email" type="email" autocomplete="email" />', err('email'))}
        <div class="form-row">
          <label class="check">
            <input type="checkbox" name="isInsurance" value="true" />${TICK}
            <span>This may be an insurance or storm damage claim</span>
          </label>
        </div>
        <div class="step-actions">
          <button type="button" class="btn btn--ghost" data-back="2">Back</button>
          <button type="submit" class="btn btn--primary">Get my quote</button>
        </div>
      </div>

      <!-- Hidden from people, offered to anything filling every field. A filled
           one gets a 200 and nothing written: a bot told it failed tries again
           differently. -->
      <div class="hp" aria-hidden="true">
        <label for="q-website">Website</label>
        <input id="q-website" name="website" type="text" tabindex="-1" autocomplete="off" />
      </div>

      <p class="form-note">
        Your details price your job and nothing else. No marketing lists, no third
        party referrals.
      </p>

      <div class="form-done" data-done hidden role="status" tabindex="-1">
        <h3>Received. We are on it.</h3>
        <p data-done-message></p>
      </div>
    </form>`
}
