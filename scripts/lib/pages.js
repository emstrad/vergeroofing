import { renderPage } from './layout.js'
import { hubs } from '../../content/hubs.js'
import { loadAll as loadServices } from '../../content/services/index.js'
import { loadAll as loadGuides } from '../../content/guides/index.js'
import { loadAll as loadAreas } from '../../content/areas/index.js'

// The build refuses to ship a thin page. A thin page drags the whole site down
// rather than only itself, so this is a hard failure and not a warning.
const MINIMUM_WORDS = 250

export function wordsIn(page) {
  const parts = [page.intro]
  for (const section of page.sections || []) {
    parts.push(section.h2, ...section.paragraphs, ...(section.list || []))
  }
  for (const faq of page.faqs || []) parts.push(faq.q, faq.a)
  return parts.join(' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length
}

function problemsWith(page, where) {
  const problems = []
  const words = wordsIn(page)
  if (words < MINIMUM_WORDS) problems.push(`${where}: only ${words} words, needs ${MINIMUM_WORDS}`)
  if (!page.title) problems.push(`${where}: no title`)
  if (!page.description || page.description.length < 50) problems.push(`${where}: description too short to be useful`)
  if (!page.h1) problems.push(`${where}: no h1`)
  if (!page.sections || !page.sections.length) problems.push(`${where}: no sections`)
  return problems
}

export async function collect() {
  const [services, guides, areas] = await Promise.all([loadServices(), loadGuides(), loadAreas()])

  const built = []
  const problems = []

  function add(page, href, crumbs, where) {
    problems.push(...problemsWith(page, where))
    built.push({ path: href, page: { ...page, href, crumbs } })
  }

  for (const page of services) {
    add(page, `/services/${page.slug}`, [{ label: 'Services', href: '/services' }], `services/${page.slug}`)
  }
  for (const page of guides) {
    add(page, `/guides/${page.slug}`, [{ label: 'Guides', href: '/guides' }], `guides/${page.slug}`)
  }
  for (const page of areas) {
    add(page, `/roofing-in/${page.slug}`, [{ label: 'Areas', href: '/roofing-in' }], `areas/${page.slug}`)
  }

  // Hubs list their children, so adding a page cannot leave something that
  // nothing links to.
  const children = {
    services: services.map((page) => ({ href: `/services/${page.slug}`, label: page.title, note: page.description })),
    guides: guides.map((page) => ({ href: `/guides/${page.slug}`, label: page.title, note: page.description })),
    areas: areas.map((page) => ({ href: `/roofing-in/${page.slug}`, label: page.title, note: page.description }))
  }

  for (const [key, hub] of Object.entries(hubs)) {
    const list = children[key]
    const page = {
      ...hub,
      crumbs: [],
      sections: hub.sections,
      related: list.map((child) => ({ href: child.href, label: child.label }))
    }
    problems.push(...problemsWith(page, `hub:${key}`))
    built.push({ path: hub.href, page: { ...page, href: hub.href } })
  }

  return { built, problems }
}

export function renderAll(built) {
  return built.map((entry) => ({
    // /services/flat-roofing is written to public/services/flat-roofing.html,
    // and cleanUrls serves it at the path it was named after. There is no
    // reason for an internal path that differs from the one people see.
    file: 'public' + entry.path + '.html',
    html: renderPage(entry.page)
  }))
}
