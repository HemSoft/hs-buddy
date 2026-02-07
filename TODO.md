# Buddy - TODO

| Status | Priority | Task | Notes |
|--------|----------|------|-------|
| 📋 | Low | [Implement offline queue](#implement-offline-queue) | Catch-up logic on reconnect |
| ✅ | Medium | [Repos of Interest feature](#repos-of-interest-feature) | Folder-organized bookmark system for GitHub repos (2026-02) |
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

**Remaining: 1** | **Completed: 27** (96%)

---

## Phase 2: Execution Engine

### Implement offline queue

**Goal**: Handle missed schedules when app was closed.

**Approach**:

- On Electron startup, query schedules where `nextRunAt < now`
- Apply `missedPolicy`:
  - `skip`: Update `nextRunAt` without running
  - `catchup`: Create runs for all missed intervals
  - `last`: Create one run covering all missed
- Process queue before resuming normal polling

**Location**: `electron/workers/offlineSync.ts`

---

### Repos of Interest feature

**Goal**: Add a bookmarking system for GitHub repos with folder organization under the Pull Requests section.

**Features**:

- New tree node "Repos of Interest" under Pull Requests
- Create/rename/delete folders (e.g., "Relias" for work, "Home" for personal)
- Add repos by URL (e.g., `https://github.com/relias-engineering/ai-skills`)
- Click repo to open in browser
- Persist in Convex (new `repoBookmarks` table with folder field)

**UI**:

- Tree view with folders as parent nodes
- Context menu: Add Repo, New Folder, Rename, Delete
- Modal for adding repo URL (extracts org/repo name automatically)

**Repos to add when implemented**:

- Relias: `https://github.com/relias-engineering/ai-skills`

**Location**: `src/components/ReposOfInterest.tsx`, `convex/repoBookmarks.ts`
