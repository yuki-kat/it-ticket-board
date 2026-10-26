import { expect, test, type Page } from '@playwright/test'
import { openApp } from './helpers'

// The main navigation in the header used to run underneath the header buttons on narrower screens
// (at phone width "Escalation" was half hidden under Quick actions). Below 1340px it now has its own
// row under the logo and the buttons; from 1340px it sits beside them. 1300/1340 sit either side of that line.

type NavReport = { link: string; problem: string }[]

/** Every nav link that is cut off, covered, or touching a header button, with the reason. */
async function navProblems(page: Page): Promise<NavReport> {
  return page.evaluate(() => {
    const nav = document.querySelector('.primary-nav')!
    const actions = document.querySelector('.top-actions')!
    const navBox = nav.getBoundingClientRect()
    const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    const buttons = [actions, ...actions.children].map((child) => child.getBoundingClientRect()).filter((box) => box.width > 0 && box.height > 0)
    const problems: { link: string; problem: string }[] = []
    for (const link of nav.querySelectorAll('button')) {
      const box = link.getBoundingClientRect()
      const name = link.textContent ?? ''
      if (box.width === 0 || box.height === 0) problems.push({ link: name, problem: 'not shown' })
      else if (box.left < -0.5 || box.right > window.innerWidth + 0.5) problems.push({ link: name, problem: 'runs off the screen' })
      else if (box.left < navBox.left - 0.5 || box.right > navBox.right + 0.5) problems.push({ link: name, problem: 'cut off by the nav' })
      else if (buttons.some((button) => overlaps(box, button))) problems.push({ link: name, problem: 'overlaps a header button' })
      else if (!link.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))) problems.push({ link: name, problem: 'covered by something else' })
    }
    return problems
  })
}

const pageScrollsSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)

/** The header buttons (sync badge, Quick actions, Tools, Settings, New ticket) all sit on one line. */
const headerButtonsOnOneLine = (page: Page) => page.locator('.top-actions').evaluate((actions) => {
  const tops = [...actions.children].map((child) => child.getBoundingClientRect()).filter((box) => box.width > 0 && box.height > 0).map((box) => box.top + box.height / 2)
  return Math.max(...tops) - Math.min(...tops) <= 2
})

for (const width of [320, 390, 600, 768, 1024, 1240, 1300, 1340, 1440]) {
  test.describe(`Header at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } })
    test.beforeEach(async ({ page }) => openApp(page))

    test('every nav link is fully visible, clickable and clear of the header buttons', async ({ page }) => {
      await expect(page.locator('.primary-nav button')).toHaveCount(6) // Home, Tickets, Search, Inventory, Escalation, KB
      expect(await navProblems(page)).toEqual([])
      expect(await headerButtonsOnOneLine(page)).toBe(true)
      expect(await pageScrollsSideways(page)).toBe(false)
    })

    test('the last link opens its page without scrolling the nav first', async ({ page }) => {
      const kb = page.locator('.primary-nav button').last()
      await expect(kb).toHaveText('KB')
      const box = (await kb.boundingBox())!
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await expect(kb).toHaveAttribute('aria-current', 'page')
      await expect(page).toHaveURL(/#\/kb$/)
    })
  })
}

test.describe('Header with room to grow', () => {
  test.use({ viewport: { width: 390, height: 800 } })
  test.beforeEach(async ({ page }) => openApp(page))

  test('if links ever outgrow the row, the row scrolls instead of the page', async ({ page }) => {
    await page.locator('.primary-nav').evaluate((nav) => { for (const name of ['Reports', 'Assets', 'Changes']) { const link = document.createElement('button'); link.textContent = name; nav.append(link) } })
    const nav = await page.locator('.primary-nav').evaluate((element) => ({ scrolls: element.scrollWidth > element.clientWidth, overflowX: getComputedStyle(element).overflowX }))
    expect(nav).toEqual({ scrolls: true, overflowX: 'auto' })
    expect(await pageScrollsSideways(page)).toBe(false)
  })
})

// On the hosted site a sync badge ("Saved to <workspace>", up to 240px) joins the header buttons.
for (const width of [700, 1024, 1300, 1340, 1440]) {
  test.describe(`Header with a sync badge at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } })
    test.beforeEach(async ({ page }) => openApp(page))

    test('the badge shortens instead of covering the nav or pushing the buttons onto two lines', async ({ page }) => {
      const headerHeight = await page.locator('.topbar').evaluate((header) => header.getBoundingClientRect().height)
      await page.locator('.top-actions').evaluate((actions) => {
        actions.querySelector('.saved')?.remove()
        const badge = document.createElement('button')
        badge.className = 'sync-badge sync-saved'
        badge.innerHTML = '<i></i><span>Saved to Service Desk EMEA workspace</span>'
        actions.prepend(badge)
      })
      expect(await navProblems(page)).toEqual([])
      expect(await headerButtonsOnOneLine(page)).toBe(true)
      expect(await page.locator('.topbar').evaluate((header) => header.getBoundingClientRect().height)).toBe(headerHeight)
      for (const button of await page.locator('.top-actions > button, .header-tools-trigger').all()) {
        expect(await button.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      }
      expect(await pageScrollsSideways(page)).toBe(false)
    })
  })
}
