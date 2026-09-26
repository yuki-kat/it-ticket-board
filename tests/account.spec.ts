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
})
