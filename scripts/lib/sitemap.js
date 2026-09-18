import { site } from '../../content/site.js'

const TODAY = new Date().toISOString().slice(0, 10)

export function sitemap(built) {
  const urls = ['/', ...built.map((entry) => entry.path)]
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">
${urls.map((path) => `  <url>
    <loc>${site.domain}${path === '/' ? '/' : path}</loc>
    <lastmod>${TODAY}</lastmod>
  </url>`).join('\n')}
</urlset>
`
}

// One group only. Adding a named group for a crawler makes that crawler ignore
// the wildcard group entirely, so the disallows below would stop applying to
// exactly the crawler somebody added the group for. AI crawlers are allowed on
// purpose: the pages are written to be read.
export function robots() {
  return `User-agent: *
Allow: /
Disallow: /api/
Disallow: /staff

Sitemap: ${site.domain}/sitemap.xml
`
}

export function llms(built) {
  const group = (prefix) => built
    .filter((entry) => entry.path.startsWith(prefix) && entry.path !== prefix)
    .map((entry) => `- [${entry.page.title}](${site.domain}${entry.path}): ${entry.page.description}`)
    .join('\n')

  return `# ${site.name}

> Residential and commercial roofing contractors covering London, Kent, Surrey,
> Essex, Hertfordshire, Sussex and Berkshire. Re-roofs, repairs, flat roofing,
> leadwork and chimneys, guttering, storm damage, planned maintenance and
> commercial roofing.

## How we work

Every job is priced after someone has been out and looked at it. There is no
price list and no published tariff, because a figure that does not survive
contact with the roof is worth less than no figure at all.

After an enquiry: we reply the same day, sooner if water is coming in. We come
out and look, at no charge. Within ${site.quoteTurnaround} of that visit you
get photographs of what we found and one fixed written price, with scaffolding,
waste, making good and VAT included. Variations only for something neither
party could see until the roof was open, agreed in advance.

Thirty years in the trade. Fully insured. A written workmanship guarantee is
handed over with the completion photographs.

Contact: ${site.email}

## Services

${group('/services')}

## Guides

${group('/guides')}

## Areas

${group('/roofing-in')}
`
}
