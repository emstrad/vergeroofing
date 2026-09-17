// House rule 4: no em dashes anywhere. CI runs this and fails on a hit, because
// an em dash is the single reliable tell that copy was pasted from a generator
// rather than written.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SKIP = new Set(['node_modules', '.git', '.vercel'])
const hits = []
// Built from a code point so this file does not trip its own check.
const EM_DASH = String.fromCharCode(0x2014)

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      walk(path)
      continue
    }
    if (/\.(js|mjs|json|html|css|md|txt|sql|yml|yaml)$/.test(name) === false) continue
    const lines = readFileSync(path, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (line.includes(EM_DASH)) hits.push(`${path}:${i + 1}: ${line.trim()}`)
    })
  }
}

walk(process.cwd())

if (hits.length) {
  console.error('em dash found:')
  for (const hit of hits) console.error('  ' + hit)
  process.exit(1)
}
console.log('no em dashes')
