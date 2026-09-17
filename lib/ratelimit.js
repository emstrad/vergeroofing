// Counters live in Postgres because serverless instances do not share memory:
// an in-process counter is walked round by spreading requests across cold
// starts, which is exactly what a script doing volume already does.
import { sql } from './db.js'

export const LIMITS = {
  // Fails open. A database blip must not stop the phone ringing.
  lead: { max: 8, windowMinutes: 10, failOpen: true },
  event: { max: 60, windowMinutes: 10, failOpen: true },
  // Fails closed. A login route that keeps working while the counter is down is
  // a login route with no limit at all.
  login: { max: 5, windowMinutes: 15, failOpen: false },
  // A per-address limit alone still lets a pool of addresses walk a four digit
  // keyspace, so there is a second ceiling across all of them.
  loginGlobal: { max: 50, windowMinutes: 15, failOpen: false }
}

// One round trip. The count CTE cannot see the insert CTE's own write, so the
// insert is added back on afterwards rather than counted twice or missed.
async function hit(bucket, key, windowMinutes) {
  const rows = await sql`
    WITH recent AS (
      SELECT count(*)::int AS n
      FROM rate_hits
      WHERE bucket = ${bucket}
        AND key = ${key}
        AND created_at > now() - (${windowMinutes}::text || ' minutes')::interval
    ),
    inserted AS (
      INSERT INTO rate_hits (bucket, key) VALUES (${bucket}, ${key}) RETURNING 1
    )
    SELECT (SELECT n FROM recent) + (SELECT count(*)::int FROM inserted) AS count
  `
  return rows[0]?.count ?? 0
}

export async function checkRate(bucket, key) {
  const limit = LIMITS[bucket]
  if (!limit) throw new Error('unknown rate bucket: ' + bucket)
  if (!key) return { allowed: true, count: 0 }
  try {
    const count = await hit(bucket, key, limit.windowMinutes)
    return { allowed: count <= limit.max, count }
  } catch {
    return { allowed: limit.failOpen, count: 0, degraded: true }
  }
}

// Old rows are dead weight on every count. Swept opportunistically rather than
// on a schedule, so there is nothing extra to deploy or to forget.
export async function sweepRateHits() {
  await sql`DELETE FROM rate_hits WHERE created_at < now() - interval '1 day'`
}
