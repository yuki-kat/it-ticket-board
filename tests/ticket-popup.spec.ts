import { expect, test, type Page } from '@playwright/test'
import { openApp } from './helpers'

// The details popup that opens from a short description in the list view, and the Resolution SLA column.

async function openTickets(page: Page) {
  await openApp(page)
  await page.locator('.primary-nav button', { hasText: 'Tickets' }).click()
  await expect(page.locator('.list-title-link').first()).toBeVisible()
}

test.describe('Ticket details popup', () => {
  test('opens as a visible card inside the screen and leads to the full ticket', async ({ page }) => {
    await openTickets(page)
    const title = (await page.locator('.list-title-link').first().innerText()).trim()
    await page.locator('.list-title-link').first().click()

    const popup = page.locator('.description-popup')
    await expect(popup).toBeVisible()
    // It once had no styles at all and showed as bare text in a corner of the blurred page.
    expect(await popup.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)')
    const box = (await popup.boundingBox())!
    const viewport = page.viewportSize()!
    expect(box.width).toBeGreaterThan(300)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    await expect(popup.locator('.description-section').first()).toContainText(title)

    await popup.getByRole('button', { name: /Open full ticket/ }).click()
    await expect(page.locator('.description-popup')).toHaveCount(0)
    await expect(page.locator('.record-overlay')).toBeVisible()
  })

  test('fits on a phone screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openTickets(page)
    await page.locator('.list-title-link').first().click()
    const box = (await page.locator('.description-popup').boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})

test('an overdue Resolution SLA timer fits inside its column', async ({ page }) => {
  await openTickets(page)
  // Make the first ticket 11 days old so its timer reads like "-10d 13h 00m 00s".
  const id = await page.evaluate(() => {
    const key = 'it-ticket-kanban-v1'
    const tickets = JSON.parse(localStorage.getItem(key) || '[]')
    tickets[0].createdAt = new Date(Date.now() - 11 * 86_400_000).toISOString()
    localStorage.setItem(key, JSON.stringify(tickets))
    return tickets[0].id as string
  })
  await page.reload()
  await page.locator('.primary-nav button', { hasText: 'Tickets' }).click()
  const cell = page.locator('.task-table tbody tr', { hasText: id }).locator('td').last()
  await expect(cell).toContainText(/^-\d+d /)
  const fits = await cell.evaluate((td) => td.querySelector('span')!.getBoundingClientRect().right <= td.getBoundingClientRect().right + 0.5)
  expect(fits).toBe(true)
})
