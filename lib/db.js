// The one place a connection string is read. Tests replace this module with a
// pg-backed stand-in, so every handler below it runs real SQL against real
// Postgres rather than against a mock that agrees with whatever the code does.
import { neon } from '@neondatabase/serverless'

let client = null

function isLocal(url) {
  return url.includes('localhost') || url.includes('127.0.0.1')
}

// A local Postgres speaks the wire protocol, not Neon's HTTP one, so running
// the real handlers on this machine needs pg. It is a dev dependency and this
// branch never runs in production, where the URL is always the Neon pooled host.
async function localClient(url) {
  const pg = (await import('pg')).default
  const pool = new pg.Pool({ connectionString: url, max: 4 })
  return (strings, ...values) => {
    let text = ''
    strings.forEach((part, index) => {
      text += part
      if (index < values.length) text += '$' + (index + 1)
    })
    return pool.query(text, values).then((result) => result.rows)
  }
}

function connection() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  // The pooled host (it contains -pooler) is the one to use in production: a
  // serverless function opens a connection per invocation and the direct host
  // runs out of them under any real traffic.
  if (!client) client = isLocal(url) ? localClient(url) : neon(url)
  return client
}

export function sql(strings, ...values) {
  const connected = connection()
  // The local client arrives as a promise, because importing pg is async.
  if (typeof connected.then === 'function') {
    return connected.then((run) => run(strings, ...values))
  }
  return connected(strings, ...values)
}

export async function dbHealthy() {
  try {
    await sql`SELECT 1`
    return true
  } catch {
    return false
  }
}
