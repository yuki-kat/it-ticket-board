import { expect, type Locator, type Page } from '@playwright/test'

export type PageName = 'Home' | 'Tickets' | 'Inventory'

/** Opens the app with a fresh browser profile, so the sample data is seeded from scratch. */
export async function openApp(page: Page) {
  await page.goto('/index.html')
  await expect(page.locator('.home-kpi-grid .home-kpi').first()).toBeVisible()
}

export async function goTo(page: Page, name: PageName) {
  await page.locator('.primary-nav button', { hasText: name }).click()
  await expect(page.locator('.primary-nav button.active')).toHaveText(name)
}

/** A Ticket overview card on Home (Open tickets, Closed tickets, P1 / P2 open, Past resolution SLA). */
export function kpiCard(page: Page, label: string): Locator {
  return page.locator('.home-kpi', { has: page.locator('.home-kpi-label', { hasText: label }) })
}

/** A button in the "Needs attention" strip (Escalated, Escalation due, Waiting on user, Unassigned). */
export function attentionButton(page: Page, label: string): Locator {
  return page.locator('.home-action-strip button', { hasText: label })
}

export async function numberIn(locator: Locator, selector = 'strong, b'): Promise<number> {
  const text = await locator.locator(selector).first().innerText()
  return Number(text.match(/\d+/)?.[0])
}

/** How many tickets the Tickets page is currently showing ("10 of 16 records" or "16 records"). */
export async function ticketsShown(page: Page): Promise<number> {
  const text = await page.locator('.ticket-total').innerText()
  const match = text.match(/^(\d+)(?: of \d+)? records/)
  if (!match) throw new Error(`Unexpected ticket count text: "${text}"`)
  return Number(match[1])
}

export async function expectOnTicketsPage(page: Page) {
  await expect(page.locator('.primary-nav button.active')).toHaveText('Tickets')
}

/** A card in the Operations insights grid, found by its heading. */
export function insightCard(page: Page, title: string): Locator {
  return page.locator('.home-chart-grid > .home-chart-card', { has: page.getByRole('heading', { name: title, exact: true }) })
}

export async function openInsight(page: Page, title: string) {
  await insightCard(page, title).locator('.insight-click-target').click()
  await expect(page.locator('#insight-detail-title')).toHaveText(title)
}

export async function insightOrder(page: Page): Promise<string[]> {
  return page.locator('.home-chart-grid > .home-chart-card h3').allInnerTexts()
}
