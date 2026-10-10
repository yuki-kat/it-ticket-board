import { expect, test, type Page } from '@playwright/test'
import { openApp } from './helpers'

// Quick scan, bulk actions and leaver transfer on the Inventory page.
// Sample data: AST-1001 Keiko Mori, AST-1002 Mina Sato, AST-1003 Available, AST-1004 Jordan Lee, AST-1005 Sam Rivera.

async function openInventory(page: Page) {
  await openApp(page)
  await page.locator('.primary-nav button', { hasText: 'Inventory' }).click()
  await expect(page.locator('.inventory-table tbody tr').first()).toBeVisible()
}

const row = (page: Page, id: string) => page.locator('.inventory-table tbody tr', { has: page.locator('.inventory-id', { hasText: id }) })

async function historyOf(page: Page, id: string) {
  await row(page, id).locator('.inventory-id').click()
  const history = page.locator('.inventory-history')
  await expect(history).toBeVisible()
  const text = await history.innerText()
  await page.getByRole('button', { name: 'Close asset details' }).click()
  return text
}

test.describe('Inventory quick scan', () => {
  test('finds an asset by serial number, ignoring case', async ({ page }) => {
    await openInventory(page)
    await page.getByRole('button', { name: 'Quick scan' }).click()
    const code = page.getByLabel('Asset tag or serial number')
    await expect(code).toBeFocused()
    await code.fill('lnt14-58231')
    await code.press('Enter')
    await expect(page.locator('#asset-detail-title')).toHaveText('ThinkPad T14 laptop')
    await expect(page.locator('#scan-title')).toHaveCount(0)
  })

  test('check-in mode returns assets one scan after another', async ({ page }) => {
    await openInventory(page)
    await page.getByRole('button', { name: 'Quick scan' }).click()
    await page.getByRole('button', { name: 'Check in', exact: true }).first().click()
    await page.getByLabel('Return to').fill('Tokyo · IT storage')
    const code = page.getByLabel('Asset tag or serial number')
    const log = page.getByRole('list', { name: 'Scan results' }).locator('li')

    await code.fill('AST-1001')
    await code.press('Enter')
    await expect(log.first()).toContainText('checked in from Keiko Mori to Tokyo · IT storage')
    await expect(code).toHaveValue('')
    await expect(code).toBeFocused()

    await code.fill('DL2724-91837') // AST-1004's serial
    await code.press('Enter')
    await expect(log.first()).toContainText('AST-1004')
    await expect(log.first()).toHaveClass(/ok/)

    await code.fill('AST-1003')
    await code.press('Enter')
    await expect(log.first()).toContainText('is available, not assigned')
    await expect(log.first()).toHaveClass(/error/)

    await code.fill('NOPE-404')
    await code.press('Enter')
    await expect(log.first()).toContainText('No asset has that asset tag or serial number.')

    await page.keyboard.press('Escape')
    await expect(page.locator('#scan-title')).toHaveCount(0)
    await expect(row(page, 'AST-1001')).toContainText('Available')
    await expect(row(page, 'AST-1004')).toContainText('Available')
    expect(await historyOf(page, 'AST-1001')).toContain('Returned by Keiko Mori; moved to Tokyo · IT storage as Available (quick scan)')
  })
})

