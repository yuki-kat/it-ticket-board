import type { Page, Route } from '@playwright/test'

// A stand-in for Supabase, so the account and sync tests need no real account and no network. It keeps a small
// database in memory (workspaces, members, invites and the four data tables), answers the requests the app makes
// the way Supabase's REST API does, including "members only see their own workspace", and records what was sent.

export const ME = '11111111-1111-1111-1111-111111111111'
export const SAM = '22222222-2222-2222-2222-222222222222'
export const DATA_TABLES = ['tickets', 'deleted_tickets', 'assets', 'stock_items'] as const
export type DataTable = typeof DATA_TABLES[number]
export type Row = Record<string, unknown>
type Role = 'admin' | 'agent'

/** A session as Supabase gives it at sign-in, valid for an hour. */
export const newSession = () => ({
  access_token: 'test', refresh_token: 'test', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: ME, email: 'me@example.com', aud: 'authenticated' },
})

/** A stored session, as Supabase keeps it after a sign-in. */
export const signIn = (page: Page) => page.addInitScript((session) => {
  localStorage.setItem('sb-lijmygwrzfodjcanddve-auth-token', JSON.stringify(session))
}, newSession())

export type FakeDatabase = {
  /** Workspace names by id. */
  workspaces: Record<string, string>
  /** Everyone's memberships: { workspace_id, user_id, email, role }. Removing ME's row is like being removed. */
  members: Row[]
  invites: Row[]
  /** The data tables, as rows: { workspace_id, id, owner, data, updated_at }. */
  tables: Record<DataTable, Row[]>
  /** No connection: every request fails, as when the network is down. */
  offline: boolean
  /** Every request, as "METHOD path". */
  calls: string[]
  /** What was sent, by "METHOD path". */
  sent: Record<string, Row[]>
}

/**
 * Starts the stand-in for this page. By default ME is the admin of "Acme IT" (ws-1), with Sam as an agent.
 * - hasWorkspace: false → ME is in no workspace yet (the app then creates one).
 * - fail: true → the database refuses every change to tickets, assets and stock.
 */
export async function fakeDatabase(page: Page, options: { role?: Role; hasWorkspace?: boolean; fail?: boolean } = {}): Promise<FakeDatabase> {
  const role = options.role ?? 'admin'
  const db: FakeDatabase = {
    workspaces: { 'ws-1': 'Acme IT' },
    members: options.hasWorkspace === false ? [] : [
      { workspace_id: 'ws-1', user_id: ME, email: 'me@example.com', role },
      { workspace_id: 'ws-1', user_id: SAM, email: 'sam@example.com', role: 'agent' },
    ],
    invites: [],
    tables: { tickets: [], deleted_tickets: [], assets: [], stock_items: [] },
    offline: false,
    calls: [],
    sent: {},
  }
  await page.route('**/auth/v1/logout**', (route) => route.fulfill({ status: 204 }))
  await page.route('**/rest/v1/**', (route) => answer(route, db, options.fail ?? false))
  return db
}

/** Puts records into a table, as another browser in the workspace would. */
export function putRecords(db: FakeDatabase, table: DataTable, records: Row[], key = 'id') {
  for (const record of records) {
    const id = String(record[key])
    const row = { workspace_id: 'ws-1', id, owner: SAM, data: record, updated_at: new Date().toISOString() }
    const rows = db.tables[table]
    const at = rows.findIndex((item) => item.workspace_id === 'ws-1' && item.id === id)
    if (at >= 0) rows[at] = row
    else rows.push(row)
  }
}

/** The records a table holds (the `data` of each row). */
export const recordsIn = (db: FakeDatabase, table: DataTable) => db.tables[table].map((row) => row.data as Row)

/** The values of a PostgREST `in.(a,b,"c,d")` filter. */
const valuesIn = (filter: string | null) =>
  [...(filter?.match(/^in\.\((.*)\)$/)?.[1] ?? '').matchAll(/"((?:[^"\\]|\\.)*)"|([^,]+)/g)].map((match) => match[1] ?? match[2])

