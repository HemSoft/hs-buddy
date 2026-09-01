import type { Page } from '@playwright/test'
import { expect, test, waitForAppReady } from './fixtures'

async function waitForCurrentApp(page: Page, projectName: string) {
  if (projectName === 'electron-cdp') {
    await page.locator('.activity-bar').waitFor({ state: 'visible', timeout: 30_000 })
    return
  }
  await waitForAppReady(page)
}

async function openInternalRoute(page: Page, viewId: string) {
  await page.evaluate(id => {
    window.dispatchEvent(new CustomEvent('app:navigate', { detail: { viewId: id } }))
  }, viewId)
}

async function expectNoRouteError(page: Page) {
  await expect(page.getByText('Something went wrong')).toHaveCount(0)
}

test('cold dashboard does not request feature-only modules', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'electron-cdp', 'Development module URLs are browser-only')
  const requestedUrls: string[] = []
  page.on('request', request => requestedUrls.push(request.url()))

  await waitForAppReady(page)

  const forbiddenStartupFragments = [
    '/src/components/AssistantPanel',
    '/src/components/settings/SettingsAccounts',
    '/src/components/settings/SettingsAppearance',
    '/src/components/settings/SettingsPullRequests',
    '/src/components/settings/SettingsCopilot',
    '/src/components/settings/SettingsNotifications',
    '/src/components/settings/SettingsAdvanced',
    '/src/components/settings/SettingsWeather',
    '/src/components/tempo/TempoDashboard',
    '/src/components/ralph-loops/RalphDashboard',
    '/src/components/ralph-loops/RalphRunDetailPanel',
    '/src/components/sessions/SessionExplorer',
    '/src/components/sessions/SessionDetail',
    '/src/components/terminal-workspace/TerminalWorkspaceView',
    '@uiw/react-markdown-preview',
    '/shiki/',
    '/@xterm/',
  ]

  for (const fragment of forbiddenStartupFragments) {
    expect(
      requestedUrls.filter(url => url.includes(fragment)),
      fragment
    ).toEqual([])
  }
})

test('feature routes load through internal navigation events', async ({ page }, testInfo) => {
  await waitForCurrentApp(page, testInfo.project.name)

  const routes: Array<[string, string]> = [
    ['settings-accounts', 'GitHub Accounts'],
    ['settings-appearance', 'Appearance'],
    ['automation-runs', 'Runs'],
    ['tasks-today', 'Today'],
    ['copilot-prompt', 'Copilot SDK'],
    ['copilot-all-results', 'Copilot Results'],
    ['copilot-sessions', 'Session Explorer'],
  ]

  for (const [viewId, heading] of routes) {
    await openInternalRoute(page, viewId)
    await expect(page.getByText(heading, { exact: true }).first()).toBeVisible()
    await expectNoRouteError(page)
  }

  await openInternalRoute(page, 'automation-schedules')
  await expect(page.locator('.schedule-overview')).toBeVisible()
  await expectNoRouteError(page)

  await openInternalRoute(page, 'bookmarks-all')
  await expect(page.locator('.panel-loading, .bookmark-list-container').first()).toBeVisible()
  await expectNoRouteError(page)

  await openInternalRoute(page, 'terminal-workspace')
  await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible()
  await expectNoRouteError(page)

  await openInternalRoute(page, 'tempo-timesheet')
  await expect(page.locator('.tempo-dashboard')).toBeVisible()
  await expectNoRouteError(page)

  await openInternalRoute(page, 'ralph-dashboard')
  await expect(page.locator('.ralph-dashboard')).toBeVisible()
  await expectNoRouteError(page)
})
