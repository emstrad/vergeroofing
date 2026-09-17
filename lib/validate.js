// Server side, trusting nothing from the client. The error strings are the ones
// already written into the markup, so a 400 shows the field message that was
// always going to be there rather than a second, different vocabulary.
import { str } from './http.js'

// The offered values, and the only ones storable. Labels live with the form
// generator; these keys are the contract between the two.
export const JOB_TYPES = [
  'leak-repair',
  're-roof',
  'flat-roof',
  'chimney-leadwork',
  'guttering-fascias',
  'not-sure'
]

export const PROPERTY_TYPES = ['house', 'bungalow', 'flat', 'commercial', 'managed-let', 'other']

export const MESSAGES = {
  name: 'Please enter your first name.',
  phone: 'Please enter a phone number we can reach you on.',
  email: 'Please enter a valid email address.',
  postcode: 'Please enter your postcode.',
  // The property postcode is a separate field with its own message, so an error
  // on step 3 does not light up a field the visitor last saw on step 1.
  postcode2: 'Please enter the postcode of the property.',
  jobTypes: 'Pick at least one, "Not sure yet" is fine.',
  propertyType: 'Please choose one.',
  address1: 'Please enter the first line of the address.',
  town: 'Please enter the town.'
}

// Loose by design: it accepts every real UK postcode and rejects obvious junk.
// A stricter pattern rejects genuine outliers, and a rejected postcode is a
// rejected enquiry.
const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i

export function normalisePostcode(input) {
  const raw = str(input, 12).toUpperCase().replace(/\s+/g, '')
  if (raw.length < 5 || raw.length > 8) return ''
  const formatted = raw.slice(0, -3) + ' ' + raw.slice(-3)
  return POSTCODE.test(formatted) ? formatted : ''
}

export function validEmail(input) {
  const email = str(input, 200)
  if (!email) return ''
  // Shape only. The address is proved by a reply landing, not by a regex.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : ''
}

export function normalisePhone(input) {
  const phone = str(input, 30)
  const digits = phone.replace(/[^\d]/g, '')
  return digits.length >= 10 && digits.length <= 15 ? phone : ''
}

// Attachment paths are checked against the exact shape this app writes, so the
// column cannot be pointed at somebody else's blob and then handed to the
// dashboard as a download link.
const FILE_PATH = /^leads\/[0-9a-f-]{10,40}\/[A-Za-z0-9._-]{1,120}$/

export function validFiles(input) {
  if (!Array.isArray(input)) return []
  return input.map((value) => str(value, 200)).filter((value) => FILE_PATH.test(value)).slice(0, 12)
}

function pickJobTypes(input) {
  if (!Array.isArray(input)) return []
  const seen = new Set()
  for (const value of input) {
    const key = str(value, 40)
    if (JOB_TYPES.includes(key)) seen.add(key)
  }
  return [...seen]
}

// Stage 'partial' validates step 1 only, because a partial by definition never
// reached the rest of the form.
export function validateLead(body, stage) {
  const errors = {}
  const lead = {
    name: str(body.name, 80),
    phone: normalisePhone(body.phone),
    email: validEmail(body.email),
    postcode: normalisePostcode(body.postcode),
    address1: str(body.address1, 120),
    address2: str(body.address2, 120),
    town: str(body.town, 80),
    propertyType: PROPERTY_TYPES.includes(str(body.propertyType, 40)) ? str(body.propertyType, 40) : '',
    jobTypes: pickJobTypes(body.jobTypes),
    notes: str(body.notes, 2000),
    files: validFiles(body.files),
    isInsurance: body.isInsurance === true || body.isInsurance === 'true'
  }

  if (!lead.name) errors.name = MESSAGES.name
  if (!lead.phone) errors.phone = MESSAGES.phone
  if (!lead.postcode) errors.postcode = MESSAGES.postcode
  if (body.email && !lead.email) errors.email = MESSAGES.email

  if (stage === 'complete') {
    if (!lead.jobTypes.length) errors.jobTypes = MESSAGES.jobTypes
    if (!lead.propertyType) errors.propertyType = MESSAGES.propertyType
    if (!lead.address1) errors.address1 = MESSAGES.address1
    if (!lead.town) errors.town = MESSAGES.town
  }

  return { lead, errors }
}
