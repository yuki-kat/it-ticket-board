import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

// Sign-in is optional and never runs unless asked: opening the board makes no request to Supabase.

const openAccount = async (page: import('@playwright/test').Page) => {
  await page.locator('.quick-settings-button').click()
  await expect(page.locator('.account-settings')).toBeVisible()
}

test.describe('Account sign-in', () => {
  test('opening the board and Settings makes no request to Supabase', async ({ page }) => {
    const calls: string[] = []
    page.on('request', (request) => { if (request.url().includes('supabase.co')) calls.push(request.url()) })
    await openApp(page)
    await openAccount(page)
    await page.waitForTimeout(500)
    expect(calls).toEqual([])
  })

  test('the send button needs an email address', async ({ page }) => {
    await openApp(page)
    await openAccount(page)
    const send = page.locator('[data-account-send]')
    await expect(send).toBeDisabled()
    await page.locator('[data-account-email-input]').fill('someone@example.com')
    await expect(send).toBeEnabled()
  })

  test('asking for a link sends the email address to Supabase and says so', async ({ page }) => {
    let body = ''
    await page.route('**/auth/v1/otp**', async (route) => { body = route.request().postData() || ''; await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }) })
    await openApp(page)
    await openAccount(page)
    await page.locator('[data-account-email-input]').fill('someone@example.com')
    await page.locator('[data-account-send]').click()
    await expect(page.locator('[data-account-message]')).toContainText('Link sent to someone@example.com')
    expect(JSON.parse(body).email).toBe('someone@example.com')
  })

  test('an error from Supabase is shown, not hidden', async ({ page }) => {
    await page.route('**/auth/v1/otp**', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ msg: 'rate limit' }) }))
    await openApp(page)
    await openAccount(page)
    await page.locator('[data-account-email-input]').fill('someone@example.com')
    await page.locator('[data-account-send]').click()
    await expect(page.locator('[data-account-message]')).toContainText('Could not send the link')
  })

  // A stored session, as Supabase keeps it after a sign-in, so these tests need no real account.
  const signedIn = (page: import('@playwright/test').Page) => page.addInitScript(() => {
    const expires = Math.floor(Date.now() / 1000) + 3600
    localStorage.setItem('sb-lijmygwrzfodjcanddve-auth-token', JSON.stringify({ access_token: 'test', refresh_token: 'test', token_type: 'bearer', expires_in: 3600, expires_at: expires, user: { id: '11111111-1111-1111-1111-111111111111', email: 'me@example.com', aud: 'authenticated' } }))
  })

  type Row = Record<string, unknown>
  /**
   * A stand-in for the Supabase database, so these tests need no real account. It answers the calls the
   * Account section makes (joining invites, finding or creating the workspace, the team list, team changes,
   * copying data) and records what was sent.
   */
  const fakeDatabase = async (page: import('@playwright/test').Page, options: { role?: 'admin' | 'agent'; hasWorkspace?: boolean; fail?: boolean } = {}) => {
    const me = '11111111-1111-1111-1111-111111111111'
    const state = {
      hasWorkspace: options.hasWorkspace ?? true,
      calls: [] as string[],
      sent: {} as Record<string, Row[]>,
      members: [{ user_id: me, email: 'me@example.com', role: options.role ?? 'admin' }, { user_id: '22222222-2222-2222-2222-222222222222', email: 'sam@example.com', role: 'agent' }] as Row[],
      invites: [] as Row[],
    }
    await page.route('**/rest/v1/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const path = url.pathname.replace(/^.*\/rest\/v1\//, '')
      const method = request.method()
      state.calls.push(`${method} ${path}`)
      const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
      if (options.fail && method === 'POST' && !path.startsWith('rpc/')) return json({ message: 'denied' }, 403)
      if (path === 'rpc/accept_invites') return json(0)
      if (path === 'rpc/create_workspace') { state.hasWorkspace = true; return json('ws-1') }
      if (path === 'workspace_members' && method === 'GET') {
        if ((url.searchParams.get('select') || '').includes('workspaces')) {
          return json(state.hasWorkspace ? [{ workspace_id: 'ws-1', role: options.role ?? 'admin', workspaces: { name: 'Acme IT' } }] : [])
        }
        return json(state.members)
      }
      if (path === 'workspace_invites' && method === 'GET') return json(state.invites)
      const body = JSON.parse(request.postData() || 'null')
      const rows = Array.isArray(body) ? body : body ? [body] : []
      state.sent[`${method} ${path}`] = [...(state.sent[`${method} ${path}`] || []), ...rows]
      if (path === 'workspace_invites' && method === 'POST') state.invites.push(...rows)
      return json([], method === 'POST' ? 201 : 200)
    })
    return state
  }

  test('signed in: finds the workspace and shows it with your role and the team', async ({ page }) => {
    await signedIn(page)
    await fakeDatabase(page)
    await openApp(page)
    await openAccount(page)
    await expect(page.locator('[data-account-email]')).toHaveText('me@example.com')
    await expect(page.locator('[data-account-workspace]')).toHaveText('Acme IT')
    await expect(page.locator('[data-account-role]')).toContainText('an admin')
    await expect(page.locator('[data-account-member]')).toHaveCount(2)
    await expect(page.locator('[data-account-member="me@example.com"]')).toContainText('(you)')
  })

  test('signed in for the first time: joins invites, then creates a workspace as admin', async ({ page }) => {
    await signedIn(page)
    const db = await fakeDatabase(page, { hasWorkspace: false })
    await openApp(page)
    await openAccount(page)
    await expect(page.locator('[data-account-workspace]')).toHaveText('Acme IT')
    const order = db.calls.filter((call) => call.startsWith('POST rpc/'))
    expect(order).toEqual(['POST rpc/accept_invites', 'POST rpc/create_workspace'])
  })

  test('signed in: copies tickets, assets and stock into the workspace, and settings to you', async ({ page }) => {
    await signedIn(page)
    const db = await fakeDatabase(page)
    await openApp(page)
    await openAccount(page)
    const local = await page.evaluate(() => JSON.parse(localStorage.getItem('it-ticket-kanban-v1')!).length)
    await page.locator('[data-account-upload]').click()
    await expect(page.locator('[data-account-upload-message]')).toContainText(`Copied to Acme IT: ${local} tickets`)
    const tickets = db.sent['POST tickets']
    expect(tickets).toHaveLength(local)
    expect(tickets.every((row) => row.workspace_id === 'ws-1' && row.owner === '11111111-1111-1111-1111-111111111111' && row.id)).toBe(true)
    expect(db.sent).toHaveProperty(['POST assets'])
    expect(db.sent).toHaveProperty(['POST stock_items'])
    expect((db.sent['POST settings'] || []).every((row) => !('workspace_id' in row))).toBe(true)
  })

  test('signed in: a database error is shown and the browser data is untouched', async ({ page }) => {
    await signedIn(page)
    await fakeDatabase(page, { fail: true })
    await openApp(page)
    await openAccount(page)
    const before = await page.evaluate(() => localStorage.getItem('it-ticket-kanban-v1'))
    await page.locator('[data-account-upload]').click()
    await expect(page.locator('[data-account-upload-message]')).toContainText('Could not copy')
    expect(await page.evaluate(() => localStorage.getItem('it-ticket-kanban-v1'))).toBe(before)
  })

  test('admin: invites a colleague by email with a role, and the invite is listed', async ({ page }) => {
    await signedIn(page)
    const db = await fakeDatabase(page)
    await openApp(page)
    await openAccount(page)
    const send = page.locator('[data-account-invite-send]')
    await expect(send).toBeDisabled()
    await page.locator('[data-account-invite-email]').fill('  New.Person@Example.com ')
    await page.locator('[data-account-invite-role]').selectOption('admin')
    await send.click()
    await expect(page.locator('[data-account-team-message]')).toContainText('Invited new.person@example.com')
    expect(db.sent['POST workspace_invites']).toEqual([{ workspace_id: 'ws-1', email: 'new.person@example.com', role: 'admin' }])
    await expect(page.locator('[data-account-invite="new.person@example.com"]')).toContainText('invited')
    await expect(page.locator('[data-account-invite-email]')).toHaveValue('')
  })

  test('admin: changes a member’s role and removes a member, but not themselves', async ({ page }) => {
    await signedIn(page)
    const db = await fakeDatabase(page)
    await openApp(page)
    await openAccount(page)
    await expect(page.locator('[data-account-member="me@example.com"] [data-account-member-remove]')).toHaveCount(0)
    const sam = page.locator('[data-account-member="sam@example.com"]')
    await sam.locator('[data-account-member-role]').selectOption('admin')
    await expect(page.locator('[data-account-team-message]')).toContainText('sam@example.com is now an admin')
    expect(db.sent['PATCH workspace_members']).toEqual([{ role: 'admin' }])
    await sam.locator('[data-account-member-remove]').click()
    await expect(page.locator('[data-account-team-message]')).toContainText('sam@example.com was removed')
    expect(db.calls).toContain('DELETE workspace_members')
  })

  test('agent: sees the team, but no invite form, role menus or remove buttons', async ({ page }) => {
    await signedIn(page)
    await fakeDatabase(page, { role: 'agent' })
    await openApp(page)
    await openAccount(page)
    await expect(page.locator('[data-account-role]')).toContainText('an agent')
    await expect(page.locator('[data-account-member]')).toHaveCount(2)
    await expect(page.locator('[data-account-invite-form]')).toHaveCount(0)
    await expect(page.locator('[data-account-member-role]')).toHaveCount(0)
    await expect(page.locator('[data-account-member-remove]')).toHaveCount(0)
  })
})
