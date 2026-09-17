// The one place a connection string is read. Tests replace this module with a
// pg-backed stand-in, so every handler below it runs real SQL against real
// Postgres rather than against a mock that agrees with whatever the code does.
import { neon } from '@neondatabase/serverless'

let client = null

function connection() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  // The pooled host (it contains -pooler) is the one to use: a serverless
  // function opens a connection per invocation and the direct host runs out of
  // them under any real traffic.
  if (!client) client = neon(url)
  return client
}

// Tagged template, so callers write SQL with interpolation and still get
// parameterised queries. sql`select * from leads where id = ${id}` is safe.
export function sql(strings, ...values) {
  return connection()(strings, ...values)
}

export async function dbHealthy() {
  try {
    await sql`SELECT 1`
    return true
  } catch {
    return false
  }
}
