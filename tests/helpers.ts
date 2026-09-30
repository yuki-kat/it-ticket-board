import { expect, type Locator, type Page } from '@playwright/test'

export type PageName = 'Home' | 'Tickets' | 'Inventory'

/** Creates a valid JWT-like test token that can be parsed */
function createTestToken() {
  const payload = {
    user_id: 'test-user',
    email: 'test@example.com',
    name: 'Test User',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400
  }
  // Create a simple JWT: header.payload.signature
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payloadB64 = btoa(JSON.stringify(payload))
  const signature = 'test-signature'
  return `${header}.${payloadB64}.${signature}`
}

/** Opens the app with a fresh browser profile, so the sample data is seeded from scratch. */
export async function openApp(page: Page) {
  // Set up test auth in localStorage before loading the page
  const testToken = createTestToken()
  const testUser = { id: 'test-user', name: 'Test User', email: 'test@example.com' }

  // Inject auth directly into localStorage before page loads, clear data to start fresh
  await page.addInitScript(({ token, user }) => {
    // Clear all data keys to reset to sample data
    localStorage.removeItem('it-ticket-kanban-v1')
    localStorage.removeItem('it-ticket-kanban-deleted-v1')
    localStorage.removeItem('it-ticket-kanban-view-v1')
    localStorage.removeItem('it-ticket-kanban-home-widgets-v1')
    localStorage.removeItem('it-ticket-kanban-inventory-v1')
    localStorage.removeItem('ops-kanban-home-insight-order-v1')
    // Set up test auth
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
  }, { token: testToken, user: testUser })

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
