import { expect, test, type Page, type Route } from '@playwright/test'
import { openApp } from './helpers'

type Team = { id: string; name: string; slug: string; role: 'admin' | 'member' }
const TEAM_ID = '11111111-1111-4111-8111-111111111111'
const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

// A small fake backend for the team pages; `teams` changes when a team is created.
async function fakeBackend(page: Page, start: { teams: Team[] }) {
  const state = { teams: [...start.teams], authorization: '', thresholds: [] as Array<Record<string, unknown>>, savedThresholds: null as unknown }
  await page.route('**/api/**', (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace(/^\/api/, '')
    const method = request.method()
    if (path === '/teams') {
      state.authorization = request.headers().authorization || ''
      if (method === 'POST') {
        const team: Team = { id: TEAM_ID, name: request.postDataJSON().name, slug: 'service-desk', role: 'admin' }
        state.teams.push(team)
        return json(route, 201, team)
      }
      return json(route, 200, state.teams)
    }
    if (path.endsWith('/members') && method === 'POST') {
      const email = request.postDataJSON().email
      if (email === 'nobody@example.com') return json(route, 404, { error: 'No account uses that email. Ask them to sign up first.' })
      return json(route, 201, { id: 'u2', name: 'Mo Member', email, role: 'member' })
    }
    if (path.endsWith('/members')) return json(route, 200, [{ id: 'u1', name: 'Test User', email: 'test@example.com', role: state.teams[0]?.role ?? 'admin' }])
    if (path.endsWith('/assignment-groups')) return json(route, 200, [{ id: 'g1', name: 'Network Team', group_type: 'support', contact_type: 'email_group', contact_address: 'net@example.com', timezone: 'UTC', member_count: 0, on_call_count: 0 }])
    if (path.endsWith('/escalation-rules')) return json(route, 200, [])
    if (path.endsWith('/escalation-thresholds') && method === 'PUT') {
      state.savedThresholds = request.postDataJSON().thresholds
      state.thresholds = (state.savedThresholds as Array<Record<string, unknown>>).filter((row) => row.tier_1_minutes !== null || row.tier_2_minutes !== null)
      return json(route, 200, state.thresholds)
    }
    if (path.endsWith('/escalation-thresholds')) return json(route, 200, state.thresholds)
    return json(route, 404, { error: 'Not found' })
  })
  return state
}

const THRESHOLD_ROW = (priority: string, tier1: number | null, tier2: number | null) => ({ ticket_type: 'incident', priority, tier_1_minutes: tier1, tier_2_minutes: tier2 })

async function openEscalation(page: Page) {
  await page.locator('.primary-nav button', { hasText: 'Escalation' }).click()
}

test.describe('Team pages', () => {
  test('signed out: asks the user to sign in', async ({ page }) => {
    await page.goto('/index.html#/escalation')
    await expect(page.getByText('Sign in to manage team settings')).toBeVisible()
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.locator('input[type="email"]')).toBeVisible()
  })

  test('first visit: creates a team, sending the sign-in token', async ({ page }) => {
    await openApp(page)
    const backend = await fakeBackend(page, { teams: [] })
    await openEscalation(page)
    await expect(page.getByText('Create your team')).toBeVisible()
    expect(backend.authorization).toMatch(/^Bearer \S+/)
    await page.getByLabel('Team name').fill('Service Desk')
    await page.getByRole('button', { name: 'Create team' }).click()
    await expect(page.getByText('Service Desk', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Members' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New Group' })).toBeVisible()
  })

  test('admin: adds a member by email and sees server errors', async ({ page }) => {
    await openApp(page)
    await fakeBackend(page, { teams: [{ id: TEAM_ID, name: 'Service Desk', slug: 'service-desk', role: 'admin' }] })
    await openEscalation(page)
    await page.getByRole('button', { name: 'Members' }).click()
    const email = page.getByPlaceholder('colleague@company.com')
    await email.fill('nobody@example.com')
    await page.getByRole('button', { name: 'Add member' }).click()
    await expect(page.getByRole('alert')).toHaveText('No account uses that email. Ask them to sign up first.')
    await email.fill('mo@example.com')
    await page.getByRole('button', { name: 'Add member' }).click()
    await expect(email).toHaveValue('')
  })

  test('member: settings are read-only', async ({ page }) => {
    await openApp(page)
    await fakeBackend(page, { teams: [{ id: TEAM_ID, name: 'Service Desk', slug: 'service-desk', role: 'member' }] })
    await openEscalation(page)
    await expect(page.getByText('Network Team')).toBeVisible()
    await expect(page.getByText('only team admins can change these settings')).toBeVisible()
    await expect(page.getByRole('button', { name: 'New Group' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Edit Network Team' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Members' }).click()
    await expect(page.getByPlaceholder('colleague@company.com')).toHaveCount(0)
  })

  test('admin: saves recommended time thresholds in minutes', async ({ page }) => {
    await openApp(page)
    const backend = await fakeBackend(page, { teams: [{ id: TEAM_ID, name: 'Service Desk', slug: 'service-desk', role: 'admin' }] })
    await openEscalation(page)
    await page.getByRole('button', { name: 'Time Thresholds' }).click()
    await page.getByRole('button', { name: 'Use recommended values' }).click()
    await page.getByRole('button', { name: 'Save incident thresholds' }).click()
    await expect(page.getByRole('status')).toHaveText('Saved')
    expect(backend.savedThresholds).toEqual([THRESHOLD_ROW('critical', 30, 60), THRESHOLD_ROW('high', 240, 1440), THRESHOLD_ROW('medium', 1440, 4320), THRESHOLD_ROW('low', 4320, 7200)])
    await expect(page.getByLabel('critical tier 2 to 3 unit')).toHaveValue('h')
  })

  test('member: time thresholds are read-only', async ({ page }) => {
    await openApp(page)
    const backend = await fakeBackend(page, { teams: [{ id: TEAM_ID, name: 'Service Desk', slug: 'service-desk', role: 'member' }] })
    backend.thresholds = [THRESHOLD_ROW('critical', 30, 60)]
    await openEscalation(page)
    await page.getByRole('button', { name: 'Time Thresholds' }).click()
    await expect(page.getByRole('table')).toContainText('30 min')
    await expect(page.getByRole('table')).toContainText('1 hour')
    await expect(page.locator('input[type="number"]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Save/ })).toHaveCount(0)
  })
})
