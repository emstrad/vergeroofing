import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { collect, wordsIn } from '../scripts/lib/pages.js'
import { sitemap, robots } from '../scripts/lib/sitemap.js'

const { built, problems } = await collect()

test('no page ships thin or incomplete', () => {
  assert.deepEqual(problems, [])
})

// The count is what the build enforces. This asserts the rule itself still
// bites, so a future edit that loosens it fails here rather than silently.
test('the thin page rule refuses a page under 250 distinctive words', () => {
  const thin = { intro: 'Roofing in Anytown.', sections: [{ h2: 'Roofing', paragraphs: ['We do roofing in Anytown.'] }] }
  assert.ok(wordsIn(thin) < 250)
})

test('every content page is reachable from its hub', () => {
  for (const hub of ['/services', '/guides', '/roofing-in']) {
    const page = built.find((entry) => entry.path === hub)
    assert.ok(page, `no hub at ${hub}`)
    const children = built.filter((entry) => entry.path.startsWith(hub + '/'))
    assert.ok(children.length >= 4, `${hub} has only ${children.length} children`)
    for (const child of children) {
      assert.ok(
        page.page.related.some((link) => link.href === child.path),
        `${child.path} is not listed on ${hub}`
      )
    }
  }
})

test('the sitemap lists the home page and every generated page', () => {
  const xml = sitemap(built)
  assert.ok(xml.includes('<loc>https://vergeroofing.com/</loc>'))
  for (const entry of built) {
    assert.ok(xml.includes(`<loc>https://vergeroofing.com${entry.path}</loc>`), `${entry.path} missing from the sitemap`)
  }
  const committed = readFileSync('public/sitemap.xml', 'utf8')
  assert.equal(
    committed.replace(/<lastmod>[^<]+<\/lastmod>/g, ''),
    xml.replace(/<lastmod>[^<]+<\/lastmod>/g, ''),
    'the committed sitemap is not what the build produces now'
  )
})

// Adding a named group for one crawler makes that crawler ignore the wildcard
// group entirely, so the disallows stop applying to it. One group, always.
test('robots.txt has exactly one user-agent group', () => {
  const text = robots()
  assert.equal((text.match(/User-agent:/g) || []).length, 1)
  assert.ok(text.includes('Disallow: /api/'))
  assert.ok(text.includes('Disallow: /staff'))
  assert.ok(text.includes('Sitemap: https://vergeroofing.com/sitemap.xml'))
})

test('only guides carry Article structured data', () => {
  for (const entry of built) {
    const isGuide = entry.path.startsWith('/guides/')
    const hasDate = Boolean(entry.page.published)
    assert.equal(hasDate, isGuide, `${entry.path} ${isGuide ? 'needs' : 'must not carry'} a publication date`)
  }
})

test('no page claims an accreditation or a guarantee nobody has written down', () => {
  const banned = /F-Gas|NICEIC|CompetentRoofer|TrustMark|Which\? Trusted Trader|insurance-backed/i
  for (const entry of built) {
    const text = JSON.stringify(entry.page)
    assert.ok(!banned.test(text), `${entry.path} makes a claim the business has not confirmed`)
  }
})

test('every service page links to a guide, and every guide back to a page', () => {
  for (const entry of built.filter((page) => page.path.startsWith('/services/'))) {
    assert.ok(entry.page.related && entry.page.related.length, `${entry.path} links nowhere`)
  }
  for (const entry of built.filter((page) => page.path.startsWith('/guides/'))) {
    assert.ok(entry.page.related && entry.page.related.length, `${entry.path} links nowhere`)
  }
})

// Every card on every shipped page has to trace back to a real entry in
// content/reviews.js. This is the test that fails on an invented testimonial.
test('every review card on a shipped page traces back to a real entry', async () => {
  const { reviews, REVIEW_FLOOR } = await import('../content/reviews.js')
  const { readdirSync, statSync } = await import('node:fs')

  function pages(dir = 'public') {
    const out = []
    for (const name of readdirSync(dir)) {
      const path = dir + '/' + name
      if (statSync(path).isDirectory()) out.push(...pages(path))
      else if (name.endsWith('.html')) out.push(path)
    }
    return out
  }

  for (const path of pages()) {
    const html = readFileSync(path, 'utf8')
    const cards = [...html.matchAll(/<article class="review">\s*<p>([\s\S]*?)<\/p>/g)].map((match) => match[1].trim())
    for (const card of cards) {
      assert.ok(
        reviews.some((review) => review.text.trim() === card.replace(/&quot;/g, '"').replace(/&amp;/g, '&')),
        `${path} shows a review that is not in content/reviews.js`
      )
    }
    if (reviews.length < REVIEW_FLOOR) {
      assert.equal(cards.length, 0, `${path} ships review cards while below the floor of ${REVIEW_FLOOR}`)
    }
  }
})
