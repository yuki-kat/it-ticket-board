import { expect, test, type Page } from '@playwright/test'
import { openApp } from './helpers'

// "Suggest fix" in the ticket record panel asks the site's /api/suggest-fix (a Vercel function that calls Gemini).
// The tests stand in for that function, so they need no key and make no request to Google.

const openRecord = async (page: Page) => {
  await openApp(page)
  await page.locator('.home-hero button', { hasText: 'Explore tickets' }).click()
  await page.locator('[data-queue="priority"]').click()
  await page.locator('.explore-list li button').first().click()
  await page.locator('.explore-detail .primary-button', { hasText: 'Open full record' }).click()
  await expect(page.locator('.ticket-record-panel')).toBeVisible()
}

test.describe('Suggest fix (Gemini)', () => {
  test('sends the ticket without personal details and shows causes, steps and when to escalate', async ({ page }) => {
    let sent: Record<string, unknown> = {}
    await page.route('**/api/suggest-fix', async (route) => {
      sent = route.request().postDataJSON()
      await route.fulfill({ json: { likelyCauses: ['Cached credentials are stale'], steps: ['Clear Credential Manager', 'Restart Outlook'], escalateIf: 'Sign-in logs show a block' } })
    })
    await openRecord(page)
    const section = page.locator('.ai-suggest-fix')
    await section.getByRole('button', { name: 'Suggest fix' }).click()
    await expect(section.locator('ol li')).toHaveText(['Clear Credential Manager', 'Restart Outlook'])
    await expect(section.locator('ul li')).toHaveText(['Cached credentials are stale'])
    await expect(section).toContainText('Sign-in logs show a block')
    const title = await page.locator('.ticket-record-panel .record-header p').innerText()
    expect(sent.title).toBe(title)
    expect(Object.keys(sent).sort()).toEqual(['assignmentGroup', 'description', 'recordType', 'severity', 'tags', 'title'])
  })

  test('shows the server message when Gemini is busy, and Try again asks again', async ({ page }) => {
    let calls = 0
    await page.route('**/api/suggest-fix', async (route) => {
      calls += 1
      if (calls === 1) await route.fulfill({ status: 503, json: { error: 'Gemini is busy right now. Try again in a minute.' } })
      else await route.fulfill({ json: { likelyCauses: [], steps: ['Reboot the laptop'], escalateIf: '' } })
    })
    await openRecord(page)
    const section = page.locator('.ai-suggest-fix')
    await section.getByRole('button', { name: 'Suggest fix' }).click()
    await expect(section.locator('.is-error')).toHaveText('Gemini is busy right now. Try again in a minute.')
    await section.getByRole('button', { name: 'Try again' }).click()
    await expect(section.locator('ol li')).toHaveText(['Reboot the laptop'])
    expect(calls).toBe(2)
  })

  test('explains that suggestions need the hosted site when there is no server', async ({ page }) => {
    await page.route('**/api/suggest-fix', (route) => route.fulfill({ status: 404, body: 'Not found' }))
    await openRecord(page)
    await page.locator('.ai-suggest-fix').getByRole('button', { name: 'Suggest fix' }).click()
    await expect(page.locator('.ai-suggest-fix .is-error')).toContainText('hosted site only')
  })
})
