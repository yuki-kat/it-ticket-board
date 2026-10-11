import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

// The loading screen in app/index.html, and the build step (app/scripts/inlinePage.mjs) that puts the app's
// 1 MB of styles and script after it, so it can show while they arrive.

test('the loading screen comes first in the page, before the app styles and script', async ({ request }) => {
  const html = await (await request.get('/index.html')).text()
  const loader = html.indexOf('class="boot"')
  const script = html.indexOf('<script type="module">')
  expect(loader).toBeGreaterThan(0)
  expect(loader).toBeLessThan(30_000) // only the head (icon, loader styles) comes before it
  expect(script).toBeGreaterThan(loader)
  expect(html.match(/<body>/g)).toHaveLength(1) // the build must not duplicate the page
})

test('the app replaces the loading screen once it starts', async ({ page }) => {
  await openApp(page)
  await expect(page.locator('.primary-nav')).toBeVisible()
  await expect(page.locator('.boot')).toHaveCount(0)
})

test('without the script, the loading screen stays and says what is happening', async ({ page, request }) => {
  const html = (await (await request.get('/index.html')).text()).replace(/<script type="module">[\s\S]*?<\/script>/, '')
  await page.route('**/index.html', (route) => route.fulfill({ contentType: 'text/html', body: html }))
  await page.goto('/index.html')
  await expect(page.locator('.boot')).toBeVisible()
  await expect(page.locator('.boot')).toContainText('Loading your board…')
})
