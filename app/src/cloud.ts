import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'

// Public values: the URL of the project and its publishable key. They are meant to be in the page.
// What protects the data is the row level security in supabase/schema.sql, not keeping these secret.
export const SUPABASE_URL = 'https://lijmygwrzfodjcanddve.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ZHl0JUIO-Fx7xzlgZRrFeg_v9HsVovH'

let client: SupabaseClient | null = null

/** The Supabase client, made on first use so the page does no network work until someone asks for the account. */
export function cloud(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'implicit' } })
  return client
}

/** A sign-in link can only come back to a web address. A file opened from disk has none. */
export const canSignInHere = () => window.location.protocol === 'http:' || window.location.protocol === 'https:'

/** Emails a sign-in link that returns to this same page. */
export async function sendSignInLink(email: string): Promise<string | null> {
  const { error } = await cloud().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin + window.location.pathname } })
  return error ? error.message : null
}

export async function currentSession(): Promise<Session | null> {
  return (await cloud().auth.getSession()).data.session
}

export const signOut = () => cloud().auth.signOut()

const CHUNK = 200
export type UploadResult = { ok: true; counts: Record<string, number> } | { ok: false; error: string }

/**
 * Copies what a backup holds into the signed-in user's tables. Rows are matched by id, so running it again
 * updates rather than duplicates. Nothing is deleted from the account and nothing is changed in this browser.
 */
export async function uploadBackup(backup: import('./backup').BackupFile): Promise<UploadResult> {
  const session = await currentSession()
  if (!session) return { ok: false, error: 'Sign in first.' }
  const owner = session.user.id
  const now = new Date().toISOString()
  const idOf = (record: unknown, field: string) => String((record as Record<string, unknown>)[field])
  const tables: [string, unknown[], string][] = [
    ['tickets', backup.records.tickets, 'id'],
    ['deleted_tickets', backup.records.deletedTickets, 'id'],
    ['assets', backup.records.assets, 'id'],
    ['stock_items', backup.records.stock, 'sku'],
  ]
  const counts: Record<string, number> = {}
  for (const [table, records, idField] of tables) {
    const rows = records.map((record) => ({ owner, id: idOf(record, idField), data: record, updated_at: now }))
    for (let start = 0; start < rows.length; start += CHUNK) {
      const { error } = await cloud().from(table).upsert(rows.slice(start, start + CHUNK), { onConflict: 'owner,id' })
      if (error) return { ok: false, error: `${table}: ${error.message}` }
    }
    counts[table] = rows.length
  }
  const settings = Object.entries(backup.settings).map(([key, value]) => ({ owner, key, value, updated_at: now }))
  if (settings.length) {
    const { error } = await cloud().from('settings').upsert(settings, { onConflict: 'owner,key' })
    if (error) return { ok: false, error: `settings: ${error.message}` }
  }
  counts.settings = settings.length
  return { ok: true, counts }
}
