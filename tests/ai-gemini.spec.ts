import { expect, test, type Page, type Route } from '@playwright/test'
import { openApp } from './helpers'

async function askAI(page: Page) {
  await page.locator('.primary-nav button', { hasText: 'Tickets' }).click()
  await page.locator('.list-title-link').first().click()
  await page.getByText('Open full ticket').first().click()
  const panel = page.locator('.record-overlay')
  await panel.getByRole('button', { name: 'Find resolution' }).click()
  await page.getByRole('button', { name: 'Search AI' }).click()
  return panel.locator('.ticket-search-results')
}

const reply = (status: number, body: object) => (route: Route) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

test.describe('Find resolution (Gemini via the backend)', () => {
  test.beforeEach(async ({ page }) => openApp(page))

  test('sends the sign-in token and shows the answer', async ({ page }) => {
    let authorization = ''
    await page.route('**/api/gemini', (route) => {
      authorization = route.request().headers().authorization || ''
      return reply(200, { text: '1. Restart the VPN client', model: 'gemini-test' })(route)
    })
    await expect(await askAI(page)).toContainText('1. Restart the VPN client')
    expect(authorization).toMatch(/^Bearer \S+/)
  })

  test('explains a missing sign-in', async ({ page }) => {
    await page.route('**/api/gemini', reply(401, { error: 'Missing authentication token' }))
    await expect(await askAI(page)).toContainText('Sign in on the hosted site to use AI suggestions.')
  })

  test('shows the server reason when Gemini is busy', async ({ page }) => {
    await page.route('**/api/gemini', reply(503, { error: 'Gemini is busy right now. Try again in a minute.' }))
    await expect(await askAI(page)).toContainText('Gemini is busy right now. Try again in a minute.')
  })

  test('explains when there is no server to reach', async ({ page }) => {
    await page.route('**/api/gemini', (route) => route.abort('connectionrefused'))
    await expect(await askAI(page)).toContainText('Could not reach the AI server')
  })
})
