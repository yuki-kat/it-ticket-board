import { expect, test, type Page } from '@playwright/test'
import { goTo, openApp, ticketsShown } from './helpers'
import { fakeDatabase, ME, newSession, putRecords, recordsIn, signIn, type FakeDatabase, type Row } from './fake-supabase'

// Syncing the board with the workspace's database (Settings → Account → Sync), against a stand-in database
// (fake-supabase.ts). Every test starts from the sample board in a fresh browser, signed in as an admin of Acme IT.
// The rules for combining the two sides are tested on their own in sync-logic.spec.ts.

const TICKETS = 'it-ticket-kanban-v1'
const SYNC_STATE = 'it-ticket-kanban-sync-v1'

const stored = (page: Page, key: string) => page.evaluate((name) => JSON.parse(localStorage.getItem(name) || 'null'), key)
const storedIds = async (page: Page, key = TICKETS) => ((await stored(page, key)) as Row[]).map((record) => String(record.id))
const badge = (page: Page) => page.locator('[data-sync-badge]')
const ticketIn = (db: FakeDatabase, id: string) => recordsIn(db, 'tickets').find((record) => record.id === id)
/** What makes the app read the database again (besides every 30 seconds): the window getting focus, or the connection coming back. */
const windowEvent = (page: Page, name: 'focus' | 'online') => page.evaluate((event) => window.dispatchEvent(new Event(event)), name)
/** Changes sent to the data tables, as "METHOD table". */
const dataChanges = (db: FakeDatabase) => Object.keys(db.sent).filter((call) => /^(POST|DELETE) (tickets|deleted_tickets|assets|stock_items)$/.test(call))

async function openAccount(page: Page) {
  await page.locator('.quick-settings-button').click()
  await expect(page.locator('.account-settings')).toBeVisible()
}

/** Signs in with a stand-in database, then opens the board and Settings → Account. */
async function signedIn(page: Page, options?: Parameters<typeof fakeDatabase>[1]): Promise<FakeDatabase> {
  await signIn(page)
  const db = await fakeDatabase(page, options)
  await openApp(page)
  await openAccount(page)
  return db
}

/** Copies the sample board into the empty workspace and waits until it is saved there. */
async function startSyncing(page: Page, db: FakeDatabase) {
  await page.locator('[data-sync-start-upload]').click()
  await expect(page.locator('[data-sync-state="saved"]')).toContainText('This browser is synced with Acme IT')
  expect(recordsIn(db, 'tickets').length).toBeGreaterThan(0)
}

/** Stars the first ticket on the Tickets page that has no star yet, and returns its id. */
async function starATicket(page: Page): Promise<string> {
  await goTo(page, 'Tickets')
  const star = page.locator('button.ticket-star[aria-pressed="false"]').first()
  const id = (await star.getAttribute('aria-label'))!.replace(/^Star /, '')
  await star.click()
  await expect(page.getByRole('button', { name: `Remove star from ${id}`, exact: true })).toBeVisible()
  return id
}

