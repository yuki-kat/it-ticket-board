import { expect, test, type Page } from '@playwright/test'
import { openApp } from './helpers'

// Legal hold (app/src/lib/legalHold.ts): a flag on devices and tickets that blocks destructive actions
// (issue, repair, retire, delete) but still allows collecting, moving and recording as lost.

async function openInventory(page: Page) {
  await openApp(page)
  await page.locator('.primary-nav button', { hasText: 'Inventory' }).click()
  await expect(page.locator('.inventory-table tbody tr').first()).toBeVisible()
}

async function openAsset(page: Page, id: string) {
  await page.locator('.inventory-table .inventory-id', { hasText: id }).click()
  await expect(page.locator('#asset-detail-title')).toBeVisible()
}

const detail = (page: Page) => page.locator('.inventory-detail-panel')

test('sample data has three held devices, counted, badged and filterable', async ({ page }) => {
  await openInventory(page)
  const kpi = page.locator('.legal-hold-kpi')
  await expect(kpi).toContainText('3')
  await kpi.click()
  await expect(page.locator('.inventory-table tbody tr')).toHaveCount(3)
  for (const id of ['AST-1007', 'AST-1010', 'AST-1011']) await expect(page.locator('.inventory-table tbody tr', { hasText: id }).locator('.legal-hold-badge')).toBeVisible()
  await page.locator('.inventory-filters-button').click()
  await expect(page.getByLabel('Filter asset status')).toHaveValue('Legal hold')
})

test('a held device shows the banner and blocks assign, repair and retire', async ({ page }) => {
  await openInventory(page)
  await openAsset(page, 'AST-1010')
  const banner = detail(page).locator('.legal-hold-banner')
  await expect(banner).toContainText('On legal hold')
  await expect(banner).toContainText('Case HR-2026-031')
  for (const name of ['Assign', 'Send for repair', 'Retire asset']) await expect(detail(page).getByRole('button', { name })).toBeDisabled()
  await expect(detail(page).getByRole('button', { name: 'Move' })).toBeEnabled()
  await expect(detail(page).getByRole('button', { name: 'Mark lost' })).toBeEnabled()

  // Returning is allowed, but only into storage: In Repair is not offered.
  await detail(page).getByRole('button', { name: 'Return' }).click()
  const returnPanel = page.locator('.inventory-action-panel')
  await expect(returnPanel).toBeVisible()
  const options = await returnPanel.locator('select option').allInnerTexts()
  expect(options).not.toContain('In Repair')
})

test('placing and releasing a hold needs the details and writes history', async ({ page }) => {
  await openInventory(page)
  await openAsset(page, 'AST-1003')
  await expect(detail(page).locator('.legal-hold-banner')).toHaveCount(0)
  await detail(page).getByRole('button', { name: 'Place legal hold…' }).click()
  await detail(page).getByRole('button', { name: 'Place hold' }).click()
  await expect(detail(page).locator('.legal-hold-error')).toHaveText('Enter the case or matter reference.')

  await detail(page).getByLabel('Case or matter reference').fill('LIT-2026-099')
  await detail(page).getByLabel('Reason').fill('Preserve for the vendor audit')
  await detail(page).getByLabel('Placed by').fill('Test Admin')
  await detail(page).getByRole('button', { name: 'Place hold' }).click()
  await expect(detail(page).locator('.legal-hold-banner')).toContainText('Case LIT-2026-099')
  await expect(detail(page).getByRole('button', { name: 'Assign' })).toBeDisabled()
  await expect(detail(page)).toContainText('Legal hold placed')

  await detail(page).getByRole('button', { name: 'Release hold…' }).click()
  await detail(page).getByRole('button', { name: 'Release hold', exact: true }).click()
  await expect(detail(page).locator('.legal-hold-error')).toContainText('Add a note')
  await detail(page).getByLabel('Release note').fill('Audit closed, approved by Legal')
  await detail(page).getByLabel('Released by').fill('Test Admin')
  await detail(page).getByRole('button', { name: 'Release hold', exact: true }).click()
  await expect(detail(page).locator('.legal-hold-banner')).toHaveCount(0)
  await expect(detail(page)).toContainText('Legal hold released')
  await expect(detail(page).getByRole('button', { name: 'Assign' })).toBeEnabled()
})

