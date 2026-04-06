# hs-buddy

> Your universal productivity companion

[![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue.svg)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-30-47848F.svg)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF.svg)](https://vitejs.dev/)
[![Set it Free Loop](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Frelias-engineering%2Fhs-buddy%2Fmain%2Fsfl.json&query=%24.version&prefix=v&label=Set%20it%20Free%20Loop&color=FFD700&style=flat&logo=githubactions&logoColor=white)](docs/SET_IT_FREE_GOVERNANCE.md)

## Overview

**hs-buddy** is a desktop application built to help you manage your work and personal life. It sits on top of the HemSoft skills infrastructure (110+ skills), providing a beautiful interface to automate tasks, manage workflows, and access information from various sources all in one place.

## Features

- **Pull Request Dashboard** — View, filter, and manage GitHub PRs across multiple accounts and orgs. Card and list views, detail panels, file diffs, checks, review threads, and merge history.
- **Copilot SDK Integration** — Run AI prompts and PR reviews directly from the app using the GitHub Copilot SDK. Results are stored in Convex for history and replay.
- **Copilot Usage Tracking** — Monitor premium request consumption, billing snapshots, and cost trends per account/org.
- **Session Explorer** — Analyze Copilot session efficiency with token counts, tool density, search churn, and estimated cost per session digest.
- **Bookmarks & In-App Browser** — Categorized URL bookmarks with an embedded tabbed browser (Electron webview). Back/forward/reload toolbar, external-browser fallback.
- **Automation Scheduler** — Create jobs (shell commands, AI prompts, or Claude skills), attach cron schedules, and view execution history. Three worker types: exec, ai, skill.
- **Tempo Timesheet** — Jira Tempo integration for logging and viewing time entries.
- **Todoist Integration** — Task management via the Todoist API.
- **Crew (Multi-Agent Projects)** — Launch and monitor multi-agent project sessions.
- **Feature Intake Normalization** — Map external tickets (Jira, GitHub, manual) to canonical GitHub issue drafts with risk labels and acceptance criteria.
- **Repo Explorer** — Browse repositories, issues, commits, and contributor details per org.
- **Contribution Graph** — Visual contribution heatmap.
- **OpenTelemetry + Aspire** — Full observability stack (traces, metrics, structured logs) that activates when launched via .NET Aspire orchestration.

## Tech Stack

- **Electron 30** — Cross-platform desktop framework (frameless window)
- **React 18** — UI framework with Lucide icons
- **TypeScript 5** — Type-safe development
- **Vite 5** — Dev server and bundler
- **Convex** — Serverless backend with real-time sync (13 tables)
- **Copilot SDK** — GitHub Copilot integration for AI prompts and PR reviews
- **OpenTelemetry** — OTLP traces, metrics, and logs
- **.NET Aspire** — Orchestration and dashboard (optional)
- **Allotment** — Resizable split panes
- **Vitest** — Unit tests with coverage ratchet

## Installation

### Prerequisites

- **Node.js 22+** - [Download](https://nodejs.org/)
- **Bun** (optional, for faster package management) - [Install](https://bun.sh/)

### Setup

```bash
# Clone the repository
git clone https://github.com/relias-engineering/hs-buddy.git
cd hs-buddy

# Install dependencies
bun install
# or with npm
npm install

# Optional: copy .env.example to .env for first-launch account auto-migration
cp .env.example .env
# Edit VITE_GITHUB_USERNAME and VITE_GITHUB_ORG if you want auto-migration on first launch

# Start development
npm run dev
# or with bun
bun run dev
```

### Configuration

hs-buddy uses **electron-store** for persistent configuration and **GitHub CLI** for authentication:

- **Windows**: `%APPDATA%\hs-buddy\config.json`
- **macOS**: `~/Library/Application Support/hs-buddy/config.json`
- **Linux**: `~/.config/hs-buddy/config.json`

#### First-Time Setup

1. **Install GitHub CLI** (if not already installed):

   ```bash
   # Windows (winget)
   winget install GitHub.cli

   # macOS (Homebrew)
   brew install gh

   # Or download from: https://cli.github.com/
   ```

2. **Authenticate with GitHub CLI**:

   ```bash
   gh auth login
   ```

   Follow the prompts to authenticate. GitHub CLI will securely store your credentials in your system keychain.

3. **Verify authentication**:

   ```bash
   gh auth status
   ```

4. **(Optional) Auto-migration from environment variables**:
   If you have a `.env` file with `VITE_GITHUB_USERNAME` and `VITE_GITHUB_ORG`, hs-buddy will automatically create your first account in the config on launch.

#### Adding GitHub Accounts

You can add multiple GitHub accounts for monitoring different organizations:

1. Click **Settings** in the sidebar
2. Click "Open in Editor" to edit `config.json`
3. Add accounts to the `github.accounts` array:

```json
{
  "github": {
    "accounts": [
      {
        "username": "your-username",
        "org": "your-org"
      },
      {
        "username": "work-username",
        "org": "work-org"
      }
    ]
  }
}
```

**Note**: All accounts share the same GitHub CLI authentication. No tokens are stored in config or environment variables!

#### Security

- **No tokens in config files** - Authentication is handled by GitHub CLI
- **System keychain storage** - Credentials are stored securely by your OS
- **No `.env` file needed** - After migration, you can delete it
- **Safe to commit config.json** - Contains no sensitive data (just usernames and org names)

## Convex Backend

hs-buddy uses [Convex](https://docs.convex.dev) as its serverless backend for real-time data sync.

```bash
# Start Convex dev server
./runServer.ps1          # or: bun run convex:dev

# Start the Electron app
./runApp.ps1             # or: bun dev

# Generate Convex types
bun run convex:codegen

# Deploy to production
bun run convex:deploy
```

Local dashboard (when dev server is running): <http://127.0.0.1:6790/>

## Development

```bash
# Start development server
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:check

# Build for production
npm run build
```

## Project Structure

```text
hs-buddy/
├── electron/               # Main process (Electron)
│   ├── ipc/               # IPC handlers (13 modules)
│   ├── services/          # Copilot SDK, Crew, Tempo, Todoist clients
│   ├── workers/           # Exec, AI, skill workers + dispatcher + offline sync
│   ├── main.ts            # Window management, IPC registration
│   ├── preload.ts         # Secure context bridge
│   ├── menu.ts            # Keyboard shortcuts (frameless window)
│   ├── telemetry.ts       # OpenTelemetry SDK init + helpers
│   ├── cache.ts           # Cache management
│   ├── config.ts          # electron-store configuration
│   ├── utils.ts           # Main-process utilities
│   └── zoom.ts            # Persistent zoom level
├── src/                   # Renderer process (React)
│   ├── api/               # GitHub API client (REST + GraphQL)
│   ├── features/          # BDD feature specs (budget, quota, task queue)
│   ├── components/        # React components
│   │   ├── automation/        # Schedule & job management UI
│   │   ├── bookmarks/         # Bookmark list, dialog, category sidebar
│   │   ├── copilot-usage/     # Copilot usage & billing panels
│   │   ├── crew/              # Crew multi-agent project UI
│   │   ├── planner/           # Task planner
│   │   ├── pr-review/         # PR review panels
│   │   ├── pr-threads/        # PR thread panels
│   │   ├── pull-request-list/ # PR list (card & list views)
│   │   ├── repo-detail/       # Repo detail panels
│   │   ├── sessions/          # Session efficiency explorer
│   │   ├── settings/          # Settings panels (accounts, appearance, etc.)
│   │   ├── shared/            # Shared components
│   │   ├── sidebar/           # Sidebar trees (GitHub, Bookmarks, Copilot)
│   │   ├── sidebar-panel/     # Sidebar panel containers
│   │   ├── bookmarks/         # Bookmark management panels
│   │   └── tempo/             # Tempo timesheet panels
│   ├── hooks/             # React hooks
│   ├── providers/         # React context providers
│   ├── services/          # Renderer-side services
│   ├── types/             # TypeScript types
│   ├── utils/             # Utilities
│   ├── App.tsx            # Main application component
│   └── main.tsx           # React entry point
├── convex/                # Serverless backend (13 tables, crons, lib/)
├── scripts/               # Helper scripts (bump, coverage, SFL debug, etc.)
├── assets/                # Images and design assets
├── public/                # Static assets
├── dist/                  # Vite build output (renderer)
├── dist-electron/         # Electron build output (main)
└── release/               # Packaged application binaries
```

## Keyboard Shortcuts

| Shortcut                         | Action            |
| -------------------------------- | ----------------- |
| `F11`                            | Toggle fullscreen |
| `Ctrl+Shift+I` / `Cmd+Option+I` | Toggle DevTools   |
| `Ctrl+NumpadAdd`                 | Zoom in           |
| `Ctrl+NumpadSubtract`            | Zoom out          |
| `Ctrl+Numpad0`                   | Reset zoom        |
| `Ctrl+Tab`                       | Next tab          |
| `Ctrl+Shift+Tab`                 | Previous tab      |
| `Ctrl+F4`                        | Close active tab  |
| `Ctrl+Shift+A`                   | Toggle assistant  |

## Troubleshooting

You can also run the validation script to check your GitHub org configurations:

```powershell
.\scripts\validate-github-orgs.ps1
```

## Activity Bar

The left-side activity bar provides access to 10 sections:

| Section        | Contents                                                        |
| -------------- | --------------------------------------------------------------- |
| **GitHub**     | PRs (My, Needs Review, Merged, Nudge), repo explorer, org/user |
| **Skills**     | Browse, recent, favorites                                       |
| **Tasks**      | Today, upcoming, projects (Todoist)                             |
| **Insights**   | Productivity, activity                                          |
| **Automation** | Schedules, run history                                          |
| **The Crew**   | Multi-agent project sessions                                    |
| **Tempo**      | Timesheet entries                                               |
| **Bookmarks**  | Categorized URLs with in-app browser tabs                       |
| **Copilot**    | Prompt box, results, usage, session explorer                    |
| **Settings**   | Accounts, appearance, PR config, Copilot SDK, advanced          |

## Set it Free Loop

This repository is governed by the **Set it Free Loop™** — a recursive automation system that detects quality findings, implements fixes on a draft PR, reviews them with multiple AI models, and hands clean pull requests to humans for the final merge decision.

<p align="center">
  <img src="assets/set-it-free-loop/sfl-architecture-flow.png" alt="Set it Free Loop Architecture" width="800" />
</p>

The loop runs continuously via GitHub Actions workflows:

| Stage                  | Workflow            | What it does                                                                       |
| ---------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| **Detect**             | Repo Audit          | Scans for documentation drift, stale artifacts, config hygiene                     |
| **Detect**             | Simplisticate Audit | Identifies unnecessary complexity and dead code                                    |
| **Claim**              | Issue Processor     | Claims `agent:fixable` issues and opens draft PRs                                  |
| **Review**             | PR Analyzers A/B/C  | Three independent AI models perform full-spectrum code review                      |
| **Implement / Revise** | Issue Processor     | Creates the first draft PR and applies follow-up analyzer feedback on later cycles |
| **Route**              | PR Label Actions    | Route blocked PRs back to the implementer and flip clean PRs to ready-for-review   |
| **Guard**              | SFL Auditor         | Repairs issue/PR label discrepancies and enforces one-issue-one-PR harmony         |

Human involvement is required for the final merge decision on every SFL PR. Low-risk fixes can still be prepared autonomously, but merging is human-owned.

> **Note**: The Discussion Processor is an event-driven workflow triggered when a GitHub Discussion is labeled. It is not a scheduled pipeline stage — audit workflows create `agent:fixable` issues directly.

See [SET_IT_FREE_GOVERNANCE.md](docs/SET_IT_FREE_GOVERNANCE.md) for the full policy including label taxonomy, retry limits, merge authority matrix, and escalation paths.

## Contributing

This is a personal productivity tool by HemSoft Developments. While contributions are welcome, please note this project is tailored to specific workflows and may not suit general use cases.

## License

MIT © HemSoft Developments

## Acknowledgments

Built upon the architecture of [hs-conductor](https://github.com/HemSoft/hs-conductor).