test.describe('Sync with the workspace', () => {
  test('copying this board into an empty workspace sends every ticket, asset and stock item', async ({ page }) => {
    const db = await signedIn(page)
    await startSyncing(page, db)
    expect(recordsIn(db, 'tickets').map((ticket) => ticket.id)).toEqual(await storedIds(page))
    expect(recordsIn(db, 'assets').map((asset) => asset.id)).toEqual(await storedIds(page, 'it-ticket-kanban-assets-v1'))
    expect(recordsIn(db, 'stock_items').map((item) => item.sku)).toEqual(((await stored(page, 'it-ticket-kanban-stock-v1')) as Row[]).map((item) => item.sku))
    expect(db.tables.tickets.every((row) => row.workspace_id === 'ws-1' && row.owner === ME)).toBe(true)
    await expect(badge(page)).toHaveText('Saved to Acme IT')
    expect(await stored(page, SYNC_STATE)).toMatchObject({ workspaceId: 'ws-1', workspaceName: 'Acme IT' })
  })

  test('starting with an empty board empties it here, and Backup and restore can put the old board back', async ({ page }) => {
    const db = await signedIn(page)
    const before = await storedIds(page)
    await page.locator('[data-sync-start-empty]').click()
    await expect(page.locator('[data-sync-state="saved"]')).toBeVisible()
    expect(await storedIds(page)).toEqual([])
    expect(db.tables.tickets).toEqual([])
    // Settings is opened again, so Backup and restore sees the copy kept when sync started.
    await page.keyboard.press('Escape')
    await openAccount(page)
    await expect(page.locator('[data-backup-previous]')).toContainText('Putting it back stops syncing')
    await Promise.all([page.waitForEvent('load'), page.locator('[data-backup-put-back]').click()])
    await expect(page.locator('.home-kpi-grid .home-kpi').first()).toBeVisible()
    expect(await storedIds(page)).toEqual(before)
    expect(await stored(page, SYNC_STATE)).toBeNull()
    await expect(badge(page)).toHaveCount(0)
  })

  test('using the board of a workspace that has one shows that board here, and sends nothing back', async ({ page }) => {
    await signIn(page)
    const db = await fakeDatabase(page)
    await openApp(page)
    const samples = (await stored(page, TICKETS)) as Row[]
    putRecords(db, 'tickets', samples.slice(0, 3).map((ticket) => ({ ...ticket, title: `Shared: ${ticket.title}` })))
    putRecords(db, 'assets', ((await stored(page, 'it-ticket-kanban-assets-v1')) as Row[]).slice(0, 1))
    await openAccount(page)
    await expect(page.locator('[data-sync-summary]')).toContainText('Acme IT already has 3 tickets, 1 asset and 0 stock items')
    await page.locator('[data-sync-start-download]').click()
    await expect(page.locator('[data-sync-state="saved"]')).toBeVisible()
    await page.keyboard.press('Escape')
    await goTo(page, 'Tickets')
    expect(await ticketsShown(page)).toBe(3)
    expect(((await stored(page, TICKETS)) as Row[]).every((ticket) => String(ticket.title).startsWith('Shared: '))).toBe(true)
    expect(await storedIds(page, 'it-ticket-kanban-assets-v1')).toHaveLength(1)
    await page.waitForTimeout(1500) // longer than the wait before changes are sent
    expect(dataChanges(db)).toEqual([])
  })

  test('a change made here is sent to the workspace about a second later', async ({ page }) => {
    const db = await signedIn(page)
    await startSyncing(page, db)
    const copied = db.sent['POST tickets'].length
    await page.keyboard.press('Escape')
    const id = await starATicket(page)
    await expect.poll(() => ticketIn(db, id)?.starred).toBe(true)
    expect(db.sent['POST tickets']).toHaveLength(copied + 1)
    await expect(badge(page)).toHaveText('Saved to Acme IT')
  })

  test('a colleague’s new and deleted tickets show up here when the window gets focus', async ({ page }) => {
    const db = await signedIn(page)
    await startSyncing(page, db)
    const [first, second] = recordsIn(db, 'tickets')
    putRecords(db, 'tickets', [{ ...first, id: 'OPS-900', title: 'Added by a colleague', createdAt: new Date().toISOString() }])
    db.tables.tickets = db.tables.tickets.filter((row) => row.id !== second.id)
    await windowEvent(page, 'focus')
    await expect.poll(() => storedIds(page)).toContain('OPS-900')
    expect(await storedIds(page)).not.toContain(second.id)
    await page.keyboard.press('Escape')
    await goTo(page, 'Tickets')
    await expect(page.getByText('Added by a colleague').first()).toBeVisible()
    await page.waitForTimeout(1500) // what arrived is not sent back
    expect(db.sent['POST tickets'].filter((row) => row.id === 'OPS-900')).toEqual([])
  })

  test('a ticket a colleague moved to Deleted can be restored here, and the workspace follows', async ({ page }) => {
    const db = await signedIn(page)
    await startSyncing(page, db)
    const ticket = recordsIn(db, 'tickets')[2]
    const id = String(ticket.id)
    db.tables.tickets = db.tables.tickets.filter((row) => row.id !== id)
    putRecords(db, 'deleted_tickets', [{ ...ticket, deletedAt: new Date().toISOString() }])
    await windowEvent(page, 'focus')
    await expect.poll(() => storedIds(page, 'it-ticket-kanban-deleted-v1')).toEqual([id])
    await page.keyboard.press('Escape')
    await page.locator('.header-tools-trigger').click()
    await page.locator('#header-tools-menu button', { hasText: 'Deleted' }).click()
    await page.locator('.deleted-item', { hasText: id }).getByRole('button', { name: 'Restore' }).click()
    await expect.poll(() => Boolean(ticketIn(db, id))).toBe(true)
    expect(db.tables.deleted_tickets).toEqual([])
    expect(db.calls).toContain('DELETE deleted_tickets')
  })

  test('with no connection, changes wait here, even over a reload, and are sent when the connection is back', async ({ page }) => {
    const db = await signedIn(page)
    await startSyncing(page, db)
    await page.keyboard.press('Escape')
    db.offline = true
    await windowEvent(page, 'focus') // the connection drops while the board is reading the workspace
    const id = await starATicket(page)
    await expect(badge(page)).toHaveText('Offline, changes kept here')
    await page.reload()
    await expect(badge(page)).toHaveText('Offline, changes kept here')
    expect(ticketIn(db, id)?.starred).toBeFalsy()
    db.offline = false
    await windowEvent(page, 'online')
    await expect.poll(() => ticketIn(db, id)?.starred).toBe(true)
    await expect(badge(page)).toHaveText('Saved to Acme IT')
  })

  test('offline with a sign-in that expired meanwhile: changes wait, and are sent once back online and signed in again', async ({ page }) => {
    const db = await signedIn(page)
    await startSyncing(page, db)
    await page.keyboard.press('Escape')
    // Supabase renews an expired sign-in over the network; here the renewal works once the connection is back.
    await page.route('**/auth/v1/token**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(newSession()) }))
    await page.evaluate(() => {
      const key = 'sb-lijmygwrzfodjcanddve-auth-token'
      localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)!), expires_at: Math.floor(Date.now() / 1000) - 60 }))
    })
    await page.context().setOffline(true)
    const id = await starATicket(page)
    await expect(badge(page)).toHaveText('Offline, changes kept here')
    await page.context().setOffline(false)
    await expect.poll(() => ticketIn(db, id)?.starred).toBe(true)
    await expect(badge(page)).toHaveText('Saved to Acme IT')
  })

  test('signing out stops syncing and leaves the board as it is', async ({ page }) => {
    const db = await signedIn(page)
    await startSyncing(page, db)
    const before = await storedIds(page)
    await page.locator('[data-account-signout]').click()
    await expect(page.locator('[data-account-email-input]')).toBeVisible()
    await expect(badge(page)).toHaveCount(0)
    expect(await stored(page, SYNC_STATE)).toBeNull()
    expect(await storedIds(page)).toEqual(before)
  })

  test('someone removed from the workspace stops syncing at the next read, and keeps the board here', async ({ page }) => {
    const db = await signedIn(page)
    await startSyncing(page, db)
    const before = await storedIds(page)
    db.members = db.members.filter((member) => member.user_id !== ME)
    await windowEvent(page, 'focus')
    await expect(page.locator('[data-sync-stopped]')).toContainText('You are no longer a member of Acme IT')
    await expect(badge(page)).toHaveCount(0)
    expect(await storedIds(page)).toEqual(before)
    expect(await stored(page, SYNC_STATE)).toBeNull()
    // The workspace is looked up again: with none left, this person gets their own.
    await expect(page.locator('[data-account-workspace]')).toHaveText('My workspace')
  })

  test('someone removed from the workspace stops syncing at their next change, which stays here', async ({ page }) => {
    const db = await signedIn(page)
    await startSyncing(page, db)
    db.members = db.members.filter((member) => member.user_id !== ME)
    await page.keyboard.press('Escape')
    const id = await starATicket(page)
    await expect(badge(page)).toHaveCount(0)
    expect(((await stored(page, TICKETS)) as Row[]).find((ticket) => ticket.id === id)?.starred).toBe(true)
    expect(ticketIn(db, id)?.starred).toBeFalsy()
    await openAccount(page)
    await expect(page.locator('[data-sync-stopped]')).toContainText('You are no longer a member of Acme IT')
  })

  test('a problem from the database is shown, and the board here is untouched', async ({ page }) => {
    const db = await signedIn(page, { fail: true })
    const before = await stored(page, TICKETS)
    await page.locator('[data-sync-start-upload]').click()
    await expect(page.locator('[data-sync-error]')).toContainText('Could not start syncing: denied')
    await expect(page.locator('[data-sync-state="error"]')).toHaveText('Sync has a problem.')
    await expect(badge(page)).toHaveText('Sync problem')
    expect(await stored(page, TICKETS)).toEqual(before)
    expect(db.tables.tickets).toEqual([])
  })
})
