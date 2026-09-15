import { defineConfig } from '@playwright/test'

const isElectronE2E = process.env.BUDDY_ELECTRON_E2E === '1'

/**
 * Playwright E2E tests for hs-buddy.
 *
 * Browser tests run the Vite renderer with mocked IPC. `bun run test:e2e:electron`
 * builds and launches an isolated Electron process for the required preload and
 * main-process journeys.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: isElectronE2E ? 'test-results/electron-e2e' : 'test-results',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 1,
  reporter: isElectronE2E
    ? [
        ['list'],
        ['html', { open: 'never', outputFolder: 'playwright-electron-report' }],
        ['junit', { outputFile: 'electron-e2e-results.xml' }],
      ]
    : process.env.CI
      ? [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'e2e-results.xml' }]]
      : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: isElectronE2E
    ? undefined
    : {
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
      testIgnore: /electron\.spec\.ts/,
      use: {
        ...(process.env.CI ? { channel: 'chrome' } : {}),
        serviceWorkers: 'block',
        // Even an accidental route.continue() cannot reach an external server.
        proxy: { server: 'http://127.0.0.1:9', bypass: 'localhost,127.0.0.1' },
      },
    },
    {
      name: 'electron-e2e',
      testMatch: /electron\.spec\.ts/,
      workers: 1,
      retries: 0,
      use: {
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
      },
    },
  ],
})
