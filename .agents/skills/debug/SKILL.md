---
name: debug
description: "V1.0 - Commands: diagnose, e2e, connect. Debug hs-buddy Electron app using Playwright, CDP, and Vite dev server. Use when the app has runtime bugs, UI won't load, features are broken, or E2E tests need writing."
hooks:
  PostToolUse:
    - matcher: "Read|Write|Edit"
      hooks:
        - type: prompt
          prompt: |
            If a file was read, written, or edited in the debug directory (path contains '.claude/skills/debug'), verify that history logging occurred.
            
            Check if History/{YYYY-MM-DD}.md exists and contains an entry for this interaction with:
            - Format: "## HH:MM - {Action Taken}"
            - One-line summary
            - Accurate timestamp (obtained via `Get-Date -Format "HH:mm"` command, never guessed)
            
            If history entry is missing or incomplete, provide specific feedback on what needs to be added.
            If history entry exists and is properly formatted, acknowledge completion.
  Stop:
    - matcher: "*"
      hooks:
        - type: prompt
          prompt: |
            Before stopping, if debug was used (check if any files in debug directory were modified), verify that the interaction was logged:
            
            1. Check if History/{YYYY-MM-DD}.md exists in debug directory
            2. Verify it contains an entry with format "## HH:MM - {Action Taken}" where HH:MM was obtained via `Get-Date -Format "HH:mm"` (never guessed)
            3. Ensure the entry includes a one-line summary of what was done
            
            If history entry is missing:
            - Return {"decision": "block", "reason": "History entry missing. Please log this interaction to History/{YYYY-MM-DD}.md with format: ## HH:MM - {Action Taken}\n{One-line summary}\n\nCRITICAL: Get the current time using `Get-Date -Format \"HH:mm\"` command - never guess the timestamp."}
            
            If history entry exists:
            - Return {"decision": "approve"}
            
            Include a systemMessage with details about the history entry status.
---

# Debug hs-buddy

Debug the hs-buddy Electron desktop app (React 19 + TypeScript + Vite + Convex).

## Architecture Overview

```
Electron Main Process
  └─ BrowserWindow (frame: false)
       └─ Vite Dev Server (localhost:5173)
            └─ React 19 App
                 └─ Convex Client → ws://127.0.0.1:3210/api/sync
```

- **Electron**: Hosts the app, provides IPC via `window.electronAPI`
- **Vite**: Dev server on `http://localhost:5173` (accessible directly in browser)
- **Convex**: Serverless backend, local dev server on port 3210 via WebSocket
- **CDP**: Chrome DevTools Protocol on port 9222 when app runs with `--remote-debugging-port=9222`

## Commands

### diagnose

Diagnose runtime issues in the running app.

**Steps:**
1. Connect to `http://localhost:5173` via Playwright MCP browser tools
2. Check console errors — common patterns:
   - `WebSocket connection to 'ws://127.0.0.1:3210/...' failed` → Convex dev server is offline
   - `Cannot read properties of undefined (reading 'invoke')` → Electron IPC unavailable (running in plain browser)
   - `[DataCache] Failed to initialize` → Same IPC issue
3. Check for infinite loading states — components that return `undefined` from Convex hooks
4. Look for React error boundaries that swallowed errors silently

**Common root causes:**
| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| Infinite "Loading..." spinner | Convex dev server not running | `npx convex dev` |
| `window.electronAPI` undefined | Accessing from browser, not Electron | Expected in browser-only testing |
| Blank white screen | Unhandled exception in render | Check console for React errors |
| WebSocket refused on 3210 | Convex offline or wrong port | Verify `npx convex dev` is running |

### e2e

Write or run Playwright E2E tests.

**Configuration:** `playwright.config.ts`
- Test directory: `./e2e/`
- Base URL: `http://localhost:5173`
- Project name: `electron-e2e`
- Timeout: 30s (expect: 10s)
- Screenshots on failure, trace on first retry

**Running tests:**
```bash
npx playwright test                           # All E2E tests
npx playwright test e2e/bookmarks.spec.ts     # Single file
npx playwright test --project=electron-e2e    # Specific project
```

**Prerequisites before running:**
1. Start the app: `bun run dev` (launches Vite on localhost:5173)
2. Start Convex: `npx convex dev` (local backend on port 3210)
3. Tests connect to the running Vite server, NOT directly to Electron

