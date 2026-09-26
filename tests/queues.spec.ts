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
