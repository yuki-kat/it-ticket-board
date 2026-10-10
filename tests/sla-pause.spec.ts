import { expect, test, type Page } from '@playwright/test'
import { openApp } from './helpers'

async function openTicket(page: Page, status: string, ticketId?: string) {
  const id = ticketId || await page.evaluate((wanted) => JSON.parse(localStorage.getItem('it-ticket-kanban-v1') || '[]').find((t: { status: string }) => t.status === wanted).id, status)
  await page.locator('.primary-nav button', { hasText: 'Tickets' }).click()
  await page.locator('tbody tr', { hasText: id }).locator('.list-title-link').click()
  await page.getByText('Open full ticket').first().click()
  return { id, panel: page.locator('.record-overlay') }
}

const resolutionTime = (page: Page) => page.locator('.record-overlay div', { has: page.locator('span', { hasText: /^Resolution Time$/ }) }).last().locator('span').last()

test.describe('SLA pause (browser)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install()
    await openApp(page)
  })

  test('manual pause freezes the clock and logs pause and resume to work notes', async ({ page }) => {
    const { panel } = await openTicket(page, 'In Progress')
    await panel.getByRole('button', { name: 'Pause SLA timer' }).click()
    const frozen = await resolutionTime(page).innerText()
    await page.clock.fastForward(5 * 60_000)
    await expect(resolutionTime(page)).toHaveText(frozen)
    await expect(panel).toContainText('SLA timer paused')
    await panel.getByRole('button', { name: 'Resume SLA timer' }).click()
    await expect(panel).toContainText(/SLA timer resumed \(paused for 5m \d+s\)/)
  })

  test('Waiting on User pauses the clock automatically with a note', async ({ page }) => {
    const { panel } = await openTicket(page, 'Waiting on User')
    await expect(panel).toContainText('Paused · waiting on user')
    await expect(panel).toContainText('System - SLA timer paused automatically - waiting on user')
    const frozen = await resolutionTime(page).innerText()
    await page.clock.fastForward(5 * 60_000)
    await expect(resolutionTime(page)).toHaveText(frozen)
  })

  test('leaving Waiting on User resumes the clock and logs how long it was paused', async ({ page }) => {
    const { id } = await openTicket(page, 'Waiting on User')
    await page.clock.fastForward(3 * 60_000)
    await page.evaluate((ticketId) => {
      const tickets = JSON.parse(localStorage.getItem('it-ticket-kanban-v1') || '[]')
      tickets.find((t: { id: string }) => t.id === ticketId).status = 'In Progress'
      localStorage.setItem('it-ticket-kanban-v1', JSON.stringify(tickets))
    }, id)
    await page.reload()
    const { panel } = await openTicket(page, 'In Progress', id)
    await expect(panel).toContainText(/SLA timer resumed automatically - status changed to In Progress \(paused for 3m \d+s\)/)
  })

  test('Resolved stops the clock', async ({ page }) => {
    const { panel } = await openTicket(page, 'Resolved')
    await expect(panel).toContainText('Stopped · resolved')
    await expect(panel).toContainText('SLA clock stopped - ticket resolved')
  })
})