**Writing new E2E tests — TDD pattern:**
1. Write tests that demonstrate the bug (red phase)
2. Run tests to confirm they fail
3. Fix the component code
4. Run tests to confirm they pass (green phase)
5. Add matching Vitest unit tests for CI (E2E needs live app, unit tests don't)

**Navigation pattern for E2E tests:**
```typescript
// Navigate to a view via the activity bar
const button = page.locator('[title*="Bookmark" i], [aria-label*="Bookmark" i]')
if (await button.count() > 0) {
  await button.first().click()
}
```

### connect

Connect to the running app for interactive debugging.

**Option A — Vite dev server (preferred):**
Navigate Playwright MCP to `http://localhost:5173/`. This gives access to the full React app minus Electron-specific IPC features.

**Option B — CDP (full Electron context):**
If the app was launched with `--remote-debugging-port=9222`:
```typescript
// In playwright config or test
connectOverCDP: 'http://127.0.0.1:9222'
```

**Playwright MCP browser tools workflow:**
1. `browser_navigate` to `http://localhost:5173/`
2. `browser_snapshot` to see current page state
3. `browser_console_messages` to check for errors
4. `browser_click` / `browser_type` to interact
5. `browser_take_screenshot` for visual verification

## Key Files

| File | Purpose |
|------|---------|
| `playwright.config.ts` | E2E test configuration |
| `e2e/*.spec.ts` | E2E test files |
| `src/hooks/useConvex.ts` | Convex hook wrappers (useBookmarks, etc.) |
| `src/hooks/useBookmarkListState.ts` | Bookmark state management |
| `src/components/bookmarks/BookmarkList.tsx` | Bookmark list with timeout handling |
| `electron/main.ts` | Electron main process |

## Debugging Patterns

### Infinite Loading State

When a component shows a loading state forever:

1. **Root cause**: Convex `useQuery` returns `undefined` while pending — if the server never responds, it stays `undefined` forever.
2. **Detection**: Check for `if (data === undefined) return <Loading />` patterns without timeouts.
3. **Fix pattern** (implemented in BookmarkList.tsx):

```typescript
const [loadTimedOut, setLoadTimedOut] = useState(false)

useEffect(() => {
  if (data !== undefined) {
    setLoadTimedOut(false)
    return
  }
  const timer = setTimeout(() => setLoadTimedOut(true), 10_000)
  return () => clearTimeout(timer)
}, [data])

if (data === undefined) {
  if (loadTimedOut) {
    return <ErrorState onRetry={() => setLoadTimedOut(false)} />
  }
  return <LoadingSpinner />
}
```

### Unit Testing Timeout Behavior

Fake timers + `act()` pattern for Vitest:

```typescript
it('shows error after timeout', async () => {
  vi.useFakeTimers()
  mockDataReturn = undefined
  render(<Component />)
  expect(screen.getByText('Loading…')).toBeInTheDocument()

  await act(async () => {
    vi.advanceTimersByTime(10_000)
  })

  expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
  expect(screen.getByText(/unable to load|timed out/i)).toBeInTheDocument()
  vi.useRealTimers()
})
```

**Important**: Use `act()` to wrap `vi.advanceTimersByTime()` — `waitFor` deadlocks with fake timers.

### Mocking Limitations

Existing unit tests mock `useConvex` entirely:
```typescript
vi.mock('../../hooks/useConvex', () => ({
  useBookmarks: () => mockBookmarksReturn,
}))
```

This means unit tests **cannot** catch connectivity issues. For connectivity bugs:
- Use E2E tests against the live app (catches real WebSocket failures)
- Add timeout/error handling to components (testable with fake timers)
- Both layers are needed: E2E for detection, unit tests for CI regression

## Troubleshooting

**Playwright can't connect to localhost:5173:**
- Ensure `bun run dev` is running
- Check that Vite hasn't crashed (port conflict, syntax error)

**Tests pass locally but E2E fails:**
- E2E requires live app + Convex; CI only runs Vitest unit tests
- Add a `test:e2e` script that documents prerequisites

**Console shows IPC errors in browser:**
- Expected when accessing via `localhost:5173` directly (not inside Electron)
- `window.electronAPI` / `window.shell` only exist in Electron context
- Components should gracefully handle missing IPC with fallbacks
