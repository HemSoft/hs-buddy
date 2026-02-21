# hs-buddy Agent Context

## Current Mission: Perfect the Agentic Loop

> **This is the single highest-priority focus of this repository right now.**

The agentic loop lives entirely in `.github/workflows/`. Its job is simple:
**GitHub Actions, GitHub Issues, and GitHub Pull Requests must be in perfect harmony at all times.**

The pipeline works like this:

```
Repo Audit → Issues (agent:fixable)
                 ↓
         Issue Processor (claims issue, creates draft PR)
                 ↓
         PR Analyzers ×3 → PR Fixer → PR Promoter
                 ↓
         Clean PR → Human review & merge
```

The **SFL Auditor** (`.github/workflows/sfl-auditor.lock.yml`) is the health guardian of this loop. It runs every 30 minutes and is responsible for detecting and repairing any state inconsistency between issues and PRs.

### Agent Standing Orders

These apply in every session, without exception:

#### 1. SFL Auditor is First

If the SFL Auditor has failed, is producing incorrect output, or missed a discrepancy — **fix the SFL Auditor before doing anything else.** No other pipeline work takes precedence over keeping the auditor healthy.

#### 2. Teach, Don't Just Fix

When you observe a state discrepancy (e.g., `agent:in-progress` issue with no open PR, conflicting labels, orphaned branches) — **do not silently fix it manually**. Instead:

1. Fix the immediate symptom if urgent.
2. Identify what SFL Auditor check would have caught this.
3. Propose an improvement to `sfl-auditor.md` that would prevent it recurring.

The goal is to make manual intervention unnecessary over time. Every manual fix is a gap in the auditor's knowledge.

#### 3. Propose Before You Commit (Interactive Sessions)

During interactive sessions with the user, **always propose SFL Auditor improvements explicitly before making changes**. State what you observed, what check is missing, and what the fix to the auditor would be. The user will approve, adjust, or redirect. Only then commit.

#### 4. Idempotency and Concurrency Are Non-Negotiable

Every workflow in the pipeline runs on a cron schedule. Multiple instances may overlap, GitHub Actions may retry, and the same event may fire twice. **Every workflow MUST be safe to run concurrently and repeatedly without producing duplicate side-effects.**

Concrete rules:

- **Marker-based idempotency**: Before performing any write, check for a marker comment (e.g., `<!-- pr-analyzer-a cycle:0 -->`) that proves this work was already done. If the marker exists, exit cleanly.
- **Claim-before-work**: Before starting expensive work on an issue or PR, atomically claim it (e.g., swap `agent:fixable` → `agent:in-progress`) so concurrent runs skip it.
- **No duplicate PRs/comments**: If a PR or comment already exists for the target, do not create another. Verify first.
- **Concurrency groups**: Every `.lock.yml` uses `concurrency: group: "gh-aw-${{ github.workflow }}"` to serialize runs of the same workflow. The `.md` frontmatter does not need to set this — `gh aw compile` adds it automatically.
- **Stateless design**: Workflows must not depend on local filesystem state between runs. All state lives in GitHub (labels, comments, branches, PRs).

If you are authoring or modifying a workflow and cannot identify how it prevents duplicate side-effects under concurrent execution, **stop and fix that first**.

#### 5. What "Harmony" Means

The pipeline is in harmony when ALL of the following are true:

- Every issue labeled `agent:in-progress` has exactly one open PR with a branch matching `agent-fix/issue-<number>-*`
- No issue has both `agent:in-progress` and `agent:fixable` simultaneously
- No `agent:pause` label exists without an explanatory comment
- No open `agent-fix/` PR exists whose linked issue is closed or lacks `agent:in-progress`
- No `agent:fixable` issue has been waiting more than 2 cron cycles without being claimed

If any of these are violated, the SFL Auditor should detect and repair it automatically. If it doesn't, that is a bug in the SFL Auditor.

#### 6. Workflow-Only State Changes (No Manual Bypass)

Manual direct mutation of loop state is prohibited except for emergency containment explicitly requested by a human.

- Do **NOT** manually un-draft PRs, relabel loop issues/PRs, or close loop PRs as a normal fix path.
- If a workflow outcome is wrong (e.g., PR remains draft), fix the workflow prompt/logic so the next run resolves it.
- Any emergency manual intervention must be followed by a workflow fix in the same session to prevent recurrence.
- Human handoff is complete only when both are true:
  1. PR is non-draft, and
  2. PR has `human:ready-for-review` label.

If either condition is false, promotion is incomplete and must be retried by workflow logic.

#### 7. Promoter Auth Requirement

`pr-promoter` depends on authenticated `gh` CLI calls (`gh pr ready`) inside the agent runtime.

