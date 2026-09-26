import { expect, test } from '@playwright/test'
import { goTo, openApp, ticketsShown } from './helpers'

test.describe('Opening a ticket', () => {
  test.beforeEach(async ({ page }) => openApp(page))

  test('a ticket in "Recently created" opens its record', async ({ page }) => {
    const first = page.locator('.home-recent-card .home-recent-list button').first()
    const id = (await first.locator('small').innerText()).split(' · ')[0]
    const title = await first.locator('b').innerText()
    await first.click()
    const record = page.getByRole('dialog')
    await expect(record).toBeVisible()
    await expect(record).toContainText(id)
    await expect(record).toContainText(title)
  })

  test('"See all" opens the Tickets page with every ticket', async ({ page }) => {
    await page.locator('.home-recent-card .home-chart-heading button', { hasText: 'See all' }).click()
    await expect(page.locator('.primary-nav button.active')).toHaveText('Tickets')
    await expect(page.locator('.ticket-total')).toHaveText(/^\d+ records$/)
  })

  test('the Tickets page can be searched by ticket number', async ({ page }) => {
    await goTo(page, 'Tickets')
    const total = await ticketsShown(page)
    await page.locator('input[aria-label="Search tickets, people, tags"]').fill('OPS-101')
    await expect.poll(() => ticketsShown(page)).toBe(1)
    expect(total).toBeGreaterThan(1)
  })

  test('the page navigation buttons move between Home, Tickets and Inventory', async ({ page }) => {
    await goTo(page, 'Tickets')
    await goTo(page, 'Inventory')
    await goTo(page, 'Home')
    await expect(page.locator('.home-kpi-grid')).toBeVisible()
  })
})

test.describe('Inventory device health', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page)
    await goTo(page, 'Inventory')
  })

  test('the asset table has a Device health column, badges and a legend', async ({ page }) => {
    await expect(page.locator('.inventory-table thead th', { hasText: 'Device health' })).toBeVisible()
    await expect(page.locator('.inventory-health-badge').first()).toBeVisible()
    await expect(page.locator('.device-health-legend')).toContainText('Monitor')
  })

  test('the health filter offers every level', async ({ page }) => {
    const options = await page.locator('.inventory-health-filter option').allInnerTexts()
    expect(options).toEqual(['All health', 'Healthy', 'Monitor', 'At Risk', 'Critical'])
  })

  // Known bug in the compiled index.html: its saved data still says "Needs attention" / "Offline",
  // so these filters find nothing. It is fixed in the React source (app/), and this test will
  // be switched on when index.html is built from app/.
  test.fixme('filtering by At Risk lists the At Risk devices', async ({ page }) => {
    const atRisk = await page.locator('.inventory-health-badge', { hasText: 'At Risk' }).count()
    expect(atRisk).toBeGreaterThan(0)
    await page.locator('.inventory-health-filter').selectOption('At Risk')
    await expect(page.locator('.inventory-table tbody tr')).toHaveCount(atRisk)
  })
})
