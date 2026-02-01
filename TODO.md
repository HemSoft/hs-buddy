# Buddy - TODO

## Task Tracker

| # | Status | Task | Priority | Notes |
|---|--------|------|----------|-------|
| 1 | ✅ | Tabbed window system for PRs | High | [Details](#1-tabbed-window-system) |
| 2 | ✅ | Fix Recently Merged date range | High | [Details](#2-recently-merged-date-range) |
| 3 | ✅ | Fix taskbar app name ("HS-body" → "Buddy") | Medium | [Details](#3-taskbar-app-name) |
| 4 | ✅ | Create Help menu with About window | Medium | [Details](#4-help-menu-and-about-window) |
| 5 | ✅ | Design and create app icon | Medium | [Details](#5-app-icon) |
| 6 | ✅ | App-wide task queue system | High | [Details](#6-task-queue-system) |
| 7 | ✅ | Settings UI with form-based editing | High | [Details](#7-settings-ui-with-form-based-editing) |

---

## Task Details

### 1. Tabbed Window System

**Problem:** Currently, clicking sidebar items replaces the main content. Switching between PR views (My PRs, Needs Review, Recently Merged) requires a full reload each time, losing context.

**Solution:** Implement a tabbed interface above the main content area.

**Behavior:**

- Each sidebar click opens a **new tab** (does not replace current content)
- Tabs appear above the PR content area
- Users can switch between tabs without reloading
- Tabs can be closed individually
- **No duplicate tabs** - if a view is already open, activate that tab instead
- **No tab limit** - unlimited tabs allowed
- **No persistence** - tabs start fresh on each app launch (keep it simple)
- Same tabbed behavior for all sections (PRs, Skills, Tasks, Insights)

---

### 2. Recently Merged Date Range

**Problem:** The Recently Merged view returned 98 PRs, some nearly a year old. This is too many and not "recent."

**Solution:** Add a configurable date range filter.

**Implementation:**

- **Default:** 7 days
- **User configurable** via Settings
- Options: 7, 14, 30, 60, 90 days (dropdown in Settings)

---

### 3. Taskbar App Name

**Problem:** The Windows taskbar shows "HS-body" instead of "Buddy".

**Location:** Likely in `electron/main.ts` or `electron-builder.json5`

**Fix:** Update the `title` property and possibly `productName` in config files.

---

### 4. Help Menu and About Window

**Requirements:**

- Add "Help" menu to the menu bar
- Include "About" menu item
- Create beautiful About window (reference: hs-conductor)
- Display:
  - App icon
  - App name and version
  - HemSoft Developments branding
  - Build info / commit hash (optional)
  - Links (GitHub, website, etc.)

---

### 5. App Icon

**Requirements:**

- Design new icon for Buddy
- Same color theme as hs-conductor icon
- Different style/design but cohesive with HemSoft branding
- Formats needed:
  - `.ico` for Windows taskbar/exe
  - `.png` for About window and other UI elements
  - Various sizes (16x16, 32x32, 48x48, 256x256, 512x512)

**Reference:** `D:\github\HemSoft\hs-conductor\admin\` for icon generation scripts

---

### 6. Task Queue System

**Problem:** Rapidly triggering multiple async operations (e.g., clicking all three PR views, or future features like Skills + Tasks + PRs simultaneously) causes race conditions. Concurrent API calls overwhelm rate limiters and cause stalls.

**Solution:** Create a reusable, app-wide task queue system.

**Features:**

- **Named queues** - Different queues for different concerns (e.g., `github`, `bitbucket`, `skills`)
- **Concurrency control** - Configurable max concurrent tasks per queue (default: 1 for serialization)
- **Priority support** - Optional priority levels for urgent tasks
- **Cancellation** - AbortController integration for cleanup on component unmount
- **React hooks** - `useTaskQueue()` hook for easy component integration
- **Progress tracking** - Optional callbacks for task status updates

**Architecture:**

```
src/
  services/
    taskQueue.ts       # Core TaskQueue class
    index.ts           # Export singleton instances
  hooks/
    useTaskQueue.ts    # React hook wrapper
```

**Usage Example:**

```typescript
// In component
const { enqueue, cancel } = useTaskQueue('github');

useEffect(() => {
  const taskId = enqueue(async (signal) => {
    return await githubClient.fetchMyPRs(signal);
  });
  
  return () => cancel(taskId); // Cleanup on unmount
}, [mode]);
```

**Benefits:**

- Reusable across PRs, Skills, Tasks, Insights
- Prevents API rate limit issues
- Clean component unmount handling
- Future-proof for additional integrations

---

### 7. Settings UI with Form-Based Editing

**Problem:** Settings currently shows read-only values. Users must "Open in Editor" to edit raw JSON - inconsistent with other sections that use SidebarPanel navigation.

**Solution:** Make Settings use SidebarPanel like other sections, with individual form-based settings pages.

**Settings Categories (sidebar items):**

- `settings-accounts` - GitHub Accounts + Bitbucket Workspaces (list + CRUD)
- `settings-appearance` - Theme selector, sidebar width
- `settings-pullrequests` - Auto-refresh toggle, refresh interval, recently merged days
- `settings-advanced` - Config file path, "Open JSON" button, reset to defaults

**Implementation Steps:**

1. Add `'settings'` section to `sectionData` in `SidebarPanel.tsx`
2. Remove special-case that hides sidebar for settings in `App.tsx`
3. Add view labels and `renderContent()` cases for each settings view
4. Create section components:
   - `SettingsAccounts.tsx` - Account list with add/edit/delete
   - `SettingsAppearance.tsx` - Theme dropdown, sidebar width slider
   - `SettingsPullRequests.tsx` - Toggle + number inputs
   - `SettingsAdvanced.tsx` - JSON access, reset button
5. Add missing hooks: `useBitbucketWorkspaces()`, `useUISettings()`
6. Create reusable form components: `FormToggle`, `FormNumber`, `FormSelect`
7. Implement immediate auto-save (no save button, VS Code style)
8. Delete old monolithic `Settings.tsx`

**Behavior:**

- Click Settings in ActivityBar → sidebar shows settings categories
- Click category → form appears in content area
- Changes save immediately on input change
- "Open JSON" in Advanced section for power users

---

## Completed

| # | Task | Completed |
|---|------|-----------|
| 7 | Settings UI with form-based editing | ✅ |
| 1 | Tabbed window system for PRs | ✅ |
| 2 | Fix Recently Merged date range (30-day default, configurable) | ✅ |
| 3 | Taskbar app name shows "Buddy" | ✅ |
| 4 | Help menu with About dialog | ✅ |
| 5 | App icon (Users icon with gold/orange gradient) | ✅ |
| 6 | App-wide task queue system | ✅ |
| - | VS Code-style activity bar layout | ✅ |
| - | Resizable sidebar pane | ✅ |
| - | Window state persistence | ✅ |
| - | Zoom level persistence | ✅ |
| - | Custom tooltips for activity bar | ✅ |
| - | PR cards redesign | ✅ |
| - | External links open in default browser | ✅ |
| - | PR filtering by mode (My PRs, Needs Review, Recently Merged) | ✅ |
| - | Title bar app name changed to "Buddy" | ✅ |
