// AI providers (Tools → AI providers) and the knowledge base AI routes, against a real Postgres and a fake
// OpenAI-compatible server on 127.0.0.1, so no real provider or key is needed. Two copies of the API run:
//   open:   AI_KEYS_SECRET set and AI_ALLOW_PRIVATE_ENDPOINTS=true, so it may call the fake server on loopback
//   strict: neither set, to check the private-address guard and the "no secret, no keys" rule
// Needs DATABASE_URL pointing at a migrated, disposable database (this file clears the ai_providers table).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import pg from 'pg'

const run = randomBytes(4).toString('hex')
const API_KEY = `sk-test-${randomBytes(12).toString('hex')}-9z8y`
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const servers = []
const seen = [] // requests the fake provider received
let fakeUrl

// ---- Fake provider ------------------------------------------------------------------------------------------------

function fakeReply(body) {
  const system = body.messages?.find((message) => message.role === 'system')?.content ?? ''
  if (system.includes('knowledge base articles from resolved')) {
    return JSON.stringify({ title: 'Reset a stuck print queue', summary: 'Clears jobs that block a shared printer.', symptoms: 'Jobs sit in the queue.', cause: 'A corrupt job held the spooler.', steps: ['Open Services', 'Restart Print Spooler'], tags: ['Printing', 'spooler'] })
  }
  if (system.includes('using only the knowledge base articles')) {
    return 'Here you go: {"answer": "Restart the spooler [KB-0001]. See also [KB-9999].", "citations": ["KB-0001", "KB-9999"], "covered": true}'
  }
  return 'OK'
}

before(async () => {
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL must point at a migrated test database')
  await db.query('DELETE FROM ai_providers')

  const fake = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      if (req.url === '/redirect/chat/completions') {
        res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data' })
        return res.end()
      }
      const body = JSON.parse(raw || '{}')
      seen.push({ url: req.url, headers: req.headers, body })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ model: 'fake-model', choices: [{ message: { content: fakeReply(body) }, finish_reason: 'stop' }] }))
    })
  })
  await new Promise((resolve) => fake.listen(0, '127.0.0.1', resolve))
  fakeUrl = `http://127.0.0.1:${fake.address().port}`
  servers.push({ kill: () => fake.close() })
})

after(async () => {
  for (const server of servers) server.kill()
  await db.query('DELETE FROM ai_providers')
  await db.end()
})

