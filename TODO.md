# Buddy - TODO

| Status | Priority | Task                                                                               | Notes                                                                                                                                                                                                                                                     |
| ------ | -------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 📋     | Medium   | [Refresh CRAP baseline and reduce quality-warning debt](#refresh-crap-baseline-and-reduce-quality-warning-debt) | #87 — Current CRAP log has no critical/high methods, but `bun run lint:quality` reports 1,567 warnings |
| 📋     | Medium   | [Improve React Doctor score](#improve-react-doctor-score)                          | #88 — Current React Doctor score is 63/100 with 154 issues |
| ✅     | Medium   | Stabilize Lighthouse CI                                                            | 2026-06-08: Fixed local LHCI readiness/cleanup and documented the baseline in `docs/lighthouse-baseline.md` (#89) |
| 📋     | Medium   | [Harden or replace Electron webviewTag usage](#harden-or-replace-electron-webviewtag-usage) | #90 — `security:electron` has 0 high/medium findings, but `webviewTag: true` remains an info risk |
| 📋     | Medium   | [Expand axe accessibility coverage](#expand-axe-accessibility-coverage)            | #91 — Tooling exists; add coverage for terminal, settings, Tempo, dashboard, and sidebar surfaces |
| 📋     | Low      | [Fix remaining markdownlint MD040 failure](#fix-remaining-markdownlint-md040-failure) | #92 — One remaining MD040 in `.sfl/governance/policy.md` |
| 📋     | Medium   | [Triage current Dependabot dependency queue](#triage-current-dependabot-dependency-queue) | #93 — Current hs-buddy PRs #158-#160; e18e duplication impact to recheck after merges |
| ⏸️     | High     | [Review stale HemSoft/TCE-Admin Dependabot PR #2](#review-stale-hemsofttce-admin-dependabot-pr-2) | Risk item — 2022 Newtonsoft.Json major update; local checkout absent |
| ✅     | Low      | Fix Prettier formatting violations                                                | 2026-06-07: `bun run format:check` passes; stale TODO removed |
| ✅     | Low      | Fix e18e pkg.main packaging config                                                | 2026-06-07: `package.json` `files` includes `dist-electron/main.js`; stale TODO removed |
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

**Remaining: 7** | **Completed: 91** (93%)

---

## Remaining Items

### Refresh CRAP baseline and reduce quality-warning debt

**Issue:** #87

**Current state** (2026-06-07 audit):

- `docs/crap-score-log.md` has a 2026-05-23 Electron snapshot: 0 critical, 0 high, 7 moderate, highest CRAP 10.5.
- `bun run lint:quality` currently reports 1,567 warnings.
- The old TODO text claiming 331 complex functions is stale and should be replaced by a refreshed CRAP snapshot.

**Approach:** Refresh the CRAP baseline, then reduce the highest-value production-code complexity and quality-warning tranche before sweeping test-only warnings.

---

### Improve React Doctor score

**Issue:** #88

**Current state** (2026-06-07 audit):

- Score: 63/100
- 154 total issues
- 78 bugs, 33 performance warnings, 2 accessibility warnings, 41 maintainability warnings

**Approach:** Fix high-count categories first: derived state/effect logic, parent synchronization effects, changing-callback re-subscriptions, sequential awaits, array index keys, and non-interactive handlers.

---

### Harden or replace Electron webviewTag usage

**Issue:** #90

**Current state** (2026-06-07 audit):

- `bun run security:electron` reports 0 high and 0 medium findings.
- It still flags `webviewTag: true` in `electron/main.ts` as an informational security risk.

**Approach:** Confirm whether the in-app browser still requires webviews. If yes, document and test the guardrails; if not, replace it with a safer alternative.

---

### Expand axe accessibility coverage

**Issue:** #91

**Current state** (2026-06-07 audit):

- `vitest-axe`, `src/test/axe-helper.ts`, and `test:a11y` already exist.
- Axe coverage already includes AboutModal, ActivityBar, ConfirmDialog, ContributionGraph, InlineDropdown, PullRequestList, RateLimitGauge, RepoIssueList, and StatusBar.

**Approach:** Add explicit a11y coverage for remaining high-traffic surfaces: TerminalPane/workspace, settings panels, Tempo views, dashboard cards, and interactive sidebar panels.

---

### Fix remaining markdownlint MD040 failure

**Issue:** #92

**Current state** (2026-06-07 audit):

- `bun run lint:md` reports one remaining error.
- `.sfl/governance/policy.md:66` needs a fenced code block language.

**Approach:** Add the correct fence language, or `text` for plain output/config prose, then rerun `bun run lint:md`.

---

### Triage current Dependabot dependency queue

**Issue:** #93

**Current state** (2026-06-12 audit):

- Open hs-buddy Dependabot PRs: #158, #159, #160.
- #156 was squash-merged on 2026-06-12 after full CI green; it touched generated `.lock.yml` workflow files only.
- #157 and #161 were squash-merged on 2026-06-12 after local OpenTelemetry validation; #157 also reran full remote CI after branch conflict resolution.
- #158, #159, and #160 currently show only lightweight Dependabot checks in the PR rollup.
- `bun run e18e` reports 137 duplicate dependency warnings.

**Approach:** Land low-risk fully green PRs first, locally verify the remaining dependency updates before merging, then rerun e18e and record whether dependency duplication improves.

---

### Review stale HemSoft/TCE-Admin Dependabot PR #2

**Issue:** HemSoft/TCE-Admin#2

**Current state** (2026-06-12 audit):

- Open Dependabot PR last updated in 2022.
- Updates Newtonsoft.Json from 12.0.2 to 13.0.2.
- Local checkout is absent at `D:\github\HemSoft\TCE-Admin`.

**Approach:** Clone or inspect the repository separately, verify framework compatibility and tests, then merge only if the stale branch is still valid.

---
