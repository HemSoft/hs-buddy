/**
 * E2E: Settings
 *
 * Verifies settings pages render correctly:
 * - Navigate to each settings section
 * - Verify form controls are present
 * - Test settings interaction (theme toggle, etc.)
 */
import { test, expect, waitForAppReady } from './fixtures'

test.describe('Settings Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
    // Navigate to Settings section
    const settingsButton = page.locator('.activity-bar [aria-label="Settings"]')
    await settingsButton.click()
  })

  test('should show settings sidebar with categories', async ({ page }) => {
    const sidebar = page.locator('.sidebar-panel')
    await expect(sidebar).toBeVisible()

    // Settings sidebar should list settings categories
    const settingsItems = page.locator(
      '.sidebar-panel :text("Accounts"), .sidebar-panel :text("Appearance"), .sidebar-panel :text("Pull Requests"), .sidebar-panel :text("Copilot"), .sidebar-panel :text("Notifications"), .sidebar-panel :text("Advanced")'
    )
    await expect(settingsItems.first()).toBeVisible({ timeout: 10_000 })
  })

  test('should navigate to Appearance settings', async ({ page }) => {
    const appearanceItem = page.locator('.sidebar-panel :text("Appearance")')
    await appearanceItem.click()

    // Appearance settings should show theme-related controls
    const themeContent = page.locator(
      ':text("Theme"), :text("theme"), :text("Font"), :text("Color")'
    )
    await expect(themeContent.first()).toBeVisible({ timeout: 10_000 })
  })

  test('should navigate to Accounts settings', async ({ page }) => {
    const accountsItem = page.locator('.sidebar-panel :text("Accounts")')
    await accountsItem.click()

    // Accounts settings should show account-related content
    const accountContent = page.locator(
      ':text("Account"), :text("account"), :text("GitHub"), :text("username")'
    )
    await expect(accountContent.first()).toBeVisible({ timeout: 10_000 })
  })

  test('should navigate to Pull Requests settings', async ({ page }) => {
    const prItem = page.locator('.sidebar-panel :text("Pull Requests")')
    await prItem.click()

    // PR settings should show PR-related configuration
    const prContent = page.locator(
      ':text("Pull Request"), :text("pull request"), :text("Recently Merged"), :text("merged")'
    )
    await expect(prContent.first()).toBeVisible({ timeout: 10_000 })
  })

  test('should navigate to Copilot settings', async ({ page }) => {
    const copilotItem = page.locator('.sidebar-panel :text("Copilot")')
    await copilotItem.click()

    // Copilot settings should show AI-related content
    const copilotContent = page.locator(
      ':text("Copilot"), :text("copilot"), :text("AI"), :text("model")'
    )
    await expect(copilotContent.first()).toBeVisible({ timeout: 10_000 })
  })

  test('should navigate to Notifications settings', async ({ page }) => {
    const notifItem = page.locator('.sidebar-panel :text("Notifications")')
    await notifItem.click()

    // Notifications settings should show notification controls
    const notifContent = page.locator(
      ':text("Notification"), :text("notification"), :text("Sound"), :text("sound"), :text("Enable")'
    )
    await expect(notifContent.first()).toBeVisible({ timeout: 10_000 })
  })

  test('should navigate to Advanced settings', async ({ page }) => {
    const advancedItem = page.locator('.sidebar-panel :text("Advanced")')
    await advancedItem.click()

    // Advanced settings should show advanced configuration
    const advancedContent = page.locator(
      ':text("Advanced"), :text("advanced"), :text("Reset"), :text("Data"), :text("Config")'
    )
    await expect(advancedContent.first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Settings Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
    const settingsButton = page.locator('.activity-bar [aria-label="Settings"]')
    await settingsButton.click()
  })

  test('should have interactive form controls in Appearance', async ({ page }) => {
    const appearanceItem = page.locator('.sidebar-panel :text("Appearance")')
    await appearanceItem.click()

    // Should have clickable/selectable controls (buttons, dropdowns, sliders)
    const controls = page.locator(
      'button, select, input[type="range"], input[type="color"], [role="combobox"], [role="slider"]'
    )
    const controlCount = await controls.count()
    expect(controlCount).toBeGreaterThan(0)
  })

  test('should not crash when navigating between all settings pages', async ({ page }) => {
    const settingsPages = [
      'Accounts',
      'Appearance',
      'Pull Requests',
      'Copilot',
      'Notifications',
      'Advanced',
    ]

    for (const pageName of settingsPages) {
      const item = page.locator(`.sidebar-panel :text("${pageName}")`)
      if ((await item.count()) > 0) {
        await item.click()
        // Wait for content area to be visible after navigation
        const contentArea = page.locator('.app-content, [class*="content"], main')
        await expect(contentArea.first()).toBeVisible({ timeout: 5_000 })
      }
    }
  })
})
