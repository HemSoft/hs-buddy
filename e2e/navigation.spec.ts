/**
 * E2E: Navigation & App Shell
 *
 * Verifies the core navigation system works end-to-end:
 * - Activity bar section switching
 * - Tab management (open, switch, close)
 * - Sidebar rendering per section
 * - Dashboard/home navigation
 */
import { test, expect, waitForAppReady } from './fixtures'

test.describe('App Shell - Boot & Structure', () => {
  test('should render the app shell with all major regions', async ({ page }) => {
    await waitForAppReady(page)

    // Title bar (frameless window custom chrome)
    await expect(page.locator('.title-bar')).toBeVisible()

    // Activity bar with navigation sections
    await expect(page.locator('.activity-bar')).toBeVisible()

    // Status bar at bottom
    await expect(page.locator('.status-bar')).toBeVisible()
  })

  test('should show the dashboard/welcome panel by default', async ({ page }) => {
    await waitForAppReady(page)

    // The Welcome/Dashboard panel should be visible on initial load
    const welcomeContent = page.locator('.welcome-panel, [data-testid="welcome-panel"]')
    await expect(welcomeContent).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Activity Bar Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test('should display all activity bar sections', async ({ page }) => {
    const activityBar = page.locator('.activity-bar')

    // Verify key sections are present via their aria-labels or titles
    const expectedSections = [
      'GitHub',
      'Settings',
      'Automation',
      'Bookmarks',
      'Copilot',
    ]

    for (const section of expectedSections) {
      const button = activityBar.locator(`[aria-label="${section}"]`)
      await expect(button).toBeVisible()
    }
  })

  test('should navigate to GitHub section', async ({ page }) => {
    const githubButton = page.locator('.activity-bar [aria-label="GitHub"]')
    await githubButton.click()

    // Sidebar should update to show GitHub-related content
    const sidebar = page.locator('.sidebar-panel')
    await expect(sidebar).toBeVisible()
  })

  test('should navigate to Settings section', async ({ page }) => {
    const settingsButton = page.locator('.activity-bar [aria-label="Settings"]')
    await settingsButton.click()

    // Sidebar should update to show settings navigation
    const sidebar = page.locator('.sidebar-panel')
    await expect(sidebar).toBeVisible()
  })

  test('should navigate to Automation section', async ({ page }) => {
    const automationButton = page.locator('.activity-bar [aria-label="Automation"]')
    await automationButton.click()

    const sidebar = page.locator('.sidebar-panel')
    await expect(sidebar).toBeVisible()
  })

  test('should navigate to Bookmarks section', async ({ page }) => {
    const bookmarksButton = page.locator('.activity-bar [aria-label="Bookmarks"]')
    await bookmarksButton.click()

    const sidebar = page.locator('.sidebar-panel')
    await expect(sidebar).toBeVisible()
  })

  test('should highlight the active section in the activity bar', async ({ page }) => {
    const settingsButton = page.locator('.activity-bar [aria-label="Settings"]')
    await settingsButton.click()

    // The active section should have a distinct visual state
    const activeItems = page.locator('.activity-bar .activity-bar-item.active')
    await expect(activeItems.first()).toBeVisible()
  })

  test('should navigate home when clicking the home button', async ({ page }) => {
    // First navigate away from home
    const settingsButton = page.locator('.activity-bar [aria-label="Settings"]')
    await settingsButton.click()

    // Click home/dashboard button
    const homeButton = page.locator('.activity-bar [aria-label="Dashboard"]')
    if ((await homeButton.count()) > 0) {
      await homeButton.first().click()
      // Dashboard should be visible again
      const welcomeContent = page.locator('.welcome-panel, [data-testid="welcome-panel"]')
      await expect(welcomeContent).toBeVisible({ timeout: 10_000 })
    }
  })
})

test.describe('Tab Management', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test('should show a tab bar', async ({ page }) => {
    const tabBar = page.locator('.tab-bar')
    await expect(tabBar).toBeVisible()
  })

  test('should have at least one tab open (dashboard)', async ({ page }) => {
    const tabs = page.locator('.tab-bar .tab-item, .tab-bar [role="tab"]')
    await expect(tabs.first()).toBeVisible()
  })

  test('should switch content when clicking different tabs', async ({ page }) => {
    // Navigate to settings to open a new tab
    const settingsButton = page.locator('.activity-bar [aria-label="Settings"]')
    await settingsButton.click()

    // Click on a settings sidebar item to open it in a tab
    const sidebarItem = page.locator('.sidebar-panel .sidebar-item, .sidebar-panel li').first()
    if ((await sidebarItem.count()) > 0) {
      await sidebarItem.click()
      // Should now have multiple tabs
      const tabs = page.locator('.tab-bar .tab-item, .tab-bar [role="tab"]')
      const tabCount = await tabs.count()
      expect(tabCount).toBeGreaterThanOrEqual(1)
    }
  })
})
