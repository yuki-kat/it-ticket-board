import { expect, test, type Page } from '@playwright/test'
import { openApp } from './helpers'

// Time with team (OLA): per-team clocks and handoff history that never reset the customer's SLA.
// Sample data: OPS-101 is Escalated with Database Operations after a stay with the Service Desk.

const saved = (page: Page, id: string) => page.evaluate((ticketId) => JSON.parse(localStorage.getItem('it-ticket-kanban-v1') || '[]').find((ticket: { id: string }) => ticket.id === ticketId), id)

async function openTicket(page: Page, id: string) {
  await openApp(page)
  await page.locator('.primary-nav button', { hasText: 'Tickets' }).click()
  await page.locator('.task-table tbody tr', { hasText: id }).locator('td').nth(1).click()
  await expect(page.locator('.record-overlay')).toBeVisible()
  return page.locator('.team-handoffs')
}

test('list rows show how long the current team has had each open ticket', async ({ page }) => {
  await openApp(page)
  await page.locator('.primary-nav button', { hasText: 'Tickets' }).click()
  await expect(page.locator('.task-table tbody tr', { hasText: 'OPS-101' }).locator('.team-clock')).toHaveText(/^With team (<1m|\d+[mhd])/)
})

test('the full ticket shows the handoff history', async ({ page }) => {
  const section = await openTicket(page, 'OPS-101')
  await expect(section.locator('.team-handoffs-head')).toContainText('1 handoff')
  const rows = section.locator('tbody tr')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Service Desk')
  await expect(rows.nth(1)).toContainText('Database Operations')
  await expect(rows.nth(1)).toContainText('Now')
})

test('reassigning starts the new team clock without resetting the customer SLA', async ({ page }) => {
  const section = await openTicket(page, 'OPS-101')
  const before = await saved(page, 'OPS-101')
  await section.getByLabel('Reassign to').selectOption('Infrastructure')

  await expect(section.locator('.team-handoffs-head')).toContainText('2 handoffs')
  await expect(section.locator('tbody tr').last()).toContainText('Infrastructure')
  const after = await saved(page, 'OPS-101')
  expect(after.assignmentGroup).toBe('Infrastructure')
  expect(after.createdAt).toBe(before.createdAt) // the customer SLA counts from creation, so it did not restart
  expect(after.teamHistory.map((segment: { group: string; to?: string }) => [segment.group, !!segment.to])).toEqual([['Service Desk', true], ['Database Operations', true], ['Infrastructure', false]])
})

test('Reports shows time per team and how many tickets changed team', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Tools' }).click()
  await page.getByRole('button', { name: /Reports/ }).click()
  const section = page.locator('.report-section', { has: page.getByRole('heading', { name: 'Time per team' }) })
  await expect(section).toContainText(/tickets? (was|were) handed between teams/)
  await expect(section.locator('tbody tr', { hasText: 'Service Desk' })).toBeVisible()
})
