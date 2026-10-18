import { expect, test } from '@playwright/test'
import { goTo, openApp, ticketsShown } from './helpers'

// Phase 1 of making the app simpler: one way to change page (the top menu), a short Tickets header with
// its quick filters in the Filters menu, a one-row Home banner, and "ticket" as the one word for a ticket.

test.describe('Simpler screens', () => {
  test.beforeEach(async ({ page }) => openApp(page))

  test('there are no round page arrows; the top menu is the way between pages', async ({ page }) => {
    await expect(page.getByRole('navigation', { name: 'Quick page navigation' })).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  })

  test('the header says "New ticket", in normal case', async ({ page }) => {
    const button = page.getByRole('button', { name: 'New ticket' })
    await expect(button).toBeVisible()
    expect(await button.evaluate((element) => getComputedStyle(element).textTransform)).toBe('none')
  })

  test('the Tickets page starts with its heading and count, without the old banner and number strip', async ({ page }) => {
    await goTo(page, 'Tickets')
    await expect(page.getByRole('heading', { level: 1, name: 'Tickets' })).toBeVisible()
    await expect(page.locator('.ticket-total')).toHaveText(/^\d+ tickets$/)
    await expect(page.locator('.page-heading, .prototype-note, .summary-strip')).toHaveCount(0)
  })

  test('the old quick filters are in Filters → Show, and the button says how many filters are on', async ({ page }) => {
    await goTo(page, 'Tickets')
    const all = await ticketsShown(page)
    await page.locator('.board-filters-button').click()
    await page.getByLabel('Show tickets').selectOption('overdue')
    await expect(page.locator('.board-filters-button')).toHaveText(/Filters \(1\)/)
    const overdue = await ticketsShown(page)
    expect(overdue).toBeLessThan(all)
    await page.locator('.clear-filters-button').click()
    expect(await ticketsShown(page)).toBe(all)
    await expect(page.locator('.board-filters-button')).toHaveText(/^\s*Filters\s*$/)
  })

  test('"How this maps" moved to the footer of the Tickets page', async ({ page }) => {
    await goTo(page, 'Tickets')
    await page.getByRole('button', { name: /How this maps/ }).click()
    await expect(page.getByRole('dialog', { name: 'ServiceNow task model' })).toBeVisible()
  })

  test('the Home banner is one short row and keeps the Explore tickets button', async ({ page }) => {
    const hero = page.locator('.home-hero')
    await expect(hero.getByRole('heading', { name: 'Good to see you.' })).toBeVisible()
    await expect(hero.getByRole('button', { name: /Explore tickets/ })).toBeVisible()
    expect((await hero.boundingBox())!.height).toBeLessThan(130)
  })

  test('each "Recently created" row keeps its title and arrow on one line', async ({ page }) => {
    const rows = page.locator('.home-recent-item > button')
    await expect(rows.first()).toBeVisible()
    for (const row of await rows.all()) {
      const title = (await row.locator('b').boundingBox())!
      const arrow = (await row.locator('svg').last().boundingBox())!
      expect(arrow.x).toBeGreaterThan(title.x + title.width)
      expect(Math.abs(arrow.y + arrow.height / 2 - (title.y + title.height / 2))).toBeLessThan(20)
    }
  })
})

test.describe('Simpler screens on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test.beforeEach(async ({ page }) => openApp(page))

  test('the Settings gear fits in the header row and opens Settings', async ({ page }) => {
    const gear = page.locator('.top-actions').getByRole('button', { name: 'Settings', exact: true })
    await expect(gear).toBeVisible()
    await gear.click()
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  })

  test('nothing floats over the page content', async ({ page }) => {
    for (const name of ['Home', 'Tickets'] as const) {
      await goTo(page, name)
      const floating = await page.evaluate(() => [...document.querySelectorAll('body *')]
        .filter((element) => getComputedStyle(element).position === 'fixed' && element.getBoundingClientRect().width > 0)
        .map((element) => element.className))
      expect(floating).toEqual([])
    }
  })
})
