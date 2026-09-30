import { expect, test, type Page } from '@playwright/test'
import { goTo, kpiCard, openApp } from './helpers'

// The small extras around the edges of the app: page arrows, Settings, the corner ×, All Views,
// screen patterns and the debug log. These run against both index.html and the React source.

async function openTools(page: Page, item: RegExp) {
  await page.locator('.header-tools-trigger').click()
  await page.getByRole('button', { name: item }).first().click()
}

test.describe('Quick page arrows', () => {
  test.beforeEach(async ({ page }) => openApp(page))

  test('name the pages they lead to', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Quick page navigation' })
    await expect(nav.getByRole('button', { name: 'Previous page: Inventory' })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Next page: Tickets' })).toBeVisible()
    await nav.getByRole('button', { name: 'Next page: Tickets' }).click()
    await expect(page.locator('.primary-nav button.active')).toHaveText('Tickets')
    await expect(nav.getByRole('button', { name: 'Previous page: Home' })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Next page: Search' })).toBeVisible()
  })

  test('go round Home, Tickets and Inventory and back to Home', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Quick page navigation' })
    const seen: string[] = []
    for (let step = 0; step < 5; step++) {
      await nav.getByRole('button', { name: /^Next page/ }).click()
      seen.push((await page.locator('.primary-nav button.active').innerText()).trim())
    }
    expect(seen).toEqual(['Tickets', 'Search', 'Inventory', 'Home', 'Tickets'])
    await nav.getByRole('button', { name: /^Previous page/ }).click()
    await expect(page.locator('.primary-nav button.active')).toHaveText('Home')
  })
})

test.describe('Settings and dialogs', () => {
  test.beforeEach(async ({ page }) => openApp(page))

  test('the Settings button in the header opens Settings', async ({ page }) => {
    await page.getByRole('button', { name: 'Customize home' }).click()
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  })

  const dialogs: [string, (page: Page) => Promise<void>, RegExp, string, boolean][] = [
    ['Settings', async (page) => page.getByRole('button', { name: 'Customize home' }).click(), /Settings/, 'Close settings', true],
    ['Reports', (page) => openTools(page, /^Reports/), /Reports|Operations report|Report/, 'Close reports', true],
    ['the Escalation matrix', (page) => openTools(page, /^Escalation matrix/), /Escalation/, 'Close matrix', true],
    ['a new task', async (page) => page.getByRole('button', { name: 'New task' }).click(), /Create a task/, 'Close form', false],
  ]
  for (const [name, open, title, closeLabel, isDialog] of dialogs) {
    test(`${name} closes with Escape`, async ({ page }) => {
      await open(page)
      const content = isDialog ? page.getByRole('dialog').first() : page.locator('.new-task-page')
      await expect(content).toBeVisible()
      await expect(content).toContainText(title)
      await page.keyboard.press('Escape')
      if (isDialog) {
        await expect(page.getByRole('dialog')).toHaveCount(0)
      } else {
        await expect(page.locator('.new-task-page')).toHaveCount(0)
      }
    })
    test(`${name} has a round × in the corner of the screen`, async ({ page }) => {
      if (!isDialog) return // new-task-page doesn't have overlay corner button, only internal close button
      await open(page)
      const close = page.getByRole('button', { name: 'Close popup' })
      await expect(close).toBeVisible()
      const box = await close.boundingBox()
      expect(box!.x + box!.width).toBeGreaterThan(1280 - 40) // right edge
      expect(box!.y).toBeLessThan(40) // top edge
      await close.click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    })
  }

  test('a ticket record closes with Escape and with the corner ×', async ({ page }) => {
    for (const close of [() => page.keyboard.press('Escape'), () => page.getByRole('button', { name: 'Close ticket details' }).click()]) {
      await page.locator('.home-recent-card .home-recent-list button').first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await close()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }
  })
})

