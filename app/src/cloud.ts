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
