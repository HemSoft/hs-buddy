# Buddy - TODO

| Status | Priority | Task | Notes |
|--------|----------|------|-------|
| 🚧 | Critical | Raise test coverage from 20% to 50% | At 29.88% (974 tests, 90 files). |
| 📋 | High | Wire coverage:ratchet into CI | Run `bun run coverage:ratchet` after test:coverage passes so thresholds auto-increment |
| 📋 | High | Add Gherkin BDD specs for remaining critical paths | Next: copilot sessions, data cache, PR list |
| 📋 | Medium | Add format:check to pre-commit hook | CI has it but Husky pre-commit doesn't |
| 📋 | Medium | [Bookmarks — URL & Link Collection Manager](#bookmarks) | New feature: categorized link management with quick-launch and tagging |
| 📋 | Medium | [Card/List View Toggle for all list pages](#cardlist-view-toggle) | Add table/grid view as alternative to card view on list pages |
| 📋 | Low | Evaluate Playwright component testing for TSX coverage | Many 0% component files are hard to unit-test |
| ✅ | High | SFL Queue Monitor workflow | 2026-04-01: Deployed to 3 repos with agent:queue label |
| ✅ | Medium | Quality gates overhaul | 2026-03-31: CI gates, commitlint, vitest-cucumber BDD, coverage ratchet (PR #408) |
| ✅ | Medium | Benchmarking tests for critical paths | 2026-03-30: 3 bench files (dateUtils, jsonSerialization, copilotSessionParsing) |
| ✅ | Medium | Task Planner (Todoist Integration) | 2026-03-30: 7-day upcoming view, Todoist REST API, IPC handlers |
| ✅ | Medium | Copilot Session Explorer | 2026-03-29: JSONL parsing, workspace grouping, streaming parser |
| ✅ | Medium | Session Insights & Feedback Loop | 2026-03-29: Digest computation, Convex persistence, digest UI |
| ✅ | Medium | Add branch cleanup to repo-audit | 2026-03-22: Branch Hygiene scope added to repo-audit + sfl-auditor |
| ✅ | High | Add GitHub organization metrics detail view | 2026-03-22: Skeleton loader, per-phase error handling, roster controls |
| ✅ | Medium | Capture Copilot usage history | 2026-03-09: Issue #137 / PR #138; snapshots persist for trends |
| ✅ | High | Build project-scoped Copilot workspaces | 2026-03-08: Local project registration and project-scoped sessions |
| ✅ | High | SFL Loop monitoring in Organizations tree | 2026-03-08: Organizations tree shows SFL workflow health per repo |
| ✅ | High | Unify issue processor and fixer | 2026-03-07: Retired pr-fixer; sfl-issue-processor is single implementer |
| ✅ | High | Global Copilot Assistant Panel | 2026-03-04: PR #104 merged via SFL pipeline |
| ✅ | High | Simplisticate E2E Test | 2026-03-04: End-to-end SFL validation run completed |
| ✅ | Critical | Simplisticate Workflows | 2026-03-03: Event-driven triggers, human review handoff |
| ✅ | Medium | Copilot Usage month-end projection | 2026-03: Per-account trend projection with daily rate |
| ✅ | Medium | Run 30-day Set it Free pilot | Removed — ongoing operational concern, not a dev task |
| ✅ | Critical | SFL Auto-Merge mode | 2026-03: Simplified to human-review handoff via A→B→C→label-actions |
| ✅ | Medium | Elegant status bar queue display | 2026-02: "X of N · TaskName" with batch tracking |
| ✅ | Medium | Copilot enterprise budget reset fix | 2026-02: UTC dates, auto-refresh on month boundary |
| ✅ | Critical | SFL Simplification — Replace supersession model | 2026-02: pr-fixer rewritten with push-to-pull-request-branch |
| ✅ | Critical | SFL Simplification — Label pruning | 2026-02: 39→27 labels, removed 12 unused |
| ✅ | Critical | Build sfl-auditor workflow | 2026-02: Audits label consistency, repairs orphaned state |
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
| ✅ | High | Tabbed window system for PRs | 2025-01: Tabs above content area, no duplicates |
| ✅ | High | Fix Recently Merged date range | 2025-01: 30-day default, configurable in Settings |
| ✅ | High | App-wide task queue system | 2025-01: Named queues with concurrency control |
| ✅ | High | Settings UI with form-based editing | 2025-01: SidebarPanel navigation, auto-save |
| ✅ | High | Initialize Convex project | 2025-02: Generated types ready |
| ✅ | High | Define Convex schema | 2025-01: convex/schema.ts with jobs, schedules, runs |
| ✅ | High | Add Convex client to Electron | 2025-01: ConvexClientProvider, useConvex hooks |
| ✅ | High | Implement schedule CRUD functions | 2025-01: convex/schedules.ts, jobs.ts, runs.ts |
| ✅ | Medium | Repos of Interest feature | 2026-02: Folder-organized bookmark system |
| ✅ | Medium | Add run history view | 2026-02: Real-time status, filters, expandable output |
| ✅ | Medium | Implement skill-worker | 2026-02: Copilot CLI spawn, --allow-all mode |
| ✅ | Medium | Implement ai-worker | 2026-02: Copilot CLI spawn, model selection, abort |
| ✅ | Medium | Create schedule editor dialog | 2025-02: Modal with CronBuilder, job selector |
| ✅ | Medium | Add Workflows activity bar icon | 2025-01: RefreshCw icon in ActivityBar |
| ✅ | Medium | Build Schedules sidebar + list | 2025-01: ScheduleList component with status badges |
| ✅ | Medium | Port CronBuilder component | 2025-01: From hs-conductor with visual builder |
| ✅ | Medium | Implement schedule toggles | 2025-02: Toggle mutation in useConvex hooks |
| ✅ | Medium | Fix taskbar app name | 2025-01: "HS-body" → "Buddy" |
| ✅ | Medium | Create Help menu with About window | 2025-01: About dialog with branding |
| ✅ | Medium | Design and create app icon | 2025-01: Gold/orange gradient Users icon |
| ✅ | Low | Implement offline queue | 2026-02: Catch-up logic on reconnect |

## Progress

**Remaining: 7** | **Completed: 64** (90%)

---

## Remaining Items

### Bookmarks

A new feature for managing a personal collection of URLs and links with rich categorization and fast access.

**Core Concepts:**

- **Link entries**: URL, title, description, favicon, category, tags
- **Categories**: User-defined folders/groups (e.g., "Dev Tools", "Docs", "Design Inspo")
- **Tags**: Cross-cutting labels for flexible filtering
- **Quick-launch**: Open links from the app with one click or keyboard shortcut
- **Import/Export**: Bring in browser bookmarks, export as JSON/HTML

**UI Ideas:**

- New sidebar icon in the ActivityBar
- List view with search/filter bar (by category, tag, or free text)
- Card or compact-row display modes
- Drag-and-drop reordering within categories
- Context menus for edit, copy URL, open, delete
- "Add Bookmark" dialog with auto-fetch of page title and favicon from URL

**Data:**

- Convex table for persistence and real-time sync
- Schema: `url`, `title`, `description`, `faviconUrl`, `category`, `tags[]`, `createdAt`, `lastVisited`, `sortOrder`

**Nice-to-haves (future):**

- Dead link detection (periodic health check)
- Usage stats (most visited, recently added)
- Shareable bookmark collections
- Browser extension or bookmarklet for quick-add

### Card/List View Toggle

Add a switchable Card ↔ List (table) view mode to all pages that render collections as cards. When a list has many items, a compact table/grid is easier to scan.

**Affected Pages:**

- `PullRequestList.tsx` — PR cards (CSS grid, 400px min)
- `RepoIssueList.tsx` — issue cards
- `RepoPullRequestList.tsx` — repo-scoped PR cards
- `RunList.tsx` / `RunCard.tsx` — workflow run cards

**Existing Pattern to Follow:**

- `TempoDashboard.tsx` already has a Grid ↔ Timeline toggle (Grid3x3 / List icons). Extract and generalize this pattern.

**Implementation Plan:**

1. Create a shared `ViewModeToggle` component (Card icon / List icon toggle button group)
2. Create a shared `useViewMode(key)` hook that persists preference per page to localStorage
3. For each affected page:
   - Add `ViewModeToggle` next to existing header/filter controls
   - Card view = current rendering (no changes)
   - List view = compact table with sortable columns (title, status, author, date, etc.)
4. Refactor `TempoDashboard` to use the shared `ViewModeToggle` + `useViewMode` instead of its local state

**List View Columns by Page:**

- PRs: Title, Status (icon), Author, Repo, Updated, Reviews
- Issues: Title, Status (icon), Author, Labels, Updated
- Runs: Name, Status (icon), Duration, Triggered, Result

**UX Details:**

- Toggle persists across sessions (localStorage keyed by page)
- Smooth transition between views (no jarring flash)
- Table rows should have hover highlight and click-to-open like cards
- Keep existing search/filter controls — they apply to both views
