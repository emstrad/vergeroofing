// /assets is served immutable for a year, which is only safe because every
// reference carries a content hash of the file it points at. A test re-runs
// this and fails when a stamp is stale, so editing an asset without rebuilding
// fails in CI rather than in a returning visitor's browser running last
// month's script against this month's markup.
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const REFERENCE = /(["'(])(\/assets\/[A-Za-z0-9._\/-]+\.(?:js|css|woff2|png|jpg|svg))(\?v=[a-f0-9]+)?/g

const cache = new Map()

function hashOf(root, urlPath) {
  if (cache.has(urlPath)) return cache.get(urlPath)
  const file = join(root, urlPath.replace(/^\//, ''))
  if (!existsSync(file)) return null
  const hash = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 10)
  cache.set(urlPath, hash)
  return hash
}

export function stampAssets(html, root) {
  return html.replace(REFERENCE, (match, quote, urlPath) => {
    const hash = hashOf(root, urlPath)
    // A missing file is left exactly as written. Silently stamping a path that
    // does not resolve would hide the typo that caused it.
    return hash ? `${quote}${urlPath}?v=${hash}` : `${quote}${urlPath}`
  })
}
