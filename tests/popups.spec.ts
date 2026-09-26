import { expect, test } from '@playwright/test'
import { kpiCard, openApp } from './helpers'

test.describe('Ticket overview popups', () => {
  test.beforeEach(async ({ page }) => openApp(page))

  test('a card opens an enlarged popup with its name', async ({ page }) => {
    await kpiCard(page, 'Open tickets').click()
    const popup = page.locator('.ticket-card-popout')
    await expect(popup).toBeVisible()
    await expect(popup.getByRole('heading', { name: 'Open tickets' })).toBeVisible()
    await expect(popup.getByRole('button', { name: 'Open matching tickets' })).toBeVisible()
  })

  const ways: [string, (page: import('@playwright/test').Page) => Promise<void>][] = [
    ['the Close button', (page) => page.locator('.ticket-card-popout-cancel').click()],
    ['the × button', (page) => page.locator('.ticket-card-popout-close').click()],
    ['the Escape key', (page) => page.keyboard.press('Escape')],
    ['a click outside the panel', (page) => page.locator('.ticket-card-popout').click({ position: { x: 4, y: 4 } })],
  ]
  for (const [name, close] of ways) {
    test(`closes with ${name}`, async ({ page }) => {
      await kpiCard(page, 'Closed tickets').click()
      await expect(page.locator('.ticket-card-popout')).toBeVisible()
      await close(page)
      await expect(page.locator('.ticket-card-popout')).toHaveCount(0)
      await expect(page.locator('.primary-nav button.active')).toHaveText('Home')
    })
  }

  test('only one popup is open at a time', async ({ page }) => {
    await kpiCard(page, 'Open tickets').click()
    await expect(page.locator('.ticket-card-popout')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await kpiCard(page, 'Closed tickets').click()
    await expect(page.locator('.ticket-card-popout')).toHaveCount(1)
    await expect(page.locator('.ticket-card-popout').getByRole('heading', { name: 'Closed tickets' })).toBeVisible()
  })
})
