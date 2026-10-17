// Records the 2-minute Binboard guided tour as one continuous take, with an on-screen cursor, captions and
// title cards drawn inside the page. Usage: node record.mjs <index.html> <workbook.xlsx> <outdir>
import { chromium } from '../../../tests/node_modules/@playwright/test/index.mjs'
import { writeFileSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'

const [file, workbook, out] = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const context = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1, recordVideo: { dir: out, size: { width: 1440, height: 810 } } })
const page = await context.newPage()
const server = createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(readFileSync(file)) }).listen(4192, '127.0.0.1')
const providers = [
  { id: 'p1', kind: 'gemini', label: 'Google Gemini', model: 'gemini-2.5-flash', baseUrl: null, keyLast4: '7Q2k', isDefault: true, updatedAt: '2026-10-16T09:00:00Z' },
  { id: 'p2', kind: 'anthropic', label: 'Anthropic Claude', model: 'claude-sonnet', baseUrl: null, keyLast4: 'x9Ld', isDefault: false, updatedAt: '2026-10-16T09:00:00Z' },
  { id: 'p3', kind: 'openai_compatible', label: 'Local Ollama', model: 'llama3.1', baseUrl: 'http://ollama.internal:11434/v1', keyLast4: null, isDefault: false, updatedAt: '2026-10-16T09:00:00Z' },
]
await page.route('**/api/**', (route) => {
  const path = new URL(route.request().url()).pathname
  const body = path.endsWith('/ai/status') ? { configured: true, label: 'Google Gemini', kind: 'gemini', model: 'gemini-2.5-flash' }
    : path.endsWith('/ai/providers') ? { canSaveKeys: true, privateEndpointsAllowed: true, envGemini: false, providers }
    : { error: 'Not found' }
  return route.fulfill({ status: body.error ? 404 : 200, contentType: 'application/json', body: JSON.stringify(body) })
})
const t0 = Date.now()
const marks = []
const mark = (scene) => { marks.push({ scene, at: (Date.now() - t0) / 1000 }); console.log(scene, ((Date.now() - t0) / 1000).toFixed(1)) }