test.describe('Inventory bulk actions', () => {
  test('shift-click selects a range, and assets that cannot take the action are skipped', async ({ page }) => {
    await openInventory(page)
    await row(page, 'AST-1002').getByRole('checkbox').click()
    await row(page, 'AST-1005').getByRole('checkbox').click({ modifiers: ['Shift'] })
    for (const id of ['AST-1002', 'AST-1003', 'AST-1004', 'AST-1005']) await expect(row(page, id).getByRole('checkbox')).toBeChecked()
    await expect(row(page, 'AST-1001').getByRole('checkbox')).not.toBeChecked()
    const bar = page.getByRole('region', { name: 'Bulk actions' })
    await expect(bar).toContainText('4 selected')

    await bar.getByRole('button', { name: 'Return' }).click()
    await expect(page.locator('.inventory-bulk-summary')).toHaveText('3 of 4 selected assets can take this action. Skipped: AST-1003 (Available).')
    await page.getByRole('button', { name: 'Return 3 assets' }).click()
    await expect(page.locator('.inventory-notice')).toContainText("Returned 3 assets. Skipped 1 that couldn't take this action.")
    for (const id of ['AST-1002', 'AST-1004', 'AST-1005']) await expect(row(page, id)).toContainText('Available')
    await expect(bar).toHaveCount(0)
    expect(await historyOf(page, 'AST-1002')).toContain('(bulk action)')
  })

  test('the header checkbox selects every visible row and shows a partial selection', async ({ page }) => {
    await openInventory(page)
    const all = page.getByRole('checkbox', { name: 'Select all visible assets' })
    await row(page, 'AST-1001').getByRole('checkbox').click()
    expect(await all.evaluate((element: HTMLInputElement) => element.indeterminate)).toBe(true)
    await all.click()
    const count = await page.locator('.inventory-table tbody tr').count()
    await expect(page.getByRole('region', { name: 'Bulk actions' })).toContainText(`${count} selected`)
    await all.click()
    await expect(page.getByRole('region', { name: 'Bulk actions' })).toHaveCount(0)
  })

  test('retiring in bulk needs a reason', async ({ page }) => {
    await openInventory(page)
    await row(page, 'AST-1003').getByRole('checkbox').click()
    await page.getByRole('region', { name: 'Bulk actions' }).getByRole('button', { name: 'Retire' }).click()
    await page.getByRole('button', { name: 'Retire 1 asset' }).click()
    await expect(page.getByRole('alert')).toHaveText('Add a reason to the history.')
    await page.getByLabel('Reason *').fill('End of life')
    await page.getByRole('button', { name: 'Retire 1 asset' }).click()
    await expect(row(page, 'AST-1003')).toContainText('Retired')
  })
})

test.describe('Inventory leaver transfer', () => {
  test('moves everything one person has to someone else', async ({ page }) => {
    await openInventory(page)
    // Give Mina Sato a second asset through the normal Assign dialog.
    await row(page, 'AST-1003').locator('.inventory-id').click()
    await page.locator('.inventory-detail-actions').getByRole('button', { name: 'Assign' }).click()
    await page.getByPlaceholder('Person receiving the asset').fill('Mina Sato')
    await page.getByPlaceholder('Service desk person').fill('Service Desk')
    await page.getByPlaceholder('Office, floor, storage room…').fill('Tokyo · Remote')
    await page.getByRole('button', { name: 'Save change' }).click()
    await page.getByRole('button', { name: 'Close asset details' }).click()
    await expect(row(page, 'AST-1003')).toContainText('Mina Sato')

    await page.getByRole('button', { name: 'Leaver transfer' }).click()
    await page.getByLabel('Person leaving').selectOption('Mina Sato')
    const assets = page.locator('.inventory-transfer-assets input[type="checkbox"]')
    await expect(assets).toHaveCount(2)
    await expect(assets.nth(0)).toBeChecked()
    await expect(assets.nth(1)).toBeChecked()
    await page.getByLabel('New holder').fill('Keiko Mori')
    await page.getByLabel('Issued by').fill('Yuki')
    await page.getByRole('button', { name: 'Transfer 2 assets' }).click()

    await expect(page.locator('.inventory-notice')).toContainText('Moved 2 assets from Mina Sato to Keiko Mori.')
    await expect(row(page, 'AST-1002')).toContainText('Keiko Mori')
    await expect(row(page, 'AST-1003')).toContainText('Keiko Mori')
    expect(await historyOf(page, 'AST-1002')).toContain('Reassigned from Mina Sato to Keiko Mori by Yuki (leaver transfer)')
  })

  test('returns a leaver\'s assets to storage, and checks the form first', async ({ page }) => {
    await openInventory(page)
    await page.getByRole('button', { name: 'Leaver transfer' }).click()
    await page.getByLabel('Person leaving').selectOption('Sam Rivera')
    await page.getByText('Back to storage').click()
    await page.getByLabel('Storage location').fill('')
    await page.getByRole('button', { name: 'Transfer 1 asset' }).click()
    await expect(page.getByRole('alert')).toHaveText('Enter the asset location.')
    await page.getByLabel('Storage location').fill('Tokyo · IT storage')
    await page.getByRole('button', { name: 'Transfer 1 asset' }).click()
    await expect(page.locator('.inventory-notice')).toContainText('Moved 1 asset from Sam Rivera back to Tokyo · IT storage.')
    await expect(row(page, 'AST-1005')).toContainText('Available')
  })
})
