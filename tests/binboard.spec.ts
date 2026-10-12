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

// The build-time recolour must not touch Binboard's own stylesheets: MUI info blue sits inside its teal hue window.
test('P3 chips keep the info colours and kanban lanes keep 8px corners', async ({ page }) => {
  await openApp(page)
  await page.locator('.primary-nav button', { hasText: 'Tickets' }).click()
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Kanban detailed', exact: true }).click()
  await expect(page.locator('.lane').first()).toHaveCSS('border-top-left-radius', '8px')
  const p3 = page.locator('.severity-badge.p3').first()
  await expect(p3).toHaveCSS('background-color', 'rgba(2, 136, 209, 0.12)')
  await expect(p3).toHaveCSS('color', 'rgb(1, 87, 155)')
})

// The old dark-teal scrims are saturated enough to have mapped to blue; dialogs should sit on a neutral backdrop.
test('the All Views backdrop is neutral, not blue', async ({ page }) => {
  await openApp(page)
  await page.locator('.primary-nav button', { hasText: 'Tickets' }).click()
  await page.getByRole('button', { name: 'Open all ticket views' }).click()
  const backdrop = await page.locator('.views-modal').evaluate((element) => getComputedStyle(element).backgroundColor)
  const [r, g, b] = backdrop.match(/[\d.]+/g)!.map(Number)
  expect(r === g && g === b, backdrop).toBe(true)
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
