import { expect, test } from '@playwright/test'
import { insightCard, kpiCard, numberIn, openApp, openInsight } from '../helpers'

// Checks for the React version of the Operations insights.

const TICKETS_KEY = 'it-ticket-kanban-v1'

test.describe('Operations insights (source)', () => {
  test.beforeEach(async ({ page }) => openApp(page))

  test('a card popup is a modal dialog named after the card', async ({ page }) => {
    await openInsight(page, 'Tickets by state')
    const dialog = page.getByRole('dialog', { name: 'Tickets by state' })
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(dialog).toContainText('OPERATIONS INSIGHTS')
    await expect(dialog).toBeFocused()
  })

  test('the SLA card lists the tickets that are really past their SLA', async ({ page }) => {
    // Make one open P1 ticket three days old: a P1 has a 4 hour resolution target.
    await page.evaluate((key) => {
      const tickets = JSON.parse(localStorage.getItem(key) || '[]')
      const ticket = tickets.find((item: { status: string; severity: string }) => item.status !== 'Resolved' && item.severity.startsWith('P1'))
      ticket.createdAt = new Date(Date.now() - 3 * 86_400_000).toISOString()
      localStorage.setItem(key, JSON.stringify(tickets))
      ;(window as unknown as { __id: string }).__id = ticket.id
    }, TICKETS_KEY)
    const id = await page.evaluate(() => (window as unknown as { __id: string }).__id)
    await page.reload()
    const overdue = await numberIn(kpiCard(page, 'Past resolution SLA'))
    expect(overdue).toBeGreaterThan(0)
    await expect(insightCard(page, 'SLA health')).toContainText(`${overdue} currently past SLA`)
    await openInsight(page, 'SLA health')
    await expect(page.locator('.insight-detail-head span')).toHaveText(`${overdue} ticket${overdue === 1 ? '' : 's'}`)
    await expect(page.locator('.insight-detail-tickets')).toContainText(id)
  })

  test('the extra cards show numbers that agree with the Home totals', async ({ page }) => {
    const open = await numberIn(kpiCard(page, 'Open tickets'))
    const closed = await numberIn(kpiCard(page, 'Closed tickets'))
    const overdue = await numberIn(kpiCard(page, 'Past resolution SLA'))
    expect(await numberIn(insightCard(page, 'SLA health'), '.extended-insight-metric strong')).toBe(open - overdue)
    expect(await numberIn(insightCard(page, 'Resolution rate'), '.extended-insight-metric strong')).toBe(closed)
    await expect(insightCard(page, 'Resolution rate')).toContainText(`${closed} resolved of ${open + closed} total tickets`)
    const unassigned = await numberIn(page.locator('.home-action-strip button', { hasText: 'Unassigned' }))
    expect(await numberIn(insightCard(page, 'Assignment coverage'), '.extended-insight-metric strong')).toBe(open - unassigned)
  })

  test('a long list shows six tickets and says how many more there are', async ({ page }) => {
    await openInsight(page, 'Ticket intake')
    await expect(page.locator('.insight-detail-tickets li')).toHaveCount(6)
    await expect(page.locator('.insight-detail-more')).toContainText(/^\+\d+ more\. Use “Open all tickets” to see the full list\.$/)
  })

  test('the Recently created card has no popup: its tickets open directly', async ({ page }) => {
    const recent = page.locator('.home-chart-grid > .home-recent-card')
    await expect(recent.locator('.insight-click-target')).toHaveCount(0)
    await recent.locator('.home-recent-list button').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.locator('.insight-detail-overlay')).toHaveCount(0)
  })
})

test.describe('Extra card switches (source)', () => {
  test('switches saved by the compiled page are picked up', async ({ page }) => {
    await page.goto('/index.html')
    // What a browser that used the compiled page holds: the four original switches under the Home key,
    // and the extra cards' switches under their own key.
    await page.evaluate(() => {
      localStorage.setItem('it-ticket-kanban-home-widgets-v1', JSON.stringify({ status: true, priority: true, intake: true, recent: true }))
      localStorage.setItem('ops-kanban-extra-home-insights-v1', JSON.stringify({ sla: false, resolution: false }))
    })
    await page.reload()
    await expect(page.locator('.home-chart-grid > .home-chart-card').first()).toBeVisible()
    await expect(page.locator('[data-extra-insight="sla"]')).toHaveCount(0)
    await expect(page.locator('[data-extra-insight="resolution"]')).toHaveCount(0)
    await expect(page.locator('[data-extra-insight="escalation"]')).toHaveCount(1)
    await expect(page.locator('[data-extra-insight="assignment"]')).toHaveCount(1)
  })

  test('a switch is remembered after a reload', async ({ page }) => {
    await openApp(page)
    await page.locator('.quick-settings-button, .header-tools-trigger').first().click()
    // Settings is reached from the Tools menu in the source, or the quick button on the page.
    if (!(await page.locator('.settings-panel').count())) await page.getByRole('button', { name: /^Settings/ }).click()
    await page.locator('[data-extra-insight-toggle="escalation"] input').uncheck()
    await page.keyboard.press('Escape')
    await page.reload()
    await expect(page.locator('.home-chart-grid > .home-chart-card').first()).toBeVisible()
    await expect(page.locator('[data-extra-insight="escalation"]')).toHaveCount(0)
    await expect(page.locator('[data-extra-insight="sla"]')).toHaveCount(1)
  })

  test('with every card switched off Home says so', async ({ page }) => {
    await page.goto('/index.html')
    await page.evaluate(() => localStorage.setItem('it-ticket-kanban-home-widgets-v1', JSON.stringify({ status: false, priority: false, intake: false, recent: false, sla: false, escalation: false, assignment: false, resolution: false })))
    await page.reload()
    await expect(page.getByText('No charts selected')).toBeVisible()
  })
})
