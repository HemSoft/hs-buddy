# Buddy - TODO

| Status | Priority | Task | Notes |
|--------|----------|------|-------|
| 🤖 | **High** | Critically reduce and remove AGENTS.md | SFL issue #89 — pipeline will slim down redundant content |
| 📋 | **High** | [SFL Loop monitoring in Organizations tree](#sfl-loop-monitoring-in-organizations-tree) | Auto-detect SFL-enabled repos; show pipeline status node under each repo |
| 📋 | Medium | [Run 30-day Set it Free pilot](#run-30-day-set-it-free-pilot) | Measure MTTR, merge quality, false positives; publish to SFL repo |
| 📋 | Medium | [Create cost telemetry dashboard](#create-cost-telemetry-dashboard) | Run counts, p50/p90 cost, monthly budget burn |
| 📋 | Medium | [Add branch cleanup to repo-audit](#add-branch-cleanup-to-repo-audit) | Detect and delete merged/orphaned agent-fix branches |
| ✅ | **Critical** | Build sfl-auditor workflow | Audits label consistency; repairs orphaned state (2026-02) |
| ✅ | High | Define Set it Free governance policy | Moved to relias-engineering/set-it-free-loop (2026-02) |
| ✅ | High | Build feature-intake normalization workflow | Convex mapping + template-driven issue drafts + dedupe (2026-02) |
| ✅ | High | Issue Processor workflow | Cron claim → draft PR → agent:in-progress labeling (2026-02) |
| ✅ | High | Build PR Analyzer workflow (×3 models) | Three analyzers on staggered crons; cycle-aware markers (2026-02) |
| ✅ | High | Build PR Fixer workflow (authority) | Claude Opus; reads analyzer comments; commits fixes; escalates at cycle 3 (2026-02) |
| ✅ | High | Add pr:cycle-N label system | Labels pr:cycle-1/2/3; analyzers skip cycle-3; escalation built in (2026-02) |
| ✅ | High | Build PR Promoter workflow | All analyzers pass → un-draft PR + promotion comment (2026-02) |
| ✅ | High | Improve Welcome to Buddy window | Convex-backed stats dashboard, session tracking (2026-02) |
| ✅ | High | Expand repo detail view | Rich card-based repo info panel with caching (2026-02) |
| ✅ | High | Make repos expandable folders | Expandable repos with Issues & PRs children (2026-02) |
| ✅ | **High** | Build task dispatch system | Dispatcher + exec worker + Convex claiming (2026-02) |
| ✅ | High | Implement exec-worker | spawn()-based shell execution, timeout, abort (2026-02) |
| ✅ | **High** | Restructure electron/main.ts | Split 423→95 lines, 8 new modules (2026-02) |
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
| ✅ | Medium | Build feature-intake normalization workflow | Convex mapping schema + template-driven issue drafts + dedupe checks (2026-02) |
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

**Remaining: 5** (1 SFL-tracked) | **Completed: 39** (89%)

---

## Remaining Items

### SFL Loop monitoring in Organizations tree

**Goal**: Dynamically detect SFL-enabled repos and show a pipeline status node under each repo in the Organizations sidebar tree.

**Detection**: Check for SFL workflow files (e.g., `sfl-dispatcher.yml`, `sfl-auditor.lock.yml`, or `issue-processor.lock.yml`) via the GitHub API (`GET /repos/{owner}/{repo}/contents/.github/workflows`). Cache the result per repo.

**UI**: When SFL is detected, add a child node under the repo (alongside Overview, Issues, Pull Requests):

- **SFL Loop** — clickable, opens a content page showing:
  - Pipeline health status (harmony check)
  - Active issues: `agent:fixable`, `agent:in-progress` counts
  - Open draft PRs in the pipeline with cycle count
  - Recent merge activity
  - Last auditor/dispatcher run timestamps

**Steps**:

1. Add `fetchSFLStatus(owner, repo)` to `GitHubClient` — check for SFL workflows + fetch labeled issues/PRs
2. Cache SFL-enabled flag per repo in `dataCache`
3. In `GitHubSidebar.tsx`, conditionally render "SFL Loop" node when detected
4. Create `SFLLoopPanel.tsx` content page with pipeline overview
5. Add `sfl-loop:owner/repo` route to `AppContentRouter.tsx` and `appContentViewLabels.ts`

---

### Run 30-day Set it Free pilot

**Goal**: Validate quality and economics with real usage in this repo. Publish metrics back to the SFL repo.

**Deliverables**:

- Baseline vs post-loop performance report
- False positive and rework analysis
- Recommendation for broader rollout

---

### Add branch cleanup to repo-audit

**Goal**: Have the repo-audit workflow detect and report stale branches (merged `agent-fix/*` branches, orphaned worktree branches, old scaffold branches) so they don't accumulate.

**Scope**:

- List remote branches matching `agent-fix/*` whose linked PR is merged or closed → create issue to delete
- Detect local-only branches that are fully merged into main
- Flag branches older than 7 days with no associated open PR

---

### Create cost telemetry dashboard

**Goal**: Make spend predictable at repo and portfolio level.

**Deliverables**:

- Per-workflow run and cost metrics
- p50/p90 cost-per-run reporting
- Monthly cap alerts and throttle policies
