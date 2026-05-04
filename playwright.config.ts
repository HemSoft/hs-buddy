import { defineConfig } from '@playwright/test'

/**
 * Playwright E2E tests for hs-buddy.
 *
 * Two modes of operation:
 *
 * 1. **Browser smoke tests** (default, CI-friendly):
 *    Starts Vite dev server with IPC mocks injected via addInitScript.
 *    Run with: `bun run test:e2e`
 *
 * 2. **Electron integration** (local development):
 *    Start the full Electron app with CDP debugging:
 *      BUDDY_DEBUG_PORT=9222 bun run dev
 *    Then run: `npx playwright test --project=electron-cdp`
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'e2e-results.xml' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  /* Start Vite dev server before running tests */
  webServer: {
    command: 'npx vite --mode e2e',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      VITE_E2E: '1',
    },
  },
  projects: [
    {
      name: 'browser-e2e',
      use: {
        // Tests run in Chromium with IPC mocks (from e2e/fixtures.ts)
      },
    },
    {
      name: 'electron-cdp',
      use: {
        // Connect to running Electron app via Chrome DevTools Protocol.
        // Requires: BUDDY_DEBUG_PORT=9222 bun run dev
        connectOverCDP: 'http://127.0.0.1:9222',
      },
    },
  ],
})
