// Local only. Vercel serves public/ and runs api/ for real; this stands in for
// both so the pages can be driven end to end on a laptop before anything is
// deployed. It is never imported by the app.
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import 'dotenv/config'

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8'
}

const ROUTES = {
  '/api/lead': () => import('../lib/routes/lead.js'),
  '/api/event': () => import('../lib/routes/event.js'),
  '/api/notified': () => import('../lib/routes/notified.js'),
  '/api/health': () => import('../lib/routes/health.js'),
  '/api/address': () => import('../lib/routes/address.js'),
  '/api/upload': () => import('../lib/routes/upload.js'),
  '/api/auth': () => import('../lib/routes/auth.js'),
  '/api/admin': () => import('../lib/routes/admin.js')
}

function serveFile(res, path) {
  res.statusCode = 200
  res.setHeader('Content-Type', TYPES[extname(path)] || 'application/octet-stream')
  res.end(readFileSync(path))
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname

  for (const [prefix, load] of Object.entries(ROUTES)) {
    if (path === prefix || path.startsWith(prefix + '/')) {
      const handler = (await load()).default
      // Secure cookies would never come back over plain http locally, so the
      // dev server strips that one attribute and nothing else.
      const setHeader = res.setHeader.bind(res)
      res.setHeader = (key, value) => {
        if (key.toLowerCase() === 'set-cookie') {
          const cookies = (Array.isArray(value) ? value : [value]).map((cookie) => cookie.replace('; Secure', ''))
          return setHeader(key, cookies)
        }
        return setHeader(key, value)
      }
      try {
        await handler(req, res)
      } catch (error) {
        res.statusCode = 500
        res.end(JSON.stringify({ error: String(error.message || error) }))
      }
      return
    }
  }

  // cleanUrls, as Vercel serves it.
  const candidates = [
    join('public', path),
    join('public', path + '.html'),
    join('public', path, 'index.html')
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return serveFile(res, candidate)
  }

  res.statusCode = 404
  res.end('not found')
})

const port = Number(process.env.PORT || 3000)
server.listen(port, () => console.log('dev server on http://localhost:' + port))
