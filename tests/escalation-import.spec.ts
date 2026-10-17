import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'
import { openApp } from './helpers'

// Tools → Escalation matrix → Import from Excel. The fixture is made up (see fixtures/make-escalation-matrix.py) and
// copies a real workbook's layout, including a decoy "Quick Search" sheet and placeholders like [Fill in].
const fixture = (name: string) => join(__dirname, 'fixtures', name)
const KEY = 'it-ticket-kanban-escalation-matrix-v1'

async function openMatrix(page: Page) {
  await page.locator('.header-tools-trigger').click()
  await page.locator('#header-tools-menu button', { hasText: /^Escalation matrix/ }).click()
  return page.locator('.matrix-panel')
}

test('importing a workbook fills the matrix with its priorities, routing and contacts', async ({ page }) => {
  await openApp(page)
  const panel = await openMatrix(page)
  await panel.getByLabel('Escalation matrix workbook').setInputFiles(fixture('escalation-matrix-sample.xlsx'))

  await expect(panel.getByRole('status')).toContainText('escalation-matrix-sample.xlsx')
  await expect(panel.getByRole('status')).toContainText('4 priorities, 3 ticket types, 5 contacts') // the Quick Search sheet is ignored
  const p2 = panel.locator('.severity-row', { hasText: 'P2' })
  await expect(p2).toContainText('A team cannot work')
  await expect(p2.locator('.sla-grid')).toContainText('20 min')
  await expect(p2.locator('.sla-grid')).toContainText('6 hours')
  await expect(p2).toContainText('After 1 hour') // notify manager

  const incident = panel.locator('.matrix-route', { hasText: 'Incident (IR) - General' })
  await expect(incident).toContainText('Desktop Engineer (Harbor Office)')
  await expect(incident.getByRole('link', { name: 'onsite@example.com' })).toBeVisible() // matched through the contact directory
  await expect(panel.locator('.matrix-route', { hasText: 'Security Incident' })).not.toContainText('[Confirm]')

  const contacts = panel.locator('.matrix-contact')
  await expect(contacts).toHaveCount(5)
  await expect(contacts.filter({ hasText: 'Service Desk' }).getByRole('link')).toHaveText(['help@example.com', 'desk@example.com'])
  await expect(contacts.filter({ hasText: 'Security Lead' })).toContainText('Riley Chen') // rich-text cell, runs joined
  await expect(contacts.filter({ hasText: 'Security Lead' })).toContainText('No email listed') // [Fill in] is not a link
  await expect(panel).not.toContainText('[Fill in]')
  await expect(panel).not.toContainText('Not available')
  await expect(panel.locator('.matrix-note')).toContainText('SLA timers on tickets keep the board')
})

test('the imported matrix stays after a reload, and "Use built-in matrix" brings back the defaults', async ({ page }) => {
  await openApp(page)
  let panel = await openMatrix(page)
  await panel.getByLabel('Escalation matrix workbook').setInputFiles(fixture('escalation-matrix-sample.xlsx'))
  await expect(panel.getByRole('status')).toContainText('escalation-matrix-sample.xlsx')

  await page.reload()
  panel = await openMatrix(page)
  await expect(panel.getByRole('status')).toContainText('escalation-matrix-sample.xlsx')
  await expect(panel.locator('.matrix-route')).toHaveCount(3)

  await panel.getByRole('button', { name: 'Use built-in matrix' }).click()
  await expect(panel.locator('.matrix-route')).toHaveCount(0)
  await expect(panel).toContainText('tier2@example.com')
  await expect(panel.locator('.matrix-note')).toContainText('built-in example matrix')
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull()
})

test('a file that is not an escalation matrix shows why and changes nothing', async ({ page }) => {
  await openApp(page)
  const panel = await openMatrix(page)
  const input = panel.getByLabel('Escalation matrix workbook')

  await input.setInputFiles(fixture('not-a-matrix.xlsx'))
  await expect(panel.getByRole('alert')).toContainText('No escalation matrix was found')
  await input.setInputFiles({ name: 'matrix.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('not really a workbook') })
  await expect(panel.getByRole('alert')).toContainText('not an Excel workbook')
  await input.setInputFiles({ name: 'matrix.csv', mimeType: 'text/csv', buffer: Buffer.from('Priority,Definition') })
  await expect(panel.getByRole('alert')).toContainText('Choose an Excel workbook (.xlsx)')

  await expect(panel).toContainText('tier2@example.com') // still the built-in matrix
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull()
})

test('escalating a ticket drafts the email with the imported contact and threshold', async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { opened: string[] }).opened = []; window.open = ((url: string) => { (window as unknown as { opened: string[] }).opened.push(String(url)); return null }) as typeof window.open })
  await openApp(page)
  const panel = await openMatrix(page)
  await panel.getByLabel('Escalation matrix workbook').setInputFiles(fixture('escalation-matrix-sample.xlsx'))
  await expect(panel.getByRole('status')).toContainText('escalation-matrix-sample.xlsx')
  await page.keyboard.press('Escape')

  await page.locator('.primary-nav button', { hasText: 'Tickets' }).click()
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Kanban detailed', exact: true }).click()
  const card = page.locator('article.ticket-card', { has: page.locator('.escalate-action') }).filter({ has: page.locator('.severity-badge', { hasText: 'P2' }) }).first()
  await expect(card.locator('.escalate-action')).toHaveAttribute('title', /Desktop Engineer \(Harbor Office\)/)
  await card.locator('.escalate-action').click()

  const opened = await page.evaluate(() => (window as unknown as { opened: string[] }).opened)
  expect(opened).toHaveLength(1)
  const draft = new URL(opened[0]).searchParams
  expect(draft.get('to')).toBe('onsite@example.com')
  expect(draft.get('body')).toMatch(/Tier 2 (escalation )?threshold in the matrix \(45 min\)/)
  expect(draft.get('body')).toContain('Matrix threshold: 45 min')
  expect(draft.get('body')).toContain('Hello Desktop Engineer (Harbor Office)')
})
