# Buddy - TODO

| Status | Priority | Task | Notes |
|--------|----------|------|-------|
| 📋 | High | [Terminal Folder View & File Preview](#terminal-folder-view--file-preview) | #699 — Built-in file explorer synced to terminal CWD with code preview pane |
| 📋 | High | [Electron Main Process Test Suite](#electron-main-process-test-suite) | #695 — **0 test files across 38 source files** — IPC handlers, services, workers, root modules all untested |
| 📋 | High | [IPC Contract Testing](#ipc-contract-testing) | #694 — 16 IPC handler files are the renderer↔main bridge with zero contract validation |
| 📋 | High | [Convex Server Function Tests](#convex-server-function-tests) | #696 — **0 tests across 16 server functions** — bookmarks, jobs, runs, schedules, settings, etc. |
| 📋 | High | [Performance Testing Suite](#performance-testing-suite) | #697 — Electron startup time, memory leak detection, IPC throughput, React render profiling, benchmark CI gating |
| 📋 | High | [E2E Test Coverage Expansion](#e2e-test-coverage-expansion) | #698 — Only 1 spec file (2 tests) — PR views, settings, automation, terminal all untested; includes Playwright component testing evaluation and visual regression testing |
| 📋 | High | [Split github.ts Monolith](#split-githubts-monolith) | #693 — 3,671 lines / 105 KB — split by domain (prs, orgs, users, copilot) with barrel re-export |
| 📋 | Medium | [Code Quality & Architecture Enforcement](#code-quality--architecture-enforcement) | #692 — `dependency-cruiser` for import boundaries + circular deps, `electronegativity` for Electron security, ESLint `strict` preset, `unicorn` plugin, runtime a11y via axe-core |
| 📋 | Medium | [CI Pipeline Improvements](#ci-pipeline-improvements) | #691 — Parallelize jobs (~8m→~5m), harden soft-fail steps (e18e, npm-audit), add Convex typecheck, cache bun deps |
| 📋 | Medium | [Bookmarks — URL & Link Collection Manager](#bookmarks) | #701 — New feature: categorized link management with quick-launch and tagging |
| 📋 | Medium | [Card/List View Toggle for all list pages](#cardlist-view-toggle) | #700 — Add table/grid view as alternative to card view on list pages |
| 📋 | Medium | Add CONTRIBUTING.md | #702 — Contributor setup (Bun, Convex, env vars), PR conventions, testing expectations |
| 📋 | Low | Add CODEOWNERS file | #703 — Define file ownership for electron/, convex/, src/components/, .github/workflows/ |
| ✅ | High | Ralph Loops Control Center | 2026-05-03: PR #677 merged — dashboard, launch/monitor/configure loops, PR detail integration, autopilot worktree isolation |
| ✅ | High | Cyclomatic Complexity Rule| 2026-05-02: `complexity: ['warn', 10]` active in eslint.config.js (informational — warns, does not block CI) |
| ✅ | High | File Length Rule (max-lines) | 2026-05-02: `max-lines: ['warn', 500]` active via ESLINT_QUALITY (informational — not in CI gate) |
| ✅ | High | Function Length Rule (max-lines-per-function) | 2026-05-02: `max-lines-per-function: ['warn', 80]` active via ESLINT_QUALITY (informational — not in CI gate) |
| ✅ | Medium | Cognitive Complexity (eslint-plugin-sonarjs) | 2026-05-02: sonarjs installed, `cognitive-complexity: ['warn', 15]` active via ESLINT_QUALITY (informational — not in CI gate) |
| ✅ | Medium | Enforce Typed Catch Clauses | 2026-05-02: All 110+ `try-catch` blocks typed `: unknown`, ESLint `no-restricted-syntax` rule enforces annotation going forward, `no-explicit-any` promoted to error. Promise `.catch()` callbacks are out of scope (arrow fn params, not catch clauses). |
| ✅ | High | Add Gherkin BDD specs for remaining critical paths | 2026-04: data-cache (10), pr-mapper (4), pr-detail-routing (6) — 90 new tests |
| ✅ | High | Wire coverage:ratchet into CI | 2026-04-21: Added ratchet + staleness check to ci.yml after test:coverage |
| ✅ | Medium | Add format:check to pre-commit hook | 2026-04-21: Added `bun run format:check` to Phase 1 of .husky/pre-commit |
| ✅ | High | Raise test coverage from 20% to 50% | 2026-04-20: At 99.98% (4,090 tests, 198 files). Thresholds set to 100%. |
| ✅ | High | SFL Queue Monitor workflow | 2026-04-01: Deployed to 3 repos with agent:queue label |
| ✅ | Medium | Quality gates overhaul | 2026-03-31: CI gates, commitlint, vitest-cucumber BDD, coverage ratchet (PR #408) |
| ✅ | Medium | Benchmarking tests for critical paths | 2026-03-30: 3 bench files (dateUtils, jsonSerialization, copilotSessionParsing) |
| ✅ | Medium | Task Planner (Todoist Integration) | 2026-03-30: 7-day upcoming view, Todoist REST API, IPC handlers |
| ✅ | Medium | Copilot Session Explorer | 2026-03-29: JSONL parsing, workspace grouping, streaming parser |
| ✅ | Medium | Session Insights & Feedback Loop | 2026-03-29: Digest computation, Convex persistence, digest UI |
| ✅ | High | Add GitHub organization metrics detail view | 2026-03-22: Skeleton loader, per-phase error handling, roster controls |
| ✅ | Medium | Add branch cleanup to repo-audit | 2026-03-22: Branch Hygiene scope added to repo-audit + sfl-auditor |
| ✅ | Medium | Capture Copilot usage history | 2026-03-09: Issue #137 / PR #138; snapshots persist for trends |
| ✅ | High | Build project-scoped Copilot workspaces | 2026-03-08: Local project registration and project-scoped sessions |
| ✅ | High | SFL Loop monitoring in Organizations tree | 2026-03-08: Organizations tree shows SFL workflow health per repo |
| ✅ | High | Unify issue processor and fixer | 2026-03-07: Retired pr-fixer; sfl-issue-processor is single implementer |
| ✅ | High | Global Copilot Assistant Panel | 2026-03-04: PR #104 merged via SFL pipeline |
| ✅ | High | Simplisticate E2E Test | 2026-03-04: End-to-end SFL validation run completed |
| ✅ | High | Simplisticate Workflows | 2026-03-03: Event-driven triggers, human review handoff |
| ✅ | High | SFL Auto-Merge mode | 2026-03: Simplified to human-review handoff via A→B→C→label-actions |
| ✅ | Medium | Copilot Usage month-end projection | 2026-03: Per-account trend projection with daily rate |
| ✅ | High | SFL Simplification — Replace supersession model | 2026-02: pr-fixer rewritten with push-to-pull-request-branch |
| ✅ | High | SFL Simplification — Label pruning | 2026-02: 39→27 labels, removed 12 unused |
| ✅ | High | Build sfl-auditor workflow | 2026-02: Audits label consistency, repairs orphaned state |
| ✅ | High | SFL Simplification — Reduce PR Fixer prompt | 2026-02: 365→164 lines via V2 architecture |
| ✅ | High | SFL Simplification — Adopt new safe-outputs | 2026-02: add-comment, add-labels/remove-labels adopted |
| ✅ | High | SFL Complexity gate for future sessions | 2026-02: Session Start Gate added to SKILL.md |
| ✅ | High | Critically reduce and remove AGENTS.md | 2026-02: Covered in workflow prompts and governance docs |
| ✅ | High | Complete migration to relias-engineering | 2026-02: Migrated, PAT set, pipeline verified |
| ✅ | High | Define Set it Free governance policy | 2026-02: Moved to relias-engineering/set-it-free-loop |
| ✅ | High | Build feature-intake normalization workflow | 2026-02: Convex mapping + template-driven issue drafts |
| ✅ | High | Issue Processor workflow | 2026-02: Cron claim → draft PR → agent:in-progress labeling |
| ✅ | High | Build PR Analyzer workflow (×3 models) | 2026-02: Three analyzers on staggered crons |
| ✅ | High | Build PR Fixer workflow (authority) | 2026-02: Claude Opus; reads analyzer comments; commits fixes |
| ✅ | High | Add pr:cycle-N label system | 2026-02: Labels pr:cycle-1/2/3; analyzers skip cycle-3 |
| ✅ | High | Build PR Promoter workflow | 2026-02: All analyzers pass → un-draft PR + promotion comment |
| ✅ | High | Improve Welcome to Buddy window | 2026-02: Convex-backed stats dashboard, session tracking |
| ✅ | High | Expand repo detail view | 2026-02: Rich card-based repo info panel with caching |
| ✅ | High | Make repos expandable folders | 2026-02: Expandable repos with Issues & PRs children |
| ✅ | High | Build task dispatch system | 2026-02: Dispatcher + exec worker + Convex claiming |
| ✅ | High | Implement exec-worker | 2026-02: spawn()-based shell execution, timeout, abort |
| ✅ | High | Restructure electron/main.ts | 2026-02: Split 423→95 lines, 8 new modules |
| ✅ | High | Job management UI | 2026-02: CRUD, context menus, worker-type forms |
| ✅ | High | Implement Convex cron job | 2026-02: Runs every minute via crons.ts |
| ✅ | High | Data prefetch + persistent cache | 2026-02: PR data survives restarts, background refresh |
| ✅ | Medium | Repos of Interest feature | 2026-02: Folder-organized bookmark system |
| ✅ | Medium | Add run history view | 2026-02: Real-time status, filters, expandable output |
| ✅ | Medium | Implement skill-worker | 2026-02: Copilot CLI spawn, --allow-all mode |
| ✅ | Medium | Implement ai-worker | 2026-02: Copilot CLI spawn, model selection, abort |
| ✅ | Medium | Elegant status bar queue display | 2026-02: "X of N · TaskName" with batch tracking |
| ✅ | Medium | Copilot enterprise budget reset fix | 2026-02: UTC dates, auto-refresh on month boundary |
| ✅ | Low | Implement offline queue | 2026-02: Catch-up logic on reconnect |
| ✅ | High | Tabbed window system for PRs | 2025-01: Tabs above content area, no duplicates |
| ✅ | High | Fix Recently Merged date range | 2025-01: 30-day default, configurable in Settings |
| ✅ | High | App-wide task queue system | 2025-01: Named queues with concurrency control |
| ✅ | High | Settings UI with form-based editing | 2025-01: SidebarPanel navigation, auto-save |
| ✅ | High | Initialize Convex project | 2025-02: Generated types ready |
| ✅ | High | Define Convex schema | 2025-01: convex/schema.ts with jobs, schedules, runs |
| ✅ | High | Add Convex client to Electron | 2025-01: ConvexClientProvider, useConvex hooks |
| ✅ | High | Implement schedule CRUD functions | 2025-01: convex/schedules.ts, jobs.ts, runs.ts |
| ✅ | Medium | Create schedule editor dialog | 2025-02: Modal with CronBuilder, job selector |
| ✅ | Medium | Add Workflows activity bar icon | 2025-01: RefreshCw icon in ActivityBar |
| ✅ | Medium | Build Schedules sidebar + list | 2025-01: ScheduleList component with status badges |
| ✅ | Medium | Port CronBuilder component | 2025-01: From hs-conductor with visual builder |
| ✅ | Medium | Implement schedule toggles | 2025-02: Toggle mutation in useConvex hooks |
| ✅ | Medium | Fix taskbar app name | 2025-01: "HS-body" → "Buddy" |
| ✅ | Medium | Create Help menu with About window | 2025-01: About dialog with branding |
| ✅ | Medium | Design and create app icon | 2025-01: Gold/orange gradient Users icon |

## Progress

**Remaining: 13** | **Completed: 74** (85%)

---

## Remaining Items

### E2E Test Coverage Expansion

The app has **1 Playwright spec file with 2 tests** covering only the bookmarks feature. With ~90 components across 15+ feature areas, the E2E coverage gap is the single biggest quality risk — 100% unit test coverage gives false confidence when integration points (IPC, API calls, DB queries) are mocked away.

#### Critical User Journeys Without E2E Coverage

- **PR workflow**: PR list → detail → review → threads → files changed
- **Settings persistence**: Change setting → restart → verify persisted
- **Automation**: Create job → create schedule → trigger run → view output
- **Terminal**: Open terminal → run command → CWD tracking
- **Navigation**: Sidebar → activity bar → tab switching → back/forward

#### Implementation Plan

1. Add Playwright Electron adapter (`@playwright/test` with `electron.launch()`)
2. Create `e2e/pr-workflow.spec.ts` — highest-value user journey
3. Create `e2e/settings.spec.ts` — settings persistence verification
4. Create `e2e/navigation.spec.ts` — sidebar, tabs, routing
5. Add `test:e2e` script to package.json and CI pipeline
6. Target: 5 spec files covering the 5 critical journeys above

#### E2E Risk Assessment

- 🟡 E2E tests require running app + Convex dev server — CI setup complexity
- 🟢 Playwright infrastructure already exists (`playwright.config.ts`, `e2e/` directory)
- 🟢 Electron Playwright adapter is well-documented

### Split github.ts Monolith

`src/api/github.ts` is **3,671 lines (105 KB)** — the largest file in the codebase by 2.3×. It contains 21 untyped `catch (error)` blocks, 2 of the 4 production `any` types, 12+ `console.warn` calls, and functions spanning at least 5 distinct GitHub API domains.

#### Why Split

- **Merge conflict magnet**: Every new GitHub API feature touches the same file
- **Cognitive burden**: 3.4K lines is beyond what anyone can hold in working memory
- **Testing bottleneck**: Changes to one domain require re-running all github.ts tests
- **Tech debt concentration**: The untyped catches and `any` types cluster here because the file grew organically

#### Proposed Domain Split

| New File | Functions | Estimated Lines |
|----------|-----------|----------------|
| `src/api/github/prs.ts` | PR list, detail, reviews, threads, files | ~800 |
| `src/api/github/orgs.ts` | Org tree, repos, members, teams | ~700 |
| `src/api/github/users.ts` | User detail, contributions, premium usage | ~600 |
| `src/api/github/copilot.ts` | Copilot usage, sessions, metrics | ~500 |
| `src/api/github/commits.ts` | Commit history, commit detail | ~300 |
| `src/api/github/index.ts` | Barrel re-export of all modules | ~50 |
| `src/api/github/shared.ts` | Shared types, helpers, Octokit init | ~200 |

#### Domain Split Implementation

1. Create `src/api/github/` directory
2. Move functions by domain into new files (pure refactor, no behavior change)
3. Create barrel `index.ts` that re-exports everything — consumers import from `@/api/github` unchanged
4. Move co-located test file `src/api/github.test.ts` into matching domain test files
5. Verify 100% coverage maintained after split

### Code Quality & Architecture Enforcement

Consolidates code quality tooling, dependency analysis, and architecture enforcement into a single initiative.

#### Architecture Enforcement (dependency-cruiser)

1. Install: `bun add -d dependency-cruiser`
2. Generate config: `bunx depcruise --init`
3. Configure rules: max fan-in per module (e.g., 15), no circular deps, enforce import boundaries (components can't import from electron/, convex/ can't import from src/)
4. Add `"deps:check": "depcruise src --config"` to package.json scripts
5. Add to CI as informational step initially, promote to blocking later
6. Alternative: `madge` for quick circular dependency visualization (`bunx madge --circular src/`)

#### ESLint Plugin Expansion

- `eslint-plugin-unicorn` — modern JS best practices, performance patterns
- Upgrade `typescript-eslint` from `recommended` → `strict` preset (adds no-unnecessary-condition, no-confusing-void-expression, etc.)

#### Electron Security

- `electronegativity` — static analysis for Electron security misconfigurations (nodeIntegration, contextIsolation, webSecurity)
- Add as CI step: `npx electronegativity -i electron/ -r`

#### Runtime Accessibility

- `vitest-axe` — catches runtime ARIA violations that jsx-a11y ESLint misses
- Add axe-core checks to component test suite

### Electron Main Process Test Suite

The entire `electron/` directory has **0 test files** across approximately 38 source files. This is the largest untested surface in the codebase.

#### Untested Electron Files

- **IPC Handlers (16 files):** cacheHandlers, configHandlers, copilotHandlers, copilotSessionHandlers, crewHandlers, filesystemHandlers, financeHandlers, githubHandlers (27KB), instrumentIpc, ipcHandler, shellHandlers, tempoHandlers, terminalHandlers (14KB), todoistHandlers, windowHandlers, index
- **Services (8 files):** copilotClient, copilotService, copilotSessionService, crewService, tempoClient, todoistClient (bench files exist but no unit tests)
- **Workers (7 files):** aiWorker, dispatcher, execWorker, offlineSync, skillWorker, types, index
- **Root Modules (7 files):** main.ts, preload.ts, config.ts, cache.ts, menu.ts, telemetry.ts, jsonFileStore.ts, utils.ts, zoom.ts

#### Electron Test Implementation Plan

1. Create `vitest.electron.config.ts` with `environment: 'node'` (not happy-dom)
2. Create `electron/__mocks__/electron.ts` to mock BrowserWindow, ipcMain, app, dialog, shell
3. Add `"test:electron": "vitest run --config vitest.electron.config.ts"` script
4. Add `test:electron` step to CI pipeline
5. Start with IPC handlers (highest-value tests) → services → workers → root modules

#### Worker Test Priorities

- **dispatcher.ts (8KB)** — correct routing, concurrency limits, error propagation
- **execWorker.ts (5KB)** — timeout behavior, abort signal handling, stdout/stderr capture
- **offlineSync.ts (7KB)** — queue persistence, replay ordering, conflict resolution on reconnect
- **skillWorker.ts (2KB)** / **aiWorker.ts (1KB)** — Copilot CLI spawn and abort

### IPC Contract Testing

The 16 IPC handler files in `electron/ipc/` register channels that the renderer process relies on. There is zero validation that these contracts are maintained — a renamed channel silently breaks features at runtime.

#### Contract Testing Approach

1. Extract a shared `IPC_CHANNELS` constant (or generate from TypeScript types)
2. Write contract tests that verify each handler registers expected channels
3. Test request/response shapes match what the renderer sends/expects
4. Biggest risks: `githubHandlers.ts` (27KB, most complex), `terminalHandlers.ts` (14KB), `configHandlers.ts` (7KB)

### Convex Server Function Tests

All 16 Convex server functions have **zero test coverage**. These handle persistent data operations (bookmarks, stats, jobs, schedules, settings) — bugs here corrupt user data.

#### Convex Test Scope

- bookmarks, buddyStats, copilotResults, copilotUsageHistory, featureIntakes
- githubAccounts, jobs, prReviewRuns, repoBookmarks, runs
- scheduleScanner, schedules, schema, sessionDigests, settings
- Plus `convex/lib/` helpers

#### Convex Test Implementation

1. Install `convex-test` package for in-memory Convex backend testing
2. Create `convex/__tests__/` directory with test files per module
3. Add `"test:convex": "vitest run --config vitest.convex.config.ts"` script
4. Prioritize: mutations (data-modifying) > queries > actions (external API calls)

### Performance Testing Suite

Comprehensive performance monitoring beyond unit benchmarks. The app needs Electron-specific performance testing that catches regressions across startup, memory, IPC, and rendering.

#### Key Performance Areas

1. **Benchmark CI Gating** — Benchmarks currently run with `continue-on-error: true` — performance regressions are invisible. Store bench results as JSON artifact, compare PR against main baseline, fail if any benchmark regresses >15%. Use `vitest bench --outputJson` + a `scripts/bench-compare.ts` comparator
2. **Electron Startup Time** — Measure time from `app.whenReady()` to first meaningful paint. Track in CI and alert on regression (target: <3s cold start)
3. **Memory Leak Detection** — Use `process.memoryUsage()` snapshots before/after heavy operations. Detect growth in heapUsed over repeated cycles. Focus on: IPC handler leaks, event listener accumulation, renderer process growth
4. **IPC Throughput Testing** — Measure round-trip latency for critical IPC channels under load. Benchmark: githubHandlers (API calls), terminalHandlers (shell I/O), configHandlers (file I/O)
5. **React Render Performance** — Add `why-did-you-render` in development mode to flag unnecessary re-renders. Track render counts for heavy components (PR list, org tree, schedule editor)
6. **Lighthouse CI** — Run Lighthouse on the renderer process to score performance, a11y, and best practices

#### Performance Test Implementation

1. Create `perf/` directory for performance test scripts
2. Add `"perf:startup"` and `"perf:memory"` scripts to package.json
3. Integrate startup time tracking into CI (fail if >5s)
4. Add `why-did-you-render` as devDependency with development-only setup
5. Add bench-compare script for CI gating of vitest bench results

### Bookmarks

A new feature for managing a personal collection of URLs and links with rich categorization and fast access.

#### Bookmark Core Concepts

- **Link entries**: URL, title, description, favicon, category, tags
- **Categories**: User-defined folders/groups (e.g., "Dev Tools", "Docs", "Design Inspo")
- **Tags**: Cross-cutting labels for flexible filtering
- **Quick-launch**: Open links from the app with one click or keyboard shortcut
- **Import/Export**: Bring in browser bookmarks, export as JSON/HTML

#### Bookmark UI Ideas

- New sidebar icon in the ActivityBar
- List view with search/filter bar (by category, tag, or free text)
- Card or compact-row display modes
- Drag-and-drop reordering within categories
- Context menus for edit, copy URL, open, delete
- "Add Bookmark" dialog with auto-fetch of page title and favicon from URL

#### Bookmark Data Model

- Convex table for persistence and real-time sync
- Schema: `url`, `title`, `description`, `faviconUrl`, `category`, `tags[]`, `createdAt`, `lastVisited`, `sortOrder`

#### Future Enhancements

- Dead link detection (periodic health check)
- Usage stats (most visited, recently added)
- Shareable bookmark collections
- Browser extension or bookmarklet for quick-add

### Terminal Folder View & File Preview

A built-in file explorer that shows the directory/file structure of the active terminal session's working directory, paired with a code preview pane above the terminal — similar to VS Code's explorer + editor layout.

#### Core Behaviour

- **Synced to terminal CWD**: The folder view shows the directory tree for whichever terminal tab is active. When the user switches terminal tabs, the folder view updates to reflect that tab's current working directory (leveraging the OSC 7 CWD tracking already implemented).
- **File preview**: Clicking a file in the folder view opens a read-only code preview in the main content area (above the terminal, replacing `AppContentRouter`'s current view or in a new "file preview" tab).
- **Syntax highlighting**: Use a lightweight approach — Monaco Editor (already bundled for most Electron apps), Shiki, or a simpler `<pre>` with highlight.js for common languages (C#, TypeScript, JSON, Markdown, YAML, Python, etc.).

#### Terminal Folder Implementation Phases

##### Phase 1: Folder View Sidebar (foundation)

1. **Context menu entry**: Add "Folder View" toggle to `TerminalTabContextMenu.tsx` (icon: `FolderOpen` from lucide-react).
2. **New component**: `FolderView.tsx` — tree-based file explorer using `window.terminal` IPC to read directory contents from the main process.
3. **New IPC handler**: `terminal:read-dir` in `electron/ipc/terminalHandlers.ts` — given a path, return `{ name, type: 'file'|'dir', size }[]`. Security: constrain to the CWD subtree only.
4. **Placement**: Add a new `Allotment.Pane` to the left of the terminal pane area (or as a collapsible side panel within the terminal region). The folder view sits beside the terminal output, not replacing it.
5. **State**: `folderViewOpen: boolean` in `useTerminalPanel` hook, persisted to Convex settings alongside other terminal state.
6. **Tree expansion**: Lazy-load subdirectories on expand (don't scan the full tree upfront). Remember expanded state per tab.

#### Phase 2: File Preview Pane

1. **File read IPC**: `terminal:read-file` handler — reads file contents (capped at 1MB, returns error for binary). Returns `{ content: string, language: string }`.
2. **Preview component**: `FilePreview.tsx` — syntax-highlighted read-only code view. Use Shiki or highlight.js (lighter than Monaco for read-only). Show filename, line count, and file size in a header bar.
3. **Integration with app layout**: File previews open as "ephemeral" tabs in `TabBar` (italic title, like VS Code's preview mode). Clicking another file replaces the ephemeral tab; double-clicking pins it.
4. **Tab viewId convention**: `file-preview://<absolute-path>` so the router can render `FilePreview` for these IDs.

#### Phase 3: Folder ↔ Terminal Sync

1. **Auto-navigate on CWD change**: When the terminal's CWD changes (via existing `onCwdChange` callback), the folder view root updates automatically.
2. **Navigate terminal from folder view**: Right-click a folder → "Open Terminal Here" changes the active terminal's CWD by writing `cd "<path>"\r` to the PTY.
3. **Breadcrumb bar**: Show the current path as a clickable breadcrumb above the folder tree for quick navigation up the hierarchy.

#### Phase 4: Polish & UX

1. **File icons**: Use file-type icons (e.g., `vscode-icons` set or a custom SVG sprite) based on file extension.
2. **Search/filter**: Quick filter input at the top of the folder view to narrow visible files.
3. **Keyboard navigation**: Arrow keys to navigate tree, Enter to preview, Ctrl+Shift+E to toggle folder view.
4. **Drag-and-drop to terminal**: Drag a file from the folder view to the terminal pane → inserts its path as text.
5. **Binary file handling**: Show a "Binary file — cannot preview" placeholder with file size and type info.
6. **Large file handling**: Files >1MB show a warning and truncate preview. Option to "Open Externally" via system default app.

#### Architecture Notes

- The folder view state (open/closed, root path) is per-terminal-tab and persists in Convex alongside `title`, `cwd`, `color`.
- The `Allotment` layout in `App.tsx` already handles vertical splits (main content | terminal). The folder view adds a horizontal split within the terminal region: `[FolderView | TerminalPane]`.
- File preview reuses the existing `TabBar` / `AppContentRouter` infrastructure — it's just a new view type.
- IPC boundary: all filesystem access goes through Electron main process (never `fs` from renderer). This preserves the security model.

#### Terminal Folder New Files

| File | Purpose |
|------|---------|
| `src/components/terminal/FolderView.tsx` | Tree UI component |
| `src/components/terminal/FolderView.css` | Styles |
| `src/components/FilePreview.tsx` | Syntax-highlighted file viewer |
| `src/components/FilePreview.css` | Styles |
| `electron/ipc/filesystemHandlers.ts` | `read-dir` and `read-file` IPC handlers |

#### Dependencies to Evaluate

- **Shiki** (syntax highlighting, ~2MB, WASM-based, accurate) vs **highlight.js** (~1MB, regex-based, fast)
- No new native modules needed — `fs.readdir` / `fs.readFile` are sufficient

#### Terminal Feature Risks

- 🟡 Large directories (node_modules) — must implement lazy loading + exclusion patterns (`.gitignore`-aware)
- 🟡 Security — main process must validate paths are within the tab's CWD subtree to prevent directory traversal
- 🟢 Performance — lazy tree + file size caps make this manageable

### Card/List View Toggle

Add a switchable Card ↔ List (table) view mode to all pages that render collections as cards. When a list has many items, a compact table/grid is easier to scan.

#### Affected Pages

- `PullRequestList.tsx` — PR cards (CSS grid, 400px min)
- `RepoIssueList.tsx` — issue cards
- `RepoPullRequestList.tsx` — repo-scoped PR cards
- `RunList.tsx` / `RunCard.tsx` — workflow run cards

#### Existing Pattern

- `TempoDashboard.tsx` already has a Grid ↔ Timeline toggle (Grid3x3 / List icons). Extract and generalize this pattern.

#### View Toggle Implementation Plan

1. Create a shared `ViewModeToggle` component (Card icon / List icon toggle button group)
2. Create a shared `useViewMode(key)` hook that persists preference per page to localStorage
3. For each affected page:
   - Add `ViewModeToggle` next to existing header/filter controls
   - Card view = current rendering (no changes)
   - List view = compact table with sortable columns (title, status, author, date, etc.)
4. Refactor `TempoDashboard` to use the shared `ViewModeToggle` + `useViewMode` instead of its local state

#### List View Columns

- PRs: Title, Status (icon), Author, Repo, Updated, Reviews
- Issues: Title, Status (icon), Author, Labels, Updated
- Runs: Name, Status (icon), Duration, Triggered, Result

#### UX Details

- Toggle persists across sessions (localStorage keyed by page)
- Smooth transition between views (no jarring flash)
- Table rows should have hover highlight and click-to-open like cards
- Keep existing search/filter controls — they apply to both views

### CI Pipeline Improvements

Consolidates parallelization, hardening, and new checks into a single CI initiative.

#### Current State

The CI workflow runs **~8 minutes** as a single serial job. Three steps run with `continue-on-error: true` (e18e, npm-audit, bench), hiding failures.

| Step | Duration | % of Total |
|------|----------|------------|
| Run tests with coverage | 4m 08s | 50% |
| Run benchmarks | 1m 29s | 18% |
| Lint (ESLint) | 39s | 8% |
| Build (vite + electron) | 37s | 7% |
| Type check (TypeScript) | 21s | 4% |
| Install dependencies | 18s | 4% |
| Everything else | ~50s | 9% |

#### Implementation Steps

1. **Split into parallel jobs** — lint, typecheck, format, tests as separate jobs (~8m→~5m wall time)
2. **Cache bun dependencies** — `actions/cache` with `~/.bun/install/cache`
3. **Harden soft-fail steps** — remove `continue-on-error` from e18e, add `--audit-level=high` to npm-audit
4. **Add Convex typecheck** — `npx convex typecheck` as new CI step
5. **Move benchmarks** — separate optional workflow triggered on `workflow_dispatch` or PR label

#### Target Architecture

```yaml
jobs:
  install: # shared dependency install + cache
  lint: # ESLint + Prettier + knip + e18e (parallel)
  typecheck: # tsc --noEmit + convex typecheck (parallel)
  test: # vitest + coverage + ratchet (parallel)
  build: # vite + electron (depends on typecheck)
  benchmarks: # optional, separate workflow
```
