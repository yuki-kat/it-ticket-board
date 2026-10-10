/**
 * Seed two system-admin accounts for testing.
 *
 * These are ordinary accounts (real bcrypt-hashed passwords) with
 * is_system_admin = TRUE, not an authentication bypass. They log in through
 * the normal /auth/login route like any other user.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx scripts/seed-admins.ts
 *
 * Credentials come from the environment so nothing secret is committed:
 *   SEED_ADMIN1_EMAIL / SEED_ADMIN1_PASSWORD / SEED_ADMIN1_NAME
 *   SEED_ADMIN2_EMAIL / SEED_ADMIN2_PASSWORD / SEED_ADMIN2_NAME
 * Any password left unset is generated and printed once at the end.
 *
 * Re-running updates the password and re-asserts admin on the same emails
 * (idempotent), so it is safe to run again to reset a test login.
 */
import { randomBytes } from 'crypto';
import { hashPassword } from '../src/utils/auth.js';
import { query, closePool } from '../src/db/connection.js';

interface Seed { email: string; password: string; name: string; generated: boolean }

function strongPassword(): string {
  // url-safe, ~20 chars, no ambiguous +/= to make it easy to paste
  return randomBytes(15).toString('base64').replace(/[+/=]/g, '').slice(0, 20)
}

function read(n: 1 | 2): Seed {
  const email = process.env[`SEED_ADMIN${n}_EMAIL`] || `admin${n}@test.local`
  const name = process.env[`SEED_ADMIN${n}_NAME`] || `Test Admin ${n}`
  const envPassword = process.env[`SEED_ADMIN${n}_PASSWORD`]
  return { email, name, password: envPassword || strongPassword(), generated: !envPassword }
}

async function upsert(seed: Seed): Promise<void> {
  const passwordHash = await hashPassword(seed.password)
  await query(
    `INSERT INTO users (email, password_hash, name, is_system_admin)
     VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           name = EXCLUDED.name,
           is_system_admin = TRUE,
           updated_at = CURRENT_TIMESTAMP`,
    [seed.email, passwordHash, seed.name]
  )
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Point it at the database you want to seed.')
    process.exit(1)
  }
  const seeds = [read(1), read(2)]
  for (const seed of seeds) await upsert(seed)

  console.log('\nSeeded 2 system-admin accounts:\n')
  for (const seed of seeds) {
    console.log(`  email:    ${seed.email}`)
    console.log(`  password: ${seed.password}${seed.generated ? '  (generated)' : ''}`)
    console.log('')
  }
  console.log('These are system admins: they can manage every team.')
  console.log('Delete them or change their passwords before any real use.')
  await closePool()
}

main().catch(async (error) => {
  console.error('Seeding failed:', error)
  await closePool()
  process.exit(1)
})
