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

  test('signed in: shows the email, and copies tickets, assets, stock and settings to the account', async ({ page }) => {
    await signedIn(page)
    const sent: Record<string, { id?: string; key?: string; owner: string }[]> = {}
    await page.route('**/rest/v1/*', async (route) => {
      const table = new URL(route.request().url()).pathname.split('/').pop()!
      sent[table] = [...(sent[table] || []), ...JSON.parse(route.request().postData() || '[]')]
      await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    })
    await openApp(page)
    await openAccount(page)
    await expect(page.locator('[data-account-email]')).toHaveText('me@example.com')
    const local = await page.evaluate(() => JSON.parse(localStorage.getItem('it-ticket-kanban-v1')!).length)
    await page.locator('[data-account-upload]').click()
    await expect(page.locator('[data-account-upload-message]')).toContainText(`${local} tickets`)
    expect(sent.tickets).toHaveLength(local)
    expect(sent.tickets.every((row) => row.owner === '11111111-1111-1111-1111-111111111111' && row.id)).toBe(true)
    expect(sent).toHaveProperty('assets')
    expect(sent).toHaveProperty('stock_items')
  })

  test('signed in: a database error is shown and the browser data is untouched', async ({ page }) => {
    await signedIn(page)
    await page.route('**/rest/v1/*', (route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'denied' }) }))
    await openApp(page)
    await openAccount(page)
    const before = await page.evaluate(() => localStorage.getItem('it-ticket-kanban-v1'))
    await page.locator('[data-account-upload]').click()
    await expect(page.locator('[data-account-upload-message]')).toContainText('Could not copy')
    expect(await page.evaluate(() => localStorage.getItem('it-ticket-kanban-v1'))).toBe(before)
  })
})
