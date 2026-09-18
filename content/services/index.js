// The directory is the list. This reads its own folder, so there is no register
// to update and no way to write a page and leave it unpublished by forgetting
// to add it somewhere.
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export async function loadAll() {
  const files = readdirSync(here)
    .filter((name) => name.endsWith('.js') && name !== 'index.js')
    .sort()
  const pages = []
  for (const file of files) {
    const module = await import(join(here, file))
    pages.push({ ...module.page, slug: module.page.slug || file.replace(/\.js$/, '') })
  }
  return pages
}
