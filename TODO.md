# Buddy - TODO

| Status | Priority | Task | Notes |
|--------|----------|------|-------|
| 🚧 | High | [SFL Loop monitoring in Organizations tree](#sfl-loop-monitoring-in-organizations-tree) | Issue #128 is active in SFL; auto-detect SFL-enabled repos and show pipeline status node under each repo |
| 📋 | High | [Build project-scoped Copilot workspaces](#build-project-scoped-copilot-workspaces) | Issue #130 created; new top-level section for Codex-style multi-project agents backed by local git folders and GitHub Copilot SDK |
| 📋 | Medium | [Capture Copilot usage history](#capture-copilot-usage-history) | Scheduled snapshots of usage/spend so Buddy can show historical trends and graphs |
| 📋 | Medium | [Create cost telemetry dashboard](#create-cost-telemetry-dashboard) | Run counts, p50/p90 cost, monthly budget burn |
| 📋 | Medium | [Add branch cleanup to repo-audit](#add-branch-cleanup-to-repo-audit) | Detect and delete merged/orphaned agent-fix branches |
| 📋 | Medium | [PR Analyzers should post reviews, not update PR body](#pr-analyzers-should-post-reviews-not-update-pr-body) | Analyzers currently append verdicts to the PR body via `update_issue`; should use `add_comment` or proper PR review comments instead |
| 📋 | Medium | [Task Planner (Todoist Integration)](#task-planner-todoist-integration) | 7-day upcoming view powered by Todoist REST API; new Activity Bar section |
| 📋 | Medium | [Tempo tracking](#tempo-tracking) | New tree-view section for time tracking with Tempo API calls, daily/weekly summaries, and fast worklog actions |
| ✅ | High | Unify issue processor and fixer into a single implementer | Completed 2026-03-07: retired `pr-fixer`; `sfl-issue-processor` is now the single implementer across first-pass and follow-up cycles. |
| ✅ | High | Global Copilot Assistant Panel | Completed via SFL pipeline (PR #104 merged on 2026-03-04). |
| ✅ | High | Simplisticate E2E Test | Completed end-to-end SFL validation run (issue → PR → merge) on 2026-03-04. |
| ✅ | Critical | Simplisticate Workflows | Completed 2026-03-03: event-driven trigger path implemented and autonomous merge flow removed in favor of human review handoff. |
| ✅ | Medium | Copilot Usage month-end projection | Per-account + aggregate trend projection with ghost arc on ring, daily rate, est. overage (2026-03) |
| ✅ | Medium | Run 30-day Set it Free pilot | Removed — ongoing operational concern, not a dev task (2026-02) |
| ✅ | Critical | SFL Auto-Merge mode | Implemented, then simplified to human-review handoff via sfl-pr-router + sfl-pr-label-actions (2026-02/2026-03) |
| ✅ | Medium | Elegant status bar queue display | Shows "X of N · TaskName" with batch tracking instead of concatenating all tasks (2026-02) |
| ✅ | Medium | Copilot enterprise budget not resetting on new billing cycle | Fixed: UTC dates for billing API query, auto-refresh on month boundary, billing period display (2026-02) |
| ✅ | Critical | SFL Simplification — Replace supersession model | pr-fixer rewritten to use `push-to-pull-request-branch` (2026-02) |
| ✅ | Critical | SFL Simplification — Label pruning | 39→27 labels, removed 12 unused (2026-02) |
| ✅ | Critical | Build sfl-auditor workflow | Audits label consistency; repairs orphaned state (2026-02) |
| ✅ | High | SFL Simplification — Reduce PR Fixer prompt | 365→164 lines via V2 architecture (2026-02) |
| ✅ | High | SFL Simplification — Adopt new safe-outputs | add-comment, add-labels/remove-labels in fixer/promoter/processor (2026-02) |
| ✅ | High | SFL Complexity gate for future sessions | Session Start Gate added to SKILL.md (2026-02) |
| ✅ | High | Critically reduce and remove AGENTS.md | Covered in workflow prompts and governance docs (2026-02) |
| ✅ | High | Complete migration to relias-engineering | Migrated, PAT set, pipeline verified (2026-02) |
| ✅ | High | Define Set it Free governance policy | Moved to relias-engineering/set-it-free-loop (2026-02) |
| ✅ | High | Build feature-intake normalization workflow | Convex mapping + template-driven issue drafts + dedupe (2026-02) |
| ✅ | High | Issue Processor workflow | Cron claim → draft PR → agent:in-progress labeling (2026-02) |
| ✅ | High | Build PR Analyzer workflow (×3 models) | Three analyzers on staggered crons; cycle-aware markers (2026-02) |
| ✅ | High | Build PR Fixer workflow (authority) | Claude Opus; reads analyzer comments; commits fixes (2026-02) |
| ✅ | High | Add pr:cycle-N label system | Labels pr:cycle-1/2/3; analyzers skip cycle-3 (2026-02) |
| ✅ | High | Build PR Promoter workflow | All analyzers pass → un-draft PR + promotion comment (2026-02) |
| ✅ | High | Improve Welcome to Buddy window | Convex-backed stats dashboard, session tracking (2026-02) |
| ✅ | High | Expand repo detail view | Rich card-based repo info panel with caching (2026-02) |
| ✅ | High | Make repos expandable folders | Expandable repos with Issues & PRs children (2026-02) |
| ✅ | High | Build task dispatch system | Dispatcher + exec worker + Convex claiming (2026-02) |
| ✅ | High | Implement exec-worker | spawn()-based shell execution, timeout, abort (2026-02) |
| ✅ | High | Restructure electron/main.ts | Split 423→95 lines, 8 new modules (2026-02) |
| ✅ | High | Job management UI | CRUD, context menus, worker-type forms (2026-02) |
| ✅ | High | Implement Convex cron job | Runs every minute via crons.ts (2026-02) |
| ✅ | High | Data prefetch + persistent cache | PR data survives restarts, background refresh (2026-02) |
| ✅ | High | Tabbed window system for PRs | Tabs above content area, no duplicates (2025-01) |
| ✅ | High | Fix Recently Merged date range | 30-day default, configurable in Settings (2025-01) |
| ✅ | High | App-wide task queue system | Named queues with concurrency control (2025-01) |
| ✅ | High | Settings UI with form-based editing | SidebarPanel navigation, auto-save (2025-01) |
| ✅ | High | Initialize Convex project | Generated types ready (2025-02) |
| ✅ | High | Define Convex schema | convex/schema.ts with jobs, schedules, runs (2025-01) |
| ✅ | High | Add Convex client to Electron | ConvexClientProvider, useConvex hooks (2025-01) |
| ✅ | High | Implement schedule CRUD functions | convex/schedules.ts, jobs.ts, runs.ts (2025-01) |
| ✅ | Medium | Repos of Interest feature | Folder-organized bookmark system for GitHub repos (2026-02) |
| ✅ | Medium | Add run history view | Real-time status, filters, expandable output (2026-02) |
| ✅ | Medium | Implement skill-worker | Copilot CLI spawn, --allow-all mode, abort/timeout (2026-02) |
| ✅ | Medium | Implement ai-worker | Copilot CLI spawn, model selection, abort support (2026-02) |
| ✅ | Medium | Create schedule editor dialog | Modal with CronBuilder, job selector (2025-02) |
| ✅ | Medium | Add Workflows activity bar icon | RefreshCw icon in ActivityBar (2025-01) |
| ✅ | Medium | Build Schedules sidebar + list | ScheduleList component with status badges (2025-01) |
| ✅ | Medium | Port CronBuilder component | From hs-conductor with visual builder (2025-01) |
| ✅ | Medium | Implement schedule toggles | Toggle mutation in useConvex hooks (2025-02) |
| ✅ | Medium | Fix taskbar app name | "HS-body" → "Buddy" (2025-01) |
| ✅ | Medium | Create Help menu with About window | Beautiful About dialog with branding (2025-01) |
| ✅ | Medium | Design and create app icon | Gold/orange gradient Users icon (2025-01) |
| ✅ | Low | Implement offline queue | Catch-up logic on reconnect (2026-02) |

## Progress

**Remaining: 8** | **Completed: 53** (87%)

---

## Remaining Items

### Build project-scoped Copilot workspaces

**Tracking**: GitHub Issue #130 created on 2026-03-07. Not yet routed into SFL.

**Goal**: Add a new top-level app section that feels like a Codex-style multi-project workspace manager, where each project is a local git clone and can host its own Copilot agent sessions, history, and execution context.

**Settled v1 decisions**:

- UI section name: `The Crew`
- Initial execution model: project-scoped prompt/thread execution, not full autonomous agents
- Eligibility: GitHub repos only
- Project storage: local-only, not Convex-backed
- Concurrency: one active thread/run per project
- Instruction-file handling: implicit only; rely on Copilot SDK + repo context rather than surfacing those files explicitly in the UI

**Product shape**:

- New top-level Activity Bar entry, separate from the existing `Copilot` section.
- Users can register multiple local projects by selecting a folder from disk.
- Each project maps to a local git repository root and becomes a persistent workspace inside Buddy.
- Each workspace can start new Copilot agent runs and retain project-scoped history.
- The existing top-right assistant panel remains global and lightweight; this feature is the structured, project-centric surface.

**Hard requirements**:

- Project creation must start from a local folder picker, not manual text entry only.
- Selected folders must validate as local git clones before they are accepted.
- The effective project root should be the git root, not an arbitrary nested subfolder.
- Agent execution must run with the project folder as working directory so Copilot sees the correct repo context.
- Project execution must respect repository-local instruction sources such as `AGENTS.md`, prompt files, Copilot instructions, and related markdown guidance already present in that clone.

**Why this is not just a Copilot Prompt clone**:

- The current Copilot area is prompt/result oriented and mostly global.
- This feature needs persistent project identity, local path validation, project metadata, project-scoped sessions, and project-aware execution UX.
- The shared Copilot SDK client already supports per-request `cwd`, which is the right primitive for binding an agent run to a specific local repo.

**Likely architecture**:

##### Data model

- Store project records locally rather than in Convex, likely via electron-store config or a dedicated local persistence layer:
  - display name
  - local path
  - git root
  - detected GitHub owner/repo from remotes
  - default branch
  - last opened timestamp
  - status / validation metadata
- Store project threads locally as well, with one active thread per project in v1:
  - project id
  - title
  - status
  - model
  - created / updated timestamps
- Decide whether to keep results compatible with existing `copilotResults` while treating project identity as local-only metadata, or move project-thread history fully local for v1.

##### Electron / IPC

- Add a native folder-picker IPC handler using Electron dialog APIs.
- Add git validation helpers that can:
  - resolve repo root from any nested folder
  - verify `.git` presence or worktree validity
  - inspect remotes / branch info
  - detect common instruction files in the repo root
- Add Copilot execution IPC that accepts project context explicitly:
  - `projectId`
  - `cwd`
  - optional session/thread id
  - selected model
  - execution mode (chat vs agent run)

##### Copilot SDK integration

- Reuse the shared Copilot SDK service where practical.
- Preserve the existing per-run `cwd` behavior for project isolation.
- Start with persistent multi-turn prompt/thread execution scoped to a project.
- Do not expand to full agent autonomy or broad tool-permission UX in v1.
- Keep the implementation compatible with a later upgrade to richer agent workflows if the thread model proves sound.

##### Renderer / navigation

- Add a new Activity Bar section named `The Crew`.
- Add a dedicated sidebar tree with:
  - project list
  - per-project thread history
  - quick action to add project
  - recent activity / active-run badges
- Add routed content views for:
  - all projects overview
  - project detail workspace
  - session transcript / run detail
  - new project onboarding / empty state

##### Validation / onboarding UX

- Folder picker should immediately validate the selection.
- If the folder is not a git repo, show a hard validation error.
- If the folder is nested inside a repo, normalize to the git root and explain that adjustment.
- If the remote is not GitHub, reject the project for v1.
- Show detected metadata before final save: path, repo slug, branch.

**Likely implementation areas**:

- `src/components/ActivityBar.tsx`
- `src/components/SidebarPanel.tsx`
- new `src/components/projects/` subtree
- `src/components/AppContentRouter.tsx`
- `src/components/appContentViewLabels.ts`
- `electron/preload.ts`
- new `electron/ipc/projectWorkspaceHandlers.ts`
- `electron/services/copilotService.ts`
- `electron/services/copilotClient.ts`
- new git/project inspection helpers under `electron/services/` or `src/api/`
- `convex/schema.ts` plus matching Convex query/mutation files

**Phased rollout suggestion**:

1. **Foundation**
  - Persist project records locally
   - Add folder picker + git-root validation
   - Render top-level section and project list
2. **Project workspace shell**
   - Project detail view
   - Empty state and metadata cards
  - Recent runs / thread list
3. **Scoped Copilot runs**
  - Start prompt/thread execution from a project
  - Persist local project-thread history
   - Open results in project context
4. **Session model**
  - One active thread per project
   - Resume/revisit past sessions
   - Rename/archive sessions
5. **Agent hardening**
  - Future-only: evaluate richer tool permission policy
  - Future-only: approval UX if real agents are introduced
  - Better execution diagnostics when repo context is invalid

**Key risks / design traps**:

- Confusing this with the existing global assistant and duplicating concepts instead of layering cleanly.
- Letting the `The Crew` UI imply full autonomy when v1 is only scoped project-thread execution.
- Letting arbitrary folders in without strong git-root validation.
- Storing local paths in synced state when they are machine-specific and should remain local.
- Rejecting valid local repos too late instead of failing fast on non-GitHub remotes.
- Building a complex session model before deciding whether results should remain compatible with existing `copilotResults` data.

**Remaining open questions**:

- Whether project-thread history should reuse existing `copilotResults` records with local project linkage, or live in a separate local store.
- Whether the existing Copilot results list should remain global, or gain project filters / project grouping.
- Whether thread titles are user-authored, prompt-derived, or auto-generated from repo + first prompt.

---

### SFL Loop monitoring in Organizations tree

**Tracking**: GitHub Issue #128 is active in SFL.

**Goal**: Surface SFL health directly under each repo in the Organizations tree so users can see pipeline state without opening the repo detail view first.

**Desired behavior**:

- Auto-detect whether a repo is SFL-enabled based on workflow inventory rather than a hardcoded allow-list.
- Add a child node under each eligible repo such as `SFL Loop` or `Pipeline Status`.
- Show high-signal state at a glance: healthy, blocked, active work, or human review waiting.
- Support expand-to-inspect details such as open agent issues, active draft PRs, ready-for-review PRs, and recent workflow failures.
- Refresh with the rest of the GitHub sidebar data and avoid expensive per-repo polling.

**Likely implementation areas**:

- GitHub sidebar data hooks under `src/components/sidebar/github-sidebar/`
- Repo detail / repo tree data shaping under `src/components/` and `src/hooks/`
- GitHub API aggregation in `src/api/github.ts`
- Shared constants/types for SFL repo detection and status summarization

**Open design choices**:

- Whether to infer SFL support from exact workflow filenames, labels, or both
- Whether status should be purely read-only or include quick actions later
- Whether the node appears for all repos with disabled SFL workflows or only currently active ones

---

### Capture Copilot usage history

**Goal**: Persist usage and spend snapshots on a schedule so Buddy has time-series data for trends, month-over-month comparisons, and graphing.

**Why this is separate from the dashboard task**:

- The dashboard is the reporting surface.
- This task is the data collection pipeline that makes historical charts possible.
- Without scheduled snapshots, the app only has current-state usage totals and cannot reconstruct prior daily values reliably.

**Desired behavior**:

- Add a scheduled job in Buddy that runs automatically on a fixed cadence such as daily.
- Fetch current Copilot usage and spend values for each tracked account and any aggregate totals already shown in the app.
- Store immutable timestamped snapshots rather than overwriting the latest value.
- Support historical queries suitable for charts: daily usage, daily spend, cumulative month-to-date, and deltas between snapshots.
- Fail safely when the upstream usage endpoint is unavailable, without corrupting prior history.

**Likely implementation areas**:

- `convex/schema.ts`
- new or existing Convex functions near `convex/githubAccounts.ts`, `convex/buddyStats.ts`, or a new usage-history file
- worker scheduling surfaces under `convex/crons.ts`, `convex/schedules.ts`, and `convex/jobs.ts`
- Electron/Copilot usage fetch path under `electron/services/copilotService.ts` and related IPC if the scheduler should reuse the existing client logic
- chart/query consumers in the existing Copilot or stats UI once the history exists

**Data shape to capture**:

- account id / login / provider source
- snapshot timestamp
- billing month or period key
- usage count metrics available from the upstream API
- spend / budget metrics available from the upstream API
- derived delta from prior snapshot when useful for charting

**Open design choices**:

- Whether the scheduler should run in Convex, Electron, or the existing Buddy job system
- Whether cadence should be daily only or configurable later
- Whether historical aggregation should be materialized at write time or computed at query time

---

### Create cost telemetry dashboard

**Goal**: Make spend predictable at repo and portfolio level.

**Deliverables**:

- Per-workflow run and cost metrics
- p50/p90 cost-per-run reporting
- Monthly cap alerts and throttle policies

---

### Add branch cleanup to repo-audit

**Goal**: Extend repo-audit so it can identify stale agent branches and propose or perform safe cleanup for merged or orphaned `agent-fix/*` branches.

**Desired behavior**:

- Detect merged `agent-fix/*` branches that are no longer needed.
- Detect orphaned branches whose issue/PR pair has already been closed.
- Avoid touching active draft PR branches or anything without clear SFL ownership.
- Report cleanup candidates clearly, with enough evidence for safe automation or human review.

**Likely implementation areas**:

- `repo-audit.md` / `repo-audit.lock.yml`
- GitHub branch and PR lookup utilities
- SFL auditor/reporting surfaces if cleanup findings should be visible elsewhere

---

### Task Planner (Todoist Integration)

**Goal**: Add a new Activity Bar section "Planner" with a 7-day upcoming task view powered by the Todoist REST API v2, similar to Todoist's "Upcoming" mode. Shows today's tasks first, then each subsequent day for 7 days total.

**Authentication**: Uses `TODOIST_API_TOKEN` environment variable (already available). All API calls go through Electron IPC → main process (no token exposure in renderer).

**API Endpoints** (Todoist REST API v2, base: `https://api.todoist.com/rest/v2`):

- `GET /tasks?filter=today` — today's tasks
- `GET /tasks?filter=<date>` — tasks for a specific date (format: `MMM DD`, e.g., `Mar 1`)
- `GET /tasks?filter=<start> | <end>` — date range queries
- `POST /tasks/{id}/close` — complete a task
- `POST /tasks/{id}/reopen` — uncomplete a task
- `POST /tasks` — create a new task (body: `{ content, due_date, priority, project_id }`)
- `POST /tasks/{id}` — update a task (body: partial fields like `{ content, due_date }`)
- `GET /projects` — list all projects (for project name resolution)
- `GET /labels` — list all labels
   ```typescript
   planner: {
     title: 'Planner',
     items: [
       { id: 'planner-upcoming', label: 'Upcoming' },
       { id: 'planner-today', label: 'Today' },
       { id: 'planner-projects', label: 'Projects' },
     ],
   }
   ```

3. **View labels**: Add entries to `appContentViewLabels.ts`:

   ```typescript
   'planner-upcoming': 'Upcoming',
   'planner-today': 'Today',
   'planner-projects': 'Projects',
   ```

##### Electron IPC — Todoist Service

1. **`electron/services/todoistClient.ts`** — Todoist REST API v2 client:
  - `fetchTasks(filter: string): Promise<TodoistTask[]>` — GET /tasks with filter
  - `fetchTasksForDateRange(startDate: string, days: number): Promise<Map<string, TodoistTask[]>>` — Fetch tasks grouped by date for the upcoming view
  - `completeTask(taskId: string): Promise<void>` — POST /tasks/{id}/close
  - `reopenTask(taskId: string): Promise<void>` — POST /tasks/{id}/reopen
  - `createTask(params: CreateTaskParams): Promise<TodoistTask>` — POST /tasks
  - `updateTask(taskId: string, params: Partial<CreateTaskParams>): Promise<TodoistTask>` — POST /tasks/{id}
  - `deleteTask(taskId: string): Promise<void>` — DELETE /tasks/{id}
  - `fetchProjects(): Promise<TodoistProject[]>` — GET /projects (cache for 5 min)
  - `fetchLabels(): Promise<TodoistLabel[]>` — GET /labels
  - Auth: reads `TODOIST_API_TOKEN` from `process.env`

2. **`electron/ipc/todoistHandlers.ts`** — IPC bridge:
  - `todoist:get-upcoming` — Returns 7-day grouped tasks
  - `todoist:get-today` — Returns today's tasks only
  - `todoist:complete-task` — Complete a task by ID
  - `todoist:reopen-task` — Reopen a task by ID
  - `todoist:create-task` — Create a new task
  - `todoist:update-task` — Update an existing task
  - `todoist:delete-task` — Delete a task
  - `todoist:get-projects` — List all projects

3. **Register handlers** in `electron/ipc/index.ts`

4. **Preload exposure** in `electron/preload.ts` — expose todoist IPC methods on `window.electronAPI`

##### React Components

1. **`src/components/planner/TaskPlannerView.tsx`** — Main upcoming view component:
  - Fetches 7-day task data via `useTodoistUpcoming()` hook
  - Renders day sections with task lists
  - Handles task completion toggling
  - Auto-refreshes every 60 seconds
  - Pull-to-refresh / manual refresh button

2. **`src/components/planner/DaySection.tsx`** — Single day header + task list:
  - Date header with day name, formatted date, task count
  - "Today" / "Tomorrow" labels for relative dates
  - "+ Add Task" button per day section
  - Empty state for days with no tasks

3. **`src/components/planner/TaskRow.tsx`** — Individual task row:
  - Completion checkbox with optimistic UI update
  - Task content with inline edit support
  - Priority dot indicator
  - Project name badge
  - Label tags
  - Context menu (right-click)

4. **`src/components/planner/TaskPlannerView.css`** — Styling matching VSCode dark theme

5. **`src/components/planner/AddTaskInline.tsx`** — Inline task creation form:
  - Content input, date picker, priority selector, project dropdown
  - Auto-assigns date based on which day section it's in

##### Hooks

1. **`src/hooks/useTodoist.ts`** — React hooks for Todoist data:
  - `useTodoistUpcoming(days?: number)` — Fetches and caches upcoming tasks, returns `{ dayGroups, isLoading, error, refresh }`
  - `useTodoistToday()` — Shortcut for today-only view
  - `useTodoistProjects()` — Cached project list for name resolution
  - `useTaskActions()` — Returns `{ completeTask, reopenTask, createTask, updateTask, deleteTask }` with optimistic updates

##### Types

1. **`src/types/todoist.ts`** — TypeScript interfaces:

   ```typescript
   interface TodoistTask {
     id: string
     content: string
     description: string
     project_id: string
     priority: 1 | 2 | 3 | 4  // 4=P1, 3=P2, 2=P3, 1=P4
     due: { date: string; datetime?: string; string: string; timezone?: string } | null
     labels: string[]
     is_completed: boolean
     created_at: string
     url: string
     order: number
   }
   
   interface TodoistProject {
     id: string
     name: string
     color: string
     parent_id: string | null
     order: number
   }
   
   interface TodoistLabel {
     id: string
     name: string
     color: string
   }
   
   interface DayGroup {
     date: string        // ISO date string YYYY-MM-DD
     label: string       // "Today", "Tomorrow", "Mon, Mar 3"
     tasks: TodoistTask[]
   }
   ```

#### Files to Create or Modify

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/types/todoist.ts` | TodoistTask, TodoistProject, TodoistLabel, DayGroup types |
| Create | `electron/services/todoistClient.ts` | Todoist REST API v2 client |
| Create | `electron/ipc/todoistHandlers.ts` | IPC handlers for todoist operations |
| Create | `src/hooks/useTodoist.ts` | React hooks: useTodoistUpcoming, useTaskActions, etc. |
| Create | `src/components/planner/TaskPlannerView.tsx` | Main 7-day upcoming view |
| Create | `src/components/planner/TaskPlannerView.css` | Planner styling |
| Create | `src/components/planner/DaySection.tsx` | Per-day section component |
| Create | `src/components/planner/TaskRow.tsx` | Individual task row component |
| Create | `src/components/planner/AddTaskInline.tsx` | Inline task creation |
| Modify | `src/components/ActivityBar.tsx` | Add "Planner" section with CalendarDays icon |
| Modify | `src/components/SidebarPanel.tsx` | Add planner section data |
| Modify | `src/components/AppContentRouter.tsx` | Route planner-upcoming/today/projects views |
| Modify | `src/components/appContentViewLabels.ts` | Add planner view labels |
| Modify | `electron/ipc/index.ts` | Register todoist IPC handlers |
| Modify | `electron/preload.ts` | Expose todoist IPC methods |

#### Key Design Decisions

- **Electron IPC, not direct fetch**: The renderer never sees the API token. All Todoist calls go through IPC → main process → Todoist API.
- **Optimistic UI**: Task completion toggles instantly in the UI, with rollback on API error.
- **Lightweight caching**: Project list cached 5 min in main process. Task data refreshed on view focus + 60s interval.
- **No Convex storage**: Tasks live in Todoist — Buddy is a pure client. No syncing or local persistence beyond in-memory cache.
- **Replace or coexist with "Tasks" section**: The existing `tasks` Activity Bar section has placeholder items (Today, Upcoming, Projects). The Planner section can either replace it or live alongside it. Replacing makes sense since the items are identical — just rename the section and wire it to real data.

---

### Tempo tracking

**Goal**: Add a visually rich **Tempo Tracking** section in the tree view so users can log, inspect, and manage time entries without leaving Buddy.

**Primary UX Concept**: Treat Tempo as a first-class workspace view (like PRs/Issues), with fast actions and high-information cards.

**Tree View Placement**:

- Add a new top-level tree section: **Tempo Tracking**
- Child nodes:
  - `tempo-today` — Today's entries and remaining hours
  - `tempo-week` — Weekly grid (Mon-Fri) with total vs target
  - `tempo-quick-log` — Fast-add panel for common entries
  - `tempo-recent` — Recent worklogs and edits

**Visual Direction (cool + polished)**:

- Use a strong, data-forward layout with compact stat cards and timeline rows.
- Header cards:
  - `Today Hours`
  - `Week Hours`
  - `Remaining to Target`
  - `Top Issue This Week`
- Timeline style rows for each worklog with:
  - Issue key pill (`PE-992`, `INT-14`)
  - Account badge (`GEN-DEV`, `INT`)
  - Duration chip (`1.5h`)
  - Editable note preview
- Include subtle motion for state changes (add/edit/delete) and optimistic UI transitions.

**Feature Scope**:

1. Read daily and date-range worklogs from Tempo.
2. Add/edit/delete worklogs from the UI.
3. Quick-log presets inspired by the Tempo skill aliases.
4. Daily target meter (8h) and weekly target meter (40h).
5. Account auto-suggestion by issue prefix (`INT-*` -> `INT`, `PE-*` -> `GEN-DEV`).

**Tempo API Integration**:

- Base URL: `https://api.tempo.io/4`
- Endpoints:
  - `GET /worklogs/user/{accountId}?from={date}&to={date}`
  - `POST /worklogs`
  - `PUT /worklogs/{id}`
  - `DELETE /worklogs/{id}`
  - `GET /accounts`
- Required env vars (main process only):
  - `TEMPO_API_TOKEN`
  - `ATLASSIAN_EMAIL`
  - `ATLASSIAN_API_TOKEN`

**Electron IPC Architecture**:

- `electron/services/tempoClient.ts`
  - `getWorklogsForDate(date)`
  - `getWorklogsForRange(from, to)`
  - `createWorklog(payload)`
  - `updateWorklog(id, payload)`
  - `deleteWorklog(id)`
  - `getAccounts()`
- `electron/ipc/tempoHandlers.ts`
  - `tempo:get-today`
  - `tempo:get-week`
  - `tempo:create-worklog`
  - `tempo:update-worklog`
  - `tempo:delete-worklog`
  - `tempo:get-accounts`
- `electron/preload.ts`
  - expose typed `window.electronAPI.tempo.*` methods

**React UI Components**:

- `src/components/tempo/TempoDashboard.tsx` — shell view for cards + tabs
- `src/components/tempo/TempoSummaryCards.tsx` — today/week/remaining metrics
- `src/components/tempo/TempoTimeline.tsx` — chronological worklog rows
- `src/components/tempo/TempoQuickLog.tsx` — one-click common-entry logging
- `src/components/tempo/TempoWorklogEditor.tsx` — modal/drawer for add/edit
- `src/components/tempo/TempoDashboard.css` — unified visual styling

**Hooks & Types**:

- `src/hooks/useTempo.ts`
  - `useTempoToday()`
  - `useTempoWeek()`
  - `useTempoActions()` (create/update/delete)
- `src/types/tempo.ts`
  - `TempoWorklog`, `TempoAccount`, `TempoIssueSummary`, `TempoDaySummary`

**Quick-Log Presets (initial)**:

- Meetings -> `INT-14`
- PE Support -> `PE-869`
- Relias Assistant -> `PE-992`
- AI Chapter -> `PE-931`
- Professional Development -> `INT-5`
- PTO / Sick / Holiday -> `INT-8`

**Implementation Plan**:

1. Add `Tempo Tracking` section to Activity Bar + Sidebar tree data.
2. Add app routes: `tempo-today`, `tempo-week`, `tempo-quick-log`, `tempo-recent`.
3. Build main-process Tempo service + IPC handlers.
4. Build typed renderer hooks and initial dashboard UI.
5. Add quick-log presets and account inference.
6. Add optimistic updates + rollback on failure.
7. Add empty/error/loading states with clear action guidance.

**Acceptance Criteria**:

- User can view today's worklogs in Buddy.
- User can add a worklog in under 10 seconds via Quick Log.
- User can edit and delete entries from the timeline.
- Daily/weekly totals are accurate and update immediately after mutations.
- No Tempo credentials are exposed in renderer code.
- Tree view section is discoverable and visually consistent with the app theme.

**Documentation**: See `docs/TEMPO_TRACKING_FEATURE.md` for full architecture, payload examples, and phased rollout details.

---

### PR Analyzers should post reviews, not update PR body

**Goal**: Migrate analyzer verdicts from PR body updates (`update_issue`) to proper PR review comments (`add_comment` or `submit-pull-request-review`), keeping the PR body clean.


