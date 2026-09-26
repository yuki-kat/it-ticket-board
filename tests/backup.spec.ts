import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { openApp } from './helpers'

// Backup and restore: the file has the data in it, a bad file changes nothing, a good file replaces everything.

const TICKETS = 'it-ticket-kanban-v1'
const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key)

async function openBackup(page: Page) {
  await page.locator('.quick-settings-button').click()
  await expect(page.locator('.backup-settings')).toBeVisible()
}

async function downloadFile(page: Page, selector = '[data-backup-download]') {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator(selector).click()])
  const path = await download.path()
  return { name: download.suggestedFilename(), json: JSON.parse(readFileSync(path, 'utf8')) }
}

const chooseFile = (page: Page, name: string, content: string) =>
  page.locator('[data-backup-file]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(content) })

test.describe('Backup and restore', () => {
  test('downloads a dated file holding the tickets, assets, stock and settings', async ({ page }) => {
    await openApp(page)
    await page.evaluate(() => localStorage.setItem('it-ticket-kanban-screen-pattern-v1', 'grid'))
    await openBackup(page)
    const { name, json } = await downloadFile(page)
    expect(name).toMatch(/^it-ticket-board-backup-\d{4}-\d{2}-\d{2}\.json$/)
    expect(json.app).toBe('it-ticket-board')
    expect(json.format).toBe(1)
    expect(json.records.tickets.length).toBeGreaterThan(0)
    expect(json.counts.tickets).toBe(json.records.tickets.length)
    expect(json.settings['it-ticket-kanban-screen-pattern-v1']).toBe('grid')
    expect(json.settings).not.toHaveProperty(TICKETS)
  })

  test('shows the counts and, after a download, the time of the last backup', async ({ page }) => {
    await openApp(page)
    await openBackup(page)
    await expect(page.locator('[data-backup-last]')).toHaveText('Last backup: Never')
    const tickets = JSON.parse((await stored(page, TICKETS))!).length
    await expect(page.locator('[data-backup-counts]')).toContainText(`${tickets} tickets`)
    await downloadFile(page)
    await expect(page.locator('[data-backup-last]')).not.toHaveText('Last backup: Never')
  })

  test('a backup restores the data after everything was wiped', async ({ page }) => {
    await openApp(page)
    await openBackup(page)
    const { json } = await downloadFile(page)
    const before = await stored(page, TICKETS)
    await page.evaluate(() => { localStorage.clear() })
    await page.evaluate((k) => localStorage.setItem(k, '[]'), TICKETS)
    await page.reload()
    await openBackup(page)
    await chooseFile(page, 'backup.json', JSON.stringify(json))
    await expect(page.getByRole('dialog', { name: /Replace everything/ })).toBeVisible()
    await page.locator('[data-backup-confirm]').click()
    await expect(page.locator('.home-kpi-grid .home-kpi').first()).toBeVisible()
    expect(JSON.parse((await stored(page, TICKETS))!).map((t: { id: string }) => t.id)).toEqual(JSON.parse(before!).map((t: { id: string }) => t.id))
  })

  test('cancelling leaves the data as it was', async ({ page }) => {
    await openApp(page)
    await openBackup(page)
    const { json } = await downloadFile(page)
    json.records.tickets = json.records.tickets.slice(0, 1)
    const before = await stored(page, TICKETS)
    await chooseFile(page, 'backup.json', JSON.stringify(json))
    await expect(page.locator('.backup-compare')).toContainText('1 tickets')
    await page.locator('[data-backup-cancel]').click()
    await expect(page.locator('.backup-overlay')).toHaveCount(0)
    expect(await stored(page, TICKETS)).toBe(before)
  })

  test('restoring replaces tickets and settings, and the previous data is kept for undo', async ({ page }) => {
    await openApp(page)
    await openBackup(page)
    const { json } = await downloadFile(page)
    json.records.tickets = json.records.tickets.slice(0, 2)
    json.settings = { 'it-ticket-kanban-screen-pattern-v1': 'dots' }
    const original = JSON.parse((await stored(page, TICKETS))!).length
    await chooseFile(page, 'backup.json', JSON.stringify(json))
    await page.locator('[data-backup-confirm]').click()
    await expect(page.locator('.home-kpi-grid .home-kpi').first()).toBeVisible()
    expect(JSON.parse((await stored(page, TICKETS))!)).toHaveLength(2)
    expect(await stored(page, 'it-ticket-kanban-screen-pattern-v1')).toBe('dots')
    const undo = JSON.parse((await stored(page, 'it-ticket-kanban-before-restore-v1'))!)
    expect(undo.records.tickets).toHaveLength(original)
  })

  test('"Download current data first" saves the current data before anything is replaced', async ({ page }) => {
    await openApp(page)
    await openBackup(page)
    const { json } = await downloadFile(page)
    await chooseFile(page, 'backup.json', JSON.stringify(json))
    const current = await downloadFile(page, '[data-backup-download-current]')
    expect(current.json.records.tickets).toHaveLength(json.records.tickets.length)
    await expect(page.locator('.backup-overlay')).toBeVisible()
  })

  const bad: [string, string, RegExp][] = [
    ['text that is not JSON', 'hello', /could not be read/],
    ['a file from another program', JSON.stringify({ app: 'other', format: 1 }), /not made by the IT Ticket Board/],
    ['a newer format', JSON.stringify({ app: 'it-ticket-board', format: 99, records: {} }), /newer version/],
    ['tickets missing fields', JSON.stringify({ app: 'it-ticket-board', format: 1, records: { tickets: [{ id: 'T-1' }], assets: [], stock: [] } }), /has no title/],
    ['repeated ticket ids', JSON.stringify({ app: 'it-ticket-board', format: 1, records: { tickets: [{ id: 'T-1', title: 'a', status: 'New' }, { id: 'T-1', title: 'b', status: 'New' }], assets: [], stock: [] } }), /repeats the id/],
  ]
  for (const [label, content, message] of bad) {
    test(`rejects ${label} and changes nothing`, async ({ page }) => {
      await openApp(page)
      await openBackup(page)
      const before = await stored(page, TICKETS)
      await chooseFile(page, 'bad.json', content)
      await expect(page.locator('[data-backup-problems]')).toContainText(message)
      await expect(page.locator('.backup-overlay')).toHaveCount(0)
      expect(await stored(page, TICKETS)).toBe(before)
    })
  }
})