async function answer(route: Route, db: FakeDatabase, fail: boolean) {
  const request = route.request()
  const url = new URL(request.url())
  const path = url.pathname.replace(/^.*\/rest\/v1\//, '')
  const method = request.method()
  db.calls.push(`${method} ${path}`)
  if (db.offline) return route.abort('internetdisconnected')

  // The count of a HEAD request is read from Content-Range, which the browser only shows the page when allowed.
  const headers = { 'access-control-expose-headers': 'content-range' }
  const reply = (body: unknown, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) })
  const empty = (status: number) => route.fulfill({ status, headers })
  const body = JSON.parse(request.postData() || 'null')
  const rows: Row[] = Array.isArray(body) ? body : body ? [body] : []
  if (method !== 'GET' && method !== 'HEAD') db.sent[`${method} ${path}`] = [...(db.sent[`${method} ${path}`] || []), ...rows]
  const eq = (column: string) => url.searchParams.get(column)?.replace(/^eq\./, '')
  // Row level security: a member sees and changes only the workspaces they belong to.
  const isMember = (workspaceId: unknown) => db.members.some((member) => member.workspace_id === workspaceId && member.user_id === ME)

  if (path === 'rpc/accept_invites') return reply(0)
  if (path === 'rpc/create_workspace') {
    const id = `ws-${Object.keys(db.workspaces).length + 1}`
    db.workspaces[id] = String(body?.workspace_name ?? 'My workspace')
    db.members.push({ workspace_id: id, user_id: ME, email: 'me@example.com', role: 'admin' })
    return reply(id)
  }

  if (path === 'workspace_members') {
    const matches = (member: Row) => isMember(member.workspace_id)
      && (!eq('workspace_id') || member.workspace_id === eq('workspace_id'))
      && (!eq('user_id') || member.user_id === eq('user_id'))
    if (method === 'GET') {
      const withNames = (url.searchParams.get('select') || '').includes('workspaces')
      return reply(db.members.filter(matches).map((member) => withNames ? { ...member, workspaces: { name: db.workspaces[String(member.workspace_id)] } } : member))
    }
    if (method === 'PATCH') { db.members.filter(matches).forEach((member) => Object.assign(member, body)); return empty(204) }
    if (method === 'DELETE') { db.members = db.members.filter((member) => !matches(member)); return empty(204) }
  }

  if (path === 'workspace_invites') {
    if (method === 'GET') return reply(db.invites.filter((invite) => invite.workspace_id === eq('workspace_id')))
    if (method === 'POST') { db.invites.push(...rows); return empty(201) }
    if (method === 'DELETE') { db.invites = db.invites.filter((invite) => !(invite.workspace_id === eq('workspace_id') && invite.email === eq('email'))); return empty(204) }
  }

  if ((DATA_TABLES as readonly string[]).includes(path)) {
    const table = path as DataTable
    const workspaceId = eq('workspace_id')
    const visible = isMember(workspaceId) ? db.tables[table].filter((row) => row.workspace_id === workspaceId) : []
    if (method === 'HEAD') return route.fulfill({ status: 200, headers: { ...headers, 'content-range': `*/${visible.length}` } })
    if (method === 'GET') {
      const offset = Number(url.searchParams.get('offset') || 0)
      const limit = Number(url.searchParams.get('limit') || 1000)
      const ordered = [...visible].sort((a, b) => String(a.id).localeCompare(String(b.id)))
      return reply(ordered.slice(offset, offset + limit).map((row) => ({ id: row.id, data: row.data })))
    }
    if (method === 'POST') {
      if (fail) return reply({ message: 'denied' }, 403)
      if (rows.some((row) => !isMember(row.workspace_id))) return reply({ code: '42501', message: `new row violates row-level security policy for table "${table}"` }, 403)
      for (const row of rows) {
        const at = db.tables[table].findIndex((item) => item.workspace_id === row.workspace_id && item.id === row.id)
        if (at >= 0) db.tables[table][at] = row
        else db.tables[table].push(row)
      }
      return empty(201)
    }
    if (method === 'DELETE') {
      const ids = valuesIn(url.searchParams.get('id'))
      if (isMember(workspaceId)) db.tables[table] = db.tables[table].filter((row) => !(row.workspace_id === workspaceId && ids.includes(String(row.id))))
      return empty(204)
    }
  }
  return reply({ message: `The test database does not know ${method} ${path}` }, 404)
}
