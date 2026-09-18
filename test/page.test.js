import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

function pages(dir = 'public') {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...pages(path))
    else if (name.endsWith('.html')) out.push(path)
  }
  return out
}

const files = pages()
const docs = files.map((path) => ({ path, html: readFileSync(path, 'utf8') }))
// The staff area is behind a login and carries noindex, so the SEO rules that
// exist to keep Google happy do not apply to it. Everything about safety and
// correctness still does.
const publicDocs = docs.filter((doc) => !doc.path.startsWith('public/staff'))

test('there is at least one page to check', () => {
  assert.ok(docs.length > 0)
})

// A stale committed page fails here rather than shipping. The build is an
// authoring step, so nothing at deploy time would otherwise catch it.
test('every committed page is what the build produces now', () => {
  execFileSync('node', ['scripts/build.js', '--check'], { stdio: 'pipe' })
})

test('nothing loads from a third party', () => {
  for (const { path, html } of docs) {
    const external = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)]
      .map((m) => m[1])
      .filter((url) => !url.startsWith('https://vergeroofing.com'))
    assert.deepEqual(external, [], `${path} loads from ${external.join(', ')}`)
  }
})

test('each page carries the accessibility structure', () => {
  for (const { path, html } of publicDocs) {
    assert.equal((html.match(/<main[\s>]/g) || []).length, 1, `${path} needs exactly one main`)
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${path} needs exactly one h1`)
    assert.ok(html.includes('class="skip-link"'), `${path} has no skip link`)
    const levels = [...html.matchAll(/<h([1-4])[\s>]/g)].map((m) => Number(m[1]))
    levels.reduce((previous, level) => {
      assert.ok(level <= previous + 1, `${path} skips from h${previous} to h${level}`)
      return level
    }, 1)
  }
})

test('every image has alt text', () => {
  for (const { path, html } of docs) {
    for (const tag of html.match(/<img [^>]*>/g) || []) {
      assert.ok(/alt="[^"]+"/.test(tag), `${path} has an image with no alt text: ${tag}`)
    }
  }
})

test('each page has a unique title, description and canonical', () => {
  const seen = new Set()
  for (const { path, html } of publicDocs) {
    const title = html.match(/<title>([^<]+)<\/title>/)
    assert.ok(title, `${path} has no title`)
    assert.ok(!seen.has(title[1]), `duplicate title on ${path}`)
    seen.add(title[1])
    assert.ok(/<meta name="description" content="[^"]{50,}"/.test(html), `${path} has no real description`)
    assert.ok(/<link rel="canonical"/.test(html), `${path} has no canonical`)
  }
})

// The house rules, as a test. Every one of these has cost somebody a manual
// action or a trading standards letter somewhere.
test('no star average, review count, invented testimonial or unheld accreditation', () => {
  const banned = [
    /aggregateRating/i,
    /\b[45](\.\d)?\s*(out of 5|stars?)\b/i,
    /\b\d+\s+(google\s+)?reviews\b/i,
    /F-Gas|NICEIC|CompetentRoofer|TrustMark|Which\? Trusted Trader/i
  ]
  for (const { path, html } of docs) {
    for (const pattern of banned) {
      assert.ok(!pattern.test(html), `${path} matches a banned claim: ${pattern}`)
    }
  }
})

test('the quote form is generated into the page rather than hand-written', () => {
  for (const { path, html } of docs) {
    if (!html.includes('QUOTE-FORM:START')) continue
    assert.ok(html.includes('id="quote-form"'), `${path} has the marker but no form`)
    assert.equal((html.match(/id="quote-form"/g) || []).length, 1, `${path} has two forms`)
  }
})

test('every asset reference carries a current content hash', () => {
  for (const { path, html } of docs) {
    const refs = [...html.matchAll(/["'(](\/assets\/[^"')?]+\.(?:js|css|woff2|png))(\?v=([a-f0-9]+))?/g)]
    assert.ok(refs.length > 0, `${path} references no assets`)
    for (const [, urlPath, , stamp] of refs) {
      assert.ok(stamp, `${urlPath} on ${path} is unstamped, and /assets is served immutable for a year`)
    }
  }
})

test('the home page states what happens after an enquiry', () => {
  const home = docs.find((doc) => doc.path === 'public/index.html')
  assert.ok(home, 'no home page')
  // The promise appears in several places and has to be the same promise in
  // each of them.
  assert.ok(!/within 24 hours/i.test(home.html), 'the quote turnaround is 48 hours')
  assert.ok(/within 48 hours/i.test(home.html))
  const words = home.html.replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length
  assert.ok(words > 900, `the home page carries only ${words} words in the markup`)
})
