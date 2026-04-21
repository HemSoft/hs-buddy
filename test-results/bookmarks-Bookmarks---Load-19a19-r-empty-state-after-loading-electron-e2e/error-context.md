# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: bookmarks.spec.ts >> Bookmarks - Loading & Connectivity >> should show bookmarks or empty state after loading
- Location: e2e\bookmarks.spec.ts:36:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.bookmark-card, :text("No bookmarks yet"), :text("connection"), :text("Unable to load")').first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('.bookmark-card, :text("No bookmarks yet"), :text("connection"), :text("Unable to load")').first()

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test'
  2   | 
  3   | /**
  4   |  * E2E tests for the Bookmarks feature.
  5   |  *
  6   |  * These tests verify that bookmarks load properly in the running app.
  7   |  * They will FAIL if:
  8   |  *   - The Convex backend is unreachable (stuck on "Loading bookmarks…" forever)
  9   |  *   - The bookmarks view doesn't render at all
  10  |  *   - The app crashes on navigation to bookmarks
  11  |  *
  12  |  * Prerequisites:
  13  |  *   - App running: `bun run dev` or Electron with CDP
  14  |  *   - Convex dev server running: `npx convex dev`
  15  |  */
  16  | 
  17  | test.describe('Bookmarks - Loading & Connectivity', () => {
  18  |   test('should not show loading spinner indefinitely', async ({ page }) => {
  19  |     await page.goto('/')
  20  | 
  21  |     // Navigate to the Bookmarks view via the activity bar
  22  |     const bookmarksButton = page.locator('[title*="Bookmark" i], [aria-label*="Bookmark" i]')
  23  |     if (await bookmarksButton.count() > 0) {
  24  |       await bookmarksButton.first().click()
  25  |     }
  26  | 
  27  |     // The loading spinner should disappear within 10 seconds.
  28  |     // Either bookmarks load successfully, or an error/empty state is shown.
  29  |     // This test FAILS if "Loading bookmarks…" persists forever.
  30  |     const loadingIndicator = page.getByText('Loading bookmarks…')
  31  | 
  32  |     // Wait up to 10 seconds for loading to resolve
  33  |     await expect(loadingIndicator).toBeHidden({ timeout: 10_000 })
  34  |   })
  35  | 
  36  |   test('should show bookmarks or empty state after loading', async ({ page }) => {
  37  |     await page.goto('/')
  38  | 
  39  |     // Navigate to bookmarks
  40  |     const bookmarksButton = page.locator('[title*="Bookmark" i], [aria-label*="Bookmark" i]')
  41  |     if (await bookmarksButton.count() > 0) {
  42  |       await bookmarksButton.first().click()
  43  |     }
  44  | 
  45  |     // After loading completes, we should see one of:
  46  |     // 1. Bookmark cards (data loaded)
  47  |     // 2. "No bookmarks yet" (empty state)
  48  |     // 3. A connection error message (graceful degradation)
  49  |     // But NOT the loading spinner still showing after 10s
  50  |     const successStates = page.locator(
  51  |       '.bookmark-card, :text("No bookmarks yet"), :text("connection"), :text("Unable to load")'
  52  |     )
> 53  |     await expect(successStates.first()).toBeVisible({ timeout: 10_000 })
      |                                         ^ Error: expect(locator).toBeVisible() failed
  54  |   })
  55  | 
  56  |   test('should display a connection error when Convex is unreachable', async ({ page }) => {
  57  |     // This test specifically validates graceful degradation.
  58  |     // When the Convex WebSocket connection fails, users should see
  59  |     // an actionable error message, NOT an infinite loading spinner.
  60  |     await page.goto('/')
  61  | 
  62  |     // Navigate to bookmarks
  63  |     const bookmarksButton = page.locator('[title*="Bookmark" i], [aria-label*="Bookmark" i]')
  64  |     if (await bookmarksButton.count() > 0) {
  65  |       await bookmarksButton.first().click()
  66  |     }
  67  | 
  68  |     // If Convex is down, within 10 seconds we should see either:
  69  |     // - Actual bookmark data (Convex is up — test passes trivially)
  70  |     // - A user-facing error about connectivity
  71  |     // - An empty/fallback state
  72  |     // The test FAILS if still showing "Loading bookmarks…" after 10s
  73  |     const resolvedState = page.locator(
  74  |       '.bookmark-card, :text("No bookmarks yet"), :text("Unable to load"), :text("offline"), :text("connection")'
  75  |     )
  76  | 
  77  |     // Use a generous timeout — the point is it should NOT be infinite
  78  |     await expect(resolvedState.first()).toBeVisible({ timeout: 15_000 })
  79  |   })
  80  | })
  81  | 
  82  | test.describe('Bookmarks - Core Interactions', () => {
  83  |   test.beforeEach(async ({ page }) => {
  84  |     await page.goto('/')
  85  |     // Navigate to bookmarks
  86  |     const bookmarksButton = page.locator('[title*="Bookmark" i], [aria-label*="Bookmark" i]')
  87  |     if (await bookmarksButton.count() > 0) {
  88  |       await bookmarksButton.first().click()
  89  |     }
  90  |     // Wait for loading to complete (either data or error)
  91  |     const loadingIndicator = page.getByText('Loading bookmarks…')
  92  |     await expect(loadingIndicator).toBeHidden({ timeout: 15_000 })
  93  |   })
  94  | 
  95  |   test('should open the Add Bookmark dialog', async ({ page }) => {
  96  |     const addButton = page.locator('[title="Add bookmark"], button:has-text("Add")')
  97  |     await expect(addButton.first()).toBeVisible()
  98  |     await addButton.first().click()
  99  | 
  100 |     // Dialog should appear
  101 |     const dialog = page.locator('[role="dialog"]')
  102 |     await expect(dialog).toBeVisible()
  103 |     await expect(page.getByText('Add Bookmark')).toBeVisible()
  104 |   })
  105 | 
  106 |   test('should have search and filter controls', async ({ page }) => {
  107 |     const searchInput = page.getByPlaceholder('Search bookmarks…')
  108 |     await expect(searchInput).toBeVisible()
  109 | 
  110 |     const categoryFilter = page.locator('[title="Filter by category"]')
  111 |     await expect(categoryFilter).toBeVisible()
  112 | 
  113 |     const tagFilter = page.locator('[title="Filter by tag"]')
  114 |     await expect(tagFilter).toBeVisible()
  115 |   })
  116 | 
  117 |   test('should filter bookmarks by search query', async ({ page }) => {
  118 |     // Only meaningful when bookmarks exist — skip if empty state
  119 |     const hasBookmarks = await page.locator('.bookmark-card').count() > 0
  120 |     test.skip(!hasBookmarks, 'No bookmarks to filter')
  121 | 
  122 |     const firstCardTitle = await page.locator('.bookmark-card-title').first().textContent()
  123 |     const searchInput = page.getByPlaceholder('Search bookmarks…')
  124 |     await searchInput.fill(firstCardTitle ?? 'test')
  125 | 
  126 |     // Should still show at least one result matching the query
  127 |     await expect(page.locator('.bookmark-card')).toHaveCount(1, { timeout: 2000 })
  128 |   })
  129 | })
  130 | 
```