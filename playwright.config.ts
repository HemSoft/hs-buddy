import { defineConfig } from '@playwright/test'

/**
 * Playwright E2E tests for hs-buddy.
 *
 * These tests connect to a running instance of the app.
 * Start the app in debug mode first:
 *   bun run dev (or electron with --remote-debugging-port=9222)
 *
 * Run tests with:
 *   npx playwright test
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    // Connect to the running Vite dev server inside Electron
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'electron-e2e',
      use: {
        // When the app is running with CDP on port 9222, tests can
        // alternatively connect via: connectOverCDP: 'http://127.0.0.1:9222'
        // For now, we hit the Vite dev server directly (works when running
        // `bun run dev` which starts Vite on localhost:5173).
      },
    },
  ],
})
