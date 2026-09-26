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

  // Regression: choosing a queue used to close the launcher and open a card popup instead of going to the queue.
  for (const queue of ['active', 'priority', 'overdue', 'escalated']) {
    test(`choosing "${queue}" goes straight to that queue`, async ({ page }) => {
      await openLauncher(page)
      const expected = await numberIn(page.locator(`[data-queue="${queue}"]`))
      await page.locator(`[data-queue="${queue}"]`).click()
      await expectOnTicketsPage(page)
      await expect(page.locator('.ticket-card-popout')).toHaveCount(0)
      expect(await ticketsShown(page)).toBe(expected)
    })
  }

  test('"All tickets" shows every ticket', async ({ page }) => {
    const total = (await numberIn(kpiCard(page, 'Open tickets'))) + (await numberIn(kpiCard(page, 'Closed tickets')))
    await openLauncher(page)
    await page.locator('[data-queue="all"]').click()
    await expectOnTicketsPage(page)
    await expect(page.locator('.ticket-card-popout')).toHaveCount(0)
    expect(await ticketsShown(page)).toBe(total)
  })
})
