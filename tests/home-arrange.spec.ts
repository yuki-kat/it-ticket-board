import { expect, test, type Page } from '@playwright/test'
import { insightCard, insightOrder, openApp, openInsight } from './helpers'

// Checks for the React version of "Arrange card". The order is kept under the same key, in the same format, as the compiled page.

const ORDER_KEY = 'ops-kanban-home-insight-order-v1'
const DEFAULT_ORDER = ['Tickets by state', 'Open tickets by priority', 'Ticket intake', 'Recently created', 'SLA health', 'Escalation workload', 'Assignment coverage', 'Resolution rate']
const TITLES: Record<string, string> = { sla: 'SLA health', escalation: 'Escalation workload', assignment: 'Assignment coverage', resolution: 'Resolution rate' }

async function arrange(page: Page, title: string) {
  await openInsight(page, title)
  await page.locator('.insight-detail-arrange').click()
  await expect(page.locator('#insight-move-title')).toHaveText(title)
}
const savedOrder = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null') as string[] | null, ORDER_KEY)
async function move(page: Page, title: string, direction: string) {
  await arrange(page, title)
  await page.locator(`[data-move="${direction}"]`).click()
  await expect(page.locator('.insight-move-overlay')).toHaveCount(0)
}

test.describe('Arrange card (source)', () => {
  test.beforeEach(async ({ page }) => openApp(page))

  test('starts in the default order', async ({ page }) => {
    expect(await insightOrder(page)).toEqual(DEFAULT_ORDER)
  })

  test('the popup is a modal dialog, and Escape closes it and returns focus to the card', async ({ page }) => {
    await arrange(page, 'Ticket intake')
    const dialog = page.getByRole('dialog', { name: 'Ticket intake' })
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(dialog).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.locator('.insight-move-overlay')).toHaveCount(0)
    await expect(insightCard(page, 'Ticket intake').locator('.insight-click-target')).toBeFocused()
    expect(await insightOrder(page)).toEqual(DEFAULT_ORDER)
  })

  test('Cancel, ×, and a click outside close it without moving anything', async ({ page }) => {
    for (const close of [
      () => page.getByRole('button', { name: 'Cancel' }).click(),
      () => page.locator('.insight-move-close').click(),
      () => page.locator('.insight-move-overlay').click({ position: { x: 4, y: 4 } }),
    ]) {
      await arrange(page, 'Ticket intake')
      await close()
      await expect(page.locator('.insight-move-overlay')).toHaveCount(0)
    }
    expect(await insightOrder(page)).toEqual(DEFAULT_ORDER)
  })

  test('moves that are not possible are disabled at the edges', async ({ page }) => {
    await arrange(page, 'Tickets by state')
    for (const direction of ['left', 'up', 'first']) await expect(page.locator(`[data-move="${direction}"]`)).toBeDisabled()
    for (const direction of ['right', 'down', 'last']) await expect(page.locator(`[data-move="${direction}"]`)).toBeEnabled()
    await page.keyboard.press('Escape')
    await arrange(page, 'Resolution rate')
    for (const direction of ['right', 'down', 'last']) await expect(page.locator(`[data-move="${direction}"]`)).toBeDisabled()
    for (const direction of ['left', 'up', 'first']) await expect(page.locator(`[data-move="${direction}"]`)).toBeEnabled()
  })

  test('Left and Right move a card by one place', async ({ page }) => {
    await move(page, 'Ticket intake', 'left')
    expect((await insightOrder(page)).slice(0, 3)).toEqual(['Tickets by state', 'Ticket intake', 'Open tickets by priority'])
    await move(page, 'Ticket intake', 'right')
    expect(await insightOrder(page)).toEqual(DEFAULT_ORDER)
  })

  test('Down and Up move a card by a whole row (two cards on a wide screen)', async ({ page }) => {
    await move(page, 'Tickets by state', 'down')
    expect((await insightOrder(page)).indexOf('Tickets by state')).toBe(2)
    await move(page, 'Tickets by state', 'up')
    expect(await insightOrder(page)).toEqual(DEFAULT_ORDER)
  })

  test('on a narrow screen there is one card per row, so Down moves by one', async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 900 })
    await move(page, 'Tickets by state', 'down')
    expect((await insightOrder(page)).indexOf('Tickets by state')).toBe(1)
  })

  test('Move first and Move last', async ({ page }) => {
    await move(page, 'Resolution rate', 'first')
    expect((await insightOrder(page))[0]).toBe('Resolution rate')
    await move(page, 'Resolution rate', 'last')
    expect(await insightOrder(page)).toEqual(DEFAULT_ORDER)
  })

  test('a move can be made with the keyboard', async ({ page }) => {
    await arrange(page, 'Ticket intake')
    await page.locator('[data-move="right"]').focus()
    await page.keyboard.press('Enter')
    expect((await insightOrder(page)).slice(2, 4)).toEqual(['Recently created', 'Ticket intake'])
  })

  test('the order is saved as titles, with short names for the four extra cards, like the compiled page', async ({ page }) => {
    await move(page, 'Tickets by state', 'last')
    const saved = await savedOrder(page)
    expect(saved).toEqual(['Open tickets by priority', 'Ticket intake', 'Recently created', 'sla', 'escalation', 'assignment', 'resolution', 'Tickets by state'])
  })
})

test.describe('Saved order (source)', () => {
  test('an order saved by the compiled page is used; unknown entries are ignored and missing cards go last', async ({ page }) => {
    await page.goto('/index.html')
    await page.evaluate((key) => localStorage.setItem(key, JSON.stringify(['Recently created', 'sla', 'Not a card', 'Tickets by state'])), ORDER_KEY)
    await page.reload()
    await expect(page.locator('.home-chart-grid > .home-chart-card').first()).toBeVisible()
    expect(await insightOrder(page)).toEqual(['Recently created', TITLES.sla, 'Tickets by state', 'Open tickets by priority', 'Ticket intake', TITLES.escalation, TITLES.assignment, TITLES.resolution])
  })

  test('a corrupt saved order falls back to the default', async ({ page }) => {
    await page.goto('/index.html')
    await page.evaluate((key) => localStorage.setItem(key, '{not json'), ORDER_KEY)
    await page.reload()
    await expect(page.locator('.home-chart-grid > .home-chart-card').first()).toBeVisible()
    expect(await insightOrder(page)).toEqual(DEFAULT_ORDER)
  })

  test('a card that is switched off keeps its place for when it comes back', async ({ page }) => {
    await page.goto('/index.html')
    await page.evaluate(() => localStorage.setItem('it-ticket-kanban-home-widgets-v1', JSON.stringify({ intake: false })))
    await page.reload()
    await expect(page.locator('.home-chart-grid > .home-chart-card').first()).toBeVisible()
    expect(await insightOrder(page)).not.toContain('Ticket intake')
    await move(page, 'Tickets by state', 'last')
    const saved = await savedOrder(page)
    expect(saved).toEqual(['Open tickets by priority', 'Ticket intake', 'Recently created', 'sla', 'escalation', 'assignment', 'resolution', 'Tickets by state'])
    await page.evaluate(() => localStorage.setItem('it-ticket-kanban-home-widgets-v1', JSON.stringify({ intake: true })))
    await page.reload()
    await expect(page.locator('.home-chart-grid > .home-chart-card').first()).toBeVisible()
    expect(await insightOrder(page)).toEqual(['Open tickets by priority', 'Ticket intake', 'Recently created', 'SLA health', 'Escalation workload', 'Assignment coverage', 'Resolution rate', 'Tickets by state'])
  })
})
