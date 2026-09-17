// Applies db/schema.sql. Idempotent by construction, so CI runs it twice on
// every merge and a statement that is not safe to repeat fails there rather
// than the next time someone deploys.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import 'dotenv/config'

const here = dirname(fileURLToPath(import.meta.url))

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }
  const schema = readFileSync(join(here, 'schema.sql'), 'utf8')
  const client = new pg.Client({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: true }
  })
  await client.connect()
  try {
    await client.query(schema)
    console.log('schema applied')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
