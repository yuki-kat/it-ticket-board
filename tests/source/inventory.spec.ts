import { expect, test, type Page } from '@playwright/test'

// These run against the React source build (app/dist), not the compiled index.html.

async function openInventory(page: Page) {
  await page.goto('/index.html')
  await expect(page.locator('.home-kpi-grid .home-kpi').first()).toBeVisible()
  await page.locator('.primary-nav button', { hasText: 'Inventory' }).click()
  await expect(page.locator('.inventory-table tbody tr').first()).toBeVisible()
}
const badges = (page: Page) => page.locator('.inventory-table .inventory-health-badge')

test.describe('Inventory device health (source)', () => {
  test.beforeEach(async ({ page }) => openInventory(page))

  test('shows a Device health column, badges with tooltips and a legend', async ({ page }) => {
    await expect(page.locator('.inventory-table thead th', { hasText: 'Device health' })).toBeVisible()
    await expect(badges(page).first()).toHaveAttribute('title', /.+/)
    await expect(page.locator('.device-health-legend')).toContainText('Critical')
  })

  test('the health filter offers every level', async ({ page }) => {
    expect(await page.locator('.inventory-health-filter option').allInnerTexts()).toEqual(['All health', 'Healthy', 'Monitor', 'At Risk', 'Critical'])
  })

  // The bug that the compiled index.html still has: At Risk / Monitor / Critical showed no devices.
  for (const level of ['Healthy', 'Monitor', 'At Risk']) {
    test(`filtering by ${level} lists exactly the ${level} devices`, async ({ page }) => {
      const expected = await badges(page).filter({ hasText: new RegExp(`^${level}$`) }).count()
      expect(expected).toBeGreaterThan(0)
      await page.locator('.inventory-health-filter').selectOption(level)
      await expect(page.locator('.inventory-table tbody tr')).toHaveCount(expected)
      for (const text of await badges(page).allInnerTexts()) expect(text).toBe(level)
    })
  }

  test('Critical shows nothing until a device is critical, then finds it', async ({ page }) => {
    await page.locator('.inventory-health-filter').selectOption('Critical')
    await expect(page.locator('.inventory-table tbody tr')).toHaveCount(0)
    await page.locator('.inventory-health-filter').selectOption('All health')
    await page.locator('.inventory-table .inventory-id').first().click()
    await page.getByRole('button', { name: 'Edit details' }).click()
    await page.locator('.inventory-create-panel label', { hasText: 'Device health' }).locator('select').selectOption('Critical')
    await page.getByRole('button', { name: 'Save details' }).click()
    await page.locator('.inventory-detail-panel .close-button').click()
    await page.locator('.inventory-health-filter').selectOption('Critical')
    await expect(page.locator('.inventory-table tbody tr')).toHaveCount(1)
  })

  test('the chosen health filter is remembered after a reload', async ({ page }) => {
    await page.locator('.inventory-health-filter').selectOption('At Risk')
    await page.reload()
    await page.locator('.primary-nav button', { hasText: 'Inventory' }).click()
    await expect(page.locator('.inventory-health-filter')).toHaveValue('At Risk')
  })

  test('"Sync from Action1" is a labelled demo, shows progress and records what changed', async ({ page }) => {
    const button = page.locator('.inventory-action1-sync-button')
    await expect(button).toHaveAttribute('title', /Demo only/)
    await expect(page.locator('.inventory-action1-sync-status')).toHaveText('Not synced (demo)')
    await button.click()
    await expect(button).toBeDisabled()
    await expect(button).toHaveText('Syncing…')
    await expect(button).toBeEnabled({ timeout: 8000 })
    await expect(page.locator('.inventory-action1-sync-status')).toContainText('(demo data)')
  })

  test('old saved values ("Needs attention", "Offline") are converted on load', async ({ page }) => {
    await page.evaluate(() => {
      const assets = JSON.parse(localStorage.getItem('it-ticket-kanban-assets-v1') || '[]')
      assets[0].health = 'Offline'; assets[1].health = 'Needs attention'
      localStorage.setItem('it-ticket-kanban-assets-v1', JSON.stringify(assets))
    })
    await page.reload()
    await page.locator('.primary-nav button', { hasText: 'Inventory' }).click()
    const first = await badges(page).allInnerTexts()
    expect(first.slice(0, 2)).toEqual(['Critical', 'At Risk'])
  })
})
