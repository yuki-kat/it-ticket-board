import { expect, test } from '@playwright/test'
import { expectOnTicketsPage, insightCard, numberIn, openApp, openInsight, ticketsShown } from './helpers'

const SEARCH = 'input[aria-label="Search tickets, people, tags"]'

test.describe('Operations insights', () => {
  test.beforeEach(async ({ page }) => openApp(page))

  test('every insight card opens its enlarged popup', async ({ page }) => {
    for (const title of ['Tickets by state', 'Open tickets by priority', 'Ticket intake', 'SLA health', 'Escalation workload', 'Assignment coverage', 'Resolution rate']) {
      await openInsight(page, title)
      await page.keyboard.press('Escape')
      await expect(page.locator('.insight-detail-overlay')).toHaveCount(0)
    }
  })

  test('a card opens from the keyboard and Escape closes it', async ({ page }) => {
    const target = insightCard(page, 'Tickets by state').locator('.insight-click-target')
    await target.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#insight-detail-title')).toHaveText('Tickets by state')
    await page.keyboard.press('Escape')
    await expect(page.locator('.insight-detail-overlay')).toHaveCount(0)
    await expect(target).toBeFocused()
  })

  test('closes with ×, Close, and a click outside', async ({ page }) => {
    for (const close of [
      () => page.locator('.insight-detail-overlay .ticket-card-popout-close').click(),
      () => page.locator('.insight-detail-overlay .ticket-card-popout-cancel').click(),
      () => page.locator('.insight-detail-overlay').click({ position: { x: 4, y: 4 } }),
    ]) {
      await openInsight(page, 'Ticket intake')
      await close()
      await expect(page.locator('.insight-detail-overlay')).toHaveCount(0)
    }
  })

  test('a state row lists its tickets and the button opens that queue', async ({ page }) => {
    await openInsight(page, 'Tickets by state')
    const row = page.locator('.insight-segment', { hasText: 'Waiting on User' })
    const expected = await numberIn(row, 'b')
    await row.click()
    await expect(page.locator('.insight-detail-head span')).toHaveText(`${expected} ticket${expected === 1 ? '' : 's'}`)
    await expect(page.locator('.insight-detail-tickets li')).toHaveCount(Math.min(expected, 6))
    await page.locator('.insight-detail-overlay .ticket-card-popout-open').click()
    await expectOnTicketsPage(page)
    expect(await ticketsShown(page)).toBe(expected)
  })

  test('a priority row lists that priority\'s open tickets', async ({ page }) => {
    await openInsight(page, 'Open tickets by priority')
    const row = page.locator('.insight-segment', { hasText: 'P2' })
    const expected = await numberIn(row, 'b')
    await row.click()
    await expect(page.locator('.insight-detail-head span')).toHaveText(`${expected} tickets`)
    for (const meta of await page.locator('.insight-detail-tickets li small').allInnerTexts()) expect(meta).toContain('P2')
  })

  test('a donut arc selects the same priority as its legend row', async ({ page }) => {
    await openInsight(page, 'Open tickets by priority')
    const arc = page.locator('.insight-arc').first()
    const priority = await arc.getAttribute('data-priority')
    // The arc is a stroked ring, so its bounding-box centre is the hole: dispatch the click on it directly.
    await arc.dispatchEvent('click')
    await expect(page.locator('.insight-segment', { hasText: priority! })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.insight-detail-head strong')).toHaveText(`${priority} open tickets`)
  })

  test('an intake hour lists its tickets, and selecting it again shows all 24 hours', async ({ page }) => {
    await openInsight(page, 'Ticket intake')
    const hour = page.locator('.insight-hour').first()
    const expected = Number((await hour.getAttribute('aria-label'))!.match(/, (\d+) ticket/)![1])
    await hour.click()
    await expect(hour).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.insight-detail-head strong')).toHaveText(/^Created /)
    await expect(page.locator('.insight-detail-head span')).toHaveText(`${expected} ticket${expected === 1 ? '' : 's'}`)
    await hour.click()
    await expect(page.locator('.insight-detail-head strong')).toHaveText('Created in the last 24 hours')
  })

  test('a segment can be chosen with the keyboard', async ({ page }) => {
    await openInsight(page, 'Tickets by state')
    const row = page.locator('.insight-segment', { hasText: 'Escalated' })
    await row.focus()
    await page.keyboard.press('Enter')
    await expect(row).toHaveAttribute('aria-pressed', 'true')
  })

  test('clicking a ticket in the list opens the Tickets page searched to that ticket', async ({ page }) => {
    await openInsight(page, 'Escalation workload')
    const first = page.locator('.insight-detail-tickets li button').first()
    const id = (await first.locator('small').innerText()).split(' · ')[0]
    await first.click()
    await expectOnTicketsPage(page)
    await expect(page.locator(SEARCH)).toHaveValue(id)
    expect(await ticketsShown(page)).toBe(1)
  })

  test('the escalation card popup lists exactly the escalated tickets', async ({ page }) => {
    const escalated = await numberIn(page.locator('.home-action-strip button', { hasText: 'Escalated' }))
    await openInsight(page, 'Escalation workload')
    await expect(page.locator('.insight-detail-head span')).toHaveText(`${escalated} tickets`)
  })

  test('a popup opened from an insight card is the only popup', async ({ page }) => {
    await openInsight(page, 'SLA health')
    await expect(page.locator('.ticket-card-popout')).toHaveCount(1)
    await expect(page.locator('.insight-move-overlay')).toHaveCount(0)
  })
})

test.describe('Home settings', () => {
  test.beforeEach(async ({ page }) => openApp(page))

  test('an extra insight card can be hidden and shown again', async ({ page }) => {
    await page.getByRole('button', { name: 'Customize home' }).click()
    await expect(page.locator('.settings-panel')).toBeVisible()
    const toggle = page.locator('[data-extra-insight-toggle="sla"] input')
    await expect(page.locator('[data-extra-insight-toggle="sla"]')).toHaveCount(1) // no duplicate toggles
    await toggle.uncheck()
    await expect(page.locator('.home-chart-grid [data-extra-insight="sla"]')).toHaveCount(0)
    await toggle.check()
    await expect(page.locator('.home-chart-grid [data-extra-insight="sla"]')).toHaveCount(1)
  })

  test('the Home page settles: nothing keeps re-rendering', async ({ page }) => {
    await page.waitForTimeout(500)
    const mutations = await page.evaluate(() => new Promise<number>((resolve) => {
      let count = 0
      const observer = new MutationObserver((list) => { count += list.length })
      observer.observe(document.getElementById('root')!, { childList: true, subtree: true })
      setTimeout(() => { observer.disconnect(); resolve(count) }, 1500)
    }))
    expect(mutations).toBeLessThan(5) // it used to be about 700 a second
  })
})
