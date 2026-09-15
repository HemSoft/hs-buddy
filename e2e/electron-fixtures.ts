import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  _electron as electron,
  expect,
  test as base,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { electronE2EEnvironment } from './electron-environment'

const FIXTURE_FILE_NAME = 'fixture.txt'
export const FIXTURE_FILE_CONTENT = 'real Electron filesystem fixture\n'

interface ElectronHarness {
  app: ElectronApplication
  fixtureRoot: string
  page: Page
  userDataDir: string
}

interface ElectronWorkerFixtures {
  electronHarness: ElectronHarness
}

function isolatedApplicationEnvironment(testRoot: string): Record<string, string> {
  return electronE2EEnvironment({
    APPDATA: testRoot,
    ELECTRON_ENABLE_LOGGING: '1',
    HOME: testRoot,
    LOCALAPPDATA: testRoot,
    USERPROFILE: testRoot,
    XDG_CONFIG_HOME: testRoot,
    ...(process.platform === 'win32' ? {} : { SHELL: '/bin/bash' }),
  })
}

async function closeApplication(app: ElectronApplication): Promise<void> {
  if (app.process().exitCode === null) await app.close()
}

export const test = base.extend<Record<never, never>, ElectronWorkerFixtures>({
  electronHarness: [
    // Playwright requires fixture arguments to use object destructuring.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const testRoot = await mkdtemp(path.join(tmpdir(), 'buddy-electron-e2e-'))
      const fixtureRoot = path.join(testRoot, 'fixtures')
      const userDataDir = path.join(testRoot, 'user-data')
      const artifactsDir = path.resolve('test-results', 'electron-artifacts')
      const processLogPath = path.resolve('test-results', 'electron-process.log')
      await Promise.all([
        mkdir(fixtureRoot, { recursive: true }),
        mkdir(userDataDir, { recursive: true }),
        mkdir(artifactsDir, { recursive: true }),
        mkdir(path.dirname(processLogPath), { recursive: true }),
      ])
      await writeFile(path.join(fixtureRoot, FIXTURE_FILE_NAME), FIXTURE_FILE_CONTENT)

      const processLog = createWriteStream(processLogPath, { flags: 'a' })
      let app: ElectronApplication | undefined
      try {
        app = await electron.launch({
          args: ['.', `--user-data-dir=${userDataDir}`],
          artifactsDir,
          cwd: process.cwd(),
          env: isolatedApplicationEnvironment(testRoot),
          offline: true,
          timeout: 45_000,
          tracesDir: path.resolve('test-results', 'electron-traces'),
        })
        app.process().stdout?.pipe(processLog, { end: false })
        app.process().stderr?.pipe(processLog, { end: false })

        const page = await app.firstWindow({ timeout: 30_000 })
        await expect(page.locator('.activity-bar')).toBeVisible({ timeout: 30_000 })
        await expect.poll(() => page.evaluate(() => window.__buddyPreloadReady)).toBe(true)

        // eslint-disable-next-line react-hooks/rules-of-hooks
        await use({ app, fixtureRoot, page, userDataDir })
      } finally {
        if (app) await closeApplication(app)
        processLog.end()
        await rm(testRoot, { recursive: true, force: true })
      }
    },
    { scope: 'worker' },
  ],
})

export { expect, FIXTURE_FILE_NAME }
