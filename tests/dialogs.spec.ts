import { expect, test, type Page } from '@playwright/test'
import { goTo, kpiCard, openApp } from './helpers'

// Where the React source improves on the compiled page.

const panel = (page: Page) => page.getByRole('region', { name: 'Debug log' })

test.describe('Dialogs (source)', () => {
  test.beforeEach(async ({ page }) => openApp(page))

  // On the compiled page Escape closed whichever dialog was first in the document, which could be the one underneath.
  test('with two dialogs open, Escape closes only the top one', async ({ page }) => {
    await goTo(page, 'Inventory')
    await page.locator('.inventory-table .inventory-id').first().click()
    await page.getByRole('button', { name: 'Edit details' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(2)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await expect(page.getByRole('dialog').first()).toContainText('ASSET RECORD')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('the corner × closes only the dialog on top too', async ({ page }) => {
    await goTo(page, 'Inventory')
    await page.locator('.inventory-table .inventory-id').first().click()
    await page.getByRole('button', { name: 'Edit details' }).click()
    await page.getByRole('button', { name: 'Close popup' }).last().click()
    await expect(page.getByRole('dialog')).toHaveCount(1)
  })

  test('Escape does nothing when no dialog is open', async ({ page }) => {
    await page.keyboard.press('Escape')
    await expect(page.locator('.home-kpi-grid')).toBeVisible()
  })

  test('the All Views picker also closes with Escape and returns focus to its button', async ({ page }) => {
    await goTo(page, 'Tickets')
    const button = page.getByRole('button', { name: 'Open all ticket views' })
    await button.click()
    await expect(page.getByRole('dialog', { name: 'Choose a view' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(button).toBeFocused()
  })
})

test.describe('Debug log (source)', () => {
  test('reports page changes by name, popups from every dialog, and Arrange', async ({ page }) => {
    const testToken = await page.evaluate(() => {
      const now = Math.floor(Date.now() / 1000)
      return btoa(JSON.stringify({ sub: 'test-user', exp: now + 3600, iat: now }))
    })
    const testUser = { id: 'test-user', name: 'Test User', email: 'test@example.com' }
    await page.addInitScript(({ token, user }) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', JSON.stringify(user))
    }, { token: testToken, user: testUser })
    await page.goto('/index.html?debug')
    await expect(panel(page)).toBeVisible()
    await goTo(page, 'Home')
    await goTo(page, 'Tickets')
    await expect(panel(page).locator('li.page', { hasText: 'home → board' })).toBeVisible()
    await page.getByRole('button', { name: 'Customize home' }).click()
    await expect(panel(page).locator('li.popup', { hasText: 'opened: Settings' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(panel(page).locator('li.popup', { hasText: 'closed: Settings' })).toBeVisible()
  })

  test('shows errors', async ({ page }) => {
    const testToken = await page.evaluate(() => {
      const now = Math.floor(Date.now() / 1000)
      return btoa(JSON.stringify({ sub: 'test-user', exp: now + 3600, iat: now }))
    })
    const testUser = { id: 'test-user', name: 'Test User', email: 'test@example.com' }
    await page.addInitScript(({ token, user }) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', JSON.stringify(user))
    }, { token: testToken, user: testUser })
    await page.goto('/index.html?debug')
    await expect(panel(page)).toBeVisible()
    await page.evaluate(() => { setTimeout(() => { throw new Error('test failure') }) })
    await expect(panel(page).locator('li.error', { hasText: 'test failure' })).toBeVisible()
  })

  test('does not log the clicks made inside the log itself', async ({ page }) => {
    const testToken = await page.evaluate(() => {
      const now = Math.floor(Date.now() / 1000)
      return btoa(JSON.stringify({ sub: 'test-user', exp: now + 3600, iat: now }))
    })
    const testUser = { id: 'test-user', name: 'Test User', email: 'test@example.com' }
    await page.addInitScript(({ token, user }) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', JSON.stringify(user))
    }, { token: testToken, user: testUser })
    await page.goto('/index.html?debug')
    await kpiCard(page, 'Open tickets').click()
    await page.keyboard.press('Escape')
    const before = await panel(page).locator('li').count()
    await panel(page).locator('header').click()
    expect(await panel(page).locator('li').count()).toBe(before)
  })

  test('keeps at most 80 lines', async ({ page }) => {
    const testToken = await page.evaluate(() => {
      const now = Math.floor(Date.now() / 1000)
      return btoa(JSON.stringify({ sub: 'test-user', exp: now + 3600, iat: now }))
    })
    const testUser = { id: 'test-user', name: 'Test User', email: 'test@example.com' }
    await page.addInitScript(({ token, user }) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', JSON.stringify(user))
    }, { token: testToken, user: testUser })
    await page.goto('/index.html?debug')
    for (let index = 0; index < 90; index++) await page.locator('.home-hero-kicker').click()
    await expect.poll(() => panel(page).locator('li').count()).toBeLessThanOrEqual(80)
  })
})
