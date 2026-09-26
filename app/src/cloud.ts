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
export type Role = 'admin' | 'agent'
export type Workspace = { id: string; name: string; role: Role }
export type Member = { user_id: string; email: string | null; role: Role }
export type Invite = { email: string; role: Role }

const WORKSPACE_KEY = 'it-ticket-kanban-workspace-v1'
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

export type UploadResult = { ok: true; counts: Record<string, number> } | { ok: false; error: string }

/**
 * Copies what a backup holds into the workspace's tables (settings go to the signed-in person, as they
 * are personal). Rows are matched by id, so running it again updates rather than duplicates. Nothing is
 * deleted from the account and nothing is changed in this browser.
 */
export async function uploadBackup(backup: import('./backup').BackupFile, workspaceId: string): Promise<UploadResult> {
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
    const rows = records.map((record) => ({ workspace_id: workspaceId, owner, id: idOf(record, idField), data: record, updated_at: now }))
    for (let start = 0; start < rows.length; start += CHUNK) {
      const { error } = await cloud().from(table).upsert(rows.slice(start, start + CHUNK), { onConflict: 'workspace_id,id' })
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
