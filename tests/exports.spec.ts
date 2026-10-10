import { expect, test, type Download, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { openApp } from './helpers'
async function toolsMenu(page: Page, name: RegExp | string) {
  await page.locator('.header-tools-trigger').click()
  const button = page.getByRole('button', { name: typeof name === 'string' ? name : name })
  await expect(button).toBeVisible({ timeout: 10000 })
  await button.click()
}
async function collect(page: Page, action: () => Promise<void>, count: number): Promise<Download[]> {
  const downloads: Download[] = []
  page.on('download', (download) => downloads.push(download))
  await action()
  await expect.poll(() => downloads.length).toBe(count)
  return downloads
}
async function text(download: Download) { return (await readFile((await download.path())!, 'utf8')).replace(/^﻿/, '') }
// Counts record breaks outside quoted cells, so multi-line work notes stay one row.
const dataRows = (csv: string) => {
  let rows = 0
  let quoted = false
  for (const char of csv.trim()) {
    if (char === '"') quoted = !quoted
    else if (char === '\n' && !quoted) rows++
  }
  return rows
}

test.describe('Exports (source)', () => {
  test.beforeEach(async ({ page }) => openApp(page))

  test('the Tickets page has an Export CSV button that exports the filtered tickets', async ({ page }) => {
    await page.locator('.primary-nav button', { hasText: 'Tickets' }).click()
    const button = page.locator('.export-csv-button')
    await expect(button).toHaveAttribute('title', /Export 66 tickets matching the current filters as CSV/)
    const [download] = await collect(page, () => button.click(), 1)
    expect(download.suggestedFilename()).toMatch(/^tickets-\d{4}-\d{2}-\d{2}\.csv$/)
    const csv = await text(download)
    expect(csv.split(/\r?\n/)[0]).toContain('Short description')
    expect(dataRows(csv)).toBe(66)
  })

  test('the Tickets Export CSV button is styled (a compact button, not bare text)', async ({ page }) => {
    await page.locator('.primary-nav button', { hasText: 'Tickets' }).click()
    const style = await page.locator('.export-csv-button').evaluate((element) => { const css = getComputedStyle(element); return { display: css.display, height: css.height, borderStyle: css.borderTopStyle, fontSize: css.fontSize } })
    expect(style).toEqual({ display: 'flex', height: '35px', borderStyle: 'solid', fontSize: '10px' })
  })

  test('the Tickets Export CSV follows the search filter', async ({ page }) => {
    await page.locator('.primary-nav button', { hasText: 'Tickets' }).click()
    await page.locator('input[aria-label="Search tickets, people, tags"]').fill('OPS-101')
    await expect(page.locator('.export-csv-button')).toHaveAttribute('title', /Export 1 tickets? matching/)
    const [download] = await collect(page, () => page.locator('.export-csv-button').click(), 1)
    expect(dataRows(await text(download))).toBe(1)
  })

  test('Tools > "All inventory CSV" downloads every asset and stock item as two files', async ({ page }) => {
    await page.locator('.primary-nav button', { hasText: 'Inventory' }).click()
    const downloads = await collect(page, async () => {
      await toolsMenu(page, 'All inventory')
      await page.getByRole('button', { name: /CSV spreadsheet/ }).click()
    }, 2)
    const files = Object.fromEntries(await Promise.all(downloads.map(async (d) => [d.suggestedFilename().replace(/-\d{4}-\d{2}-\d{2}/, ''), await text(d)])))
    expect(Object.keys(files).sort()).toEqual(['inventory-assets.csv', 'inventory-stock.csv'])
    expect(dataRows(files['inventory-assets.csv'])).toBe(12)
    expect(dataRows(files['inventory-stock.csv'])).toBe(5)
    expect(files['inventory-assets.csv'].split(/\r?\n/)[0]).toContain('Device health')
  })

  test('Tools > "All inventory Excel" downloads one workbook with an Assets and a Stock sheet', async ({ page }) => {
    await page.locator('.primary-nav button', { hasText: 'Inventory' }).click()
    const [download] = await collect(page, async () => {
      await toolsMenu(page, 'All inventory')
      await page.getByRole('button', { name: /Excel spreadsheet/ }).click()
    }, 1)
    expect(download.suggestedFilename()).toMatch(/^inventory-\d{4}-\d{2}-\d{2}\.xlsx$/)
    const bytes = (await readFile((await download.path())!)).toString('latin1') // the writer stores parts uncompressed
    expect(bytes.startsWith('PK')).toBe(true)
    for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) expect(bytes).toContain(part)
    expect(bytes).toContain('<sheet name="Assets" sheetId="1"')
    expect(bytes).toContain('<sheet name="Stock" sheetId="2"')
    expect(bytes).toContain('DL7450-21084') // an asset serial, so the sheet really has data
    expect(bytes).toContain('USB-C charging cable') // a stock item
  })

  test('Tools > Export Excel still exports the tickets', async ({ page }) => {
    const [download] = await collect(page, () => toolsMenu(page, /Tickets · Excel/), 1)
    expect(download.suggestedFilename()).toMatch(/^tickets-\d{4}-\d{2}-\d{2}\.xlsx$/)
  })

  test('on the Inventory page, Tools > Export CSV exports the current tab', async ({ page }) => {
    await page.locator('.primary-nav button', { hasText: 'Inventory' }).click()
    const [download] = await collect(page, async () => {
      await toolsMenu(page, 'Filtered assets/stock')
      await page.getByRole('button', { name: /CSV spreadsheet/ }).click()
    }, 1)
    expect(download.suggestedFilename()).toMatch(/^inventory-assets-/)
  })
})
