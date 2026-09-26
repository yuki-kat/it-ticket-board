import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { WORKSPACE_KEY } from './syncLogic'

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

export type Role = 'admin' | 'agent'
export type Workspace = { id: string; name: string; role: Role }
export type Member = { user_id: string; email: string | null; role: Role }
export type Invite = { email: string; role: Role }

const fail = (error: { message: string } | null) => error ? error.message : null

/**
 * The workspace (company) this browser works in. Signing in first joins any workspace that invited
 * this email address; someone with no workspace at all gets their own, as its admin.
 */
export async function currentWorkspace(): Promise<Workspace | { error: string }> {
  const session = await currentSession()
  if (!session) return { error: 'Sign in first.' }
  await cloud().rpc('accept_invites')
  const load = () => cloud().from('workspace_members').select('workspace_id, role, workspaces(name)').eq('user_id', session.user.id)
  let { data, error } = await load()
  if (!error && data && data.length === 0) {
    const made = await cloud().rpc('create_workspace', { workspace_name: 'My workspace' })
    if (made.error) return { error: made.error.message }
    ;({ data, error } = await load())
  }
  if (error || !data?.length) return { error: error?.message ?? 'No workspace found.' }
  const rows = data as unknown as { workspace_id: string; role: Role; workspaces: { name: string } | null }[]
  const chosen = rows.find((row) => row.workspace_id === localStorage.getItem(WORKSPACE_KEY)) ?? rows[0]
  localStorage.setItem(WORKSPACE_KEY, chosen.workspace_id)
  return { id: chosen.workspace_id, name: chosen.workspaces?.name ?? 'Workspace', role: chosen.role }
}

export async function listMembers(workspaceId: string): Promise<{ members: Member[]; invites: Invite[] } | { error: string }> {
  const [members, invites] = await Promise.all([
    cloud().from('workspace_members').select('user_id, email, role').eq('workspace_id', workspaceId).order('created_at'),
    cloud().from('workspace_invites').select('email, role').eq('workspace_id', workspaceId).order('created_at'),
  ])
  if (members.error) return { error: members.error.message }
  // Only admins can see invites; for agents that list is simply empty.
  return { members: (members.data ?? []) as Member[], invites: (invites.data ?? []) as Invite[] }
}

export const inviteMember = async (workspaceId: string, email: string, role: Role) =>
  fail((await cloud().from('workspace_invites').upsert({ workspace_id: workspaceId, email: email.trim().toLowerCase(), role }, { onConflict: 'workspace_id,email' })).error)
export const cancelInvite = async (workspaceId: string, email: string) =>
  fail((await cloud().from('workspace_invites').delete().eq('workspace_id', workspaceId).eq('email', email)).error)
export const setMemberRole = async (workspaceId: string, userId: string, role: Role) =>
  fail((await cloud().from('workspace_members').update({ role }).eq('workspace_id', workspaceId).eq('user_id', userId)).error)
export const removeMember = async (workspaceId: string, userId: string) =>
  fail((await cloud().from('workspace_members').delete().eq('workspace_id', workspaceId).eq('user_id', userId)).error)
export const renameWorkspace = async (workspaceId: string, name: string) =>
  fail((await cloud().from('workspaces').update({ name: name.trim() }).eq('id', workspaceId)).error)