async function startApi(port, extraEnv) {
  const env = { ...process.env, PORT: String(port), JWT_SECRET: randomBytes(32).toString('hex'), NODE_ENV: 'test', CORS_ORIGIN: 'http://localhost', GEMINI_API_KEY: '', AI_KEYS_SECRET: '', AI_ALLOW_PRIVATE_ENDPOINTS: '', ...extraEnv }
  const child = spawn(process.execPath, ['dist/index.js'], { env, stdio: ['ignore', 'ignore', 'inherit'] })
  servers.push(child)
  const base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/health`)).ok) break } catch { /* not listening yet */ }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  const call = (method, path, body, token) => fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const signUp = async (name, admin = false) => {
    const email = `${name}-${port}-${run}@test.local`
    const res = await call('POST', '/api/auth/signup', { email, password: 'Passw0rd!long', name })
    assert.equal(res.status, 200)
    if (admin) await db.query('UPDATE users SET is_system_admin = TRUE WHERE email = $1', [email])
    return (await res.json()).token
  }
  return { call, signUp }
}

const providerForm = (overrides = {}) => ({ kind: 'openai_compatible', label: 'Local test model', model: 'fake-model', baseUrl: `${fakeUrl}/v1`, apiKey: API_KEY, ...overrides })

// ---- Tests --------------------------------------------------------------------------------------------------------

test('admins manage providers; keys are encrypted and never sent back; every AI route uses the default', async () => {
  const api = await startApi(3201, { AI_KEYS_SECRET: randomBytes(32).toString('hex'), AI_ALLOW_PRIVATE_ENDPOINTS: 'true' })
  const admin = await api.signUp('ai-admin', true)
  const member = await api.signUp('ai-member')

  assert.deepEqual(await (await api.call('GET', '/api/ai/status', undefined, member)).json(), { configured: false })
  assert.equal((await api.call('GET', '/api/ai/providers', undefined, member)).status, 403)
  assert.equal((await api.call('POST', '/api/ai/providers', providerForm(), member)).status, 403)
  assert.equal((await api.call('GET', '/api/ai/providers')).status, 401)

  const created = await api.call('POST', '/api/ai/providers', providerForm(), admin)
  assert.equal(created.status, 201)
  const provider = await created.json()
  assert.equal(provider.keyLast4, '9z8y')
  assert.equal(provider.isDefault, true, 'the first provider becomes the default')
  assert.ok(!JSON.stringify(provider).includes(API_KEY), 'the key must not come back')

  const list = await (await api.call('GET', '/api/ai/providers', undefined, admin)).json()
  assert.equal(list.canSaveKeys, true)
  assert.ok(!JSON.stringify(list).includes(API_KEY) && !JSON.stringify(list).includes('v1:'), 'neither the key nor its ciphertext is listed')

  const stored = (await db.query('SELECT key_ciphertext FROM ai_providers WHERE id = $1', [provider.id])).rows[0].key_ciphertext
  assert.match(stored, /^v1:/)
  assert.ok(!stored.includes(API_KEY), 'the key is encrypted at rest')

  const status = await (await api.call('GET', '/api/ai/status', undefined, member)).json()
  assert.deepEqual(status, { configured: true, label: 'Local test model', kind: 'openai_compatible', model: 'fake-model' })
  assert.deepEqual(await (await api.call('GET', '/api/check-gemini')).json(), { available: true })

  // Test connection: OpenAI-compatible servers get max_tokens and the key as a Bearer token.
  const tested = await api.call('POST', `/api/ai/providers/${provider.id}/test`, {}, admin)
  assert.equal(tested.status, 200)
  assert.deepEqual(await tested.json(), { ok: true, model: 'fake-model', reply: 'OK' })
  const last = seen.at(-1)
  assert.equal(last.url, '/v1/chat/completions')
  assert.equal(last.headers.authorization, `Bearer ${API_KEY}`)
  assert.ok(last.body.max_tokens >= 64 && last.body.max_completion_tokens === undefined)

  // Editing without a key keeps the saved one.
  const renamed = await api.call('PUT', `/api/ai/providers/${provider.id}`, providerForm({ label: 'Renamed', apiKey: '' }), admin)
  assert.equal(renamed.status, 200)
  assert.equal((await renamed.json()).keyLast4, '9z8y')

  // The older Gemini-shaped proxy now goes to the default provider.
  const proxied = await api.call('POST', '/api/gemini', { contents: [{ role: 'user', parts: [{ text: 'Hello' }] }] }, member)
  assert.equal(proxied.status, 200)
  assert.equal((await proxied.json()).text, 'OK')

  // Draft from a resolved ticket.
  const draft = await api.call('POST', '/api/ai/kb-draft', { ticket: { number: 'OPS-112', title: 'Printer queue stuck on level 4', description: 'Jobs <b>stuck</b>', workNotes: [{ at: '2026-10-01', author: 'Ken', text: 'Restarted the spooler, fixed.' }] } }, member)
  assert.equal(draft.status, 200)
  const article = await draft.json()
  assert.equal(article.title, 'Reset a stuck print queue')
  assert.deepEqual(article.steps, ['Open Services', 'Restart Print Spooler'])
  assert.deepEqual(article.tags, ['printing', 'spooler'])
  const draftPrompt = seen.at(-1).body.messages.at(-1).content
  assert.match(draftPrompt, /<ticket>[\s\S]*OPS-112[\s\S]*<\/ticket>/)
  assert.ok(!draftPrompt.includes('<b>'), 'ticket text cannot open or close prompt tags')

  // Ask the KB: citations to articles that were not sent are dropped from the list and the answer.
  const asked = await api.call('POST', '/api/ai/kb-ask', { question: 'Printer jobs are stuck', articles: [{ id: 'KB-0001', title: 'Reset a stuck print queue', body: 'Restart the spooler.' }, { id: 'KB-0002', title: 'Map a printer', body: 'Add it by name.' }] }, member)
  assert.equal(asked.status, 200)
  const answer = await asked.json()
  assert.deepEqual(answer.citations, ['KB-0001'])
  assert.ok(answer.answer.includes('[KB-0001]') && !answer.answer.includes('KB-9999'))
  assert.equal(answer.covered, true)
  assert.equal((await api.call('POST', '/api/ai/kb-ask', { question: 'Anything', articles: [] }, member)).status, 400)
  assert.equal((await api.call('POST', '/api/ai/kb-draft', { ticket: { title: 'x' } })).status, 401)

  // A provider that answers with a redirect is refused rather than followed.
  const redirecting = await (await api.call('POST', '/api/ai/providers', providerForm({ label: 'Redirects', baseUrl: `${fakeUrl}/redirect` }), admin)).json()
  const refused = await api.call('POST', `/api/ai/providers/${redirecting.id}/test`, {}, admin)
  assert.equal(refused.status, 502)
  assert.match((await refused.json()).error, /redirect/)

  // Switching the default and deleting.
  assert.equal((await api.call('POST', `/api/ai/providers/${redirecting.id}/default`, {}, admin)).status, 200)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM ai_providers WHERE is_default')).rows[0].n, 1)
  assert.equal((await api.call('DELETE', `/api/ai/providers/${redirecting.id}`, undefined, admin)).status, 200)
  assert.equal((await api.call('DELETE', '/api/ai/providers/not-a-uuid', undefined, admin)).status, 404)
})

test('without the private-endpoint flag, internal addresses and plain http are refused; without AI_KEYS_SECRET, keys are not saved', async () => {
  const api = await startApi(3202, {})
  const admin = await api.signUp('ai-strict-admin', true)
  const reject = async (form, pattern) => {
    const res = await api.call('POST', '/api/ai/providers', providerForm(form), admin)
    assert.equal(res.status, 400, JSON.stringify(form))
    assert.match((await res.json()).error, pattern)
  }
  await reject({ baseUrl: `${fakeUrl}/v1` }, /must start with https/)
  await reject({ baseUrl: 'https://127.0.0.1:9/v1' }, /private network/)
  await reject({ baseUrl: 'https://169.254.169.254/v1' }, /private network/)
  await reject({ baseUrl: 'https://[::1]:9/v1' }, /private network/)
  await reject({ baseUrl: 'https://user:pass@example.com/v1' }, /not in the URL/)
  await reject({ kind: 'azure_openai', baseUrl: 'https://example.com' }, /Azure resource URL/)
  await reject({ kind: 'openai', model: 'bad model name' }, /model name/)

  const noSecret = await api.call('POST', '/api/ai/providers', providerForm({ kind: 'anthropic', model: 'any-model' }), admin)
  assert.equal(noSecret.status, 503)
  assert.match((await noSecret.json()).error, /AI_KEYS_SECRET/)
})
