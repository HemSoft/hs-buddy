# Buddy - TODO

| Status | Priority | Task                                                                               | Notes                                                                                                                                                                                                                                                     |
| ------ | -------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 📋     | Medium   | [Reduce CRAP scores](#reduce-crap-scores)                                         | Perfection audit: 331 functions with cyclomatic complexity > 5. Target: all functions CRAP < 6 via refactoring + coverage |
| 📋     | Medium   | [Improve React Doctor score](#improve-react-doctor-score)                          | Perfection audit: 82/100 — 138 warnings across 47 files (Date.now in JSX, filter().map() chains, sequential setState, etc.) |
| 📋     | Medium   | [Performance Testing Suite](#performance-testing-suite)                            | #10 — Remaining: Lighthouse CI. Done: bench-compare.ts + benchmarks.yml CI workflow, react-scan (replaces WDYR for React 19), startup/memory/IPC bench infra |
| 📋     | Medium   | [Code Quality & Architecture Enforcement](#code-quality--architecture-enforcement) | #9 — Remaining: `electronegativity` for Electron security, expand axe-core to more component tests. Done: `dependency-cruiser` ✅, `unicorn` ✅, `strict` ✅, `vitest-axe` + axe-helper (4 tests) ✅ |
| 📋     | Low      | [Fix Prettier formatting violations](#fix-prettier-formatting-violations)          | Down from 33 to 10 files — auto-fix with `bun run format` |
| 📋     | Low      | [Fix Markdown lint errors](#fix-markdown-lint-errors)                              | Down from 7 to 5 errors (MD040 ×3, MD032 ×1, MD047 ×1) — mostly auto-fixable |
| 📋     | Low      | Fix e18e pkg.main packaging config                                                | Perfection audit: pkg.main references dist-electron/main.js but file not in pkg.files — update package.json |
| ✅     | High     | Update bundle-size baseline                                                       | 2026-05-07: Fixed stale-artifact bug in collectLargestMain, updated baseline, cleaned 32 stale artifacts |
| ✅     | High     | Close test coverage gap to 100%                                                   | 2026-05-07: PR #14 merged — 100% statements, branches, functions, lines (10981/6990/3498/9940) |
| ✅     | High     | Terminal Folder View & File Preview                                                | 2026-05-05: FolderExplorerView, FolderTree, FilePreview in src/components/explorer/. FilesystemHandlers IPC. Shiki syntax highlighting. (#8 closed)                                                                                                  |
| ✅     | High     | IPC Contract Testing                                                                | 2026-05-05: src/ipc/contracts.ts (single source of truth), contracts.test.ts + contracts.registration.test.ts, all handlers import from shared constant (#7 closed)                                                                                         |
| ✅     | Medium   | Card/List View Toggle for all list pages                                           | 2026-05-05: ViewModeToggle + useViewMode shared; PR, Issue, RepoPR, RunList all toggling ✅                                                                                                                                                              |
| ✅     | Medium   | Add CONTRIBUTING.md                                                                | 2026-05-05: Setup guide, PR conventions, testing expectations, code quality rules (#702)                                                                                                                                                                  |
| ✅     | High     | Upgrade TypeScript 5.x → 6.0.3                                                     | 2026-05-05: PR #6 merged — TypeScript 6.0.3 + TS7 native preview (tsgo)                                                                                                                                                                                   |
| ✅     | High     | Split github.ts Monolith                                                           | 2026-05: `src/api/github.ts` (3,671 lines) split into 11 domain modules under `src/api/github/` (prs, orgs, users, repos, sfl, pr-detail, pr-threads, pr-mutations, shared, client, index)                                                                |
| ✅     | High     | Electron Main Process Test Suite                                                   | 2026-05: 42 test files covering all IPC handlers (17), services (8), workers (7), and root modules (9)                                                                                                                                                    |
| ✅     | High     | Convex Server Function Tests                                                       | 2026-05: 16 test files covering all server functions (bookmarks, jobs, runs, schedules, settings, etc.)                                                                                                                                                   |
| ✅     | High     | E2E Test Coverage Expansion                                                        | 2026-05: 6 Playwright spec files (automation, bookmarks, navigation, pr-workflow, settings, terminal) covering all critical user journeys                                                                                                                 |
| ✅     | Medium   | CI Pipeline Improvements                                                           | 2026-05: Parallel jobs (lint, typecheck, test, build), bun dependency caching implemented                                                                                                                                                                 |
| ✅     | Medium   | Bookmarks — URL & Link Collection Manager                                          | 2026-05: Full feature with BookmarkDialog, BookmarkList, BookmarksSidebar, validation, and Convex persistence                                                                                                                                             |
| ✅     | Low      | Add CODEOWNERS file                                                                | 2026-05: File ownership defined for electron/, convex/, src/components/, .github/workflows/                                                                                                                                                               |
| ✅     | High     | Ralph Loops Control Center                                                         | 2026-05-03: PR #677 merged — dashboard, launch/monitor/configure loops, PR detail integration, autopilot worktree isolation                                                                                                                               |
| ✅     | High     | Cyclomatic Complexity Rule                                                         | 2026-05-02: `complexity: ['warn', 10]` active in eslint.config.js (informational — warns, does not block CI)                                                                                                                                              |
| ✅     | High     | File Length Rule (max-lines)                                                       | 2026-05-02: `max-lines: ['warn', 500]` active via ESLINT_QUALITY (informational — not in CI gate)                                                                                                                                                         |
| ✅     | High     | Function Length Rule (max-lines-per-function)                                      | 2026-05-02: `max-lines-per-function: ['warn', 80]` active via ESLINT_QUALITY (informational — not in CI gate)                                                                                                                                             |
| ✅     | Medium   | Cognitive Complexity (eslint-plugin-sonarjs)                                       | 2026-05-02: sonarjs installed, `cognitive-complexity: ['warn', 15]` active via ESLINT_QUALITY (informational — not in CI gate)                                                                                                                            |
| ✅     | Medium   | Enforce Typed Catch Clauses                                                        | 2026-05-02: All 110+ `try-catch` blocks typed `: unknown`, ESLint `no-restricted-syntax` rule enforces annotation going forward, `no-explicit-any` promoted to error. Promise `.catch()` callbacks are out of scope (arrow fn params, not catch clauses). |
| ✅     | High     | Add Gherkin BDD specs for remaining critical paths                                 | 2026-04: data-cache (10), pr-mapper (4), pr-detail-routing (6) — 90 new tests                                                                                                                                                                             |
| ✅     | High     | Wire coverage:ratchet into CI                                                      | 2026-04-21: Added ratchet + staleness check to ci.yml after test:coverage                                                                                                                                                                                 |
| ✅     | Medium   | Add format:check to pre-commit hook                                                | 2026-04-21: Added `bun run format:check` to Phase 1 of .husky/pre-commit                                                                                                                                                                                  |
| ✅     | High     | Raise test coverage from 20% to 50%                                                | 2026-04-20: At 99.98% (4,090 tests, 198 files). Thresholds set to 100%.                                                                                                                                                                                   |
| ✅     | High     | SFL Queue Monitor workflow                                                         | 2026-04-01: Deployed to 3 repos with agent:queue label                                                                                                                                                                                                    |
| ✅     | Medium   | Quality gates overhaul                                                             | 2026-03-31: CI gates, commitlint, vitest-cucumber BDD, coverage ratchet (PR #408)                                                                                                                                                                         |
| ✅     | Medium   | Benchmarking tests for critical paths                                              | 2026-03-30: 3 bench files (dateUtils, jsonSerialization, copilotSessionParsing)                                                                                                                                                                           |
| ✅     | Medium   | Task Planner (Todoist Integration)                                                 | 2026-03-30: 7-day upcoming view, Todoist REST API, IPC handlers                                                                                                                                                                                           |
| ✅     | Medium   | Copilot Session Explorer                                                           | 2026-03-29: JSONL parsing, workspace grouping, streaming parser                                                                                                                                                                                           |
| ✅     | Medium   | Session Insights & Feedback Loop                                                   | 2026-03-29: Digest computation, Convex persistence, digest UI                                                                                                                                                                                             |
| ✅     | High     | Add GitHub organization metrics detail view                                        | 2026-03-22: Skeleton loader, per-phase error handling, roster controls                                                                                                                                                                                    |
| ✅     | Medium   | Add branch cleanup to repo-audit                                                   | 2026-03-22: Branch Hygiene scope added to repo-audit + sfl-auditor                                                                                                                                                                                        |
| ✅     | Medium   | Capture Copilot usage history                                                      | 2026-03-09: Issue #137 / PR #138; snapshots persist for trends                                                                                                                                                                                            |
| ✅     | High     | Build project-scoped Copilot workspaces                                            | 2026-03-08: Local project registration and project-scoped sessions                                                                                                                                                                                        |
| ✅     | High     | SFL Loop monitoring in Organizations tree                                          | 2026-03-08: Organizations tree shows SFL workflow health per repo                                                                                                                                                                                         |
| ✅     | High     | Unify issue processor and fixer                                                    | 2026-03-07: Retired pr-fixer; sfl-issue-processor is single implementer                                                                                                                                                                                   |
| ✅     | High     | Global Copilot Assistant Panel                                                     | 2026-03-04: PR #104 merged via SFL pipeline                                                                                                                                                                                                               |
| ✅     | High     | Simplisticate E2E Test                                                             | 2026-03-04: End-to-end SFL validation run completed                                                                                                                                                                                                       |
| ✅     | High     | Simplisticate Workflows                                                            | 2026-03-03: Event-driven triggers, human review handoff                                                                                                                                                                                                   |
| ✅     | High     | SFL Auto-Merge mode                                                                | 2026-03: Simplified to human-review handoff via A→B→C→label-actions                                                                                                                                                                                       |
| ✅     | Medium   | Copilot Usage month-end projection                                                 | 2026-03: Per-account trend projection with daily rate                                                                                                                                                                                                     |
| ✅     | High     | SFL Simplification — Replace supersession model                                    | 2026-02: pr-fixer rewritten with push-to-pull-request-branch                                                                                                                                                                                              |
| ✅     | High     | SFL Simplification — Label pruning                                                 | 2026-02: 39→27 labels, removed 12 unused                                                                                                                                                                                                                  |
| ✅     | High     | Build sfl-auditor workflow                                                         | 2026-02: Audits label consistency, repairs orphaned state                                                                                                                                                                                                 |
| ✅     | High     | SFL Simplification — Reduce PR Fixer prompt                                        | 2026-02: 365→164 lines via V2 architecture                                                                                                                                                                                                                |
| ✅     | High     | SFL Simplification — Adopt new safe-outputs                                        | 2026-02: add-comment, add-labels/remove-labels adopted                                                                                                                                                                                                    |
| ✅     | High     | SFL Complexity gate for future sessions                                            | 2026-02: Session Start Gate added to SKILL.md                                                                                                                                                                                                             |
| ✅     | High     | Critically reduce and remove AGENTS.md                                             | 2026-02: Covered in workflow prompts and governance docs                                                                                                                                                                                                  |
| ✅     | High     | Complete migration to relias-engineering                                           | 2026-02: Migrated, PAT set, pipeline verified                                                                                                                                                                                                             |
| ✅     | High     | Define Set it Free governance policy                                               | 2026-02: Moved to relias-engineering/set-it-free-loop                                                                                                                                                                                                     |
| ✅     | High     | Build feature-intake normalization workflow                                        | 2026-02: Convex mapping + template-driven issue drafts                                                                                                                                                                                                    |
| ✅     | High     | Issue Processor workflow                                                           | 2026-02: Cron claim → draft PR → agent:in-progress labeling                                                                                                                                                                                               |
| ✅     | High     | Build PR Analyzer workflow (×3 models)                                             | 2026-02: Three analyzers on staggered crons                                                                                                                                                                                                               |
| ✅     | High     | Build PR Fixer workflow (authority)                                                | 2026-02: Claude Opus; reads analyzer comments; commits fixes                                                                                                                                                                                              |
| ✅     | High     | Add pr:cycle-N label system                                                        | 2026-02: Labels pr:cycle-1/2/3; analyzers skip cycle-3                                                                                                                                                                                                    |
| ✅     | High     | Build PR Promoter workflow                                                         | 2026-02: All analyzers pass → un-draft PR + promotion comment                                                                                                                                                                                             |
| ✅     | High     | Improve Welcome to Buddy window                                                    | 2026-02: Convex-backed stats dashboard, session tracking                                                                                                                                                                                                  |
| ✅     | High     | Expand repo detail view                                                            | 2026-02: Rich card-based repo info panel with caching                                                                                                                                                                                                     |
| ✅     | High     | Make repos expandable folders                                                      | 2026-02: Expandable repos with Issues & PRs children                                                                                                                                                                                                      |
| ✅     | High     | Build task dispatch system                                                         | 2026-02: Dispatcher + exec worker + Convex claiming                                                                                                                                                                                                       |
| ✅     | High     | Implement exec-worker                                                              | 2026-02: spawn()-based shell execution, timeout, abort                                                                                                                                                                                                    |
| ✅     | High     | Restructure electron/main.ts                                                       | 2026-02: Split 423→95 lines, 8 new modules                                                                                                                                                                                                                |
| ✅     | High     | Job management UI                                                                  | 2026-02: CRUD, context menus, worker-type forms                                                                                                                                                                                                           |
| ✅     | High     | Implement Convex cron job                                                          | 2026-02: Runs every minute via crons.ts                                                                                                                                                                                                                   |
| ✅     | High     | Data prefetch + persistent cache                                                   | 2026-02: PR data survives restarts, background refresh                                                                                                                                                                                                    |
| ✅     | Medium   | Repos of Interest feature                                                          | 2026-02: Folder-organized bookmark system                                                                                                                                                                                                                 |
| ✅     | Medium   | Add run history view                                                               | 2026-02: Real-time status, filters, expandable output                                                                                                                                                                                                     |
| ✅     | Medium   | Implement skill-worker                                                             | 2026-02: Copilot CLI spawn, --allow-all mode                                                                                                                                                                                                              |
| ✅     | Medium   | Implement ai-worker                                                                | 2026-02: Copilot CLI spawn, model selection, abort                                                                                                                                                                                                        |
| ✅     | Medium   | Elegant status bar queue display                                                   | 2026-02: "X of N · TaskName" with batch tracking                                                                                                                                                                                                          |
| ✅     | Medium   | Copilot enterprise budget reset fix                                                | 2026-02: UTC dates, auto-refresh on month boundary                                                                                                                                                                                                        |
| ✅     | Low      | Implement offline queue                                                            | 2026-02: Catch-up logic on reconnect                                                                                                                                                                                                                      |
| ✅     | High     | Tabbed window system for PRs                                                       | 2025-01: Tabs above content area, no duplicates                                                                                                                                                                                                           |
| ✅     | High     | Fix Recently Merged date range                                                     | 2025-01: 30-day default, configurable in Settings                                                                                                                                                                                                         |
| ✅     | High     | App-wide task queue system                                                         | 2025-01: Named queues with concurrency control                                                                                                                                                                                                            |
| ✅     | High     | Settings UI with form-based editing                                                | 2025-01: SidebarPanel navigation, auto-save                                                                                                                                                                                                               |
| ✅     | High     | Initialize Convex project                                                          | 2025-02: Generated types ready                                                                                                                                                                                                                            |
| ✅     | High     | Define Convex schema                                                               | 2025-01: convex/schema.ts with jobs, schedules, runs                                                                                                                                                                                                      |
| ✅     | High     | Add Convex client to Electron                                                      | 2025-01: ConvexClientProvider, useConvex hooks                                                                                                                                                                                                            |
| ✅     | High     | Implement schedule CRUD functions                                                  | 2025-01: convex/schedules.ts, jobs.ts, runs.ts                                                                                                                                                                                                            |
| ✅     | Medium   | Create schedule editor dialog                                                      | 2025-02: Modal with CronBuilder, job selector                                                                                                                                                                                                             |
| ✅     | Medium   | Add Workflows activity bar icon                                                    | 2025-01: RefreshCw icon in ActivityBar                                                                                                                                                                                                                    |
| ✅     | Medium   | Build Schedules sidebar + list                                                     | 2025-01: ScheduleList component with status badges                                                                                                                                                                                                        |
| ✅     | Medium   | Port CronBuilder component                                                         | 2025-01: From hs-conductor with visual builder                                                                                                                                                                                                            |
| ✅     | Medium   | Implement schedule toggles                                                         | 2025-02: Toggle mutation in useConvex hooks                                                                                                                                                                                                               |
| ✅     | Medium   | Fix taskbar app name                                                               | 2025-01: "HS-body" → "Buddy"                                                                                                                                                                                                                              |
| ✅     | Medium   | Create Help menu with About window                                                 | 2025-01: About dialog with branding                                                                                                                                                                                                                       |
| ✅     | Medium   | Design and create app icon                                                         | 2025-01: Gold/orange gradient Users icon                                                                                                                                                                                                                  |

## Progress

**Remaining: 7** | **Completed: 88** (93%)

---

## Remaining Items

### Code Quality & Architecture Enforcement

Remaining work: `electronegativity` + expand axe-core coverage. Other items are complete.

**Already done:**

- ✅ `dependency-cruiser` — installed, configured, `deps:check` script
- ✅ `eslint-plugin-unicorn` — installed and active
- ✅ TypeScript `strict` preset rules — key rules promoted as warnings
- ✅ `vitest-axe` + `axe-helper.ts` — 4 component tests have a11y checks (AboutModal, ActivityBar, ConfirmDialog, StatusBar)

#### Remaining: Electronegativity

1. `bun add -d electronegativity`
2. Run initial audit: `npx electronegativity -i electron/ -r`
3. Triage findings, add as informational CI step

#### Remaining: Expand axe-core Coverage

1. Add `axe()` + `toHaveNoViolations()` to more component test suites
2. Prioritize heavy UI components: PullRequestList, RepoIssueList, SettingsPanel, TerminalPane
3. Add `test:a11y` script to package.json

### Performance Testing Suite

Remaining work: Lighthouse CI only. Other items are complete.

**Already done:**

- ✅ Benchmark CI gating — `benchmarks.yml` workflow with `bench-compare.ts` comparator
- ✅ React render profiling — `react-scan` (React 19 compatible replacement for WDYR) in dev mode
- ✅ Startup timing, memory monitoring, IPC throughput benchmarks in `perf/`
- ✅ `vitest-axe` installed with `axe-helper.ts` util and 4 component test suites covering a11y

#### Remaining: Lighthouse CI

1. Add `@lhci/cli` as dev dependency
2. Create `lighthouse.config.ts` for Electron renderer URL
3. Add LH CI step to CI workflow (informational initially)

---

### Reduce CRAP scores

**Current state** (2026-05-07 perfection audit):

- 331 functions with cyclomatic complexity > 5
- Notable: `appendOptionalArgs` (10), `validateTimingConfig` (9), `comparePrompts` (8), `resolveScriptPath` (8), `launchLoop` (8)

**Approach**: Prioritize functions with both high complexity AND low coverage (highest CRAP). Refactor by extracting helper functions, using early returns, and simplifying conditionals. Add tests to increase coverage for complex paths.

---

### Improve React Doctor score

**Current state** (2026-05-07 perfection audit):

- Score: 82/100 (138 warnings, 47 files)
- Top findings: Date.now() in JSX (64), .filter().map() chains (13), useState never read (7), multiple setState in useEffect (5), sequential awaits (4)

**Approach**: Fix by category — largest impact first:

1. Date.now() in JSX → wrap in useEffect+useState
2. .filter().map() → single .reduce() or for...of
3. Unused useState → convert to useRef
4. Multiple setState → useReducer

---

### Fix Prettier formatting violations

10 files failing `prettier --check` (mostly new test files from PR #14). Auto-fix: `bun run format`. Verify no unintended changes before committing.

---

### Fix Markdown lint errors

5 errors across 4 files:

- MD040 (fenced code blocks need language): debug/SKILL.md, CONTRIBUTING.md ×2
- MD032 (blank lines around lists): perfection/SKILL.md
- MD047 (trailing newline): todo/History/2026-05-05.md

Auto-fix: `bun run lint:md:fix`, then manually add language specifiers to fenced code blocks.