await page.addInitScript(() => {
  window.open = () => null // escalation drafts would open Outlook
  const LOGO = '<svg width="96" height="96" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="8" fill="#1976d2"/><rect x="11" y="11" width="12" height="42" rx="3" fill="#fff" fill-opacity=".25"/><rect x="26" y="11" width="12" height="42" rx="3" fill="#fff" fill-opacity=".25"/><rect x="41" y="11" width="12" height="42" rx="3" fill="#fff" fill-opacity=".25"/><rect x="13" y="15" width="8" height="7" rx="1.5" fill="#fff"/><rect x="13" y="26" width="8" height="7" rx="1.5" fill="#fff"/><rect x="13" y="37" width="8" height="7" rx="1.5" fill="#fff"/><rect x="28" y="15" width="8" height="7" rx="1.5" fill="#fff"/><rect x="28" y="26" width="8" height="7" rx="1.5" fill="#fff"/><rect x="43" y="15" width="8" height="7" rx="1.5" fill="#fff"/></svg>'
  const css = `
    #demo-cursor{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:transform .02s linear}
    #demo-cursor svg{filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))}
    .demo-ripple{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(25,118,210,.35);z-index:2147483646;pointer-events:none;animation:demo-ripple .5s ease-out forwards}
    @keyframes demo-ripple{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}
    #demo-caption{position:fixed;left:50%;bottom:34px;transform:translateX(-50%) translateY(12px);max-width:86vw;padding:12px 26px;border-radius:28px;background:rgba(13,33,61,.92);color:#fff;font:500 24px/1.35 Roboto,Helvetica,Arial,sans-serif;letter-spacing:.1px;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:2147483645;opacity:0;transition:opacity .35s ease,transform .35s ease;pointer-events:none}
    #demo-caption.on{opacity:1;transform:translateX(-50%) translateY(0)}
    #demo-card{position:fixed;inset:0;z-index:2147483644;display:grid;place-items:center;background:linear-gradient(120deg,#1565c0 0%,#1976d2 65%,#2a86e0 100%);color:#fff;font-family:Roboto,Helvetica,Arial,sans-serif;opacity:0;transition:opacity .45s ease;pointer-events:none;text-align:center}
    #demo-card.on{opacity:1}
    body.demo-card-on #demo-cursor{opacity:0}
    #demo-card .demo-brand span{text-transform:none;letter-spacing:-1px;color:#fff}
    #demo-card .inner{display:grid;justify-items:center;gap:18px;padding:0 60px}
    #demo-card .demo-brand{display:flex;align-items:center;gap:18px;font-size:64px;letter-spacing:-1px}
    #demo-card .demo-brand b{font-weight:700}
    #demo-card .demo-brand svg rect:first-child{fill:#fff;fill-opacity:.12}
    #demo-card h1{margin:0;font-size:46px;font-weight:500;letter-spacing:-.5px;line-height:1.15}
    #demo-card p{margin:0;font-size:26px;font-weight:400;opacity:.92;line-height:1.4}
    #demo-card .pill{display:inline-flex;align-items:center;gap:10px;margin-top:8px;padding:12px 24px;border-radius:30px;background:#fff;color:#1565c0;font-size:24px;font-weight:500}
    #demo-card .offer{display:grid;gap:10px}
    #demo-card .big{font-size:58px;font-weight:700;letter-spacing:-1px}
    #demo-card .term{margin:6px 0 0;padding:26px 34px;border-radius:10px;background:#0d213d;color:#e3eefa;font:400 22px/1.7 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-align:left;box-shadow:0 18px 40px rgba(0,0,0,.3);white-space:pre}
    #demo-card .term .dim{color:#90caf9}
    #demo-card .term .ok{color:#81c784}
  `
  const setup = () => {
    if (document.getElementById('demo-cursor')) return
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style)
    const cursor = document.createElement('div'); cursor.id = 'demo-cursor'
    cursor.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2.5l14.5 10.2-6.6 1.1 3.9 7.3-2.6 1.3-3.8-7.4L4.6 19.6z" fill="#fff" stroke="#0d213d" stroke-width="1.4" stroke-linejoin="round"/></svg>'
    document.body.appendChild(cursor)
    const caption = document.createElement('div'); caption.id = 'demo-caption'; document.body.appendChild(caption)
    const card = document.createElement('div'); card.id = 'demo-card'; document.body.appendChild(card)
    document.addEventListener('mousemove', (event) => { cursor.style.transform = `translate(${event.clientX - 3}px, ${event.clientY - 2}px)` }, true)
    document.addEventListener('mousedown', (event) => { const ripple = document.createElement('div'); ripple.className = 'demo-ripple'; ripple.style.left = event.clientX + 'px'; ripple.style.top = event.clientY + 'px'; document.body.appendChild(ripple); setTimeout(() => ripple.remove(), 600) }, true)
    window.__caption = (text) => { caption.classList.remove('on'); if (!text) return; setTimeout(() => { caption.textContent = text; caption.classList.add('on') }, text && caption.textContent ? 220 : 0) }
    window.__card = (kind) => {
      document.body.classList.toggle('demo-card-on', Boolean(kind))
      if (!kind) { card.classList.remove('on'); return }
      const cards = {
        title: `<div class="inner"><div class="demo-brand">${LOGO}<span><b>Bin</b>board</span></div><h1>A guided tour</h1><p>Tickets · SLAs · Escalation · Inventory · Legal hold · Knowledge base · AI</p></div>`,
        docker: `<div class="inner"><h1>Or self-host the full stack</h1><pre class="term"><span class="dim">$</span> git clone https://github.com/yuki-kat/it-ticket-board\n<span class="dim">$</span> cp .env.example .env\n<span class="dim">$</span> docker compose up -d --build\n<span class="ok">✔</span> board, API and Postgres on http://localhost:8080</pre></div>`,
        offer: `<div class="inner"><div class="demo-brand">${LOGO}<span><b>Bin</b>board</span></div><div class="offer"><div class="big">Free for 6 months</div><p>24/7 support agents — by phone or remotely</p></div><div class="pill">Start your free trial · it-ticket-board-frontend.onrender.com</div></div>`,
      }
      card.innerHTML = cards[kind]
      card.classList.add('on')
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup()
})

// registered after the catch-all /api route, so it wins (Playwright runs the newest matching route first)
await page.route('**/api/ai/kb-ask', (route) => setTimeout(() => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: 'Restart the Print Spooler service on the print server, clear the stuck files from the spool folder, then start the service again [KB-0002].', citations: ['KB-0002'], covered: true, provider: 'Google Gemini', model: 'gemini-2.5-flash' }) }), 900))
const hold = (ms) => page.waitForTimeout(ms)
const caption = (text) => page.evaluate((value) => window.__caption(value), text)
const card = (kind) => page.evaluate((value) => window.__card(value), kind)
let cursor = { x: 720, y: 470 }
async function moveTo(locator, steps = 22) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  await page.mouse.move(x, y, { steps })
  cursor = { x, y }
}
async function click(locator, steps) { await moveTo(locator, steps); await hold(120); await page.mouse.down(); await page.mouse.up(); await hold(250) }
const smooth = (selector, block = 'center') => page.evaluate(([sel, b]) => document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: b }), [selector, block])
const nav = (name) => click(page.locator('.primary-nav button', { hasText: name }))
const view = (name) => click(page.getByRole('group', { name: 'View' }).getByRole('button', { name, exact: true }))

await page.goto('http://127.0.0.1:4192/#/home')
await page.waitForTimeout(1200)
await page.mouse.move(cursor.x, cursor.y)

// 0 · Title
await card('title'); await hold(500); mark('title'); await hold(3600)
await card(null); await hold(400)

// 1 · Home
mark('home'); await caption('Sign in and see what needs attention: priorities, SLA risks and escalations.')
await hold(1600)
await click(page.locator('.home-hero .bb-animated'))
await hold(900)
await page.evaluate(() => window.scrollTo({ top: 560, behavior: 'smooth' })); await hold(700)
await caption('Operations insights show where work is piling up.'); await hold(2600)
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await hold(800)

