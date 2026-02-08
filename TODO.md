# Buddy - TODO

| Status | Priority | Task | Notes |
|--------|----------|------|-------|
| ✅ | High | [Improve Welcome to Buddy window](#improve-welcome-to-buddy-window) | Convex-backed stats dashboard, session tracking (2026-02) |
| ✅ | High | [Expand repo detail view](#expand-repo-detail-view) | Rich card-based repo info panel with caching (2026-02) |
| 📋 | High | [Make repos expandable folders](#make-repos-expandable-folders) | Expand repos to show Issues & PRs as children |
| ✅ | Low | Implement offline queue | Catch-up logic on reconnect (2026-02) |
| ✅ | Medium | Repos of Interest feature | Folder-organized bookmark system for GitHub repos (2026-02) |
| ✅ | Medium | Add run history view | Real-time status, filters, expandable output (2026-02) |
| ✅ | Medium | Implement skill-worker | Copilot CLI spawn, --allow-all mode, abort/timeout (2026-02) |
| ✅ | Medium | Implement ai-worker | Copilot CLI spawn, model selection, abort support (2026-02) |
| ✅ | **High** | Build task dispatch system | Dispatcher + exec worker + Convex claiming (2026-02) |
| ✅ | High | Implement exec-worker | spawn()-based shell execution, timeout, abort (2026-02) |
| ✅ | **High** | Restructure electron/main.ts | Split 423→95 lines, 8 new modules (2026-02) |
| ✅ | High | Job management UI | CRUD, context menus, worker-type forms (2026-02) |
| ✅ | High | Implement Convex cron job | Runs every minute via crons.ts (2026-02) |
| ✅ | High | Data prefetch + persistent cache | PR data survives restarts, background refresh (2026-02) |
| ✅ | Medium | Create schedule editor dialog | Modal with CronBuilder, job selector (2025-02) |
| ✅ | High | Initialize Convex project | Generated types ready (2025-02) |
| ✅ | High | Define Convex schema | `convex/schema.ts` with jobs, schedules, runs (2025-01) |
| ✅ | High | Add Convex client to Electron | ConvexClientProvider, useConvex hooks (2025-01) |
| ✅ | High | Implement schedule CRUD functions | `convex/schedules.ts`, `jobs.ts`, `runs.ts` (2025-01) |
| ✅ | Medium | Add Workflows activity bar icon | RefreshCw icon in ActivityBar (2025-01) |
| ✅ | Medium | Build Schedules sidebar + list | ScheduleList component with status badges (2025-01) |
| ✅ | Medium | Port CronBuilder component | From hs-conductor with visual builder (2025-01) |
| ✅ | Medium | Implement schedule toggles | Toggle mutation in useConvex hooks (2025-02) |
| ✅ | High | Tabbed window system for PRs | Tabs above content area, no duplicates (2025-01) |
| ✅ | High | Fix Recently Merged date range | 30-day default, configurable in Settings (2025-01) |
| ✅ | High | App-wide task queue system | Named queues with concurrency control (2025-01) |
| ✅ | High | Settings UI with form-based editing | SidebarPanel navigation, auto-save (2025-01) |
| ✅ | Medium | Fix taskbar app name | "HS-body" → "Buddy" (2025-01) |
| ✅ | Medium | Create Help menu with About window | Beautiful About dialog with branding (2025-01) |
| ✅ | Medium | Design and create app icon | Gold/orange gradient Users icon (2025-01) |

## Progress

**Remaining: 1** | **Completed: 30** (97%)

---

## Remaining Items

### Improve Welcome to Buddy window ✅

**Completed**: 2026-02

**What was built**:
- `convex/schema.ts` — Added `buddyStats` table (15 counter fields + time tracking, singleton keyed `"default"`)
- `convex/buddyStats.ts` — Full Convex module: `get` query, `increment`/`batchIncrement` mutations, `recordSessionStart`/`recordSessionEnd`/`checkpointUptime` mutations
- `src/hooks/useConvex.ts` — `useBuddyStats()` reactive hook, `useBuddyStatsMutations()` for all mutations
- `src/components/WelcomePanel.tsx` — About-modal-inspired dashboard with gold gradient icon, 3×2 stat grid (PRs Viewed, Active PRs, Repos Browsed, Runs Executed, Bookmarks, Member Since), uptime badge, 4 quick-action buttons, HemSoft footer
- `src/components/WelcomePanel.css` — Full responsive CSS using theme variables
- `src/App.tsx` — Replaced placeholder, added `tabsOpened`/`prsViewed`/`prsReviewed`/`prsMergedWatched` tracking + session lifecycle (start, 5-min checkpoint, beforeunload end)
- `src/components/SidebarPanel.tsx` — `reposBrowsed`/`bookmarksCreated` increments
- `src/components/automation/JobEditor.tsx` — `jobsCreated` increment on create
- `src/components/automation/ScheduleEditor.tsx` — `schedulesCreated` increment on create

**Deferred**: `settingsChanged` tracking (complex save patterns across 4 settings files), `runsTriggered`/`runsCompleted`/`runsFailed` tracking (electron-side dispatcher)

---

### Expand repo detail view ✅

**Completed**: 2026-02

**What was built**:
- `src/api/github.ts` — Added `fetchRepoDetail(owner, repo)` method with parallel fetching of repo metadata, languages, recent commits (10), top contributors (10), open PR count, and latest CI/CD workflow run. Added `RepoDetail`, `RepoCommit`, `RepoContributor`, `WorkflowRun` types.
- `src/components/RepoDetailPanel.tsx` — Card-based detail view with: header (name, description, visibility/archived/fork/language/license/CI badges, topic tags, Open on GitHub + Homepage buttons), stats bar (stars, forks, watchers, issues, PRs, size, default branch), content grid (language breakdown bar + list, recent commits list with avatars, top contributors grid, repo info card with dates/size/branch/license)
- `src/components/RepoDetailPanel.css` — Full responsive CSS using theme variables, VS Code dark theme aesthetic matching existing cards
- `src/components/SidebarPanel.tsx` — Changed repo click from `openExternal(url)` to `onItemSelect('repo-detail:owner/repo')` to open the detail panel in a tab
- `src/App.tsx` — Added dynamic `repo-detail:owner/repo` viewId handling, `getViewLabel()` helper for dynamic tab labels, renders `RepoDetailPanel` from parsed viewId
- Data cached via `dataCache` with `repo-detail:{owner}/{repo}` key, auto-refreshes on PR refresh interval

---

### Make repos expandable folders

**Location**: `src/components/SidebarPanel.tsx` (org repos section)

**Problem**: Repos are currently leaf nodes in the sidebar tree. We want them to be expandable folders that reveal Issues and PRs as child nodes.

**Proposed Solution**:

1. Change repo items from leaf `FileText` icons to expandable `Folder`/`FolderOpen`
2. On expand, fetch and show two child groups:
   - **Issues** (count badge) — clicking opens an Issue list for that repo
   - **Pull Requests** (count badge) — clicking opens a PR list for that repo
3. Lazy-load counts on first expand (GitHub API: `GET /repos/{owner}/{repo}`)
4. Child items open dedicated filtered views in the content panel
5. Preserve existing bookmark star and language badge on the repo row
