# Buddy Vision

**Version**: 3.0
**Updated**: 2026-04-06
**Status**: Active Execution

## Executive Summary

Buddy is a cross-platform Electron desktop app that unifies developer
productivity into a single workspace — pull requests, Copilot AI,
bookmarks, time tracking, task planning, automation, and repository
insights — backed by Convex for real-time sync and offline resilience.

It is the first (and reference) consumer of the **Set it Free Loop™**,
a continuous-quality operating model for software repositories.

---

## Current Feature Map

### Pull Requests

Four-mode PR dashboard (My PRs, Needs Review, Recently Merged, Needs a
Nudge) with full detail views: conversation, commits, checks,
files-changed diff, and AI reviews. Card and list view modes persist to
Convex per page.

### Copilot AI Integration

- **Prompt Box** — free-text prompts to the Copilot SDK, results stored
  in Convex.
- **AI-Powered PR Review** — one-click Copilot code review with inline
  thread resolution.
- **Usage Dashboard** — billing, spend, premium-request quota rings, and
  org budget tracking with daily snapshots.
- **Session Explorer** — parse Copilot JSONL session logs, compute
  efficiency digests (token efficiency, tool density, search churn,
  estimated cost).
- **Assistant Panel** — context-aware streaming chat sidebar using
  Copilot SDK.

### Bookmarks

Categorized URL collection with drag-and-drop, AI-suggested titles and
tags, in-app browser tabs (webview with session persistence,
back/forward/reload, open-in-external-browser), and sidebar tree
navigation by category.

### Automation (Job Scheduler)

Three worker types — **exec** (shell), **ai** (LLM prompt), **skill**
(Claude skills) — with cron-based scheduling, timezone support,
missed-execution policy (catchup/skip/last), offline queue with
catch-up, and real-time run status. Convex cron scans due schedules
every minute.

### Task Planner (Todoist)

Today, upcoming, and projects views connected to Todoist REST API via
IPC handlers.

### Tempo (Time Tracking)

Timesheet grid, summary cards, and worklog editor connected to Tempo
via IPC handlers.

### The Crew (Project Sessions)

Project-scoped workspace sessions with dedicated sidebar and detail
views.

### GitHub Integration

Multi-account support via `gh` CLI auth. Org detail, repo detail (stats
bar, content grid), per-repo commit/issue/PR browsing, user profiles
with contribution graphs, and rate-limit gauge.

### Feature Intake Normalization

Maps external tickets (Jira, GitHub Issue, manual) to canonical GitHub
issue drafts with risk labels. Convex table tracks draft → linked →
duplicate status.

### Settings

