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

test.describe('Work notes popup', () => {
  test('opens from the ticket summary, adds a timestamped note that is saved, and Back returns to the summary', async ({ page }) => {
    await openTickets(page)
    await page.locator('.list-title-link').first().click()
    await page.locator('.description-popup').getByRole('button', { name: 'Work notes' }).click()

    const notes = page.locator('.work-notes-popup')
    await expect(notes).toBeVisible()
    await expect(page.locator('.description-popup')).toHaveCount(0) // one popup at a time
    await expect(notes.locator('.work-notes-facts')).toContainText('Escalation tier')

    await expect(notes.getByRole('button', { name: 'Add note' })).toBeDisabled()
    await notes.getByLabel('Add a note').fill('Escalating to Tier 2: still failing after restart.')
    await notes.getByRole('button', { name: 'Add note' }).click()
    await expect(notes.locator('.work-notes-body')).toContainText(/\[[A-Z][a-z]{2} \d{1,2}, \d{2}:\d{2} [AP]M\] - Escalating to Tier 2/)
    await expect(notes.getByLabel('Add a note')).toHaveValue('')

    await notes.getByRole('button', { name: /Back to ticket summary/ }).click()
    await expect(page.locator('.work-notes-popup')).toHaveCount(0)
    await expect(page.locator('.description-popup')).toBeVisible()

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('it-ticket-kanban-v1') || '[]')[0].notes as string)
    expect(saved).toContain('Escalating to Tier 2: still failing after restart.')
  })

  test('opens from the full ticket panel and Back returns to it', async ({ page }) => {
    await openTickets(page)
    await page.locator('.task-table tbody tr').first().locator('td').nth(1).click()
    await expect(page.locator('.record-overlay')).toBeVisible()
    await page.locator('.record-overlay').getByRole('button', { name: 'Work notes' }).click()

    const notes = page.locator('.work-notes-popup')
    await expect(notes).toBeVisible()
    await expect(page.locator('.record-overlay')).toHaveCount(0)
    await notes.getByRole('button', { name: /Back to full ticket/ }).click()
    await expect(page.locator('.record-overlay')).toBeVisible()
  })
})
