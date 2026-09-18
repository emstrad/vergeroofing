// The only way a staff account is created. There is no seeded account and no
// default password, because a default password is a published one.
//
//   node db/create-user.js someone@example.com
//
// The staff area currently takes one shared code, so nothing reads this table
// yet. It exists now so moving to per-person logins later is a route change
// rather than a migration, and so the audit trail can start the day it does.
import { createInterface } from 'node:readline/promises'
import pg from 'pg'
import 'dotenv/config'

async function main() {
  const email = String(process.argv[2] || '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    console.error('usage: node db/create-user.js someone@example.com')
    process.exit(1)
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const password = await rl.question('password (will be hashed, not stored): ')
  const name = await rl.question('name: ')
  rl.close()

  if (password.length < 12) {
    console.error('twelve characters minimum. This is the only thing between a stranger and the money.')
    process.exit(1)
  }

  // argon2id via @node-rs/argon2: prebuilt binaries for the Lambda platform, so
  // a deploy cannot fail on a native compile step.
  const { hash } = await import('@node-rs/argon2')
  const passwordHash = await hash(password)

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    await client.query(
      `INSERT INTO staff_users (email, name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name`,
      [email, name || null, passwordHash]
    )
    console.log('saved ' + email)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