- The agent execution environment MUST receive `GITHUB_TOKEN` (and `GH_TOKEN`) from workflow secrets/context.
- If these are missing, promotion silently degrades into no-op comments while PRs remain draft.
- Any workflow recompilation or refactor that touches `pr-promoter.lock.yml` must preserve token injection for the `Execute GitHub Copilot CLI` step.

#### 8. Credential Attribution Requirement

For this repository, default all CLI and workflow token usage to the **`fhemmerrelias`** identity unless explicitly overridden by a human.

- Local `gh` CLI operations should run with active account `fhemmerrelias`.
- Workflow runtime secrets used for agent actions (`GH_AW_GITHUB_TOKEN`, `COPILOT_GITHUB_TOKEN`) should be sourced from the `fhemmerrelias` token.
- If a maintenance action requires repo-admin access unavailable to `fhemmerrelias`, perform that one-time admin action, then immediately switch the active CLI account back to `fhemmerrelias`.

### Workflow Files

| File | Purpose | Schedule |
|------|---------|----------|
| `repo-audit.lock.yml` | Creates `agent:fixable` issues from code quality findings | Daily |
| `issue-processor.lock.yml` | Claims oldest `agent:fixable` issue, creates draft PR | `*/30 * * * *` |
| `sfl-auditor.lock.yml` | Audits issue/PR label harmony, repairs discrepancies | `15,45 * * * *` |
| `pr-analyzer-a.lock.yml` | Reviews draft PRs for correctness & logic issues | `8,38 * * * *` |
| `pr-analyzer-b.lock.yml` | Reviews draft PRs for security & performance issues | `10,40 * * * *` |
| `pr-analyzer-c.lock.yml` | Reviews draft PRs for style & maintainability issues | `12,42 * * * *` |
| `pr-fixer.lock.yml` | Implements fixes from analyzer comments | `20,50 * * * *` |
| `pr-promoter.lock.yml` | Un-drafts clean PRs for human review | `25,55 * * * *` |

---

## Project Overview

**hs-buddy** is your universal productivity companion - an Electron application that sits on top of the HemSoft skills infrastructure to help automate tasks, manage workflows, and provide insights across both work and personal life.

## Built Upon hs-conductor

