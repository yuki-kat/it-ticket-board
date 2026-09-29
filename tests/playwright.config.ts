import { defineConfig } from '@playwright/test'

// The tests open the real index.html, exactly as it ships, in a real browser.
// (index.html is built from the React source in ../app; see the README.)
// Locally they use the pre-installed Chromium (/opt/pw-browsers);
// in CI they use Playwright's own Chromium.
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.VITE_DEV ? 'http://127.0.0.1:5173' : 'http://127.0.0.1:4173',
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
  webServer: process.env.VITE_DEV ? undefined : {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1 --directory ..',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
  },
})
