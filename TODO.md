# Buddy - TODO

| Status | Priority | Task | Notes |
|--------|----------|------|-------|
| ✅ | High | [Job management UI](#job-management-ui) | CRUD, context menus, worker-type forms (2026-02) |
| ✅ | High | [Implement Convex cron job](#implement-convex-cron-job) | Runs every minute via crons.ts (2026-02) |
| 📋 | High | [Build task dispatch system](#build-task-dispatch-system) | Convex → Electron communication |
| 📋 | High | [Implement exec-worker](#implement-exec-worker) | PowerShell/Bash execution in main process |
| 📋 | Medium | [Implement ai-worker](#implement-ai-worker) | LLM integration (OpenRouter/Claude) |
| 📋 | Medium | [Implement skill-worker](#implement-skill-worker) | Claude CLI spawning for skills |
| 📋 | Medium | [Add run history view](#add-run-history-view) | Real-time status updates |
| 📋 | Low | [Implement offline queue](#implement-offline-queue) | Catch-up logic on reconnect |
| 📋 | Medium | [Repos of Interest feature](#repos-of-interest-feature) | Folder-organized bookmark system for GitHub repos |
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

**Remaining: 7** | **Completed: 19** (73%)

---

## Phase 2: Execution Engine

### Job management UI ✅

**Status**: Completed (2026-02)

**Implementation**:
- Created `JobList.tsx` component with grouped view (Exec, AI, Skill)
- Created `JobEditor.tsx` modal for create/edit/duplicate
- Worker-type-specific configuration forms:
  - **exec**: command, cwd, timeout, shell (powershell/bash/cmd)
  - **ai**: prompt, model, maxTokens, temperature
  - **skill**: skillName, action, params (JSON)
- Right-click context menus with Edit, Duplicate, Delete, Run Now
- Worker type badges and config previews
- Uses `convex/jobs.ts` CRUD mutations
- "Run Now" creates manual runs via `runs.create`

**Terminology Update (2026-02)**: Renamed from "Workloads" to "Jobs" for clarity. Section renamed from "Workflows" to "Automation". Backend schema fully renamed to use "jobs" table.

**Location**: `src/components/automation/JobList.tsx`, `JobEditor.tsx`, `JobList.css`, `JobEditor.css`

---

### Implement Convex cron job ✅

**Status**: Completed (2026-02)

**Implementation**:
- Created `convex/crons.ts` with 1-minute interval cron job
- Created `convex/scheduleScanner.ts` with `scanAndDispatch` internal mutation
- Uses `cron-parser` v5 for calculating next run times
- Queries schedules where `enabled=true` and `nextRunAt <= now`
- Creates pending runs, updates `lastRunAt` and `nextRunAt`
- Prevents duplicate runs by checking for existing pending/running runs
- Updated `schedules.ts` to initialize `nextRunAt` on create/toggle/update

---

### Build task dispatch system

**Goal**: Electron polls Convex for pending runs and executes them.

**Approach**:
- Main process polls `runs.listByStatus("pending")` every 10 seconds
- Claims a run by marking it "running"
- Dispatches to appropriate worker based on job.workerType
- Updates run status on completion/failure

**Location**: `electron/workers/dispatcher.ts`

---

### Implement exec-worker

**Goal**: Execute shell commands (PowerShell, Bash, cmd).

**Approach**:
- Spawn child process with job.config.command
- Capture stdout/stderr
- Respect timeout setting
- Return output to Convex run record

**Location**: `electron/workers/execWorker.ts`

---

### Implement ai-worker

**Goal**: Execute LLM prompts via OpenRouter or Claude API.

**Approach**:
- Read job.config.prompt, model, maxTokens, temperature
- Call OpenRouter API (or Claude direct)
- Store response in run output

**Location**: `electron/workers/aiWorker.ts`

---

### Implement skill-worker

**Goal**: Spawn Claude CLI to execute skills.

**Approach**:
- Read job.config.skillName, action, params
- Build Claude CLI command with skill context
- Execute and capture output
- Parse structured response if available

**Location**: `electron/workers/skillWorker.ts`

---

### Add run history view

**Goal**: Display recent runs with real-time status updates.

**Approach**:
- Create `RunList.tsx` component
- Use `useRecentRuns()` hook with Convex subscription
- Show status badges (pending → running → completed/failed)
- Expandable rows for full output

**Location**: `src/components/automation/RunList.tsx`

---

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

---

## Phase 1: Automation Foundation ✅

All Phase 1 tasks complete! See [VISION.md](VISION.md) for full architecture.

**Implemented:**
- Convex backend with schedules, jobs, runs tables
- ScheduleList with create/edit/toggle/delete
- ScheduleEditor modal with CronBuilder
- Real-time subscriptions via Convex

---

## Completed

Previous milestone work:

- VS Code-style activity bar layout
- Resizable sidebar pane (Allotment)
- Window state persistence
- Zoom level persistence
- Custom tooltips for activity bar
- PR cards redesign
- External links open in default browser
- PR filtering by mode (My PRs, Needs Review, Recently Merged)
- Title bar app name changed to "Buddy"
