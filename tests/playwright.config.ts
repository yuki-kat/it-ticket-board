import { defineConfig } from '@playwright/test'

// Two sets of tests:
//  - "page":   the compiled index.html at the repo root (what people use today).
//  - "source": the React source in ../app, built into ../app/dist (run `npm run build` in app/ first).
//  - "source-same-flows": some of the "page" test files, run against that source build.
// Locally the tests use the installed Google Chrome (nothing to download);
// in CI they use Playwright's own Chromium.
const channel = process.env.CI ? undefined : 'chrome'

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: { channel, viewport: { width: 1280, height: 900 }, trace: 'retain-on-failure', acceptDownloads: true },
  projects: [
    { name: 'page', testIgnore: 'source/**', use: { baseURL: 'http://127.0.0.1:4173' } },
    { name: 'source', testMatch: 'source/**/*.spec.ts', use: { baseURL: 'http://127.0.0.1:4174' } },
    // The same tests as "page", run against the React source. Add a spec file here as soon as the
    // source can do what it tests; when every spec is listed, index.html can be built from app/.
    { name: 'source-same-flows', testMatch: ['queues.spec.ts', 'popups.spec.ts', 'insights.spec.ts', 'arrange.spec.ts', 'addons.spec.ts'], use: { baseURL: 'http://127.0.0.1:4174' } },
  ],
  webServer: [
    { command: 'python3 -m http.server 4173 --bind 127.0.0.1 --directory ..', url: 'http://127.0.0.1:4173/index.html', reuseExistingServer: !process.env.CI },
    { command: 'python3 -m http.server 4174 --bind 127.0.0.1 --directory ../app/dist', url: 'http://127.0.0.1:4174/index.html', reuseExistingServer: !process.env.CI },
  ],
})