This application is architecturally based on **[hs-conductor](https://github.com/HemSoft/hs-conductor)**, specifically the `/admin` Electron app within that repository.

### Reference Architecture

When making decisions about project structure, UI patterns, or technical implementation, **always reference hs-conductor/admin** for consistency:

- **Electron Setup**: `(hs-conductor)/admin/electron/main.ts`
- **React Structure**: `(hs-conductor)/admin/src/`
- **Build Config**: `(hs-conductor)/admin/vite.config.ts`
- **UI Components**: React Complex Tree, Allotment (split panes), Monaco Editor, VSCode WebView UI Toolkit

## Technology Stack

- **Runtime**: Electron 30+
- **Frontend**: React 18 + TypeScript
- **Backend**: Convex (serverless database + real-time subscriptions)
- **Build Tool**: Vite 5
- **UI Libraries**:
  - `react-complex-tree` - Tree view navigation (left sidebar)
  - `allotment` - Resizable split panes
  - `@monaco-editor/react` - Code/text editing
  - `@vscode/webview-ui-toolkit` - VSCode-style UI components
  - `lucide-react` - Icons
- **Packaging**: electron-builder

## Convex Backend

- **Local Dashboard**: <http://127.0.0.1:6790/> (when `./runServer.ps1` is running)
- **Start Dev Server**: `./runServer.ps1` or `bun run convex:dev`
- **Start App**: `./runApp.ps1` or `bun dev`
- **Generate Types**: `bun run convex:codegen`
- **Deploy**: `bun run convex:deploy`

### Convex Schema

Located in `convex/schema.ts`:

- **jobs**: Task definitions (exec, ai, skill worker types)
- **schedules**: Cron-based triggers linked to jobs
- **runs**: Execution history with status tracking

### Cron Jobs

`convex/crons.ts` runs every minute to scan for due schedules and create pending runs.

## Project Vision

hs-buddy is designed to be **the** go-to tool for daily work and personal life management. It will:

1. **Manage 110+ Skills**: Provide a beautiful UI to interact with the extensive skill library
2. **Aggregate Information**: Display pull requests, tasks, notifications, and more in one place
3. **Left-Hand Navigation**: Tree view structure (like VS Code) for organizing different tools and views
4. **Pull Request Management**: UI version of the `hs-cli-prs` command - display and manage GitHub PRs with a polished interface ✓

## Implemented Features

### Configuration System ✓

- **electron-store**: Industry-standard config persistence in userData directory
- **Schema Validation**: JSON Schema enforcement for config structure
- **Multi-Account Support**: Multiple GitHub/Bitbucket accounts supported
- **Security**: GitHub CLI authentication (tokens stored in system keychain, not in app)
- **Auto-Migration**: Detects .env on first launch and creates initial config
- **IPC Bridge**: Full two-way communication between main/renderer processes
- **React Hooks**: `useConfig()`, `useGitHubAccounts()`, `usePRSettings()` for easy access
- **Settings UI**: View and manage configuration with "Open in Editor" functionality

Architecture:

- `src/types/config.ts` - TypeScript types and JSON Schema (no token fields)
- `electron/config.ts` - ConfigManager class wrapping electron-store
- `electron/main.ts` - IPC handlers for config operations and GitHub CLI token retrieval
- `src/hooks/useConfig.ts` - React hooks for renderer access
- `src/components/Settings.tsx` - Settings UI panel
- `src/api/github.ts` - GitHub API client using GitHub CLI authentication

### Pull Request Viewer ✓

- **GitHub Integration**: Fetch and display PRs from GitHub organizations
- **My PRs View**: Shows all PRs you're involved with (authored, assigned, reviewing, review requested)
- **Status Indicators**: Approval counts, your approval status, assignee counts
- **Beautiful UI**: VSCode-styled dark theme with clickable PR links
- **Real-time Data**: Direct API integration with GitHub using Octokit
- **Architecture Based on hs-cli-prs**: Reuses the proven API clients from hs-cli-prs project

Configuration:

- **electron-store**: Persistent JSON config in userData directory
  - Windows: `%APPDATA%\hs-buddy\config.json`
  - macOS: `~/Library/Application Support/hs-buddy/config.json`
  - Linux: `~/.config/hs-buddy/config.json`
- **GitHub CLI Authentication**: Uses `gh auth` for secure authentication (no tokens stored!)
  - Install: `winget install GitHub.cli` (Windows) or `brew install gh` (macOS)
  - Login: `gh auth login`
  - Verify: `gh auth status`
- **Auto-migration**: First launch detects VITE_GITHUB_USERNAME/ORG and migrates to config
- **Settings UI**: View config location, GitHub accounts, preferences, with "Open in Editor" button
- **Multi-account**: All accounts share the same GitHub CLI authentication

## Key Design Principles

1. **Consistency with hs-conductor**: Mimic the look, feel, and architecture
2. **No Server Component**: Unlike hs-conductor, this is purely a client-side Electron app
3. **Beautiful & Functional**: High-quality UI that's both aesthetically pleasing and highly functional
4. **Extensible**: Built to easily add new views and capabilities over time

## Development Guidelines

### When Adding Features

1. Check hs-conductor/admin for similar patterns
2. Use the same UI component libraries
3. Follow the established directory structure
4. Maintain the VSCode-inspired dark theme aesthetic

### Directory Structure

```
hs-buddy/
├── electron/          # Main process (window management, IPC)
│   ├── main.ts
│   ├── preload.ts
│   └── electron-env.d.ts
├── src/               # Renderer process (React app)
│   ├── api/           # API clients (GitHub, Bitbucket)
│   ├── components/    # React components
│   │   ├── PullRequestList.tsx    # PR viewer component
│   │   ├── TreeView.tsx           # Left sidebar navigation
│   │   └── TitleBar.tsx           # Window title bar
│   ├── types/         # TypeScript type definitions
│   ├── App.tsx
│   ├── main.tsx
│   └── *.css
├── dist/              # Built renderer (Vite output)
└── dist-electron/     
- [x] Scaffold Electron + React + TypeScript project
- [x] Implement tree view navigation
- [x] Create PR viewer (first use case)
- [x] GitHub API integration
- [ ] Multi-account GitHub support
- [ ] Bitbucket integration

### Phase 1: Foundation (Current)
- [x] Scaffold Electron + React + TypeScript project
- [ ] Implement tree view navigation
- [ ] Create PR viewer (first use case)

### Phase 2: Skill Integration
- [ ] Skills browser and launcher
- [ ] Skill metadata display
- [ ] Quick access to skill actions

### Phase 3: Workflow Automation
- [ ] Task management integration
- [ ] Calendar and scheduling
- [ ] Notifications and alerts

### Future
- Integrate with Todoist, GitHub, Slack, Teams, etc.
- Dashboard views for metrics and insights
- Customizable layouts and themes
- Plugin system for extensibility

## Important Notes for AI Agents

- **Always preserve the architectural alignment with hs-conductor**
- When in doubt, reference the hs-conductor/admin codebase
- Maintain type safety - use TypeScript strictly
- Follow the established code style (ESLint, Prettier)
- Keep the UI consistent with VSCode's design language
- **Frameless Window**: This app uses `frame: false` - the native menu bar is HIDDEN. ALL menus (File, Edit, View, Help) MUST be in the custom `TitleBar.tsx` component, not in `electron/main.ts`. The Electron menu template only handles keyboard shortcuts.