Five panels — Accounts, Appearance (themes, color picker, font
customization), Pull Requests, Copilot SDK, Advanced. Runtime config
stored in electron-store with Convex sync for view modes.

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│  Buddy Desktop (Electron 30 + React 18 + Vite 5)               │
│                                                                  │
│  Renderer                      Main Process                      │
│  ┌────────────────────┐        ┌──────────────────────────────┐ │
│  │ React UI            │        │ IPC Handlers (8 domains)     │ │
│  │  10 Activity Panels │◀──────▶│ Workers (exec, ai, skill)   │ │
│  │  30+ Content Views  │  IPC   │ Services (Copilot, Tempo,   │ │
│  │  21 Custom Hooks    │        │   Todoist, Crew, Sessions)  │ │
│  └────────┬───────────┘        │ OpenTelemetry (→ Aspire)     │ │
│           │                     └──────────────────────────────┘ │
│           │ Convex SDK                                           │
│           ▼                                                      │
│  ┌────────────────────┐                                          │
│  │  Convex Cloud       │  14 tables · 2 cron jobs                │
│  │  Real-time sync     │  File storage for run outputs           │
│  │  Offline resilience │                                          │
│  └────────────────────┘                                          │
└──────────────────────────────────────────────────────────────────┘
```

### Data Model (14 Convex Tables)

| Table | Purpose |
|-------|---------|
| `githubAccounts` | Multi-account GitHub CLI configurations |
| `settings` | Singleton app config (PR refresh, Copilot models, view modes) |
| `jobs` | Task definitions (exec/ai/skill worker type + config) |
| `schedules` | Cron expressions, timezone, missed policy, linked job |
| `runs` | Execution history (status, duration, output, file storage) |
| `bookmarks` | URL collection with categories, tags, sort order |
| `repoBookmarks` | Folder-organized repo collection |
| `buddyStats` | 16 lifetime counters (launches, tabs, PRs viewed, etc.) |
| `copilotResults` | Stored Copilot prompt/response pairs |
| `copilotUsageHistory` | Daily billing snapshots for trend reporting |
| `prReviewRuns` | AI review history per PR + head SHA |
| `featureIntakes` | External ticket → canonical issue mapping |
| `sessionDigests` | Copilot session efficiency metrics |
| `_storage` | Convex file storage for run outputs |

### Electron Main Process

| Module | Responsibility |
|--------|---------------|
| `main.ts` | App entry, window creation, multi-monitor, CDP debug port |
| `config.ts` | electron-store config manager |
| `cache.ts` | Caching layer |
| `preload.ts` | Context bridge (IPC ↔ renderer) |
| `menu.ts` | Keyboard shortcuts (frameless window — no native menu bar) |
| `telemetry.ts` | OpenTelemetry SDK: traces, metrics, structured logs to Aspire |
| `zoom.ts` | Zoom level persistence |

### IPC Handler Domains

`github` · `copilot` · `copilotSessions` · `crew` · `tempo` · `todoist` · `shell` · `config` · `cache` · `window`

### Aspire Orchestration

TypeScript AppHost (`apphost.ts`) orchestrates Convex dev server and
Buddy with full OpenTelemetry instrumentation (traces, metrics,
structured logs) flowing to the Aspire dashboard when
`OTEL_EXPORTER_OTLP_ENDPOINT` is set.

---

## Set it Free Loop™

Buddy is the reference consumer of the **Set it Free Loop™** — a
continuous quality improvement operating model.

> One Intake. One Loop. Compounding Quality.

The operating model, workflow library, and governance live at:
**[relias-engineering/set-it-free-loop](https://github.com/relias-engineering/set-it-free-loop)**

### Pipeline (happy path)

| # | Workflow | What it does |
|---|---------|-------------|
| 0 | `discussion-processor` | Audit findings → categorized GitHub Issues |
| 1 | `sfl-issue-processor` | Issue → draft PR with implementation |
| 2 | `sfl-analyzer-a` | Claude Sonnet code review (marker + verdict) |
| 3 | `sfl-analyzer-b` | Claude Opus code review (marker + verdict) |
| 4 | `sfl-analyzer-c` | GPT code review (marker + verdict) |
| 5 | `sfl-pr-label-actions` | Aggregate verdicts → ready-for-review or fix cycle |

### Supporting Workflows

| Workflow | Cadence | Purpose |
|---------|---------|---------|
| `sfl-auditor` | Every 12 hours | Detects/repairs state discrepancies |
| `sfl-queue-monitor` | Scheduled | Monitors agent queue depth |
| `sfl-improve-scorecard` | On demand | Scorecard keyword detection improvements |
| `daily-repo-status` | Daily | Repository health report |
| `repo-audit` | Scheduled | Comprehensive code/config audit |
| `simplisticate-audit` | Scheduled | Complexity reduction audit |
| `test-coverage-audit` | Scheduled | Coverage gap analysis |
| `react-doctor-audit` | Scheduled | React code health audit |

---

## Quality Tooling

### CI Pipeline (`.github/workflows/ci.yml`)

Steps: knip (dead code) → ESLint → tsc --noEmit → Prettier → e18e
(dependency health) → Vitest + coverage → Build → Bundle size →
Benchmarks

### Testing

- **Vitest** with `happy-dom`, 119 test files, ~974 tests
- **BDD**: 3 Gherkin feature specs via `vitest-cucumber`
- **Benchmarks**: 8 `.bench.ts` files for critical paths
- **Coverage**: v8 provider, Cobertura + lcov reporters, ratcheting
  thresholds (45%+ statements/functions/lines, 41%+ branches)

### Code Health

- **Knip**: zero-suppression dead code detection
- **e18e**: dependency health and migration analysis
- **Bundle size**: baseline comparison on every build
- **Pre-commit hooks**: version bump, changelog, formatting

---

## UI Shell

Frameless window (`frame: false`) with custom `TitleBar.tsx`. VS
Code-inspired layout:

```text
┌──────────────────────────────────────────────────────────┐
│ [≡] Buddy v0.1.608                      [−] [□] [×]     │
├────┬────────────────────────┬────────────────────────────┤
│    │  Sidebar               │  Tab Bar                   │
│ 🔀 │                        ├────────────────────────────┤
│ ⚡ │  Tree navigation       │                            │
│ ✔  │  per active section    │  Content Area              │
│ 📊 │                        │  (30+ routable views)      │
│ 🤖 │                        │                            │
│ 👥 │                        │                            │
│ 🕐 │                        │                            │
│ 🔖 │                        │                            │
│ ✨ │                        │                            │
│ ⚙  │                        │                            │
├────┴────────────────────────┴────────────────────────────┤
│  Status Bar                                              │
└──────────────────────────────────────────────────────────┘
```

10 Activity Bar sections: GitHub, Skills, Tasks, Insights, Automation,
The Crew, Tempo, Bookmarks, Copilot, Settings.

---

## Technical Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 30 |
| UI | React 18, TypeScript 5.2, Vite 5 |
| Backend | Convex 1.34 (serverless DB + real-time) |
| AI | `@github/copilot-sdk` 0.1.23 |
| GitHub API | `@octokit/rest` 22, `@octokit/graphql` 9 |
| Telemetry | OpenTelemetry SDK (traces, metrics, logs → Aspire) |
| Icons | lucide-react |
| Layout | allotment (resizable panes) |
| Storage | electron-store (local config) |
| Build | Vite + electron-builder (NSIS/DMG/AppImage) |
| CI | GitHub Actions, Bun 1.2, Node 22 |

---

## Strategic Goals

| # | Goal | Status |
|---|------|--------|
| 1 | Replace hs-conductor | ✅ Retired — Buddy handles all scheduling |
| 2 | Platform independence (Convex sync) | ✅ All data in Convex |
| 3 | Serverless architecture | ✅ No local Express/Inngest server |
| 4 | Real-time experience | ✅ Convex subscriptions power live UI |
| 5 | Skill integration (110+ Claude skills) | ✅ skill-worker type operational |
| 6 | Unified delivery intake | ✅ featureIntakes table + discussion-processor |
| 7 | Recursive quality automation (SFL) | ✅ Full loop operational |
| 8 | Portfolio scalability | 🚧 Running on hs-buddy + 2 SFL repos |
| 9 | Raise test coverage to 50% | 🚧 At ~46%, ratcheting up |
| 10 | Mobile companion app | 📋 Future — React Native + Expo |

---

## References

- [relias-engineering/set-it-free-loop](https://github.com/relias-engineering/set-it-free-loop) — SFL operating model
- [Convex Documentation](https://docs.convex.dev) — Backend platform
- [GOAL-AND-GUIDING-PRINCIPLES.md](GOAL-AND-GUIDING-PRINCIPLES.md) — Guiding principles
- [AGENTS.md](AGENTS.md) — Agentic loop standing orders
- [docs/WORKFLOW-README.md](docs/WORKFLOW-README.md) — Workflow catalog
