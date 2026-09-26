// Screenshots of the IT Ticket Board at desktop (1440x900) and phone (390x844) size.
//
// Run it from the repo's tests/ folder, so Playwright is found in tests/node_modules:
//   cd <repo>/tests && node <skill>/scripts/screenshots.mjs <path/to/index.html> <out-dir> [home,tickets,inventory,explore]
//
// Writes <out-dir>/<desktop|phone>-<page>.png and prints any page errors. Works on builds with page
// addresses (#/tickets …) and on older builds without them (it clicks the top menu instead).
import { createRequire } from 'node:module'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(resolve(process.cwd(), 'package.json'))
const { chromium } = require('@playwright/test')

const [file, out = 'shots', list = 'home,tickets,inventory,explore'] = process.argv.slice(2)
if (!file) { console.error('usage: node screenshots.mjs <index.html> <out-dir> [home,tickets,inventory,explore]'); process.exit(2) }
mkdirSync(out, { recursive: true })
const url = pathToFileURL(resolve(file)).href
const wanted = list.split(',').map((item) => item.trim()).filter(Boolean)
const NAV = { tickets: 'Tickets', inventory: 'Inventory' }

// Cloud sessions have a preinstalled Chromium; on a Mac, use the installed Google Chrome.
const launch = existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : { channel: 'chrome' }
const browser = await chromium.launch(launch)
const errors = []
for (const [size, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  for (const name of wanted) {
    const page = await browser.newPage({ viewport })
    page.on('pageerror', (error) => errors.push(`${size}/${name}: ${error.message}`))
    await page.goto(`${url}#/${name}`)
    await page.locator('.topbar').waitFor()
    if (name === 'explore' && !(await page.locator('.explore-page').count())) {
      const hero = page.locator('.home-hero button', { hasText: 'Explore tickets' })
      if (await hero.count()) await hero.click()
      if (!(await page.locator('.explore-page').count())) { console.log(`${size}/${name}: no Explore page in this build, skipped`); await page.close(); continue }
    }
    const nav = NAV[name] && page.locator('.primary-nav button', { hasText: NAV[name] })
    if (nav && !(await page.locator('.primary-nav button.active', { hasText: NAV[name] }).count())) await nav.click()
    await page.waitForTimeout(600)
    const path = `${out}/${size}-${name}.png`
    await page.screenshot({ path, fullPage: true })
    console.log('saved', path)
    await page.close()
  }
}
await browser.close()
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors')
