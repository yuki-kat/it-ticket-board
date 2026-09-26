import { expect, test, type Page } from '@playwright/test'
import { expectOnTicketsPage, goTo, kpiCard, numberIn, openApp, ticketsShown } from './helpers'

// Explore tickets is its own page (#/explore): (1) choose a queue, (2) pick a ticket, (3) see its summary.
// Each step has its own address, so the browser's Back button steps back.

const openExplore = async (page: Page) => {
  await page.locator('.home-hero button', { hasText: 'Explore tickets' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Explore tickets' })).toBeVisible()
}
const firstTicketIn = async (page: Page, index = 0) => {
  const row = page.locator('.explore-list li button').nth(index)
  const id = (await row.locator('small').innerText()).split(' · ')[0]
  return { row, id }
}

test.describe('Explore tickets page', () => {
  test.beforeEach(async ({ page }) => openApp(page))

  test('Explore tickets opens its own page, not a popup, with the four queues and their counts', async ({ page }) => {
    await openExplore(page)
    await expect(page).toHaveURL(/#\/explore$/)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('.primary-nav button.active')).toHaveText('Home')
    for (const queue of ['active', 'priority', 'overdue', 'escalated']) await expect(page.locator(`.explore-queues [data-queue="${queue}"]`)).toBeVisible()
    await page.locator('.explore-crumbs button', { hasText: 'Home' }).click()
    const open = await numberIn(kpiCard(page, 'Open tickets'))
    const priority = await numberIn(kpiCard(page, 'P1 / P2 open'))
    await openExplore(page)
    expect(await numberIn(page.locator('[data-queue="active"]'))).toBe(open)
    expect(await numberIn(page.locator('[data-queue="priority"]'))).toBe(priority)
  })

  for (const queue of ['active', 'priority', 'overdue', 'escalated']) {
    test(`choosing "${queue}" lists all its tickets, and the same queue opens on the Tickets page`, async ({ page }) => {
      await openExplore(page)
      const expected = await numberIn(page.locator(`[data-queue="${queue}"]`))
      await page.locator(`[data-queue="${queue}"]`).click()
      await expect(page).toHaveURL(new RegExp(`#/explore/${queue}$`))
      await expect(page.locator(`[data-queue="${queue}"]`)).toHaveAttribute('aria-current', 'true')
      await expect(page.locator('.explore-list li')).toHaveCount(expected)
      await page.locator('.explore-open-queue').click()
      await expectOnTicketsPage(page)
      expect(await ticketsShown(page)).toBe(expected)
    })
  }

  test('choosing a ticket shows its summary, and "Open full record" opens the record', async ({ page }) => {
    await openExplore(page)
    await page.locator('[data-queue="priority"]').click()
    const { row, id } = await firstTicketIn(page, 1)
    await row.click()
    await expect(page).toHaveURL(new RegExp(`#/explore/priority/${id}$`))
    await expect(row).toHaveAttribute('aria-current', 'true')
    await expect(page.locator('#explore-detail-title')).toHaveText(id)
    await expect(page.locator('.explore-ticket-summary .record-status-strip')).toContainText(/P[12]/)
    await page.locator('.explore-detail .primary-button', { hasText: 'Open full record' }).click()
    await expect(page.locator('.ticket-record-panel')).toBeVisible()
    await expect(page.locator('#ticket-record-title')).toHaveText(id)
  })

  test("the browser's Back button steps back through the page, and Forward returns", async ({ page }) => {
    await openExplore(page)
    await page.locator('[data-queue="escalated"]').click()
    const { row, id } = await firstTicketIn(page)
    await row.click()
    await expect(page.locator('#explore-detail-title')).toHaveText(id)
    await page.goBack()
    await expect(page).toHaveURL(/#\/explore\/escalated$/)
    await expect(page.locator('#explore-detail-title')).toHaveText(/Details/)
    await page.goBack()
    await expect(page).toHaveURL(/#\/explore$/)
    await expect(page.locator('#explore-list-title')).toHaveText(/Tickets/)
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Good to see you.' })).toBeVisible()
    await page.goForward()
    await expect(page.getByRole('heading', { level: 1, name: 'Explore tickets' })).toBeVisible()
  })

  test('a refresh, or the same address in a new tab, opens the same queue and ticket', async ({ page, context }) => {
    await openExplore(page)
    await page.locator('[data-queue="active"]').click()
    const { row, id } = await firstTicketIn(page, 2)
    await row.click()
    await page.reload()
    await expect(page.locator('#explore-detail-title')).toHaveText(id)
    const other = await context.newPage()
    await other.goto(page.url())
    await expect(other.locator('[data-queue="active"]')).toHaveAttribute('aria-current', 'true')
    await expect(other.locator('#explore-detail-title')).toHaveText(id)
  })

  test('"All tickets" shows every ticket on the Tickets page', async ({ page }) => {
    const total = (await numberIn(kpiCard(page, 'Open tickets'))) + (await numberIn(kpiCard(page, 'Closed tickets')))
    await openExplore(page)
    await page.locator('.explore-all').click()
    await expectOnTicketsPage(page)
    expect(await ticketsShown(page)).toBe(total)
  })
})

test.describe('Explore tickets page on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test.beforeEach(async ({ page }) => openApp(page))

  test('the steps are shown one at a time, each with a way back', async ({ page }) => {
    await openExplore(page)
    await expect(page.locator('.explore-queues')).toBeVisible()
    await expect(page.locator('.explore-list')).toBeHidden()
    await page.locator('[data-queue="priority"]').click()
    await expect(page.locator('.explore-queues')).toBeHidden()
    await expect(page.locator('#explore-list-title')).toBeFocused()
    const { row, id } = await firstTicketIn(page)
    await row.click()
    await expect(page.locator('.explore-list')).toBeHidden()
    await expect(page.locator('#explore-detail-title')).toHaveText(id)
    await page.locator('.explore-detail .explore-step-back').click()
    await expect(page.locator('.explore-list')).toBeVisible()
    await page.locator('.explore-list .explore-step-back').click()
    await expect(page.locator('.explore-queues')).toBeVisible()
  })
})

test.describe('Page addresses', () => {
  test.beforeEach(async ({ page }) => openApp(page))

  test('each page has its own address, and Back returns to the previous page', async ({ page }) => {
    await goTo(page, 'Tickets')
    await expect(page).toHaveURL(/#\/tickets$/)
    await goTo(page, 'Inventory')
    await expect(page).toHaveURL(/#\/inventory$/)
    await page.goBack()
    await expect(page.locator('.primary-nav button.active')).toHaveText('Tickets')
    await page.goBack()
    await expect(page.locator('.primary-nav button.active')).toHaveText('Home')
  })

  test('a refresh stays on the same page', async ({ page }) => {
    await goTo(page, 'Inventory')
    await page.reload()
    await expect(page.locator('.primary-nav button.active')).toHaveText('Inventory')
    await expect(page.getByRole('heading', { level: 1, name: 'Inventory' })).toBeVisible()
  })

  test('an address opens its page directly', async ({ page }) => {
    await page.goto('/index.html#/tickets')
    await expectOnTicketsPage(page)
    expect(await ticketsShown(page)).toBeGreaterThan(0)
  })

  test('a ticket opened in a new tab still gets its own full page', async ({ context }) => {
    const tab = await context.newPage()
    await tab.goto('/index.html#ticket=OPS-102')
    await expect(tab.getByRole('heading', { level: 1, name: 'OPS-102' })).toBeVisible()
    await expect(tab).toHaveURL(/#ticket=OPS-102$/)
  })
})
