import { site } from '../../content/site.js'

// One page shell for every generated page, so the header, the footer and the
// schema cannot drift between page types. The home page keeps its own markup
// because it is the one page whose layout is not a template.

function escape(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function nav() {
  return `<nav aria-label="Primary">
        <ul class="nav-links">
          <li><a href="/services">Services</a></li>
          <li><a href="/guides">Guides</a></li>
          <li><a href="/roofing-in">Areas</a></li>
          <li><a href="/#commercial">Commercial</a></li>
          <li><a href="/#faq">FAQs</a></li>
        </ul>
      </nav>`
}

function breadcrumbSchema(crumbs) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      item: site.domain + crumb.href
    }))
  })
}

function faqSchemaFor(faqs) {
  if (!faqs || !faqs.length) return ''
  return `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: { '@type': 'Answer', text: faq.a }
    }))
  })}</script>`
}

// Only guides carry Article. A guide is an article; a service page is a
// description of a service, and marking one up as the other is a claim about
// what the page is that is simply not true.
function articleSchema(page) {
  if (!page.published) return ''
  return `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: page.h1,
    datePublished: page.published,
    dateModified: page.updated || page.published,
    author: { '@type': 'Organization', name: site.name },
    publisher: { '@type': 'Organization', name: site.name }
  })}</script>`
}

function sections(page) {
  return (page.sections || []).map((section) => `
      <section class="prose-section">
        <h2>${escape(section.h2)}</h2>
        ${section.paragraphs.map((text) => `<p>${escape(text)}</p>`).join('\n        ')}
        ${section.list ? `<ul class="prose-list">${section.list.map((item) => `<li>${escape(item)}</li>`).join('')}</ul>` : ''}
      </section>`).join('\n')
}

function faqs(page) {
  if (!page.faqs || !page.faqs.length) return ''
  return `
      <section class="prose-section" id="faq">
        <h2>Common questions</h2>
        <div class="faq-list">
          ${page.faqs.map((faq) => `<details class="qa">
            <summary>${escape(faq.q)}<span class="qa-plus" aria-hidden="true">+</span></summary>
            <p>${escape(faq.a)}</p>
          </details>`).join('\n          ')}
        </div>
      </section>`
}

function related(page) {
  if (!page.related || !page.related.length) return ''
  return `
      <section class="prose-section">
        <h2>Related</h2>
        <ul class="prose-list">
          ${page.related.map((link) => `<li><a href="${link.href}">${escape(link.label)}</a></li>`).join('\n          ')}
        </ul>
      </section>`
}

export function renderPage(page) {
  const url = site.domain + page.href
  const crumbs = [{ label: 'Home', href: '/' }, ...page.crumbs, { label: page.title, href: page.href }]

  return `<!doctype html>
<html lang="en-GB" class="no-js">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escape(page.title)} | ${site.name}</title>
<meta name="description" content="${escape(page.description)}" />
<meta name="theme-color" content="#141414" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="${page.published ? 'article' : 'website'}" />
<meta property="og:locale" content="en_GB" />
<meta property="og:title" content="${escape(page.title)}" />
<meta property="og:description" content="${escape(page.description)}" />
<meta property="og:image" content="${site.domain}/assets/img/verge-logo.png" />
<meta property="og:url" content="${url}" />
<link rel="icon" type="image/png" href="/assets/img/verge-logo.png" />
<link rel="preload" href="/assets/fonts/archivo-latin.woff2" as="font" type="font/woff2" crossorigin />
<link rel="stylesheet" href="/assets/css/site.css" />
<script>document.documentElement.classList.remove('no-js')</script>
<script type="application/ld+json">${breadcrumbSchema(crumbs)}</script>
${faqSchemaFor(page.faqs)}
${articleSchema(page)}
</head>
<body>

<a class="skip-link" href="#main">Skip to content</a>

<header class="site-header">
  <div class="container nav">
    <a href="/" class="brand" aria-label="${site.name} home">
      <span class="logo"><img src="/assets/img/verge-logo.png" alt="${site.name}" width="200" height="48" /><span class="logo-tag">Higher standards.</span></span>
    </a>
    <div class="nav-end">
      ${nav()}
      <div class="nav-cta">
        <!-- PHONE_NAV:START -->
        <!-- PHONE_NAV:END -->
        <a href="#book" class="btn btn--primary" data-cta data-placement="header">Get a free quote</a>
        <button type="button" class="menu-button" data-menu-button aria-controls="menu-panel" aria-expanded="false">
          <span class="sr-only">Menu</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
        </button>
      </div>
    </div>
  </div>
</header>

<nav class="menu-panel" id="menu-panel" data-menu-panel aria-label="Menu">
  <ul>
    <li><a href="/services">Services</a></li>
    <li><a href="/guides">Guides</a></li>
    <li><a href="/roofing-in">Areas</a></li>
    <li><a href="/#commercial">Commercial</a></li>
    <li><a href="#book">Get a free quote</a></li>
  </ul>
</nav>

<main id="main">
  <article class="prose">
    <div class="container">
      <nav class="crumbs" aria-label="Breadcrumb">
        ${crumbs.map((crumb, index) => index === crumbs.length - 1
          ? `<span aria-current="page">${escape(crumb.label)}</span>`
          : `<a href="${crumb.href}">${escape(crumb.label)}</a>`).join(' <span aria-hidden="true">/</span> ')}
      </nav>
      <h1>${escape(page.h1)}</h1>
      <p class="lede">${escape(page.intro)}</p>
${sections(page)}
${faqs(page)}
${related(page)}
    </div>
  </article>

  <section class="book-section" id="book">
    <div class="container">
      <div class="book-card">
        <div class="book-body">
          <div class="book-head"><h2>Get your free quote</h2></div>
          <!-- QUOTE-FORM:START -->
          <!-- QUOTE-FORM:END -->
        </div>
      </div>
    </div>
  </section>
</main>

<footer class="footer">
  <div class="container footer-bar">
    <span>&copy; 2026 ${site.name}. All rights reserved.</span>
    <span><a href="/services">Services</a> · <a href="/guides">Guides</a> · <a href="/roofing-in">Areas</a></span>
    <a class="staff-login" href="/staff">Staff login</a>
  </div>
</footer>

<div class="action-bar">
  <!-- PHONE_BAR:START -->
  <!-- PHONE_BAR:END -->
  <a href="#book" class="btn btn--primary" data-cta data-placement="mobile-bar">Free quote</a>
</div>

<script src="/assets/js/visit.js"></script>
<script src="/assets/js/partial.js"></script>
<script src="/assets/js/book.js"></script>
<script src="/assets/js/address.js" defer></script>
<script src="/assets/js/upload.js" defer></script>
<script src="/assets/js/menu.js" defer></script>
</body>
</html>
`
}

export { escape }
