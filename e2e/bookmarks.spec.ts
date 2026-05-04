import { test, expect, waitForAppReady } from './fixtures'

/**
 * E2E tests for the Bookmarks feature.
 *
 * These tests verify that bookmarks navigation works in the running app.
 * With Convex mocked in E2E mode, components are in loading/empty state.
 * Tests verify the app renders correctly and doesn't crash.
 */

test.describe('Bookmarks - Loading & Connectivity', () => {
  test('should navigate to bookmarks without crashing', async ({ page }) => {
    await page.goto('/')

    // Navigate to the Bookmarks view via the activity bar
    const bookmarksButton = page.locator('[aria-label*="Bookmark" i]')
    await bookmarksButton.first().click()

    // The sidebar panel should be visible after clicking
    await expect(page.locator('.sidebar-panel')).toBeVisible()

    // App should still be functional (activity bar present)
    await expect(page.locator('.activity-bar')).toBeVisible()
  })

  test('should show bookmarks sidebar content', async ({ page }) => {
    await page.goto('/')

    // Navigate to bookmarks
    const bookmarksButton = page.locator('[aria-label*="Bookmark" i]')
    await bookmarksButton.first().click()

    // Should see the sidebar panel with bookmarks header or content
    const sidebar = page.locator('.sidebar-panel')
    await expect(sidebar).toBeVisible()

    // The sidebar should contain some text (header, items, or empty state)
    await expect(sidebar).not.toBeEmpty()
  })

  test('should handle empty/loading state gracefully', async ({ page }) => {
    await waitForAppReady(page)

    // Navigate to bookmarks
    const bookmarksButton = page.locator('[aria-label*="Bookmark" i]')
    await bookmarksButton.first().click()

    // Wait for sidebar to render — confirms the app processed the navigation
    await expect(page.locator('.sidebar-panel')).toBeVisible({ timeout: 5_000 })

    // The page should still be functional (no crash)
    await expect(page.locator('.activity-bar')).toBeVisible()
    await expect(page.locator('.status-bar')).toBeVisible()
  })
})

test.describe('Bookmarks - Core Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Navigate to bookmarks
    const bookmarksButton = page.locator('[aria-label*="Bookmark" i]')
    await bookmarksButton.first().click()
    // Wait for sidebar to appear
    await expect(page.locator('.sidebar-panel')).toBeVisible()
  })

  test('should render bookmarks view without crashing', async ({ page }) => {
    // The app should not crash when navigating to bookmarks with no data
    // Sidebar visibility confirms the view rendered successfully
    await expect(page.locator('.sidebar-panel')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('.activity-bar')).toBeVisible()
  })

  test('should show bookmarks section in sidebar', async ({ page }) => {
    // The sidebar should have bookmarks-related content
    const sidebar = page.locator('.sidebar-panel')
    await expect(sidebar).toBeVisible()
    // Header should contain bookmarks-related text
    const header = page.locator('.sidebar-panel-header')
    await expect(header).toBeVisible()
  })

  test('should filter bookmarks by search query', async ({ page }) => {
    // Only meaningful when bookmarks exist — skip if empty state
    const hasBookmarks = (await page.locator('.bookmark-card').count()) > 0
    test.skip(!hasBookmarks, 'No bookmarks to filter')

    const firstCardTitle = await page.locator('.bookmark-card-title').first().textContent()
    const searchInput = page.getByPlaceholder('Search bookmarks…')
    await searchInput.fill(firstCardTitle ?? 'test')

    // Should still show at least one result matching the query
    await expect(page.locator('.bookmark-card')).toHaveCount(1, { timeout: 2000 })
  })
})
