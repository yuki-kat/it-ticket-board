import { expect, test, type Page, type Route } from '@playwright/test'
import { openApp } from './helpers'

// Knowledge base page (#/kb) and Tools → AI providers. The server is mocked with page.route, so these check the
// browser side: local articles and search, what is sent to the AI routes, and how answers and errors are shown.

const reply = (body: object, status = 200) => (route: Route) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function openKb(page: Page) {
  await openApp(page)
  await page.locator('.primary-nav button', { hasText: 'KB' }).click()
  await expect(page).toHaveURL(/#\/kb$/)
  await expect(page.getByRole('heading', { name: 'Knowledge base' })).toBeVisible()
}

const items = (page: Page) => page.locator('.kb-items > li')
const askFor = async (page: Page, question: string) => {
  await page.getByPlaceholder(/Ask the knowledge base/).fill(question)
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
}

test('lists the sample articles and filters them by word, tag and status', async ({ page }) => {
  await openKb(page)
  await expect(items(page)).toHaveCount(6)
  await page.getByPlaceholder('Filter by word or tag').fill('printing')
  await expect(items(page)).toHaveCount(1)
  await expect(items(page).first()).toContainText('Clear a stuck print queue')
  await page.getByPlaceholder('Filter by word or tag').fill('')
  await page.getByRole('tab', { name: /Drafts/ }).click()
  await expect(items(page)).toHaveCount(1)
  await expect(items(page).first()).toContainText('KB-0006')
})

test('writing an article checks the required fields and keeps it after a reload', async ({ page }) => {
  await openKb(page)
  await page.getByRole('button', { name: 'New article' }).click()
  await page.getByLabel('Title').fill('Reset a forgotten BitLocker PIN')
  await page.getByRole('button', { name: 'Save article' }).click()
  await expect(page.locator('.kb-error')).toHaveText('Add at least one step, one per line.')
  await page.getByLabel(/^Steps/).fill('1. Look up the recovery key in the directory.\n2. Read it to the user.\n')
  await page.getByLabel(/^Tags/).fill('BitLocker, Encryption, bitlocker')
  await page.getByRole('button', { name: 'Save article' }).click()

  const reader = page.locator('.kb-reader')
  await expect(reader.getByRole('heading', { name: 'Reset a forgotten BitLocker PIN' })).toBeVisible()
  await expect(reader.locator('.kb-steps li')).toHaveText(['Look up the recovery key in the directory.', 'Read it to the user.'])
  await expect(reader.locator('.kb-tags li')).toHaveText(['bitlocker', 'encryption'])
  await expect(reader).toContainText('KB-0007')

  await page.reload()
  await expect(items(page)).toHaveCount(7)
})

test('Ask the KB sends only matching published articles and links the cited one', async ({ page }) => {
  let sent: { question: string; articles: { id: string }[] } | undefined
  await page.route('**/api/ai/kb-ask', (route) => {
    sent = route.request().postDataJSON()
    return reply({ answer: 'Restart the print spooler [KB-0002].', citations: ['KB-0002'], covered: true, provider: 'Test AI', model: 'test-model' })(route)
  })
  await openKb(page)
  await askFor(page, 'printer jobs stuck in the queue')

  const answer = page.locator('.kb-answer')
  await expect(answer).toContainText('Restart the print spooler')
  await expect(answer).toContainText('Answered by Test AI')
  expect(sent?.question).toBe('printer jobs stuck in the queue')
  expect(sent?.articles.map((article) => article.id)).toContain('KB-0002')
  expect(sent?.articles.map((article) => article.id)).not.toContain('KB-0006') // drafts are never sent

  await answer.locator('.kb-inline-cite', { hasText: 'KB-0002' }).click()
  await expect(page.locator('.kb-reader h2')).toHaveText('Clear a stuck print queue on a shared printer')
})

test('Ask the KB does not call the AI when no article matches, and shows matches when the AI fails', async ({ page }) => {
  let calls = 0
  await page.route('**/api/ai/kb-ask', (route) => { calls += 1; return reply({ error: 'Missing authentication token' }, 401)(route) })
  await openKb(page)
  await askFor(page, 'quantum flux capacitor')
  await expect(page.locator('.kb-answer')).toContainText('No published article matches')
  expect(calls).toBe(0)

  await askFor(page, 'vpn password')
  await expect(page.locator('.kb-answer .kb-error')).toHaveText('Sign in (Tools → Sign in) on the hosted site to use AI.')
  await expect(page.locator('.kb-matches')).toContainText('KB-0001')
  expect(calls).toBe(1)
})

test('drafting from a resolved ticket opens an AI draft that publishing clears', async ({ page }) => {
  let ticket: { number: string; title: string; workNotes: { text: string }[] } | undefined
  await page.route('**/api/ai/kb-draft', (route) => {
    ticket = route.request().postDataJSON().ticket
    return reply({ title: 'Clear a stuck level 4 print queue', summary: 'Restart the spooler.', symptoms: 'Jobs stuck.', cause: 'A stuck job.', steps: ['Restart the spooler.', 'Print a test page.'], tags: ['printing'], provider: 'Test AI', model: 'test-model' })(route)
  })
  await openKb(page)
  await page.getByRole('button', { name: 'Draft from ticket' }).click()
  const panel = page.locator('.kb-draft-panel')
  await panel.getByLabel('Resolved ticket').selectOption('OPS-112')
  await panel.getByRole('button', { name: 'Draft article' }).click()

  const editor = page.locator('.kb-editor')
  await expect(editor.getByLabel('Title')).toHaveValue('Clear a stuck level 4 print queue')
  await expect(editor.locator('.kb-ai-flag')).toContainText('AI draft')
  expect(ticket?.number).toBe('OPS-112')
  expect(ticket?.workNotes.map((note) => note.text).join(' ')).toContain('Queue cleared and a test page printed.')

  await editor.getByRole('button', { name: 'Save article' }).click()
  await expect(page.locator('.kb-reader .kb-ai-flag')).toContainText('Drafted by AI (Test AI) from OPS-112')
  await expect(items(page).first()).toContainText('AI draft')
  await page.locator('.kb-reader').getByRole('button', { name: 'Publish' }).click()
  await expect(page.locator('.kb-reader .kb-ai-flag')).toHaveCount(0)
  await expect(page.locator('.kb-reader .kb-status')).toHaveText('Published')
})

test('deleting an article asks first, in the page', async ({ page }) => {
  await openKb(page)
  await items(page).filter({ hasText: 'KB-0004' }).getByRole('button').click()
  await page.locator('.kb-reader').getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Keep it' }).click()
  await expect(items(page)).toHaveCount(6)
  await page.locator('.kb-reader').getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete article' }).click()
  await expect(items(page)).toHaveCount(5)
})

test.describe('AI providers', () => {
  async function openProviders(page: Page) {
    await page.locator('.header-tools-trigger').click()
    await page.getByRole('button', { name: /^AI providers/ }).click()
    return page.getByRole('dialog', { name: 'AI providers' })
  }

  test('non-admins see which provider is in use but cannot change it', async ({ page }) => {
    await page.route('**/api/ai/status', reply({ configured: true, label: 'Team Gemini', kind: 'gemini', model: 'gemini-test' }))
    await page.route('**/api/ai/providers', reply({ error: 'Only system admins can manage AI providers.' }, 403))
    await openApp(page)
    const dialog = await openProviders(page)
    await expect(dialog.locator('.ai-status')).toContainText('In use: Team Gemini · gemini-test')
    await expect(dialog).toContainText('Only system admins can add or change AI providers.')
    await expect(dialog.getByRole('button', { name: 'Add a provider' })).toHaveCount(0)
  })

  test('admins see saved providers by last 4 characters and can add one', async ({ page }) => {
    let posted: Record<string, unknown> | undefined
    const providers = [{ id: '11111111-1111-1111-1111-111111111111', kind: 'gemini', label: 'Team Gemini', model: 'gemini-test', baseUrl: null, keyLast4: 'Ab12', isDefault: true, updatedAt: '2026-10-10' }]
    await page.route('**/api/ai/status', reply({ configured: true, label: 'Team Gemini', kind: 'gemini', model: 'gemini-test' }))
    await page.route('**/api/ai/providers', (route) => {
      if (route.request().method() === 'POST') {
        posted = route.request().postDataJSON()
        return reply({ ...providers[0], id: '22222222-2222-2222-2222-222222222222', kind: 'openai', label: 'OpenAI', keyLast4: '9xyz', isDefault: false }, 201)(route)
      }
      return reply({ canSaveKeys: true, privateEndpointsAllowed: false, envGemini: false, providers })(route)
    })
    await openApp(page)
    const dialog = await openProviders(page)
    await expect(dialog.locator('.ai-provider-list li').first()).toContainText('key ••••Ab12')
    await expect(dialog.locator('.ai-default-badge')).toBeVisible()

    await dialog.getByRole('button', { name: 'Add a provider' }).click()
    await dialog.locator('.ai-provider-form select').selectOption('openai')
    await dialog.getByLabel(/^Model/).fill('my-model')
    await dialog.getByLabel(/^API key/).fill('sk-test-123456789xyz')
    await dialog.getByRole('button', { name: 'Save provider' }).click()
    await expect.poll(() => posted?.kind).toBe('openai')
    expect(posted).toMatchObject({ kind: 'openai', model: 'my-model', apiKey: 'sk-test-123456789xyz', makeDefault: false })
    await expect(dialog.locator('.ai-provider-form')).toHaveCount(0)
  })
})

test('on a phone the Knowledge base is in the Tools menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openApp(page)
  await expect(page.locator('.primary-nav .nav-kb')).toBeHidden()
  await page.locator('.header-tools-trigger').click()
  await page.getByRole('button', { name: /^Knowledge base/ }).click()
  await expect(page).toHaveURL(/#\/kb$/)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
})

test.describe('Find resolution → Search knowledge base', () => {
  async function findResolution(page: Page, ticketId: string) {
    await page.locator('.primary-nav button', { hasText: 'Tickets' }).click()
    await page.locator('.list-ticket-id', { hasText: ticketId }).click()
    const panel = page.locator('.ticket-record-panel')
    await panel.getByRole('button', { name: 'Find resolution' }).click()
    await page.getByRole('button', { name: 'Search knowledge base' }).click()
    return panel.getByRole('region', { name: 'Knowledge base matches' })
  }

  test('shows matching published articles and adds the steps to the work notes', async ({ page }) => {
    await openApp(page)
    const results = await findResolution(page, 'OPS-112')
    await expect(results.locator('.ticket-kb-article').first()).toContainText('KB-0002')
    await expect(results.locator('.ticket-kb-article').first().locator('ol li').first()).toHaveText('Open Services on the print server.')
    await results.locator('.ticket-kb-article').first().getByRole('button', { name: 'Add steps to work notes' }).click()
    await expect(results).toHaveCount(0)
    const notes = await page.evaluate(() => (JSON.parse(localStorage.getItem('it-ticket-kanban-v1') || '[]') as { id: string; notes: string }[]).find((ticket) => ticket.id === 'OPS-112')?.notes ?? '')
    expect(notes).toContain('Following KB-0002 "Clear a stuck print queue on a shared printer":')
    expect(notes).toContain('1. Open Services on the print server.')
  })

  test('says so when no published article matches', async ({ page }) => {
    await openApp(page)
    await page.evaluate(() => localStorage.setItem('it-ticket-kanban-kb-v1', '[]'))
    const results = await findResolution(page, 'OPS-112')
    await expect(results).toContainText('No published article matches this ticket yet.')
  })
})
