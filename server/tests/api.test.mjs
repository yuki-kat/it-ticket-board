// API tests: start the built server against a real Postgres and exercise it over HTTP.
// Needs DATABASE_URL pointing at a migrated, disposable database. CI starts one; locally:
//   npm run build && DATABASE_URL=postgresql://... npm run migrate && DATABASE_URL=... npm test
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'

const PORT = 3199
const BASE = `http://127.0.0.1:${PORT}`
const run = randomBytes(4).toString('hex') // unique emails, so the suite can rerun on the same database
let server

before(async () => {
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL must point at a migrated test database')
  server = spawn(process.execPath, ['dist/index.js'], {
    env: { ...process.env, PORT: String(PORT), JWT_SECRET: randomBytes(32).toString('hex'), NODE_ENV: 'test', CORS_ORIGIN: 'http://localhost' },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return } catch { /* not listening yet */ }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('Server did not start within 10 seconds')
})

after(() => server?.kill())

const json = (method, path, body, token) => fetch(BASE + path, {
  method,
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: body ? JSON.stringify(body) : undefined,
})

async function signUp(name) {
  const res = await json('POST', '/api/auth/signup', { email: `${name}-${run}@test.local`, password: 'Passw0rd!long', name })
  assert.equal(res.status, 200)
  return (await res.json()).token
}

function upload(teamId, token, { kind = 'escalation', field = 'file', type = 'image/png', bytes = Buffer.from('\x89PNG\r\n\x1a\nsample'), name = 'matrix.png' } = {}) {
  const form = new FormData()
  form.append(field, new Blob([bytes], { type }), name)
  return fetch(`${BASE}/api/teams/${teamId}/${kind}-matrix/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
}

test('health check answers', async () => {
  const res = await fetch(`${BASE}/health`)
  assert.deepEqual(await res.json(), { status: 'ok' })
})

test('sign-up, duplicate sign-up and sign-in', async () => {
  const email = `login-${run}@test.local`
  assert.equal((await json('POST', '/api/auth/signup', { email, password: 'Passw0rd!long', name: 'Login' })).status, 200)
  assert.equal((await json('POST', '/api/auth/signup', { email, password: 'Other1!pass', name: 'Again' })).status, 400)

  const ok = await json('POST', '/api/auth/login', { email, password: 'Passw0rd!long' })
  assert.equal(ok.status, 200)
  const body = await ok.json()
  assert.ok(body.token)
  assert.equal(body.user.password_hash, undefined, 'the password hash must never be sent back')

  assert.equal((await json('POST', '/api/auth/login', { email, password: 'wrong' })).status, 401)
  assert.equal((await json('POST', '/api/auth/login', { email: `nobody-${run}@test.local`, password: 'x' })).status, 401)
})

test('team routes need a valid token', async () => {
  assert.equal((await json('GET', '/api/teams')).status, 401)
  assert.equal((await json('GET', '/api/teams', undefined, 'not-a-real-token')).status, 401)
})

test('matrix uploads: admin can upload and download, wrong input is rejected, non-members are blocked', async () => {
  const admin = await signUp('admin')
  const outsider = await signUp('outsider')
  const created = await json('POST', '/api/teams', { name: `Team ${run}` }, admin)
  assert.equal(created.status, 201)
  const team = await created.json()
  assert.equal(team.role, 'admin')

  const png = Buffer.from('\x89PNG\r\n\x1a\n' + randomBytes(64).toString('hex'))
  assert.equal((await upload(team.id, admin, { bytes: png })).status, 200)
  const download = await fetch(`${BASE}/api/teams/${team.id}/escalation-matrix/download`, { headers: { Authorization: `Bearer ${admin}` } })
  assert.equal(download.status, 200)
  assert.ok(Buffer.from(await download.arrayBuffer()).equals(png), 'download must match the uploaded bytes')

  const wrongType = await upload(team.id, admin, { type: 'application/x-msdownload', name: 'tool.exe' })
  assert.equal(wrongType.status, 400)
  assert.match((await wrongType.json()).error, /File type not allowed/)

  const tooBig = await upload(team.id, admin, { kind: 'sla', type: 'text/plain', bytes: Buffer.alloc(11 * 1024 * 1024), name: 'big.txt' })
  assert.equal(tooBig.status, 400)
  assert.equal((await tooBig.json()).error, 'File is larger than 10 MB')

  assert.equal((await upload(team.id, admin, { field: 'upload' })).status, 400)
  assert.equal((await upload(team.id, outsider)).status, 403)
  assert.equal((await fetch(`${BASE}/api/teams/${team.id}/escalation-matrix`, { headers: { Authorization: `Bearer ${outsider}` } })).status, 403)
})

test('production refuses to start without a real JWT_SECRET', () => {
  const load = (secret) => spawnSync(process.execPath, ['-e', "import('./dist/utils/auth.js')"], {
    env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: secret },
    encoding: 'utf8',
  })
  const missing = load('')
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr, /JWT_SECRET is missing or set to a public placeholder/)
  assert.notEqual(load('dev-secret').status, 0)
  assert.equal(load(randomBytes(32).toString('hex')).status, 0)
})
