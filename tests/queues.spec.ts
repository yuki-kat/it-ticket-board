import { expect, test } from '@playwright/test'
import { attentionButton, expectOnTicketsPage, goTo, kpiCard, numberIn, openApp, ticketsShown } from './helpers'

test.describe('Home totals match the ticket queues', () => {
  test.beforeEach(async ({ page }) => openApp(page))

  test('open + closed tickets add up to every ticket on the Tickets page', async ({ page }) => {
    const open = await numberIn(kpiCard(page, 'Open tickets'))
    const closed = await numberIn(kpiCard(page, 'Closed tickets'))
    await goTo(page, 'Tickets')
    expect(await ticketsShown(page)).toBe(open + closed)
  })

  const cards = ['Open tickets', 'Closed tickets', 'P1 / P2 open', 'Past resolution SLA']
  for (const label of cards) {
    test(`"${label}" opens a queue with the same count`, async ({ page }) => {
      const expected = await numberIn(kpiCard(page, label))
      await kpiCard(page, label).click()
      await page.locator('.ticket-card-popout-open').click()
      await expectOnTicketsPage(page)
      expect(await ticketsShown(page)).toBe(expected)
    })
  }

  const strip = ['Escalated', 'Escalation due', 'Waiting on user', 'Unassigned']
  for (const label of strip) {
    test(`"${label}" opens a queue with the same count`, async ({ page }) => {
      const expected = await numberIn(attentionButton(page, label))
      await attentionButton(page, label).click()
      await page.locator('.ticket-card-popout-open').click()
      await expectOnTicketsPage(page)
      expect(await ticketsShown(page)).toBe(expected)
    })
  }
})

test.describe('Explore tickets', () => {
  test.beforeEach(async ({ page }) => openApp(page))

  const openLauncher = async (page: import('@playwright/test').Page) => {
    await page.locator('.home-hero button', { hasText: 'Explore tickets' }).click()
    await expect(page.getByRole('heading', { name: 'Choose a ticket queue' })).toBeVisible()
  }

  test('offers the five queues, each with its current count', async ({ page }) => {
    await openLauncher(page)
    for (const queue of ['active', 'priority', 'overdue', 'escalated', 'all']) {
      await expect(page.locator(`.explore-queue-grid [data-queue="${queue}"]`)).toBeVisible()
    }
    expect(await numberIn(page.locator('[data-queue="active"]'))).toBe(await numberIn(kpiCard(page, 'Open tickets')))
    expect(await numberIn(page.locator('[data-queue="priority"]'))).toBe(await numberIn(kpiCard(page, 'P1 / P2 open')))
  })

  // Explore is a chain of three popups: the queues, a queue's tickets, then one ticket's summary.
  // Only one popup is ever on screen, and each queue's popup still leads to the full queue.
  const QUEUE_TITLES: Record<string, string> = { active: 'Active tickets', priority: 'Priority tickets', overdue: 'Past SLA', escalated: 'Escalated' }
  for (const [queue, title] of Object.entries(QUEUE_TITLES)) {
    test(`choosing "${queue}" lists its tickets, and its button opens that queue`, async ({ page }) => {
      await openLauncher(page)
      const expected = await numberIn(page.locator(`[data-queue="${queue}"]`))
      await page.locator(`[data-queue="${queue}"]`).click()
      await expect(page.getByRole('dialog', { name: title })).toBeFocused()
      await expect(page.locator('.ticket-card-popout')).toHaveCount(1)
      await expect(page.locator('.insight-detail-head span')).toHaveText(`${expected} ticket${expected === 1 ? '' : 's'}`)
      await expect(page.locator('.insight-detail-tickets li')).toHaveCount(Math.min(expected, 6))
      await page.locator('.ticket-card-popout-open').click()
      await expectOnTicketsPage(page)
      await expect(page.locator('.ticket-card-popout')).toHaveCount(0)
      expect(await ticketsShown(page)).toBe(expected)
    })
  }

  test('a ticket in the list opens its summary, and Back steps back through the popups', async ({ page }) => {
    await openLauncher(page)
    await page.locator('[data-queue="priority"]').click()
    const first = page.locator('.insight-detail-tickets li button').first()
    const id = (await first.locator('small').innerText()).split(' · ')[0]
    await first.click()
    const summary = page.getByRole('dialog', { name: id })
    await expect(summary).toBeFocused()
    await expect(summary).toContainText('TICKET DETAILS')
    await expect(summary.locator('.record-status-strip')).toContainText(/P[12]/)
    await expect(page.locator('.ticket-card-popout')).toHaveCount(1)
    await page.locator('.explore-back').click()
    await expect(page.getByRole('dialog', { name: 'Priority tickets' })).toBeFocused()
    await page.locator('.explore-back').click()
    await expect(page.getByRole('dialog', { name: 'Choose a ticket queue' })).toBeFocused()
  })

  test('"Open full record" closes the chain and opens the ticket record', async ({ page }) => {
    await openLauncher(page)
    await page.locator('[data-queue="active"]').click()
    const first = page.locator('.insight-detail-tickets li button').first()
    const id = (await first.locator('small').innerText()).split(' · ')[0]
    await first.click()
    await page.locator('.ticket-card-popout-open', { hasText: 'Open full record' }).click()
    await expect(page.locator('.ticket-card-popout')).toHaveCount(0)
    await expect(page.locator('.ticket-record-panel')).toBeVisible()
    await expect(page.locator('#ticket-record-title')).toHaveText(id)
  })

  test('Escape on the last popup closes the chain and puts focus back on Explore tickets', async ({ page }) => {
    const button = page.locator('.home-hero button', { hasText: 'Explore tickets' })
    await openLauncher(page)
    await page.locator('[data-queue="escalated"]').click()
    await page.locator('.insight-detail-tickets li button').first().click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.ticket-card-popout')).toHaveCount(0)
    await expect(button).toBeFocused()
  })

  test('"All tickets" shows every ticket', async ({ page }) => {
    const total = (await numberIn(kpiCard(page, 'Open tickets'))) + (await numberIn(kpiCard(page, 'Closed tickets')))
    await openLauncher(page)
    await page.locator('[data-queue="all"]').click()
    await expectOnTicketsPage(page)
    await expect(page.locator('.ticket-card-popout')).toHaveCount(0)
    expect(await ticketsShown(page)).toBe(total)
  })
})
