// The single implementation of the quote form. The build writes the output of
// this into every page, home page included, between markers. Hand-writing it
// into one page and generating it elsewhere is how the two copies drift, and it
// is found months later when a field added to one is missing from the other.
import { JOB_TYPES, PROPERTY_TYPES, MESSAGES } from '../lib/validate.js'

const JOB_LABELS = {
  'leak-repair': 'Leak or repair',
  're-roof': 'Full re-roof',
  'flat-roof': 'Flat roof',
  'chimney-leadwork': 'Chimney / leadwork',
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

function error(field) {
  return `<p class="field-error" id="err-${field}" hidden>${MESSAGES[field]}</p>`
}

function jobCheckboxes() {
  return JOB_TYPES.map(
    (key) => `<label class="check"><input type="checkbox" name="jobTypes" value="${key}" />
            <span>${JOB_LABELS[key]}</span></label>`
  ).join('\n          ')
}

function propertyOptions() {
  return PROPERTY_TYPES.map(
    (key) => `<option value="${key}">${PROPERTY_LABELS[key]}</option>`
  ).join('\n            ')
}

export function renderQuoteForm() {
  return `<form id="quote-form" class="quote-form" novalidate data-steps="3">
      <p class="form-intro">Three short steps. We reply the same day with a price.</p>

      <div class="form-step" data-step="1">
        <p class="step-count">Step 1 of 3</p>
        <div class="field">
          <label for="q-name">First name</label>
          <input id="q-name" name="name" type="text" autocomplete="given-name" required />
          ${error('name')}
        </div>
        <div class="field">
          <label for="q-phone">Phone number</label>
          <input id="q-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required />
          ${error('phone')}
        </div>
        <div class="field">
          <label for="q-postcode">Postcode</label>
          <input id="q-postcode" name="postcode" type="text" autocomplete="postal-code" required />
          ${error('postcode')}
        </div>
        <button type="button" class="btn btn-primary" data-next="2">Start my quote</button>
      </div>

      <div class="form-step" data-step="2" hidden>
        <p class="step-count">Step 2 of 3</p>
        <fieldset class="field">
          <legend>What is the job? Tick anything that applies.</legend>
          ${jobCheckboxes()}
          ${error('jobTypes')}
        </fieldset>
        <div class="field">
          <label for="q-notes">Anything we should know? (optional)</label>
          <textarea id="q-notes" name="notes" rows="3"></textarea>
        </div>
        <div class="field">
          <label for="q-files">Photos of the problem (optional)</label>
          <input id="q-files" name="files" type="file" multiple
                 accept="image/jpeg,image/png,image/heic,image/webp,application/pdf" />
          <p class="field-hint">
            A photo of the roof often turns a site visit into a phone quote, and
            always makes the visit shorter. A previous report or quote is useful too.
          </p>
          <p class="upload-status" data-upload-status aria-live="polite"></p>
        </div>
        <div class="step-actions">
          <button type="button" class="btn btn-quiet" data-back="1">Back</button>
          <button type="button" class="btn btn-primary" data-next="3">Continue</button>
        </div>
      </div>

      <div class="form-step" data-step="3" hidden>
        <p class="step-count">Step 3 of 3</p>
        <div class="field">
          <label for="q-property">What sort of property is it?</label>
          <select id="q-property" name="propertyType" required>
            <option value="">Select one</option>
            ${propertyOptions()}
          </select>
          ${error('propertyType')}
        </div>
        <div class="field">
          <label for="q-address1">Address</label>
          <input id="q-address1" name="address1" type="text" autocomplete="address-line1" required />
          ${error('address1')}
        </div>
        <div class="field">
          <label for="q-address2">Address line 2 (optional)</label>
          <input id="q-address2" name="address2" type="text" autocomplete="address-line2" />
        </div>
        <div class="field">
          <label for="q-town">Town</label>
          <input id="q-town" name="town" type="text" autocomplete="address-level2" required />
          ${error('town')}
        </div>
        <div class="field">
          <!-- Asked again, below the town: the step 1 postcode is whatever they
               typed to get started, this one is the property. Prefilled from it. -->
          <label for="q-postcode2">Postcode of the property</label>
          <input id="q-postcode2" name="postcode" type="text" autocomplete="postal-code" required />
          <button type="button" class="btn btn-quiet" data-lookup hidden>Find address</button>
          <p class="field-hint" data-lookup-status aria-live="polite"></p>
          ${error('postcode')}
        </div>
        <div class="field">
          <label for="q-email">Email address (optional)</label>
          <input id="q-email" name="email" type="email" autocomplete="email" />
          ${error('email')}
        </div>
        <label class="check">
          <input type="checkbox" name="isInsurance" value="true" />
          <span>This may be an insurance or storm damage claim</span>
        </label>
        <div class="step-actions">
          <button type="button" class="btn btn-quiet" data-back="2">Back</button>
          <button type="submit" class="btn btn-primary">Get my quote</button>
        </div>
      </div>

      <!-- Honeypot. Hidden from people, offered to anything filling every field. -->
      <div class="hp" aria-hidden="true">
        <label for="q-website">Website</label>
        <input id="q-website" name="website" type="text" tabindex="-1" autocomplete="off" />
      </div>

      <p class="form-note">
        Your details price your job and nothing else. No marketing lists, no third
        party referrals.
      </p>

      <div class="form-done" data-done hidden role="status">
        <h3>Received. We are on it.</h3>
        <p data-done-message></p>
      </div>
    </form>`
}
