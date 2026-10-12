import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

// Binboard look: brand, the Tickets view switcher, the animated logo, and the Kanban Detailed card layout.

test('the page and header carry the Binboard name and logo', async ({ page }) => {
  await openApp(page)
  await expect(page).toHaveTitle('Binboard')
  const home = page.locator('.brand-home-button')
  await expect(home).toHaveAccessibleName('Go to home')
  await expect(home.locator('.bb-mark')).toBeVisible()
  await expect(home.locator('.bb-wordmark')).toHaveText('Binboard')
})

test('the segmented switcher changes the ticket view', async ({ page }) => {
  await openApp(page)
  await page.locator('.primary-nav button', { hasText: 'Tickets' }).click()
  const views = page.getByRole('group', { name: 'View' })
  await expect(views.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await views.getByRole('button', { name: 'Kanban detailed', exact: true }).click()
  await expect(page.locator('.lane').first()).toBeVisible()
  await expect(views.getByRole('button', { name: 'Kanban detailed', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

// Regression: the description column was a fixed 280px beside a ~190px card, squeezing titles to zero width.
test('Kanban Detailed cards give the title real width', async ({ page }) => {
  await openApp(page)
  await page.locator('.primary-nav button', { hasText: 'Tickets' }).click()
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Kanban detailed', exact: true }).click()
  const title = page.locator('.ticket-card h3').first()
  await expect(title).toBeVisible()
  const box = await title.boundingBox()
  expect(box!.width).toBeGreaterThan(100)
  expect(box!.height).toBeLessThan(120)
})

test('clicking the hero logo moves a card to the next lane', async ({ page }) => {
  await openApp(page)
  const mark = page.getByRole('button', { name: 'Binboard logo: click to move a card' })
  const lanes = () => mark.locator('.bb-card').evaluateAll((cards) => cards.map((card) => (card as SVGElement).style.transform))
  const before = await lanes()
  await mark.click()
  const after = await lanes()
  expect(after).not.toEqual(before)
  expect(after.filter((t) => t.startsWith('translate(28px')).length).toBe(3) // lane 2 now holds three cards
})
