# Buddy - TODO

| Status | Priority | Task                                                                                                         | Notes                                                                                                                                 |
| ------ | -------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 📋     | Medium   | [Task Planner (Todoist Integration)](#task-planner-todoist-integration)                                      | 7-day upcoming view powered by Todoist REST API; new Activity Bar section                                                             |
| ✅     | Medium   | Copilot Session Explorer                                                                                     | Completed 2026-03-29: JSONL parsing, workspace grouping, session detail with prompts/tokens/tools, streaming parser, scan caching     |
| ✅     | Medium   | Session Insights & Feedback Loop                                                                             | Completed 2026-03-29: digest computation (6 metrics), Convex persistence, digest UI in SessionDetail, 3-round adversarial review      |
| ✅     | Medium   | Tempo tracking                                                                                               | Completed 2026-03-23: monthly grid, capex/non-capex split, holiday support, green capex highlighting, auto-scroll to today            |
| ✅     | Medium   | PR Analyzers should post reviews, not update PR body                                                         | Completed 2026-03-22: all 3 analyzers already use `add_comment`; `update_issue` not in safe-outputs config                           |
| ✅     | Medium   | Add branch cleanup to repo-audit                                                                             | Completed 2026-03-22: added Branch Hygiene scope (#7) to repo-audit + stale branch detection (Step 14) to sfl-auditor                |
| ✅     | High     | Add GitHub organization metrics detail view                                                                  | Completed 2026-03-22: skeleton loader, per-phase error handling, roster filter/sort controls                                         |
| ✅     | High     | Build project-scoped Copilot workspaces                                                                      | Completed 2026-03-08: The Crew ships with local project registration and project-scoped sessions.                                     |
| ✅     | High     | SFL Loop monitoring in Organizations tree                                                                    | Completed 2026-03-08: Organizations tree now shows SFL workflow health per repo.                                                      |
| ✅     | High     | Unify issue processor and fixer into a single implementer                                                    | Completed 2026-03-07: retired `pr-fixer`; `sfl-issue-processor` is now the single implementer across first-pass and follow-up cycles. |
| ✅     | High     | Global Copilot Assistant Panel                                                                               | Completed via SFL pipeline (PR #104 merged on 2026-03-04).                                                                            |
| ✅     | High     | Simplisticate E2E Test                                                                                       | Completed end-to-end SFL validation run (issue → PR → merge) on 2026-03-04.                                                           |
| ✅     | Critical | Simplisticate Workflows                                                                                      | Completed 2026-03-03: event-driven trigger path implemented and autonomous merge flow removed in favor of human review handoff.       |
| ✅     | Medium   | Copilot Usage month-end projection                                                                           | Per-account + aggregate trend projection with ghost arc on ring, daily rate, est. overage (2026-03)                                   |
| ✅     | Medium   | Run 30-day Set it Free pilot                                                                                 | Removed — ongoing operational concern, not a dev task (2026-02)                                                                       |
| ✅     | Critical | SFL Auto-Merge mode                                                                                          | Implemented, then simplified to human-review handoff via direct chain pattern A→B→C→label-actions (2026-02/2026-03)                   |
| ✅     | Medium   | Elegant status bar queue display                                                                             | Shows "X of N · TaskName" with batch tracking instead of concatenating all tasks (2026-02)                                            |
| ✅     | Medium   | Copilot enterprise budget not resetting on new billing cycle                                                 | Fixed: UTC dates for billing API query, auto-refresh on month boundary, billing period display (2026-02)                              |
| ✅     | Critical | SFL Simplification — Replace supersession model                                                              | pr-fixer rewritten to use `push-to-pull-request-branch` (2026-02)                                                                     |
| ✅     | Critical | SFL Simplification — Label pruning                                                                           | 39→27 labels, removed 12 unused (2026-02)                                                                                             |
| ✅     | Critical | Build sfl-auditor workflow                                                                                   | Audits label consistency; repairs orphaned state (2026-02)                                                                            |
| ✅     | High     | SFL Simplification — Reduce PR Fixer prompt                                                                  | 365→164 lines via V2 architecture (2026-02)                                                                                           |
| ✅     | High     | SFL Simplification — Adopt new safe-outputs                                                                  | add-comment, add-labels/remove-labels in fixer/promoter/processor (2026-02)                                                           |
| ✅     | High     | SFL Complexity gate for future sessions                                                                      | Session Start Gate added to SKILL.md (2026-02)                                                                                        |
| ✅     | High     | Critically reduce and remove AGENTS.md                                                                       | Covered in workflow prompts and governance docs (2026-02)                                                                             |
| ✅     | High     | Complete migration to relias-engineering                                                                     | Migrated, PAT set, pipeline verified (2026-02)                                                                                        |
| ✅     | High     | Define Set it Free governance policy                                                                         | Moved to relias-engineering/set-it-free-loop (2026-02)                                                                                |
| ✅     | High     | Build feature-intake normalization workflow                                                                  | Convex mapping + template-driven issue drafts + dedupe (2026-02)                                                                      |
| ✅     | High     | Issue Processor workflow                                                                                     | Cron claim → draft PR → agent:in-progress labeling (2026-02)                                                                          |
| ✅     | High     | Build PR Analyzer workflow (×3 models)                                                                       | Three analyzers on staggered crons; cycle-aware markers (2026-02)                                                                     |
| ✅     | High     | Build PR Fixer workflow (authority)                                                                          | Claude Opus; reads analyzer comments; commits fixes (2026-02)                                                                         |
| ✅     | High     | Add pr:cycle-N label system                                                                                  | Labels pr:cycle-1/2/3; analyzers skip cycle-3 (2026-02)                                                                               |
| ✅     | High     | Build PR Promoter workflow                                                                                   | All analyzers pass → un-draft PR + promotion comment (2026-02)                                                                        |
| ✅     | High     | Improve Welcome to Buddy window                                                                              | Convex-backed stats dashboard, session tracking (2026-02)                                                                             |
| ✅     | High     | Expand repo detail view                                                                                      | Rich card-based repo info panel with caching (2026-02)                                                                                |
| ✅     | High     | Make repos expandable folders                                                                                | Expandable repos with Issues & PRs children (2026-02)                                                                                 |
| ✅     | High     | Build task dispatch system                                                                                   | Dispatcher + exec worker + Convex claiming (2026-02)                                                                                  |
| ✅     | High     | Implement exec-worker                                                                                        | spawn()-based shell execution, timeout, abort (2026-02)                                                                               |
| ✅     | High     | Restructure electron/main.ts                                                                                 | Split 423→95 lines, 8 new modules (2026-02)                                                                                           |
| ✅     | High     | Job management UI                                                                                            | CRUD, context menus, worker-type forms (2026-02)                                                                                      |
| ✅     | High     | Implement Convex cron job                                                                                    | Runs every minute via crons.ts (2026-02)                                                                                              |
| ✅     | High     | Data prefetch + persistent cache                                                                             | PR data survives restarts, background refresh (2026-02)                                                                               |
| ✅     | High     | Tabbed window system for PRs                                                                                 | Tabs above content area, no duplicates (2025-01)                                                                                      |
| ✅     | High     | Fix Recently Merged date range                                                                               | 30-day default, configurable in Settings (2025-01)                                                                                    |
| ✅     | High     | App-wide task queue system                                                                                   | Named queues with concurrency control (2025-01)                                                                                       |
| ✅     | High     | Settings UI with form-based editing                                                                          | SidebarPanel navigation, auto-save (2025-01)                                                                                          |
| ✅     | High     | Initialize Convex project                                                                                    | Generated types ready (2025-02)                                                                                                       |
| ✅     | High     | Define Convex schema                                                                                         | convex/schema.ts with jobs, schedules, runs (2025-01)                                                                                 |
| ✅     | High     | Add Convex client to Electron                                                                                | ConvexClientProvider, useConvex hooks (2025-01)                                                                                       |
| ✅     | High     | Implement schedule CRUD functions                                                                            | convex/schedules.ts, jobs.ts, runs.ts (2025-01)                                                                                       |
| ✅     | Medium   | Repos of Interest feature                                                                                    | Folder-organized bookmark system for GitHub repos (2026-02)                                                                           |
| ✅     | Medium   | Add run history view                                                                                         | Real-time status, filters, expandable output (2026-02)                                                                                |
| ✅     | Medium   | Implement skill-worker                                                                                       | Copilot CLI spawn, --allow-all mode, abort/timeout (2026-02)                                                                          |
| ✅     | Medium   | Implement ai-worker                                                                                          | Copilot CLI spawn, model selection, abort support (2026-02)                                                                           |
| ✅     | Medium   | Create schedule editor dialog                                                                                | Modal with CronBuilder, job selector (2025-02)                                                                                        |
| ✅     | Medium   | Add Workflows activity bar icon                                                                              | RefreshCw icon in ActivityBar (2025-01)                                                                                               |
| ✅     | Medium   | Build Schedules sidebar + list                                                                               | ScheduleList component with status badges (2025-01)                                                                                   |
| ✅     | Medium   | Port CronBuilder component                                                                                   | From hs-conductor with visual builder (2025-01)                                                                                       |
| ✅     | Medium   | Implement schedule toggles                                                                                   | Toggle mutation in useConvex hooks (2025-02)                                                                                          |
| ✅     | Medium   | Capture Copilot usage history                                                                                | Completed 2026-03-09: issue #137 / PR #138 merged; snapshots now persist for historical trends.                                      |
| ✅     | Medium   | Fix taskbar app name                                                                                         | "HS-body" → "Buddy" (2025-01)                                                                                                         |
| ✅     | Medium   | Create Help menu with About window                                                                           | Beautiful About dialog with branding (2025-01)                                                                                        |
| ✅     | Medium   | Design and create app icon                                                                                   | Gold/orange gradient Users icon (2025-01)                                                                                             |
| ✅     | Low      | Implement offline queue                                                                                      | Catch-up logic on reconnect (2026-02)                                                                                                 |

## Progress

**Remaining: 1** | **Completed: 62** (98%)

---

## Remaining Items

### Copilot Session Explorer

**Goal**: Add a new Activity Bar section "Sessions" that provides visibility into GitHub Copilot's session data — token usage, prompt history, tool call analytics, model costs, and session timelines. Leverages existing work in the `hs-buddy-vscode-extension` (`D:\github\HemSoft\hs-buddy-vscode-extension`) and the `prompt-db` skill.

**Prior Art & Existing Code**:

| Source | What It Has |
|--------|------------|
| `hs-buddy-vscode-extension/src/chatSessionParser.ts` | Parses `chatSessions/*.jsonl` — real token counts, tool calls, model info, session init |
| `hs-buddy-vscode-extension/src/transcriptParser.ts` | Parses legacy `transcripts/*.jsonl` — 7 event types, turn assembly, tool call records |
| `hs-buddy-vscode-extension/src/sessionTracker.ts` | Real-time tracking with polling watcher, incremental parsing, aggregate totals |
| `hs-buddy-vscode-extension/src/storageReader.ts` | Finds VS Code workspace storage dirs, detects Insiders vs Stable |
| `hs-buddy-vscode-extension/src/tokenEstimator.ts` | Token estimation via `vscode.lm.countTokens` with char-based fallback |
| `hs-buddy-vscode-extension/src/types.ts` | Full TypeScript types: `CopilotSession`, `Turn`, `ToolCallRecord`, `SessionTotals`, `ModelInfo` |
| `prompt-db` skill | Recovery from `state.vscdb` SQLite — session index, prompt extraction, schema docs |

**Copilot Session Data Architecture** (confirmed via code + docs):

| Data Source | Location | Persistence | Token Data? | Key Info |
|-------------|----------|-------------|------------|----------|
| `state.vscdb` SQLite | `%APPDATA%\{Code variant}\User\workspaceStorage\{id}\state.vscdb` | Persisted, 50-session cap | No | Session metadata (title, dates, state), prompt input history |
| `chatSessions/*.jsonl` | Same workspace storage dir | Persisted per-session | **Yes** — real `promptTokens`/`outputTokens` | Current format. Kind-based line classification. Token counts, tool call rounds, model metadata, timing |
| `transcripts/*.jsonl` | `GitHub.copilot-chat/transcripts/` | Persisted per-session | No (char counts only) | Legacy format. 7 event types with timestamps. User messages, assistant turns, tool executions |
| Agent Debug Buffer | In-memory (`ChatDebugServiceImpl`) | **Wiped on restart** | Yes — live events | 10,000-event ring buffer. Exportable to OTLP JSON |
| Copilot Extension Provider | Internal to extension | Survives restart | Yes — replayed on demand | Historical session traces, token data for past sessions |

**Key SQLite Schema** (`ItemTable` in `state.vscdb`):

- `memento/interactive-session` → `data.history.copilot[]` — array of `{ inputText, selectedModel, mode }` — verbatim user prompts
- `chat.ChatSessionStore.index` → `data.entries{}` — dict of sessions with `sessionId`, `title`, `lastMessageDate`, `timing`, `isEmpty`, `lastResponseState`
- Session count cap: **50 sessions** (oldest trimmed on save)
- Empty sessions cleaned on window close
- Images cleaned after 7 days (not sessions)

**chatSessions JSONL Line Format** (kind-based):

- `kind: 0` — Session initialization (sessionId, creationDate, selectedModel with id/name/family/vendor/multiplier/maxTokens)
- `kind: 1, keyPath: ["customTitle"]` — Title update
- `kind: 1, keyPath: [*, *, "result"]` — Request result with `metadata.promptTokens`, `metadata.outputTokens`, `timings.firstProgress`, `timings.totalElapsed`, `metadata.toolCallRounds[].toolCalls[].name`
- `kind: 2, keyPath: ["requests"]` — New user request count

**VS Code Debug Tools** (official, as of 2026-03-25):

- **Agent Debug Log panel** (Preview): Chrono event log with Logs view, Summary view (total tool calls, tokens, errors, duration), and Agent Flow Chart view. Enable via `github.copilot.chat.agentDebugLog.enabled`. Export to OTLP JSON.
- **Chat Debug view**: Raw LLM request/response details — system prompt, user prompt, context, tool payloads.
- **`/troubleshoot` command**: Ask questions about current session (requires debug log setting enabled).
- **Export**: `Chat: Export Chat...` command saves session as JSON.

**Implementation Plan**:

1. **Port & adapt types** from `hs-buddy-vscode-extension/src/types.ts` — `CopilotSession`, `Turn`, `ToolCallRecord`, `SessionTotals`, `ModelInfo`, `CurrentSessionStats`.
2. **Build Electron service** `electron/services/copilotSessionService.ts`:
   - Discover workspace storage dirs (Insiders → Stable fallback)
   - Parse `chatSessions/*.jsonl` using kind-based line classification (port from `chatSessionParser.ts`)
   - Parse `transcripts/*.jsonl` as legacy fallback (port from `transcriptParser.ts`)
   - Read `state.vscdb` via Python subprocess for prompt history + session index
   - Aggregate into session list with totals
3. **Build IPC handlers** `electron/ipc/copilotSessionHandlers.ts`:
   - `copilot-sessions:scan` — Full scan of all workspace storage dirs
   - `copilot-sessions:get-session` — Single session detail by ID
   - `copilot-sessions:get-totals` — Aggregate totals
   - `copilot-sessions:get-prompts` — Prompt history from SQLite
   - `copilot-sessions:export` — Export session to JSON
4. **Build React views**:
   - `SessionExplorerView.tsx` — Main dashboard: session list, aggregate stats, cost estimates
   - `SessionDetailView.tsx` — Single session: timeline, prompts, tool calls, token breakdown
   - `SessionStatsCard.tsx` — Summary cards: total tokens, model usage, tool frequency
5. **Add Activity Bar section** "Sessions" with items: Overview, History, Analytics.
6. **Optional: File watcher** for real-time updates (port `TranscriptWatcher` polling approach).

**Research Questions to Resolve**:

- Can Electron access `state.vscdb` while VS Code has it open? (SQLite supports concurrent readers)
- Should we use Python subprocess (like `prompt-db`) or bundle `better-sqlite3` native module?
- Can we tap into the Agent Debug OTLP export format for richer data?
- What's the best way to correlate `chatSessions` data with `state.vscdb` session index?
- Premium request tracking: can we derive cost from multiplier + token counts?

**Acceptance Criteria**:

- User can see a list of recent Copilot sessions with title, date, model, and token counts.
- User can drill into a session to see prompt history, tool calls, and timing.
- Aggregate stats show total tokens consumed, model usage breakdown, and tool frequency.
- Data is read-only — no mutations to Copilot's storage files.
- Works with both VS Code Insiders and Stable storage paths.

### Session Insights & Feedback Loop

**Goal**: Turn Copilot session data into a closed-loop optimization signal. Compute per-session efficiency metrics, persist digests to Convex for historical queries, and surface actionable improvement suggestions for instructions, skills, and repo memory. Depends on Session Explorer (viewer) being merged first.

**Prerequisite**: Merge `anvil/copilot-session-explorer` branch to `main`.

**Session Digest Metrics** (computed per session from existing JSONL data):

| Metric | Formula | What It Reveals |
|--------|---------|-----------------|
| `tokenEfficiency` | `totalOutputTokens / totalPromptTokens` | Low ratio = model thinking more than producing. Instructions need more direction. |
| `toolDensity` | `totalToolCalls / requestCount` | High = agentic (good). Low = chatty, not using tools. |
| `searchChurn` | Count of repeated grep/search calls with similar args | High = blind searching. Codebase conventions or file structure undocumented. |
| `avgTimePerRequest` | `totalDurationMs / requestCount` | Baseline for comparing models and task types. |
| `dominantTools` | Top 3 tool names by frequency | Fingerprint of session behavior. |
| `estimatedCost` | `(promptTokens + outputTokens) × multiplierNumeric × baseRate` | Cost attribution per project/session. |

**Convex Schema** — `sessionDigests` table:

```typescript
sessionDigests: defineTable({
  sessionId: v.string(),
  workspaceName: v.string(),
  model: v.optional(v.string()),
  agentMode: v.optional(v.string()),
  requestCount: v.number(),
  totalPromptTokens: v.number(),
  totalOutputTokens: v.number(),
  totalToolCalls: v.number(),
  totalDurationMs: v.number(),
  tokenEfficiency: v.number(),
  toolDensity: v.number(),
  searchChurn: v.number(),
  estimatedCost: v.number(),
  dominantTools: v.array(v.string()),
  firstPrompt: v.optional(v.string()),
  sessionDate: v.number(),
  digestedAt: v.number(),
})
  .index("by_workspace", ["workspaceName", "sessionDate"])
  .index("by_session", ["sessionId"])
  .index("by_date", ["sessionDate"])
```

**Implementation Plan**:

1. **Merge Session Explorer branch** — prerequisite, brings in service + types + IPC + UI.
2. **Add digest types** to `src/types/copilotSession.ts` — `SessionDigest` interface.
3. **Add `computeDigest()` function** to `copilotSessionService.ts` — takes a `CopilotSession`, returns `SessionDigest`. Computes all 6 metrics. Search churn requires analyzing the `toolNames` arrays across results for repeated patterns.
4. **Add Convex table + mutations** — `sessionDigests` table in schema, `upsertDigest` mutation (idempotent by sessionId), `getDigests` query with workspace/date filters.
5. **Add IPC handler** `copilot-sessions:compute-digests` — scans sessions, computes digests for any not yet in Convex, pushes new digests.
6. **Add digest display to Session Detail** — show efficiency metrics alongside existing token/tool data.
7. **Future (P2)**: Insights View with trend charts, worst-session highlighting, and "what would have helped" suggestions.

**Acceptance Criteria**:

- Every parsed session gets a digest with all 6 metrics computed.
- Digests persist to Convex and are queryable by workspace and date range.
- Session Detail view displays efficiency score, tool density, and search churn.
- Digest computation is idempotent — re-scanning doesn't create duplicates.
- Cost estimation uses the model's `multiplierNumeric` from JSONL metadata.

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

1. **View labels**: Add entries to `appContentViewLabels.ts`:

   ```typescript
   'planner-upcoming': 'Upcoming',
   'planner-today': 'Today',
   'planner-projects': 'Projects',
   ```

#### Electron IPC — Todoist Service

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

1. **`electron/ipc/todoistHandlers.ts`** — IPC bridge:

- `todoist:get-upcoming` — Returns 7-day grouped tasks
- `todoist:get-today` — Returns today's tasks only
- `todoist:complete-task` — Complete a task by ID
- `todoist:reopen-task` — Reopen a task by ID
- `todoist:create-task` — Create a new task
- `todoist:update-task` — Update an existing task
- `todoist:delete-task` — Delete a task
- `todoist:get-projects` — List all projects

1. **Register handlers** in `electron/ipc/index.ts`

2. **Preload exposure** in `electron/preload.ts` — expose todoist IPC methods on `window.electronAPI`

#### React Components

1. **`src/components/planner/TaskPlannerView.tsx`** — Main upcoming view component:

- Fetches 7-day task data via `useTodoistUpcoming()` hook
- Renders day sections with task lists
- Handles task completion toggling
- Auto-refreshes every 60 seconds
- Pull-to-refresh / manual refresh button

1. **`src/components/planner/DaySection.tsx`** — Single day header + task list:

- Date header with day name, formatted date, task count
- "Today" / "Tomorrow" labels for relative dates
- "+ Add Task" button per day section
- Empty state for days with no tasks

1. **`src/components/planner/TaskRow.tsx`** — Individual task row:

- Completion checkbox with optimistic UI update
- Task content with inline edit support
- Priority dot indicator
- Project name badge
- Label tags
- Context menu (right-click)

1. **`src/components/planner/TaskPlannerView.css`** — Styling matching VSCode dark theme

2. **`src/components/planner/AddTaskInline.tsx`** — Inline task creation form:

- Content input, date picker, priority selector, project dropdown
- Auto-assigns date based on which day section it's in

#### Hooks

1. **`src/hooks/useTodoist.ts`** — React hooks for Todoist data:

- `useTodoistUpcoming(days?: number)` — Fetches and caches upcoming tasks, returns `{ dayGroups, isLoading, error, refresh }`
- `useTodoistToday()` — Shortcut for today-only view
- `useTodoistProjects()` — Cached project list for name resolution
- `useTaskActions()` — Returns `{ completeTask, reopenTask, createTask, updateTask, deleteTask }` with optimistic updates

#### Types

1. **`src/types/todoist.ts`** — TypeScript interfaces:

   ```typescript
   interface TodoistTask {
     id: string
     content: string
     description: string
     project_id: string
     priority: 1 | 2 | 3 | 4 // 4=P1, 3=P2, 2=P3, 1=P4
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
     date: string // ISO date string YYYY-MM-DD
     label: string // "Today", "Tomorrow", "Mon, Mar 3"
     tasks: TodoistTask[]
   }
   ```

#### Files to Create or Modify

| Action | File                                         | Purpose                                                   |
| ------ | -------------------------------------------- | --------------------------------------------------------- |
| Create | `src/types/todoist.ts`                       | TodoistTask, TodoistProject, TodoistLabel, DayGroup types |
| Create | `electron/services/todoistClient.ts`         | Todoist REST API v2 client                                |
| Create | `electron/ipc/todoistHandlers.ts`            | IPC handlers for todoist operations                       |
| Create | `src/hooks/useTodoist.ts`                    | React hooks: useTodoistUpcoming, useTaskActions, etc.     |
| Create | `src/components/planner/TaskPlannerView.tsx` | Main 7-day upcoming view                                  |
| Create | `src/components/planner/TaskPlannerView.css` | Planner styling                                           |
| Create | `src/components/planner/DaySection.tsx`      | Per-day section component                                 |
| Create | `src/components/planner/TaskRow.tsx`         | Individual task row component                             |
| Create | `src/components/planner/AddTaskInline.tsx`   | Inline task creation                                      |
| Modify | `src/components/ActivityBar.tsx`             | Add "Planner" section with CalendarDays icon              |
| Modify | `src/components/SidebarPanel.tsx`            | Add planner section data                                  |
| Modify | `src/components/AppContentRouter.tsx`        | Route planner-upcoming/today/projects views               |
| Modify | `src/components/appContentViewLabels.ts`     | Add planner view labels                                   |
| Modify | `electron/ipc/index.ts`                      | Register todoist IPC handlers                             |
| Modify | `electron/preload.ts`                        | Expose todoist IPC methods                                |

#### Key Design Decisions

- **Electron IPC, not direct fetch**: The renderer never sees the API token. All Todoist calls go through IPC → main process → Todoist API.
- **Optimistic UI**: Task completion toggles instantly in the UI, with rollback on API error.
- **Lightweight caching**: Project list cached 5 min in main process. Task data refreshed on view focus + 60s interval.
- **No Convex storage**: Tasks live in Todoist — Buddy is a pure client. No syncing or local persistence beyond in-memory cache.
- **Replace or coexist with "Tasks" section**: The existing `tasks` Activity Bar section has placeholder items (Today, Upcoming, Projects). The Planner section can either replace it or live alongside it. Replacing makes sense since the items are identical — just rename the section and wire it to real data.

---

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
