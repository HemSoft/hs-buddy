import { test, expect } from '@playwright/test'

/**
 * E2E tests for the Bookmarks feature.
 *
 * These tests verify that bookmarks load properly in the running app.
 * They will FAIL if:
 *   - The Convex backend is unreachable (stuck on "Loading bookmarks…" forever)
 *   - The bookmarks view doesn't render at all
 *   - The app crashes on navigation to bookmarks
 *
 * Prerequisites:
 *   - App running: `bun run dev` or Electron with CDP
 *   - Convex dev server running: `npx convex dev`
 */

test.describe('Bookmarks - Loading & Connectivity', () => {
  test('should not show loading spinner indefinitely', async ({ page }) => {
    await page.goto('/')

    // Navigate to the Bookmarks view via the activity bar
    const bookmarksButton = page.locator('[title*="Bookmark" i], [aria-label*="Bookmark" i]')
    if (await bookmarksButton.count() > 0) {
      await bookmarksButton.first().click()
    }

    // The loading spinner should disappear within 10 seconds.
    // Either bookmarks load successfully, or an error/empty state is shown.
    // This test FAILS if "Loading bookmarks…" persists forever.
    const loadingIndicator = page.getByText('Loading bookmarks…')

    // Wait up to 10 seconds for loading to resolve
    await expect(loadingIndicator).toBeHidden({ timeout: 10_000 })
  })

  test('should show bookmarks or empty state after loading', async ({ page }) => {
    await page.goto('/')

    // Navigate to bookmarks
    const bookmarksButton = page.locator('[title*="Bookmark" i], [aria-label*="Bookmark" i]')
    if (await bookmarksButton.count() > 0) {
      await bookmarksButton.first().click()
    }

    // After loading completes, we should see one of:
    // 1. Bookmark cards (data loaded)
    // 2. "No bookmarks yet" (empty state)
    // 3. A connection error message (graceful degradation)
    // But NOT the loading spinner still showing after 10s
    const successStates = page.locator(
      '.bookmark-card, :text("No bookmarks yet"), :text("connection"), :text("Unable to load")'
    )
    await expect(successStates.first()).toBeVisible({ timeout: 10_000 })
  })

  test('should display a connection error when Convex is unreachable', async ({ page }) => {
    // This test specifically validates graceful degradation.
    // When the Convex WebSocket connection fails, users should see
    // an actionable error message, NOT an infinite loading spinner.
    await page.goto('/')

    // Navigate to bookmarks
    const bookmarksButton = page.locator('[title*="Bookmark" i], [aria-label*="Bookmark" i]')
    if (await bookmarksButton.count() > 0) {
      await bookmarksButton.first().click()
    }

    // If Convex is down, within 10 seconds we should see either:
    // - Actual bookmark data (Convex is up — test passes trivially)
    // - A user-facing error about connectivity
    // - An empty/fallback state
    // The test FAILS if still showing "Loading bookmarks…" after 10s
    const resolvedState = page.locator(
      '.bookmark-card, :text("No bookmarks yet"), :text("Unable to load"), :text("offline"), :text("connection")'
    )

    // Use a generous timeout — the point is it should NOT be infinite
    await expect(resolvedState.first()).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('Bookmarks - Core Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Navigate to bookmarks
    const bookmarksButton = page.locator('[title*="Bookmark" i], [aria-label*="Bookmark" i]')
    if (await bookmarksButton.count() > 0) {
      await bookmarksButton.first().click()
    }
    // Wait for loading to complete (either data or error)
    const loadingIndicator = page.getByText('Loading bookmarks…')
    await expect(loadingIndicator).toBeHidden({ timeout: 15_000 })
  })

  test('should open the Add Bookmark dialog', async ({ page }) => {
    const addButton = page.locator('[title="Add bookmark"], button:has-text("Add")')
    await expect(addButton.first()).toBeVisible()
    await addButton.first().click()

    // Dialog should appear
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await expect(page.getByText('Add Bookmark')).toBeVisible()
  })

  test('should have search and filter controls', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search bookmarks…')
    await expect(searchInput).toBeVisible()

    const categoryFilter = page.locator('[title="Filter by category"]')
    await expect(categoryFilter).toBeVisible()

    const tagFilter = page.locator('[title="Filter by tag"]')
    await expect(tagFilter).toBeVisible()
  })

  test('should filter bookmarks by search query', async ({ page }) => {
    // Only meaningful when bookmarks exist — skip if empty state
    const hasBookmarks = await page.locator('.bookmark-card').count() > 0
    test.skip(!hasBookmarks, 'No bookmarks to filter')

    const firstCardTitle = await page.locator('.bookmark-card-title').first().textContent()
    const searchInput = page.getByPlaceholder('Search bookmarks…')
    await searchInput.fill(firstCardTitle ?? 'test')

    // Should still show at least one result matching the query
    await expect(page.locator('.bookmark-card')).toHaveCount(1, { timeout: 2000 })
  })
})
