# Buddy - TODO

## Agentic PR Lifecycle

The full pipeline for autonomous code quality:

```
Repo Audit → Issues  →  Issue Processor  →  Draft PR (agent:pr)
                                                    ↓
                              ┌─────── PR Analyzers (×3 models) ─────────┐
                              │  Comment on issues found; exit            │
                              └───────────────────────────────────────────┘
                                                    ↓
                              ┌─────── PR Fixer (Authority / Opus) ───────┐
                              │  Read all comments; fix; commit; exit      │
                              └───────────────────────────────────────────┘
                                                    ↓
                              Repeat up to 3 cycles (pr:cycle-1/2/3 labels)
                                                    ↓
                         Still issues after cycle 3? → agent:human-required
                         Clean? → Un-draft PR → Human review & merge
```

| Status | Priority | Task | Notes |
|--------|----------|------|-------|
| ✅ | High | Define Set it Free governance policy | Moved to relias-engineering/set-it-free-loop (2026-02) |
| ✅ | High | Build feature-intake normalization workflow | Convex mapping schema + template-driven issue drafts + dedupe checks (2026-02) |
| ✅ | High | Issue Processor workflow | Cron every 30 min; claim issue; create draft PR; agent:in-progress labeling (2026-02) |
| ✅ | **Critical** | Build sfl-auditor workflow | Audits issue/PR label consistency; repairs orphaned in-progress, conflicting labels, and unexplained pauses. Cron `15,45 * * * *` (2026-02) |
| ✅ | High | Build PR Analyzer workflow (×3 models) | Three analyzers (A: Correctness, B: Security, C: Style) on staggered crons; cycle-aware comment markers; compiled lock.yml (2026-02) |
| ✅ | High | Build PR Fixer workflow (authority) | Authority model (Claude Opus); reads all 3 analyzer comments; implements fixes; commits via create-pull-request safe output; increments pr:cycle-N; escalates at cycle 3. Cron `20,50 * * * *` (2026-02) |
| ✅ | High | Add pr:cycle-N label system | Labels `pr:cycle-1/2/3` created; analyzers skip cycle-3 PRs; escalation built into PR Fixer design (2026-02) |
| ✅ | High | Build PR Promoter workflow | Runs after PR Fixer; if all 3 analyzers pass → un-draft PR via create-pull-request (draft:false) + promotion comment. Cron `25,55 * * * *` (2026-02) |
| 📋 | Medium | Run 30-day Set it Free pilot | Measure MTTR, merge quality, false positives; publish to SFL repo |
| 📋 | Medium | [Create cost telemetry dashboard](#create-cost-telemetry-dashboard) | Run counts, p50/p90 cost, monthly budget burn |
| ✅ | High | Improve Welcome to Buddy window | Convex-backed stats dashboard, session tracking (2026-02) |
| ✅ | High | Expand repo detail view | Rich card-based repo info panel with caching (2026-02) |
| ✅ | High | Make repos expandable folders | Expandable repos with Issues & PRs children (2026-02) |
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

**Remaining: 2** | **Completed: 39** (95%)

---

## Remaining Items

### Run 30-day Set it Free pilot

**Goal**: Validate quality and economics with real usage in this repo. Publish metrics back to the SFL repo.

**Deliverables**:

- Baseline vs post-loop performance report
- False positive and rework analysis
- Recommendation for broader rollout

### Create cost telemetry dashboard

**Goal**: Make spend predictable at repo and portfolio level.

**Deliverables**:

- Per-workflow run and cost metrics
- p50/p90 cost-per-run reporting
- Monthly cap alerts and throttle policies