test('a leaver hand-over sends held devices to storage instead of the new holder', async ({ page }) => {
  await openInventory(page)
  await page.getByRole('button', { name: 'Leaver transfer' }).click()
  const panel = page.locator('.inventory-transfer-panel')
  await panel.locator('label', { hasText: 'Person leaving' }).locator('select').selectOption('Aiko Tanaka')
  await expect(panel.locator('.inventory-transfer-assets')).toContainText('on legal hold, goes to storage instead')
  await panel.getByLabel('New holder').fill('Ken Sato')
  await panel.getByLabel('Issued by').fill('Test Admin')
  await panel.getByRole('button', { name: /^Transfer \d+ asset/ }).click()
  await expect(page.getByText(/AST-1010 (is|are) on legal hold, so (it was|they were) collected to/)).toBeVisible()

  await openAsset(page, 'AST-1010')
  await expect(detail(page).locator('.legal-hold-banner')).toBeVisible()
  const assignment = detail(page).locator('.inventory-detail-section', { hasText: 'Current assignment' })
  await expect(assignment).toContainText('Not assigned')
  await expect(assignment).not.toContainText('Ken Sato')
  await expect(detail(page)).toContainText('collected to storage instead of being handed to Ken Sato')
})

test('a held ticket cannot be deleted until the hold is released', async ({ page }) => {
  await openApp(page)
  await page.locator('.primary-nav button', { hasText: 'Tickets' }).click()
  const firstId = page.locator('.list-ticket-id').first()
  const ticketId = (await firstId.innerText()).trim()
  await firstId.click()
  const record = page.locator('.ticket-hold-wrap.is-idle')
  await record.getByRole('button', { name: 'Place legal hold…' }).click()
  await record.getByLabel('Case or matter reference').fill('EDS-2026-010')
  await record.getByLabel('Reason').fill('Relevant to the e-discovery request')
  await record.getByLabel('Placed by').fill('Test Admin')
  await record.getByRole('button', { name: 'Place hold' }).click()
  await expect(page.locator('.ticket-hold-wrap .legal-hold-banner')).toContainText('Case EDS-2026-010')
  await expect(page.locator('.list-ticket-id', { hasText: ticketId }).locator('xpath=..').locator('.legal-hold-badge')).toBeVisible()

  // The activity log records the hold.
  await expect(page.locator('body')).toContainText('Legal hold placed')

  // On the Kanban cards the delete button is disabled while held.
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Open all ticket views' }).click()
  await page.getByRole('button', { name: 'Kanban Detailed', exact: true }).click()
  const card = page.locator('.card-top', { hasText: ticketId }).locator('xpath=..')
  await expect(card.locator('.legal-hold-badge')).toBeVisible()
  await expect(card.getByTitle('On legal hold: it cannot be deleted')).toBeDisabled()
  await page.getByRole('button', { name: 'Open all ticket views' }).click()
  await page.getByRole('button', { name: 'List View', exact: true }).click()
  await page.locator('.list-ticket-id', { hasText: ticketId }).click()

  await page.locator('.ticket-hold-wrap .legal-hold-banner').getByRole('button', { name: 'Release hold…' }).click()
  await page.locator('.ticket-hold-wrap').getByLabel('Release note').fill('Request withdrawn')
  await page.locator('.ticket-hold-wrap').getByLabel('Released by').fill('Test Admin')
  await page.locator('.ticket-hold-wrap').getByRole('button', { name: 'Release hold', exact: true }).click()
  await expect(page.locator('.ticket-hold-wrap .legal-hold-banner')).toHaveCount(0)
  await expect(page.locator('body')).toContainText('Legal hold released')
})
