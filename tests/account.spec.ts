import { expect, test } from '@playwright/test'
import { openApp } from './helpers'
import { fakeDatabase, putRecords, signIn } from './fake-supabase'

// Sign-in is optional and never runs unless asked: opening the board makes no request to Supabase.
// The signed-in tests use a stand-in database (fake-supabase.ts), so they need no real account.
// Syncing the board with the workspace is tested in sync.spec.ts.

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

  test('signed in: finds the workspace and shows it with your role and the team', async ({ page }) => {
    await signIn(page)
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
    await signIn(page)
    const db = await fakeDatabase(page, { hasWorkspace: false })
    await openApp(page)
    await openAccount(page)
    await expect(page.locator('[data-account-workspace]')).toHaveText('My workspace')
    await expect(page.locator('[data-account-role]')).toContainText('an admin')
    const order = db.calls.filter((call) => call.startsWith('POST rpc/'))
    expect(order).toEqual(['POST rpc/accept_invites', 'POST rpc/create_workspace'])
  })

  test('signed in, empty workspace: offers to copy this board into it, or to start with an empty board', async ({ page }) => {
    await signIn(page)
    await fakeDatabase(page)
    await openApp(page)
    await openAccount(page)
    await expect(page.locator('[data-sync-summary]')).toContainText('Acme IT has no tickets, assets or stock yet')
    await expect(page.locator('[data-sync-start-upload]')).toHaveText('Copy this board into Acme IT')
    await expect(page.locator('[data-sync-start-empty]')).toBeVisible()
    await expect(page.locator('[data-sync-start-download]')).toHaveCount(0)
  })

  test('signed in, workspace with a board: offers to use that board, and says what it holds', async ({ page }) => {
    await signIn(page)
    const db = await fakeDatabase(page)
    putRecords(db, 'tickets', [{ id: 'OPS-1' }, { id: 'OPS-2' }])
    putRecords(db, 'assets', [{ id: 'A-1' }])
    await openApp(page)
    await openAccount(page)
    await expect(page.locator('[data-sync-summary]')).toContainText('Acme IT already has 2 tickets, 1 asset and 0 stock items')
    await expect(page.locator('[data-sync-start-download]')).toHaveText('Use Acme IT’s board')
    await expect(page.locator('[data-sync-start-upload]')).toHaveCount(0)
  })

  test('admin: invites a colleague by email with a role, and the invite is listed', async ({ page }) => {
    await signIn(page)
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
    await signIn(page)
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
    await expect(page.locator('[data-account-member]')).toHaveCount(1)
  })

  test('agent: sees the team, but no invite form, role menus or remove buttons', async ({ page }) => {
    await signIn(page)
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
