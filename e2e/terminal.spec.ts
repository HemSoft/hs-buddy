/**
 * E2E: Terminal Panel
 *
 * Verifies the terminal panel UI:
 * - Toggle terminal panel open/closed
 * - Terminal tab bar rendering
 * - Terminal panel chrome (not actual shell execution in browser mode)
 */
import { test, expect, waitForAppReady } from './fixtures'

test.describe('Terminal Panel - Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test('should toggle terminal panel via title bar button', async ({ page }) => {
    // The terminal toggle button is in the title bar
    const terminalToggle = page.locator(
      '.terminal-toggle-button, [aria-label*="Toggle Terminal" i]'
    )
    await expect(terminalToggle.first()).toBeVisible({ timeout: 5_000 })

    // Click to open terminal
    await terminalToggle.first().click()

    // Terminal panel should become visible (use specific class, not broad [class*="terminal"])
    const terminalPanel = page.locator('.terminal-panel')
    await expect(terminalPanel).toBeVisible({ timeout: 5_000 })

    // Click again to close
    await terminalToggle.first().click()

    // Terminal panel should be hidden
    await expect(terminalPanel).toBeHidden({ timeout: 5_000 })
  })

  test('should show terminal tab bar when panel is open', async ({ page }) => {
    const terminalToggle = page.locator(
      '.terminal-toggle-button, [aria-label*="Toggle Terminal" i]'
    )
    await expect(terminalToggle.first()).toBeVisible({ timeout: 5_000 })
    await terminalToggle.first().click()

    // Terminal panel should have a tab bar for multiple terminals
    const terminalTabs = page.locator(
      '.terminal-panel .terminal-panel-tabs, .terminal-panel [role="tablist"]'
    )
    await expect(terminalTabs.first()).toBeVisible({ timeout: 5_000 })
  })

  test('should have add terminal tab button', async ({ page }) => {
    const terminalToggle = page.locator(
      '.terminal-toggle-button, [aria-label*="Toggle Terminal" i]'
    )
    await expect(terminalToggle.first()).toBeVisible({ timeout: 5_000 })
    await terminalToggle.first().click()

    // Should have a button to add new terminal tabs
    const addButton = page.locator(
      '.terminal-panel .terminal-panel-add-tab, .terminal-panel [title*="new" i]'
    )
    await expect(addButton.first()).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('Terminal Panel - Resilience', () => {
  test('should not crash the app when terminal panel is toggled', async ({ page }) => {
    await waitForAppReady(page)

    const terminalToggle = page.locator(
      '.terminal-toggle-button, [aria-label*="Toggle Terminal" i]'
    )
    await expect(terminalToggle.first()).toBeVisible({ timeout: 5_000 })

    const terminalPanel = page.locator('.terminal-panel')

    // Toggle open — wait for panel to appear
    await terminalToggle.first().click()
    await expect(terminalPanel).toBeVisible({ timeout: 5_000 })

    // Toggle closed — wait for panel to disappear
    await terminalToggle.first().click()
    await expect(terminalPanel).toBeHidden({ timeout: 5_000 })

    // Toggle open again — wait for panel to appear
    await terminalToggle.first().click()
    await expect(terminalPanel).toBeVisible({ timeout: 5_000 })

    // App should still be functional
    await expect(page.locator('.activity-bar')).toBeVisible()
    await expect(page.locator('.status-bar')).toBeVisible()
  })

  test('should maintain app state when terminal is opened', async ({ page }) => {
    await waitForAppReady(page)

    // Navigate to a specific section first
    const settingsButton = page.locator('.activity-bar [aria-label="Settings"]')
    await settingsButton.click()

    const sidebar = page.locator('.sidebar-panel')
    await expect(sidebar).toBeVisible()

    // Now open terminal
    const terminalToggle = page.locator(
      '.terminal-toggle-button, [aria-label*="Toggle Terminal" i]'
    )
    await expect(terminalToggle.first()).toBeVisible({ timeout: 5_000 })
    await terminalToggle.first().click()

    // Sidebar should still be visible (settings section maintained)
    await expect(sidebar).toBeVisible()
    // Activity bar should still show settings as active
    const settingsItem = page.locator('.activity-bar [aria-label="Settings"].active')
    await expect(settingsItem).toBeVisible()
  })
})
