# Buddy - TODO

| Status | Priority | Task | Notes |
|--------|----------|------|-------|
| 📋 | **🔴 High** | [Ralph Loops Control Center](#ralph-loops-control-center) | Full integration of the ralph-loops ecosystem — orchestrate, launch, monitor, and configure autonomous AI work loops from Buddy |
| 📋 | High | [Terminal Folder View & File Preview](#terminal-folder-view--file-preview) | Built-in file explorer synced to terminal CWD with code preview pane |
| 📋 | High | [Electron Main Process Test Suite](#electron-main-process-test-suite) | **0 test files across 38 source files** — IPC handlers, services, workers, root modules all untested |
| 📋 | High | [IPC Contract Testing](#ipc-contract-testing) | 16 IPC handler files are the renderer↔main bridge with zero contract validation |
| 📋 | High | [Convex Server Function Tests](#convex-server-function-tests) | **0 tests across 16 server functions** — bookmarks, jobs, runs, schedules, settings, etc. |
| 📋 | High | [Performance Testing Suite](#performance-testing-suite) | Electron startup time, memory leak detection, IPC throughput, React render profiling, benchmark CI gating |
| 📋 | High | [Cyclomatic Complexity Gate](#cyclomatic-complexity-gate) | Enable ESLint built-in `complexity` rule (threshold 10) to flag overly complex functions at lint time |
| 📋 | High | [Code Quality Tooling Roadmap](#code-quality-tooling-roadmap) | ESLint plugins (sonarjs, unicorn, strict), Electron security, architecture enforcement, E2E testing |
| 📋 | High | [E2E Test Coverage Expansion](#e2e-test-coverage-expansion) | Only 1 spec file (2 tests) for bookmarks — PR views, settings, automation, terminal all untested end-to-end |
| 📋 | High | [Split github.ts Monolith](#split-githubts-monolith) | 3,671 lines / 105 KB — split by domain (prs, orgs, users, copilot) with barrel re-export |
| 📋 | High | [File Length Gate (max-lines)](#file-length-gate-max-lines) | Add ESLint `max-lines` rule (warn at 500). **12 source files** over threshold today — largest is github.ts at 3,671 |
| 📋 | High | [Function Length Gate (max-lines-per-function)](#function-length-gate-max-lines-per-function) | Add ESLint `max-lines-per-function` rule (warn at 80). Catches long sequential plumbing that passes complexity checks |
| 📋 | Medium | [Cognitive Complexity (eslint-plugin-sonarjs)](#cognitive-complexity-sonarjs) | Install `eslint-plugin-sonarjs` — `cognitive-complexity` measures nesting depth + control flow weight, catches code that cyclomatic complexity misses |
| 📋 | Medium | [Dependency Coupling Analysis](#dependency-coupling-analysis) | Add `dependency-cruiser` or `madge` to detect God-files (high afferent coupling) and circular dependencies |
| 📋 | Medium | [Enforce Typed Catch Clauses](#enforce-typed-catch-clauses) | 21 untyped `catch (error)` vs 2 typed — add `use-unknown-in-catch-variables` ESLint rule, promote `no-explicit-any` to error |
| 📋 | Medium | [Bookmarks — URL & Link Collection Manager](#bookmarks) | New feature: categorized link management with quick-launch and tagging |
| 📋 | Medium | [Card/List View Toggle for all list pages](#cardlist-view-toggle) | Add table/grid view as alternative to card view on list pages |
| 📋 | Medium | [Parallelize CI Pipeline](#parallelize-ci-pipeline) | CI runs ~8m serial; split into parallel jobs + cache deps + move benchmarks to save ~3-4m wall time |
| 📋 | Medium | [Harden CI Soft-Fail Steps](#harden-ci-soft-fail-steps) | e18e and npm-audit both `continue-on-error: true` — make e18e blocking, add audit severity threshold |
| 📋 | Medium | Add Convex typecheck to CI | Run `npx convex typecheck` in CI to catch schema/function type errors |
| 📋 | Medium | [Electron Worker Tests](#electron-worker-tests) | dispatcher, execWorker, offlineSync, skillWorker, aiWorker — untested execution infrastructure |
| 📋 | Medium | Add runtime a11y testing with axe-core | vitest-axe catches runtime ARIA violations that jsx-a11y ESLint misses |
| 📋 | Medium | Add CONTRIBUTING.md | Contributor setup (Bun, Convex, env vars), PR conventions, testing expectations |
| 📋 | Low | Evaluate Playwright component testing for TSX coverage | Many 0% component files are hard to unit-test |
| 📋 | Low | Add CODEOWNERS file | Define file ownership for electron/, convex/, src/components/, .github/workflows/ |
| 📋 | Low | Evaluate visual regression testing | Playwright screenshots or Percy/Chromatic for catching unintended UI changes |
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

**Remaining: 26** | **Completed: 68** (72%)

---

## Remaining Items

### Ralph Loops Control Center

Integrate the entire **ralph-loops** ecosystem from [`ai-tools`](https://github.com/Relias-Engineering/ai-tools) into Buddy as a first-class activity bar section. Ralph Loops are autonomous PowerShell scripts that run GitHub Copilot CLI (or OpenCode) in iterative loops to accomplish development work — improving test coverage, reducing CRAP scores, fixing code quality, resolving PR comments — all without human intervention.

Today, these loops are launched from the terminal with complex parameter combinations:

```powershell
ralph -Prompt "..." -Branch feature/x -Model opus46 -Agents anvil,pr-review-quality@opus47 -WorkUntil 08:00 -Autopilot
```

The goal is to bring all of this into Buddy with a visual dashboard for launching, monitoring, and configuring loops across multiple repositories simultaneously.

#### Source Ecosystem (ai-tools/ralph-loops)

| Component | Purpose |
|-----------|---------|
| `ralph.ps1` | Iterative autopilot — runs Copilot CLI in a loop with git worktrees for branch isolation |
| `ralph-pr.ps1` | PR comment resolver — monitors PRs for CI failures and review comments, fixes them automatically |
| `ralph-run-all.ps1` | Sequential orchestrator — chains multiple template scripts with autopilot mode |
| `config/models.json` | Model catalog with aliases, tiers (fast/medium/best), cost multipliers, reasoning effort |
| `config/agents.json` | Agent roles (dev + review categories) with provider-specific mappings and tier defaults |
| `config/providers.json` | CLI provider configuration (Copilot, OpenCode) with flag mappings and model templates |
| `lib/config.ps1` | Shared config resolution library — model/agent/provider parsing, validation, command building |
| Template scripts | Pre-built loops: improve-test-coverage, improve-quality, improve-scorecard, improve-crap-score, improve-react-doctor, simplisticate |

#### Infrastructure Reuse

hs-buddy already has the foundational infrastructure needed — this feature is about composing existing patterns:

| Ralph Loops Need | Existing hs-buddy Infrastructure |
|---|---|
| Spawn & manage PowerShell processes | `terminalHandlers.ts` — `node-pty` PTY sessions with real-time stdout streaming, CWD tracking, attach/detach |
| Execute shell commands async | `execWorker.ts` — `spawn()` with timeout, abort signal, stdout/stderr capture (512KB buffer) |
| Job scheduling & dispatch | `dispatcher.ts` — polls Convex for pending jobs, claims them, routes to typed workers |
| Cron-based scheduling | Automation section — CronBuilder UI, schedules table, run history, offline catch-up |
| Persist run history & state | Convex backend with `jobs` + `runs` + `schedules` tables and real-time subscriptions |
| GitHub PR/CI status | `githubHandlers.ts` — Octokit REST + GraphQL, multi-account auth via `gh` CLI |
| Real-time UI updates | Convex real-time subscriptions + IPC `webContents.send()` event streaming |
| Cross-platform builds | `electron-builder.json5` — NSIS (Windows), DMG (macOS arm64+x64), AppImage (Linux) |
| Observability | OpenTelemetry SDK — OTLP traces, metrics, structured logs |

#### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Renderer (React)                                       │
│  src/components/ralph-loops/                            │
│    RalphDashboard.tsx      — Active/recent loop overview│
│    RalphLaunchForm.tsx     — Visual parameter builder   │
│    RalphLoopCard.tsx       — Per-loop status card       │
│    RalphLogViewer.tsx      — Real-time structured log   │
│    RalphConfigEditor.tsx   — Visual JSON config editor  │
│    RalphMetrics.tsx        — Coverage/CRAP/scorecard    │
│    RalphRepoSelector.tsx   — Multi-repo picker          │
├─────────────────────────────────────────────────────────┤
│  IPC Bridge (preload.ts)                                │
│    window.ralph.launch()   — Start a new loop           │
│    window.ralph.stop()     — Abort a running loop       │
│    window.ralph.list()     — Get active/recent loops    │
│    window.ralph.getConfig()— Read ralph config JSONs    │
│    window.ralph.getLog()   — Retrieve log content       │
├─────────────────────────────────────────────────────────┤
│  Electron Main Process                                  │
│  electron/ipc/ralphHandlers.ts   — IPC handler module   │
│  electron/services/ralphService.ts                      │
│    ├── Reads models/agents/providers JSON configs        │
│    ├── Spawns ralph.ps1 / ralph-pr.ps1 via node-pty     │
│    ├── Parses structured output (iterations, phases)     │
│    ├── Pushes state updates to renderer via IPC events   │
│    └── Stores run history in Convex                      │
│  electron/workers/ralphWorker.ts — Dispatcher-compatible │
├─────────────────────────────────────────────────────────┤
│  Convex Backend                                         │
│    ralphRuns table    — Run history with status/metrics  │
│    ralphConfigs table — Cached config snapshots          │
│    ralphMetrics table — Coverage/CRAP trends over time   │
└─────────────────────────────────────────────────────────┘
```

#### Activity Bar Entry

New section in the activity bar (icon: `RefreshCcw` or `Zap` from lucide-react):

| Sidebar Node | Content |
|---|---|
| **Active Loops** | Live status cards for all running loops across repos |
| **Launch** | Visual form to configure and start a new loop |
| **History** | Past runs with duration, iterations, outcome, branch, PR link |
| **Configuration** | Visual editors for models.json, agents.json, providers.json |
| **Metrics** | Coverage/CRAP/scorecard trend charts per repo over time |

#### Launch Form — Replacing CLI Complexity

The launch form replaces the 20+ parameter CLI surface with an intuitive UI:

| Form Section | Controls | Data Source |
|---|---|---|
| **Repository** | Dropdown of registered repos (with local clone path detection) | `electron-store` config + `terminal:resolve-repo-path` |
| **Prompt** | Textarea or file picker (supports `.md` files) | Free text or filesystem |
| **Branch** | Text input with auto-generation preview | Git branch naming |
| **Script** | Dropdown: Custom, Improve Coverage, Improve Quality, Improve Scorecard, Improve CRAP Score, Improve React Doctor, Simplisticate, Run All | Template scripts from `ralph-loops/scripts/` |
| **Model** | Dropdown with labels + cost multipliers: `Sonnet 4.6 (1×)`, `Opus 4.6 (3×)`, `Opus 4.7 (7.5×)`, `GPT-5.4 (1×)` | `models.json` — aliases, tiers, cost info |
| **Provider** | Radio: Copilot / OpenCode | `providers.json` |
| **Dev Agent** | Dropdown: anvil, developer-principal, developer-senior, simplisticate, csharp-quality-expert | `agents.json` (category: dev) with descriptions |
| **Review Agents** | Multi-select checkboxes with optional per-agent model override | `agents.json` (category: review) — pr-review-general, pr-review-security, pr-review-quality, pr-review-crap-score, pr-review-scorecard-score, auditor-* |
| **Max Iterations** | Number input (default 10) | — |
| **Work Until** | Time picker (HH:mm) | — |
| **Flags** | Toggle switches: Autopilot, No PR, Skip Review, Cleanup Worktree, No Audio | — |

All dropdowns are populated dynamically by reading the config JSONs from the ai-tools repo path (configurable in Settings).

#### Dashboard — Real-Time Monitoring

The dashboard shows all active and recent loops in a card layout:

```
┌─────────────────────────────────────────────────────────────┐
│  🔄 Ralph Loops                                    ⚙️  ▶️  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────┐ ┌────────────────────────┐ │
│  │ 🟢 my-service               │ │ 🟡 auth-service        │ │
│  │ feature/increase-coverage   │ │ feature/simplisticate  │ │
│  │ ████████░░ 8/10 iterations  │ │ ██████░░░░ 6/10        │ │
│  │ Opus 4.6 · anvil            │ │ Sonnet 4.6 · simplist. │ │
│  │ ✅ CI passing · ⏱ 2h 14m    │ │ ⏳ CI running · ⏱ 1h03 │ │
│  │ Phase: PR Resolution        │ │ Phase: Work Loop       │ │
│  │ [Log] [PR #147] [Stop]      │ │ [Log] [Stop]           │ │
│  └─────────────────────────────┘ └────────────────────────┘ │
│                                                             │
│  ┌─────────────────────────────┐ ┌────────────────────────┐ │
│  │ ✅ portal-app (completed)    │ │ ⏸ api-gateway (idle)   │ │
│  │ feature/improve-scorecard   │ │ Waiting for next run   │ │
│  │ ██████████ 10/10            │ │                        │ │
│  │ PR #89 merged · 4h 32m      │ │ [Launch]               │ │
│  └─────────────────────────────┘ └────────────────────────┘ │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  📋 Log Stream  │ 📊 Metrics  │ ⚙️ Config                  │
│  [14:32:01] ✅ Iteration 8 complete — 3 files changed       │
│  [14:32:05] 📤 Pushing to origin...                         │
│  [14:32:12] 🔀 Creating PR #147...                          │
│  [14:32:30] 🔍 Requesting review: pr-review-quality         │
│  [14:33:15] 💬 2 review comments received                   │
│  [14:33:20] 🔧 Copilot CLI fixing review comments...        │
└─────────────────────────────────────────────────────────────┘
```

Each card shows:
- **Repo name** with status indicator (🟢 running, 🟡 CI pending, ✅ complete, 🔴 failed)
- **Branch name** and script type
- **Progress bar** — iteration X of Y
- **Model + Agent** labels with cost tier
- **Phase** — Work Loop, PR Creation, PR Resolution, CI Wait, Review Wait, Complete
- **Elapsed time** — running clock
- **Quick actions** — View log, Open PR (links to GitHub), Stop loop

#### Log Viewer

Two rendering modes:

1. **Structured View** (default) — Parses ralph.ps1 output into structured entries with icons, timestamps, iteration markers, and phase badges. Collapsible iteration groups.
2. **Raw Terminal** — Full PTY output via xterm.js (reuses existing terminal infrastructure). Useful for debugging.

Log parsing targets these ralph.ps1 output patterns:
- `=== ITERATION N ===` — iteration boundaries
- `✅` / `❌` — success/failure markers
- `Pushing to origin` — phase transitions
- `Creating PR` / `PR #NNN` — PR lifecycle events
- `CI check` / `CI passed` / `CI failed` — CI status
- `Copilot review` / `review comments` — review lifecycle

#### Configuration Editor

Visual editor for the three config files, with validation:

- **Models**: Card per model showing label, cost multiplier, provider, reasoning effort. Add/edit/remove aliases. Tier assignment.
- **Agents**: Card per agent showing role name, category (dev/review), description, tier, provider mappings. Skills list.
- **Providers**: Card per provider showing command, flags, model template, capabilities.

Changes are written back to the JSON files in the ai-tools repo path. Validation runs the same checks as `lib/config.ps1` (alias targets exist, tier models exist, no namespace collisions, agent provider mappings complete).

#### Convex Schema Extensions

```typescript
// convex/schema.ts additions

ralphRuns: defineTable({
  repoPath: v.string(),           // Local clone path
  repoName: v.string(),           // e.g., "my-service"
  repoSlug: v.optional(v.string()), // e.g., "Relias/my-service"
  scriptType: v.string(),         // "custom" | "improve-coverage" | "improve-quality" | etc.
  branch: v.string(),             // Target branch name
  prompt: v.optional(v.string()), // Prompt text or file path
  model: v.string(),              // Model alias used (e.g., "opus46")
  modelId: v.string(),            // Resolved model ID (e.g., "claude-opus-4.6")
  provider: v.string(),           // "copilot" | "opencode"
  devAgent: v.string(),           // Dev agent role (e.g., "anvil")
  reviewAgents: v.array(v.string()), // Review agent specs
  maxIterations: v.number(),
  workUntil: v.optional(v.string()),
  flags: v.object({               // Boolean flags
    autopilot: v.boolean(),
    noPR: v.boolean(),
    skipReview: v.boolean(),
    cleanupWorktree: v.boolean(),
    noAudio: v.boolean(),
  }),
  status: v.string(),             // "running" | "completed" | "failed" | "stopped" | "pr-resolution"
  phase: v.string(),              // "work-loop" | "pr-creation" | "pr-resolution" | "ci-wait" | "review-wait" | "complete"
  currentIteration: v.number(),
  prNumber: v.optional(v.number()),
  prUrl: v.optional(v.string()),
  startedAt: v.number(),          // Epoch ms
  completedAt: v.optional(v.number()),
  duration: v.optional(v.number()), // Total ms
  exitCode: v.optional(v.number()),
  error: v.optional(v.string()),
  costMultiplier: v.number(),     // From model config
  logPath: v.optional(v.string()), // Path to ralph.log / ralph-pr.log
})
  .index("by_status", ["status"])
  .index("by_repo", ["repoName", "startedAt"]),

ralphConfigs: defineTable({
  configType: v.string(),         // "models" | "agents" | "providers"
  content: v.string(),            // JSON string
  sourcePath: v.string(),         // Filesystem path
  version: v.string(),            // SemVer from the JSON
  cachedAt: v.number(),
})
  .index("by_type", ["configType"]),

ralphMetrics: defineTable({
  repoName: v.string(),
  branch: v.string(),
  runId: v.id("ralphRuns"),
  metricType: v.string(),         // "coverage" | "crap-score" | "scorecard" | "react-doctor"
  before: v.optional(v.number()), // Score before the run
  after: v.optional(v.number()),  // Score after the run
  delta: v.optional(v.number()),
  recordedAt: v.number(),
})
  .index("by_repo_metric", ["repoName", "metricType", "recordedAt"]),
```

#### Preload Bridge API

```typescript
// electron/preload.ts additions

contextBridge.exposeInMainWorld('ralph', {
  // Loop lifecycle
  launch: (config: RalphLaunchConfig) => ipcRenderer.invoke('ralph:launch', config),
  stop: (runId: string) => ipcRenderer.invoke('ralph:stop', runId),
  list: () => ipcRenderer.invoke('ralph:list'),
  getStatus: (runId: string) => ipcRenderer.invoke('ralph:get-status', runId),

  // Configuration
  getConfig: (configType: 'models' | 'agents' | 'providers') =>
    ipcRenderer.invoke('ralph:get-config', configType),
  saveConfig: (configType: string, content: string) =>
    ipcRenderer.invoke('ralph:save-config', configType, content),
  validateConfig: () => ipcRenderer.invoke('ralph:validate-config'),
  getAiToolsPath: () => ipcRenderer.invoke('ralph:get-ai-tools-path'),
  setAiToolsPath: (path: string) => ipcRenderer.invoke('ralph:set-ai-tools-path', path),

  // Logs
  getLog: (runId: string) => ipcRenderer.invoke('ralph:get-log', runId),
  attachLog: (runId: string) => ipcRenderer.invoke('ralph:attach-log', runId),

  // Repo discovery
  listRepos: () => ipcRenderer.invoke('ralph:list-repos'),
  getInstalledScripts: (repoPath: string) =>
    ipcRenderer.invoke('ralph:get-installed-scripts', repoPath),
  installScripts: (repoPath: string, scripts: string[]) =>
    ipcRenderer.invoke('ralph:install-scripts', repoPath, scripts),

  // Real-time events (renderer listens)
  // 'ralph:iteration-complete' — { runId, iteration, total }
  // 'ralph:phase-change'       — { runId, phase, details }
  // 'ralph:log-data'           — { runId, data, seq }
  // 'ralph:run-complete'       — { runId, status, exitCode }
})
```

#### Settings Integration

New settings section under Settings → Ralph Loops:

| Setting | Type | Default | Description |
|---|---|---|---|
| `ralph.aiToolsPath` | Directory picker | Auto-detect | Path to the `ai-tools` repo (contains ralph-loops/) |
| `ralph.defaultModel` | Dropdown | `opus46` | Default model for new loops |
| `ralph.defaultProvider` | Radio | `copilot` | Default CLI provider |
| `ralph.defaultDevAgent` | Dropdown | `anvil` | Default dev agent |
| `ralph.maxConcurrentLoops` | Number | `3` | Maximum simultaneously running loops |
| `ralph.logRetentionDays` | Number | `30` | Days to keep log files |
| `ralph.autoInstallScripts` | Toggle | `false` | Auto-install template scripts when registering a repo |

#### Implementation Phases

##### Phase 1: Foundation (Backend)

1. Create `electron/services/ralphService.ts` — config reading, process spawning, state tracking
2. Create `electron/ipc/ralphHandlers.ts` — IPC handler module following existing pattern
3. Create `electron/workers/ralphWorker.ts` — dispatcher-compatible worker for scheduled loops
4. Add `ralph` to the preload bridge in `electron/preload.ts`
5. Register handlers in `electron/ipc/index.ts`
6. Add Convex schema extensions (`ralphRuns`, `ralphConfigs`, `ralphMetrics`)
7. Add Convex mutations/queries for run lifecycle

##### Phase 2: Dashboard & Launch UI

1. Create `src/components/ralph-loops/` component directory
2. Build `RalphDashboard.tsx` — card grid of active/recent loops
3. Build `RalphLaunchForm.tsx` — visual parameter builder with config-driven dropdowns
4. Build `RalphLoopCard.tsx` — status card with progress bar, phase badge, quick actions
5. Add activity bar entry (icon + sidebar tree nodes)
6. Wire up real-time status updates via IPC events

##### Phase 3: Log Viewer

1. Build `RalphLogViewer.tsx` with dual mode (structured + raw terminal)
2. Implement log parser for ralph.ps1 output patterns (iterations, phases, CI status)
3. Wire xterm.js for raw PTY output (reuse terminal infrastructure)
4. Add log filtering/search and auto-scroll with "pin to bottom" toggle

##### Phase 4: Config Editor

1. Build `RalphConfigEditor.tsx` — tabbed editor for models/agents/providers
2. Implement validation matching `lib/config.ps1` logic (alias targets, tier models, namespace collisions, provider mappings)
3. Add save-back to filesystem with SemVer bump
4. Add "Reset to defaults" option

##### Phase 5: Metrics & History

1. Build `RalphMetrics.tsx` — trend charts for coverage/CRAP/scorecard per repo
2. Build `RalphHistory.tsx` — filterable table of past runs with duration, outcome, PR links
3. Parse `TEST-METRICS.md` files from repos to extract before/after data
4. Store metrics in `ralphMetrics` Convex table for historical trending

##### Phase 6: Repo Management & Script Installation

1. Build `RalphRepoSelector.tsx` — register repos, detect local clones
2. Implement `ralph:install-scripts` IPC — mirrors `ralph -Install` functionality
3. Show which template scripts are installed per repo
4. Add "Install All" / "Pick" modes matching the CLI behavior

##### Phase 7: Automation Integration

1. Add `ralph` as a new worker type in the existing dispatcher
2. Allow scheduling ralph loops via the existing Automation → Schedules UI
3. Support "Run All" orchestration as a scheduled job (nightly autonomous runs)
4. Add notification support (system tray notifications for loop completion)

#### New Files

| File | Purpose |
|------|---------|
| `electron/services/ralphService.ts` | Process manager: spawn, track, stream, persist |
| `electron/ipc/ralphHandlers.ts` | IPC handler module (follows configHandlers pattern) |
| `electron/workers/ralphWorker.ts` | Dispatcher-compatible worker for scheduled loops |
| `src/components/ralph-loops/RalphDashboard.tsx` | Main dashboard — card grid of loops |
| `src/components/ralph-loops/RalphDashboard.css` | Dashboard styles |
| `src/components/ralph-loops/RalphLaunchForm.tsx` | Visual launch configuration form |
| `src/components/ralph-loops/RalphLaunchForm.css` | Launch form styles |
| `src/components/ralph-loops/RalphLoopCard.tsx` | Per-loop status card |
| `src/components/ralph-loops/RalphLoopCard.css` | Card styles |
| `src/components/ralph-loops/RalphLogViewer.tsx` | Dual-mode log viewer (structured + raw) |
| `src/components/ralph-loops/RalphLogViewer.css` | Log viewer styles |
| `src/components/ralph-loops/RalphConfigEditor.tsx` | Visual config JSON editor |
| `src/components/ralph-loops/RalphConfigEditor.css` | Config editor styles |
| `src/components/ralph-loops/RalphMetrics.tsx` | Coverage/CRAP/scorecard trend charts |
| `src/components/ralph-loops/RalphMetrics.css` | Metrics styles |
| `src/components/ralph-loops/RalphRepoSelector.tsx` | Repo picker + script installer |
| `src/components/ralph-loops/RalphHistory.tsx` | Past run table with filters |
| `src/components/ralph-loops/index.ts` | Barrel export |
| `src/components/sidebar/ralph-sidebar/` | Sidebar tree nodes for Ralph Loops section |
| `src/hooks/useRalphLoops.ts` | React hook for loop state management |
| `src/hooks/useRalphConfig.ts` | React hook for config reading/writing |
| `src/types/ralph.ts` | TypeScript types for Ralph Loops domain |
| `src/utils/ralphLogParser.ts` | Parse ralph.ps1 structured output |
| `src/utils/ralphLogParser.test.ts` | Log parser tests |
| `convex/ralphRuns.ts` | Convex CRUD for run history |
| `convex/ralphConfigs.ts` | Convex CRUD for config snapshots |
| `convex/ralphMetrics.ts` | Convex CRUD for metrics trends |

#### Risk Assessment

- 🟡 **Long-running processes** — Ralph loops can run for hours. Need robust process lifecycle management (survive app restarts? reconnect to existing PTY sessions?)
- 🟡 **Log volume** — Hours of Copilot CLI output can be large. Cap in-memory buffers (reuse `MAX_SCROLLBACK_BUFFER` pattern from terminalHandlers), persist to disk.
- 🟡 **Config sync** — If someone edits config JSONs from the CLI while Buddy is running, need file-watcher or refresh-on-focus to stay in sync.
- 🟢 **Process spawning** — `node-pty` + PowerShell already battle-tested in the terminal feature.
- 🟢 **Infrastructure reuse** — Dispatcher, workers, Convex schema, IPC patterns all proven at scale.
- 🟢 **Cross-platform** — PowerShell Core (`pwsh`) runs on macOS/Linux. All ralph-loops dependencies (git, gh, copilot CLI) are cross-platform.

#### Dependencies

- No new npm packages required — all infrastructure exists (`node-pty`, `xterm`, `convex`, `lucide-react`, `allotment`)
- Optional: charting library for metrics trends (e.g., `recharts` or lightweight `<canvas>` SVG approach)
- ai-tools repo must be cloned locally (path configured in Settings)

---

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

#### Risk Assessment

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

### File Length Gate (max-lines)

The codebase has **12 non-test source files over 500 lines** — a maintainability risk that existing per-function metrics (cyclomatic complexity, CRAP) don't catch. CRAP and complexity are per-function; a file can have 86 low-complexity functions and still be a 3,671-line monolith.

#### Current Violations (non-test files >500 lines)

| Lines | File |
|------:|------|
| 3,671 | `src/api/github.ts` |
| 1,596 | `src/components/OrgDetailPanel.tsx` |
| 1,247 | `src/components/sidebar/github-sidebar/RepoNode.tsx` |
| 1,188 | `src/components/sidebar/github-sidebar/useGitHubSidebarData.ts` |
| 1,126 | `src/components/sidebar/github-sidebar/OrgRepoTree.tsx` |
| 687 | `src/components/bookmarks/BookmarkDialog.tsx` |
| 634 | `electron/ipc/githubHandlers.ts` |
| 596 | `src/components/UserPremiumUsageSection.tsx` |
| 595 | `src/components/UserDetailPanel.tsx` |
| 529 | `electron/services/tempoClient.ts` |
| 505 | `src/components/pull-request-list/usePRListData.ts` |
| 502 | `src/components/PullRequestDetailPanel.tsx` |

#### File Length Gate Steps

1. Add `'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }]` to `eslint.config.js`
2. Run lint to confirm violations match the table above
3. The simplisticate loop will naturally target these as it looks for code smells
4. Graduate from `warn` to `error` once violations are under 5

### Function Length Gate (max-lines-per-function)

Complements `complexity` — a function can have cyclomatic complexity of 2 and still be 200 lines of sequential API plumbing with no branching. Long functions are hard to test, review, and maintain even when they aren't complex.

#### Function Length Gate Steps

1. Add `'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }]` to `eslint.config.js`
2. Audit violations — prioritize functions in `github.ts` and component files
3. Extract helper functions or split into domain modules as needed

### Cognitive Complexity (sonarjs)

ESLint's built-in `complexity` counts branches but not nesting depth. A function with 3 nested `if` statements inside a `for` inside a `try` scores the same as 3 flat `if/else` chains — but it's dramatically harder to understand. Cognitive complexity (from `eslint-plugin-sonarjs`) accounts for this.

#### Cognitive Complexity Steps

1. Install: `bun add -d eslint-plugin-sonarjs`
2. Add to `eslint.config.js`: `sonarjs/cognitive-complexity: ['warn', 15]`
3. Audit violations alongside `complexity` rule to see which functions are deceptively complex
4. Also enables other sonarjs rules: `no-duplicate-string`, `no-identical-functions`, `no-collapsible-if`

### Dependency Coupling Analysis

No current tooling detects God-files (high afferent coupling — many modules importing from one file) or circular dependencies. `github.ts` is likely imported by 20+ components, making every change there a blast-radius risk.

#### Dependency Coupling Steps

1. Install: `bun add -d dependency-cruiser`
2. Generate config: `bunx depcruise --init`
3. Add `"deps:check": "depcruise src --config"` to package.json scripts
4. Configure rules: max fan-in per module (e.g., 15), no circular deps
5. Add to CI as informational step initially, promote to blocking later
6. Alternative: `madge` for quick circular dependency visualization (`bunx madge --circular src/`)

### Enforce Typed Catch Clauses

The codebase has **21 untyped `catch (error)` blocks** vs only **2 typed `catch (error: unknown)` blocks**. A dedicated `errorUtils.ts` module with `getErrorMessage(error: unknown)` exists but is underutilized — most catch blocks log `error` directly or use string interpolation, producing `[object Object]` instead of useful messages in production.

#### Current State

- `catch (error)` (untyped): 21 occurrences across `github.ts`, `taskQueue.ts`, `useConfig.ts`, `useCopilotUsage.ts`, `JobDetailPanel.tsx`, `RunList.tsx`
- `catch (error: unknown)` (typed): 2 occurrences in `github.ts`
- `no-explicit-any` ESLint rule: set to `warn`, not `error`
- `getErrorMessage()`: exists in `errorUtils.ts` but rarely called

#### Error Handling Implementation

1. Add `@typescript-eslint/use-unknown-in-catch-variables` as an **error** rule in `eslint.config.js` — auto-enforces `catch (error: unknown)` across the codebase
2. Promote `no-explicit-any` from `warn` to `error` in `eslint.config.js`
3. Migrate all 21 untyped catch blocks to `catch (error: unknown)` and adopt `getErrorMessage()` consistently
4. Fix the 2 remaining production `any` types in `github.ts` (`eventSummary`, `mapPR`)

#### Impact

- **Debuggability**: Production errors will produce meaningful messages instead of `[object Object]`
- **Type safety**: Catches the same class of issues that `strict: true` prevents elsewhere
- **Consistency**: Aligns error handling with the existing `errorUtils.ts` pattern

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

### Cyclomatic Complexity Gate

Enable the ESLint built-in `complexity` rule to flag functions that exceed a cyclomatic complexity threshold. Industry standard threshold is 10 — any function scoring higher is a candidate for refactoring.

#### Complexity Gate Steps

1. Add to ESLint config: `"complexity": ["warn", 10]`(built-in, no extra packages)
2. Run `eslint . --rule 'complexity: [warn, 10]'` to identify current violations
3. Triage: fix high-value violations first (IPC handlers, service modules), suppress known-complex functions with inline `// eslint-disable-next-line complexity` + TODO comment
4. Once violations are manageable, escalate from `warn` → `error` to make it a CI gate

#### Complementary Tools

- `eslint-plugin-sonarjs` — adds **cognitive complexity** (weighs nesting depth, not just branch count) — see [Code Quality Tooling Roadmap](#code-quality-tooling-roadmap)
- SonarCloud — already in CI; tracks complexity metrics on dashboard if connected

#### High-Risk Files (likely violations)

- `electron/ipc/githubHandlers.ts` (27KB, most complex handler file)
- `electron/ipc/terminalHandlers.ts` (14KB)
- `electron/ipc/configHandlers.ts` (7KB)

### Code Quality Tooling Roadmap

The repo already has excellent tooling (ESLint 9, Prettier, TypeScript strict, Vitest 100% thresholds, Knip, e18e, commitlint, Husky, markdownlint, bundle-size tracking, npm-audit-ci, Copilot Code Review, react-doctor, vitest-cucumber BDD, coverage ratchet, repo-audit, SFL Analyzers ×3, test-coverage-audit, simplisticate-audit). These are the remaining genuine gaps:

#### Tier 1 — ESLint Plugin Expansion

- `eslint-plugin-sonarjs` — catches cognitive complexity, duplicate branches, identical expressions
- `eslint-plugin-unicorn` — modern JS best practices, performance patterns, no abbreviations
- Upgrade `typescript-eslint` from `recommended` → `strict` preset (adds no-unnecessary-condition, no-confusing-void-expression, etc.)

#### Tier 2 — Electron Security

- `electronegativity` — static analysis for Electron security misconfigurations (nodeIntegration, contextIsolation, webSecurity)
- Add as CI step: `npx electronegativity -i electron/ -r`

#### Tier 3 — Architecture Enforcement

- `dependency-cruiser` — enforce import boundaries (e.g., components can't import from electron/, convex/ can't import from src/)
- `.dependency-cruiser.cjs` config with forbidden rules
- Add as CI step

#### Tier 4 — E2E Testing

- Playwright with Electron adapter for full app E2E tests
- Start with critical user flows: app launch, settings, PR list navigation
- Consider `@playwright/test` with `electron.launch()` API

### Harden CI Soft-Fail Steps

Three CI steps currently run with `continue-on-error: true`, meaning failures are invisible:

| Step | Current Behavior | Recommended Change |
|------|-----------------|-------------------|
| `e18e` | Soft-fail | **Make blocking** — dependency health is a quality gate |
| `npm-audit` | Soft-fail | Add `--audit-level=high` to fail only on high/critical vulns |
| `bench` | Soft-fail | Gate via bench-compare script (see Performance Testing Suite) |

#### CI Hardening Steps

1. Remove `continue-on-error: true` from e18e step in ci.yml
2. Change npm-audit step to: `npx npm-audit-ci --moderate` (or `--high`)
3. Benchmark gating covered in Performance Testing Suite

### Electron Worker Tests

The `electron/workers/` directory contains critical execution infrastructure with **zero tests**:

- **dispatcher.ts (8KB)** — Routes tasks to correct worker, manages concurrency
- **execWorker.ts (5KB)** — Spawns child processes, handles timeouts and abort signals
- **offlineSync.ts (7KB)** — Queues operations during offline, replays on reconnect
- **skillWorker.ts (2KB)** — Spawns Copilot CLI for skill execution
- **aiWorker.ts (1KB)** — Spawns Copilot CLI for AI tasks

#### Priority Test Scenarios

- Dispatcher: correct routing, concurrency limits, error propagation
- ExecWorker: timeout behavior, abort signal handling, stdout/stderr capture
- OfflineSync: queue persistence, replay ordering, conflict resolution on reconnect

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

#### Implementation Phases

#### Phase 1: Folder View Sidebar (foundation)

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

#### New Files

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

### Parallelize CI Pipeline

The CI workflow runs **~8 minutes** as a single serial job. Half that time is tests+coverage (4m) and benchmarks (1.5m). All lint/check steps are independent and could run concurrently.

#### Current CI Step Breakdown (Run #931)

| Step | Duration | % of Total |
|------|----------|------------|
| Run tests with coverage | 4m 08s | 50% |
| Run benchmarks | 1m 29s | 18% |
| Lint (ESLint) | 39s | 8% |
| Build (vite + electron) | 37s | 7% |
| Type check (TypeScript) | 21s | 4% |
| Install dependencies | 18s | 4% |
| Format check (Prettier) | 16s | 3% |
| Dep health analysis | 13s | 3% |
| Everything else | ~20s | 3% |

#### Recommended Changes

1. **Split into parallel jobs** — Run lint, typecheck, format, and tests as separate jobs. Wall time drops from ~8m to ~5m since the longest job (tests) runs alongside the others.
2. **Cache bun dependencies** — No dependency caching is configured; `bun install` runs fresh every time (~18s). Use `actions/cache` with `~/.bun/install/cache` as the cache path.
3. **Move benchmarks to a separate optional workflow** — They already use `continue-on-error: true` and add 1.5m. Make them a separate workflow triggered on `workflow_dispatch` or PR label.
4. **Evaluate TypeScript 6 native compiler** — Would reduce typecheck from 21s to ~3-4s (minor in CI, but significant for editor DX). The codebase is ~117K LOC / 468 files on TS 5.9.3.

#### Target Architecture

```yaml
jobs:
  install: # shared dependency install + cache
  lint: # ESLint + Prettier + knip (parallel)
  typecheck: # tsc --noEmit (parallel)
  test: # vitest + coverage + ratchet (parallel)
  build: # vite + electron (depends on typecheck)
  benchmarks: # optional, separate workflow or label-triggered
```