// 2 · Tickets
mark('tickets'); await nav('Tickets'); await caption('Every ticket carries a live SLA countdown.'); await hold(2600)
await view('Kanban detailed'); await caption('Work on a Kanban board, with the SLA and next step on every card.'); await hold(1200)
await page.evaluate(() => window.scrollTo({ top: 320, behavior: 'smooth' })); await hold(2000)
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await hold(500)
await view('Split'); await caption('Or keep the list and the ticket side by side.'); await hold(2800)

// 3 · Full ticket and time with each team
mark('record'); await view('List')
await click(page.locator('.task-table tbody tr', { hasText: 'OPS-101' }).locator('td').nth(1))
await page.waitForSelector('.record-overlay'); await caption('Open any ticket for the full record: SLA, owner, history.'); await hold(2600)
await smooth('.team-handoffs'); await hold(600)
await caption('Time with each team shows exactly where a ticket waited.'); await hold(3000)
await page.keyboard.press('Escape'); await hold(500)

// 4 · Work notes handover
mark('handover'); await click(page.locator('.task-table tbody tr', { hasText: 'OPS-101' }).locator('.list-title-link'))
await hold(500)
await click(page.locator('.description-popup').getByRole('button', { name: 'Work notes' }))
await caption('Escalating? The handover is ready to copy into email or Teams.')
const note = page.locator('.work-notes-popup').getByLabel('Add a note')
await click(note); await page.keyboard.type('Replica restarted; lag back under 5 s. Handing to Tier 2 to confirm.', { delay: 14 })
await click(page.locator('.work-notes-popup').getByRole('button', { name: 'Add note' }))
await hold(1800)
await page.keyboard.press('Escape'); await hold(300)
if (await page.locator('.description-popup').isVisible()) { await page.keyboard.press('Escape'); await hold(300) }

// 5 · Escalation matrix from Excel
mark('import'); await caption('Already have an escalation matrix in Excel? Import it.')
await click(page.locator('.header-tools-trigger'))
await click(page.locator('#header-tools-menu button', { hasText: /^Escalation matrix/ }))
await hold(500)
const chooser = page.waitForEvent('filechooser')
await click(page.locator('.matrix-import-button'))
await (await chooser).setFiles(workbook)
await page.waitForSelector('.matrix-import-status[role=status]')
await hold(1000)
await page.evaluate(() => { const panel = document.querySelector('.matrix-panel'); const heading = [...panel.querySelectorAll('h3')].find((h) => h.textContent.includes('Routing')); panel.scrollTo({ top: heading.offsetTop - 70, behavior: 'smooth' }) })
await caption('Every ticket type is routed to the right team and contact.'); await hold(2800)
await page.keyboard.press('Escape'); await hold(400)

// 6 · Inventory and legal hold
mark('inventory'); await nav('Inventory'); await caption('Inventory is built in: every device, its health, and who has it.'); await hold(1500)
await click(page.getByRole('button', { name: /Quick scan/ }))
await click(page.getByPlaceholder('Scan or type, then press Enter')); await page.keyboard.type('DL7450-21084', { delay: 40 }); await page.keyboard.press('Enter')
await hold(2200)
await page.keyboard.press('Escape'); await hold(500)
mark('hold'); await click(page.locator('.inventory-table .inventory-id', { hasText: 'AST-1007' }))
await page.waitForSelector('.inventory-detail-panel .legal-hold-banner')
await smooth('.inventory-detail-panel .legal-hold-banner', 'start'); await hold(400)
await caption('Legal hold locks a device so it can’t be reissued, repaired or retired.'); await hold(3600)
await page.keyboard.press('Escape'); await hold(400)

// 7 · Knowledge base with AI
mark('kb'); await nav('KB'); await caption('A knowledge base that grows with every ticket you solve.'); await hold(2200)
const ask = page.getByPlaceholder(/Ask the knowledge base/)
await click(ask); await page.keyboard.type('printer jobs stuck in the queue', { delay: 30 })
await click(page.getByRole('button', { name: 'Ask', exact: true }))
await caption('Ask it a question and get an answer that cites its sources.')
await page.waitForSelector('.kb-answer .kb-inline-cite'); await hold(2600)
await click(page.locator('.kb-answer .kb-inline-cite', { hasText: 'KB-0002' })); await hold(2400)

// 8 · AI providers
mark('ai'); await click(page.locator('.header-tools-trigger'))
await click(page.locator('#header-tools-menu button', { hasText: /^AI providers/ }))
await caption('Bring your own AI: Gemini, OpenAI, Claude or a local model.'); await hold(3000)
await page.keyboard.press('Escape'); await hold(300)

// 9 · Self-host, then the offer
await caption(null); await card('docker'); await hold(400); mark('docker'); await hold(3600)
await card('offer'); await hold(400); mark('offer'); await hold(6500)
mark('end')

writeFileSync(out + '/marks.json', JSON.stringify(marks, null, 2))
const video = page.video()
await context.close()
server.close()
console.log('video:', await video.path())
await browser.close()
