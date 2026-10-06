import { test, expect, waitForAppReady } from './fixtures'

/**
 * E2E tests for the Bookmarks feature.
 *
 * These tests verify that bookmarks navigation works in the running app.
 * Convex is mocked in E2E mode. Loading/error scenarios use the default fixture;
 * populated search uses explicit local query results and never a real service.
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

  test('should replace stalled bookmark loading with a retryable error', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'electron-cdp', 'Requires browser E2E Convex mocks')

    await waitForAppReady(page)

    await page.getByRole('button', { name: 'Bookmarks', exact: true }).click()
    await page.getByText('All Bookmarks', { exact: true }).click()

    await expect(page.getByText('Loading bookmarks…')).toHaveCount(2)
    await expect(page.getByText('Unable to load bookmarks')).toHaveCount(2, { timeout: 12_000 })
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(2)
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

  test.describe('populated local fixtures', () => {
    test.use({
      convexQueries: {
        'bookmarks:list': [
          {
            _id: 'fixture-alpha',
            title: 'Alpha handbook',
            url: 'https://alpha.invalid/handbook',
            category: 'Guides',
            sortOrder: 0,
            createdAt: 1,
            updatedAt: 1,
          },
          {
            _id: 'fixture-beta',
            title: 'Beta reference',
            url: 'https://beta.invalid/reference',
            category: 'Guides',
            sortOrder: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        'bookmarks:listCategories': ['Guides'],
      },
    })

    test('should filter bookmarks by search query', async ({ page }) => {
      await page.getByText('All Bookmarks', { exact: true }).click()
      const cards = page.locator('.bookmark-card')
      const titles = cards.locator('.bookmark-card-title')
      await expect(titles).toHaveText(['Alpha handbook', 'Beta reference'])

      const searchInput = page.getByPlaceholder('Search bookmarks…')
      await searchInput.fill('Alpha')
      await expect(titles).toHaveText(['Alpha handbook'])
      await expect(cards).toHaveCount(1)

      await searchInput.clear()
      await expect(titles).toHaveText(['Alpha handbook', 'Beta reference'])
      await expect(cards).toHaveCount(2)
    })
  })
})