test.describe('All Views', () => {
  test.beforeEach(async ({ page }) => { await openApp(page); await goTo(page, 'Tickets') })

  test('the picker lists every view in groups and marks the current one', async ({ page }) => {
    await page.getByRole('button', { name: 'Open all ticket views' }).click()
    const dialog = page.getByRole('dialog', { name: 'Choose a view' })
    await expect(dialog).toBeVisible()
    expect(await dialog.locator('.views-group h3').allTextContents()).toEqual(['Records', 'Kanban', 'Personal'])
    expect(await dialog.locator('.views-option').count()).toBe(5)
    await expect(dialog.locator('.views-option.current')).toHaveCount(1)
    await expect(dialog.locator('.views-option.current')).toHaveText('List View')
  })

  test('choosing a view switches to it and closes the picker', async ({ page }) => {
    await page.getByRole('button', { name: 'Open all ticket views' }).click()
    await page.getByRole('button', { name: 'Kanban Compact', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Choose a view' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Open all ticket views' }).click()
    await expect(page.locator('.views-option.current')).toHaveText('Kanban Compact')
  })

  test('closes with × and with a click outside', async ({ page }) => {
    for (const close of [() => page.getByRole('button', { name: 'Close views' }).click(), () => page.locator('.views-modal').click({ position: { x: 4, y: 4 } })]) {
      await page.getByRole('button', { name: 'Open all ticket views' }).click()
      await expect(page.getByRole('dialog', { name: 'Choose a view' })).toBeVisible()
      await close()
      await expect(page.getByRole('dialog', { name: 'Choose a view' })).toHaveCount(0)
    }
  })

  test('the View selector offers the same views', async ({ page }) => {
    // The view selector is in Settings; navigate to Home and open Settings
    await goTo(page, 'Tickets')
    await page.locator('.brand-home-button').click()
    await page.getByRole('button', { name: 'Customize home' }).click()
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
    const selectElement = page.locator('.settings-view-label select')
    await expect(selectElement).toBeVisible()
    const options = await selectElement.locator('option').allInnerTexts()
    expect(options.length).toBeGreaterThan(0)
    expect(options).toContain('List View')
  })
})

test.describe('Screen pattern', () => {
  test('Settings offers four patterns; choosing one changes the background and is remembered', async ({ page }) => {
    await openApp(page)
    await expect(page.locator('html')).toHaveAttribute('data-screen-pattern', 'plain')
    await page.getByRole('button', { name: 'Customize home' }).click()
    const options = page.locator('.screen-pattern-option')
    expect(await options.locator('b').allInnerTexts()).toEqual(['Plain', 'Dot grid', 'Fine lines', 'Blueprint'])
    await expect(options.filter({ hasText: 'Plain' })).toHaveClass(/active/)
    await options.filter({ hasText: 'Dot grid' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-screen-pattern', 'dots')
    await expect(options.filter({ hasText: 'Dot grid' })).toHaveClass(/active/)
    await expect(options.filter({ hasText: 'Plain' })).not.toHaveClass(/active/)
    expect(await page.evaluate(() => localStorage.getItem('it-ticket-kanban-screen-pattern-v1'))).toBe('dots')
    const background = await page.locator('.app-shell').evaluate((element) => getComputedStyle(element).backgroundImage)
    expect(background).toContain('radial-gradient')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-screen-pattern', 'dots')
  })
})

test.describe('Debug log', () => {
  const panel = (page: Page) => page.getByRole('region', { name: 'Debug log' })

  test('is off until asked for, and ?debug turns it on', async ({ page }) => {
    await openApp(page)
    await expect(panel(page)).toHaveCount(0)
    await page.goto('/index.html?debug')
    await expect(page.locator('.home-kpi-grid .home-kpi').first()).toBeVisible()
    await expect(panel(page)).toBeVisible()
  })

  test('Ctrl+Shift+D turns it on and off, and it stays on after a reload', async ({ page }) => {
    await openApp(page)
    await page.keyboard.press('Control+Shift+D')
    await expect(panel(page)).toBeVisible()
    await page.reload()
    await expect(panel(page)).toBeVisible()
    await page.keyboard.press('Control+Shift+D')
    await expect(panel(page)).toHaveCount(0)
    await page.reload()
    await expect(panel(page)).toHaveCount(0)
  })

  test('logs clicks, opened and closed popups, and page changes', async ({ page }) => {
    await openApp(page)
    await page.goto('/index.html?debug')
    await expect(panel(page)).toBeVisible()
    await kpiCard(page, 'Open tickets').click()
    await expect(panel(page).locator('li.click', { hasText: 'Open tickets' }).first()).toBeVisible()
    await expect(panel(page).locator('li.popup', { hasText: 'opened: Open tickets' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(panel(page).locator('li.popup', { hasText: 'closed: Open tickets' })).toBeVisible()
    await goTo(page, 'Tickets')
    await expect(panel(page).locator('li.page', { hasText: 'Home → Tickets' }).or(panel(page).locator('li.page', { hasText: 'home → board' }))).toBeVisible()
  })

  test('Clear empties the log and Turn off hides it', async ({ page }) => {
    await openApp(page)
    await page.goto('/index.html?debug')
    await kpiCard(page, 'Open tickets').click()
    await expect(panel(page).locator('li').first()).toBeVisible()
    await panel(page).getByRole('button', { name: 'Clear' }).click()
    await expect(panel(page).locator('li')).toHaveCount(0)
    await panel(page).getByRole('button', { name: 'Turn off' }).click()
    await expect(panel(page)).toHaveCount(0)
  })
})
