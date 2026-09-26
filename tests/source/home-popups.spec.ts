import { expect, test } from '@playwright/test'
import { attentionButton, kpiCard, numberIn, openApp } from '../helpers'

// Checks that only make sense for the React version of the Home popups.

test.describe('Home popups (source)', () => {
  test.beforeEach(async ({ page }) => openApp(page))

  test('a card popup is a modal dialog named after the card, and holds focus', async ({ page }) => {
    await kpiCard(page, 'P1 / P2 open').click()
    const dialog = page.getByRole('dialog', { name: 'P1 / P2 open' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(dialog).toBeFocused()
    await expect(dialog).toContainText('TICKET OVERVIEW')
    await expect(dialog).toContainText('Current total based on the tickets stored in this workspace.')
  })

  test('focus goes back to the card after Escape, Close and ×', async ({ page }) => {
    const card = kpiCard(page, 'Open tickets')
    for (const close of [
      () => page.keyboard.press('Escape'),
      () => page.locator('.ticket-card-popout-cancel').click(),
      () => page.locator('.ticket-card-popout-close').click(),
    ]) {
      await card.click()
      await expect(page.locator('.ticket-card-popout')).toBeVisible()
      await close()
      await expect(page.locator('.ticket-card-popout')).toHaveCount(0)
      await expect(card).toBeFocused()
    }
  })

  test('a card opens from the keyboard', async ({ page }) => {
    await kpiCard(page, 'Closed tickets').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Closed tickets' })).toBeVisible()
  })

  test('the Needs-attention popup shows its own label, count and explanation', async ({ page }) => {
    const expected = await numberIn(attentionButton(page, 'Waiting on user'))
    await attentionButton(page, 'Waiting on user').click()
    const dialog = page.getByRole('dialog', { name: 'Waiting on user' })
    await expect(dialog).toContainText('NEEDS ATTENTION')
    await expect(dialog).toContainText('Current total based on the active ticket queues in this workspace.')
    await expect(dialog.locator('.attention-popout-card b')).toHaveText(String(expected))
  })

  test('the Explore launcher is a labelled dialog and returns focus to the button', async ({ page }) => {
    const button = page.locator('.home-hero button', { hasText: 'Explore tickets' })
    await button.click()
    await expect(page.getByRole('dialog', { name: 'Choose a ticket queue' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.locator('.ticket-card-popout')).toHaveCount(0)
    await expect(button).toBeFocused()
  })

  test('the popup counts follow the tickets: they update after a ticket is resolved', async ({ page }) => {
    const before = await numberIn(kpiCard(page, 'Open tickets'))
    await page.evaluate(() => {
      const tickets = JSON.parse(localStorage.getItem('it-ticket-kanban-v1') || '[]')
      tickets.find((ticket: { status: string }) => ticket.status !== 'Resolved').status = 'Resolved'
      localStorage.setItem('it-ticket-kanban-v1', JSON.stringify(tickets))
    })
    await page.reload()
    await expect(kpiCard(page, 'Open tickets')).toBeVisible()
    await kpiCard(page, 'Open tickets').click()
    await expect(page.locator('.ticket-card-popout .home-kpi strong')).toHaveText(String(before - 1))
  })
})
