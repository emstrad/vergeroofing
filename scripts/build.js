// An authoring tool, not a deploy step: Vercel serves public/ exactly as it sits
// on disk, and whatever this writes is committed. Run it after editing content,
// an asset, or the form.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { renderQuoteForm } from './book-form.js'
import { site } from '../content/site.js'
import { fillMarkers } from './lib/marker.js'
import { stampAssets } from './lib/stamp.js'
import { faqSchema } from './lib/schema.js'
import { collect, renderAll } from './lib/pages.js'
import { sitemap, robots, llms } from './lib/sitemap.js'

const PUBLIC = 'public'

function pages(dir = PUBLIC) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...pages(path))
    else if (name.endsWith('.html')) out.push(path)
  }
  return out
}

// A phone number that does not exist yet is worse than none: a placeholder
// sends real customers to a stranger. While site.phone is null every phone
// block ships empty, and the moment it is filled in every placement gets it.
function phoneBlocks() {
  if (!site.phone) return { nav: '', closing: '', footer: '', bar: '' }
  const display = site.phoneDisplay || site.phone
  return {
    nav: `<a href="tel:${site.phone}" class="call-link" data-placement="header">${display}</a>`,
    closing: `<a href="tel:${site.phone}" class="btn btn--ghost btn--lg" data-placement="closing">Call ${display}</a>`,
    footer: `<li><a href="tel:${site.phone}" data-placement="footer">${display}</a></li>`,
    bar: `<a href="tel:${site.phone}" class="btn btn--ghost" data-placement="mobile-bar">Call now</a>`
  }
}

function buildPage(path, form, phones) {
  let html = readFileSync(path, 'utf8')
  html = fillMarkers(html, 'QUOTE-FORM', form)
  html = fillMarkers(html, 'PHONE_NAV', phones.nav)
  html = fillMarkers(html, 'PHONE_CLOSING', phones.closing)
  html = fillMarkers(html, 'PHONE_FOOTER', phones.footer)
  html = fillMarkers(html, 'PHONE_BAR', phones.bar)
  html = fillMarkers(html, 'FAQ-SCHEMA', faqSchema(html))
  // Stamped last, so whatever the other passes wrote is what gets stamped.
  html = stampAssets(html, PUBLIC)
  return html
}

// Cleared and rewritten, so a renamed slug does not leave the old page live
// forever. Only the generated directories are touched: the home page and the
// staff area are hand-written.
const GENERATED = ['public/services', 'public/guides', 'public/roofing-in']

async function main() {
  const check = process.argv.includes('--check')
  const form = renderQuoteForm()
  const phones = phoneBlocks()
  const stale = []

  // Content pages first, so the marker and stamping passes below run over what
  // was just written as well as over the pages already on disk.
  const { built, problems } = await collect()
  if (problems.length) {
    console.error('the build writes nothing while any page is thin or incomplete:')
    for (const problem of problems) console.error('  ' + problem)
    process.exit(1)
  }

  const generated = renderAll(built)
  if (!check) {
    for (const dir of GENERATED) rmSync(dir, { recursive: true, force: true })
    for (const file of generated) {
      mkdirSync(dirname(file.file), { recursive: true })
      writeFileSync(file.file, file.html)
    }
    // Adding a page cannot leave something that nothing links to and nothing
    // lists.
    writeFileSync('public/sitemap.xml', sitemap(built))
    writeFileSync('public/robots.txt', robots())
    writeFileSync('public/llms.txt', llms(built))
  }

  for (const path of pages()) {
    const current = readFileSync(path, 'utf8')
    const built = buildPage(path, form, phones)
    if (built === current) continue
    if (check) stale.push(path)
    else writeFileSync(path, built)
  }

  if (check && stale.length) {
    console.error('these committed pages are not what the build produces now:')
    for (const path of stale) console.error('  ' + path)
    process.exit(1)
  }

  if (!site.phone) {
    console.log('note: site.phone is not set, so every call to action ships without a number')
  }
  console.log(check ? 'pages are current' : `built ${pages().length} page(s), ${generated.length} of them generated`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
