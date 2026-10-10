import { expect, test, type Page } from '@playwright/test'
import { openApp } from './helpers'

// Quick actions page (#/quick): commands ranked by on-device usage learning (app/src/lib/usage.ts).

const USAGE_KEY = 'it-ticket-kanban-usage-v1'
const usage = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]').map((event: { c: string }) => event.c) as string[], USAGE_KEY)
const openQuick = (page: Page) => page.locator('.header-quick-button').click()

// Opens a ticket's summary popup, then its work notes, then closes: the habit the page should learn.
async function summaryThenNotes(page: Page, row: number) {
  await page.locator('.primary-nav button', { hasText: 'Tickets' }).click()
  await page.locator('.list-title-link').nth(row).click()
  await page.locator('.description-popup').getByRole('button', { name: 'Work notes' }).click()
  await expect(page.locator('.work-notes-popup')).toBeVisible()
  await page.keyboard.press('Escape')
}

test('starts with common commands before anything is learned', async ({ page }) => {
  await openApp(page)
  await openQuick(page)
  await expect(page).toHaveURL(/#\/quick$/)
  await expect(page.getByRole('heading', { name: 'Nothing learned yet' })).toBeVisible()
  await expect(page.locator('.quick-command')).toHaveCount(8)
  expect(await usage(page)).toEqual([]) // opening the page itself is not a command
})

test('ranks used commands and suggests what usually comes next', async ({ page }) => {
  await openApp(page)
  await summaryThenNotes(page, 0)
  await summaryThenNotes(page, 1)
  await openQuick(page)

  const top = page.locator('.quick-section', { has: page.getByRole('heading', { name: 'Your top commands' }) })
  await expect(top.locator('.quick-command', { hasText: 'Work notes' })).toContainText('Used 2×')
  await expect(top.locator('.quick-command', { hasText: 'Ticket summary' })).toContainText('Used 2×')

  // After opening another summary, Work notes is the predicted next step (2 of 2 times so far).
  await page.locator('.primary-nav button', { hasText: 'Tickets' }).click()
  await page.locator('.list-title-link').nth(2).click()
  await page.keyboard.press('Escape')
  await openQuick(page)
  const next = page.locator('.quick-grid-next .quick-command').first()
  await expect(next).toContainText('Work notes')
  await expect(next).toContainText('2 of 2 times')
})

test('runs a ticket command on the chosen ticket', async ({ page }) => {
  await openApp(page)
  await openQuick(page)
  await page.getByLabel('Working on').selectOption('OPS-101')
  await page.locator('.quick-command', { hasText: 'Set to In Progress' }).click()
  await expect(page.locator('.quick-notice')).toHaveText('Set to In Progress · OPS-101')
  const status = await page.evaluate(() => JSON.parse(localStorage.getItem('it-ticket-kanban-v1') || '[]').find((ticket: { id: string }) => ticket.id === 'OPS-101').status)
  expect(status).toBe('In Progress')
  expect(await usage(page)).toEqual(['status:In Progress'])
})

test('pausing stops learning and clearing asks first', async ({ page }) => {
  await openApp(page)
  await summaryThenNotes(page, 0)
  await openQuick(page)
  await page.getByRole('button', { name: 'Pause learning' }).click()
  await expect(page.locator('.quick-learned')).toHaveText('Learning paused')
  const before = (await usage(page)).length
  await summaryThenNotes(page, 1)
  expect((await usage(page)).length).toBe(before)

  await openQuick(page)
  await page.getByRole('button', { name: 'Resume learning' }).click()
  await page.getByRole('button', { name: 'Clear history' }).click()
  await page.getByRole('button', { name: 'Keep' }).click()
  expect((await usage(page)).length).toBe(before)
  await page.getByRole('button', { name: 'Clear history' }).click()
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  expect(await usage(page)).toEqual([])
  await expect(page.getByRole('heading', { name: 'Nothing learned yet' })).toBeVisible()
})
