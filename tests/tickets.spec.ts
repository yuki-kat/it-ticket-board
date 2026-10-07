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
    await page.locator('.inventory-filters-button').click()
    const options = await page.locator('.inventory-health-filter option').allInnerTexts()
    expect(options).toEqual(['All health', 'Healthy', 'Monitor', 'At Risk', 'Critical'])
  })

  test('filtering by At Risk lists the At Risk devices', async ({ page }) => {
    const atRisk = await page.locator('.inventory-health-badge', { hasText: 'At Risk' }).count()
    expect(atRisk).toBeGreaterThan(0)
    await page.locator('.inventory-filters-button').click()
    await page.locator('.inventory-health-filter').selectOption('At Risk')
    await expect(page.locator('.inventory-table tbody tr')).toHaveCount(atRisk)
  })
})

test.describe('AI troubleshooting guidance', () => {
  test.beforeEach(async ({ page }) => openApp(page))

  test('AI Gateway settings report the server configuration', async ({ page }) => {
    await page.route('**/api/check-gemini', async (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ available: true }),
    }))

    await page.getByRole('button', { name: 'Tools' }).click()
    await page.getByRole('button', { name: /AI Gateway Settings/ }).click()

    await expect(page.getByRole('heading', { name: 'AI Gateway Configured' })).toBeVisible()
  })

  test('Ask AI on a ticket card shows ticket-specific troubleshooting steps', async ({ page }) => {
    await goTo(page, 'Tickets')
    await page.getByRole('combobox', { name: 'Choose ticket view' }).selectOption('regular')
    let requestedTitle = ''
    await page.route('**/api/suggest-fix', async (route) => {
      requestedTitle = route.request().postDataJSON().title
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ likelyCauses: ['A test cause'], steps: ['Check the affected service', 'Review recent changes'], escalateIf: 'The service remains unavailable' }),
      })
    })

    const card = page.locator('.ticket-card').first()
    const title = await card.locator('.ticket-card-front h3').innerText()
    await card.getByRole('button', { name: 'Ask AI' }).click()

    const guidance = card.getByRole('region', { name: 'AI guidance' })
    await expect(guidance.getByRole('heading', { name: 'Steps to try' })).toBeVisible()
    await expect(guidance).toBeInViewport()
    await expect(guidance.locator('ol li')).toHaveText(['Check the affected service', 'Review recent changes'])
    expect(requestedTitle).toBe(title)
  })

  test('Ask AI in ticket details shows the same guidance and can add it to notes', async ({ page }) => {
    await goTo(page, 'Tickets')
    await page.getByRole('combobox', { name: 'Choose ticket view' }).selectOption('regular')
    await page.route('**/api/suggest-fix', async (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ likelyCauses: ['A test cause'], steps: ['Check the affected service'], escalateIf: 'The service remains unavailable' }),
    }))

    await page.locator('.ticket-card').first().click()
    const dialog = page.locator('.ticket-record-panel')
    await dialog.getByRole('button', { name: 'Ask AI' }).click()

    const guidance = dialog.getByRole('region', { name: 'AI guidance' })
    await expect(guidance.locator('ul li')).toHaveText(['A test cause'])
    await expect(guidance.locator('ol li')).toHaveText(['Check the affected service'])
    await guidance.getByRole('button', { name: 'Add to notes' }).click()
    await expect(dialog.locator('textarea').first()).toHaveValue(/Likely cause: A test cause[\s\S]*1\. Check the affected service/)
  })
})

test.describe('Record counts', () => {
  const count = (page: import('@playwright/test').Page) => page.getByText(/^\d+ (of \d+ )?records$/)

  test('Tickets shows the record count once', async ({ page }) => {
    await openApp(page)
    await goTo(page, 'Tickets')
    await expect(count(page)).toHaveCount(1)
  })

  test('Inventory shows the record count once', async ({ page }) => {
    await openApp(page)
    await goTo(page, 'Inventory')
    await expect(count(page)).toHaveCount(1)
  })
})
