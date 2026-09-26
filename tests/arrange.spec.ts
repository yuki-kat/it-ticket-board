import { expect, test } from '@playwright/test'
import { goTo, insightOrder, openApp, openInsight } from './helpers'

test.describe('Arranging insight cards', () => {
  test.beforeEach(async ({ page }) => openApp(page))

  test('"Arrange card" moves a card to the end and the order is kept', async ({ page }) => {
    const before = await insightOrder(page)
    const first = before[0]
    await openInsight(page, first)
    await page.locator('.insight-detail-arrange').click()
    await expect(page.locator('#insight-move-title')).toHaveText(first)
    await page.locator('[data-move="last"]').click()
    await expect(page.locator('.insight-move-overlay')).toHaveCount(0)
    const after = await insightOrder(page)
    expect(after.at(-1)).toBe(first)
    expect(after).toHaveLength(before.length)

    await goTo(page, 'Tickets')
    await goTo(page, 'Home')
    // The cards are put back a moment after Home reappears, so wait for the order to settle.
    await expect.poll(() => insightOrder(page)).toEqual(after)
  })

  test('the order survives a reload', async ({ page }) => {
    const first = (await insightOrder(page))[0]
    await openInsight(page, first)
    await page.locator('.insight-detail-arrange').click()
    await page.locator('[data-move="last"]').click()
    const moved = await insightOrder(page)
    await page.reload()
    await expect(page.locator('.home-chart-grid > .home-chart-card').first()).toBeVisible()
    await expect.poll(() => insightOrder(page)).toEqual(moved)
  })
})
