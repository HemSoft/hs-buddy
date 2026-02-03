# hs-buddy Agent Context

## Project Overview

**hs-buddy** is your universal productivity companion - an Electron application that sits on top of the HemSoft skills infrastructure to help automate tasks, manage workflows, and provide insights across both work and personal life.

## Built Upon hs-conductor

This application is architecturally based on **[hs-conductor](D:\github\HemSoft\hs-conductor)**, specifically the `/admin` Electron app within that repository.

### Reference Architecture

When making decisions about project structure, UI patterns, or technical implementation, **always reference hs-conductor/admin** for consistency:

- **Electron Setup**: `D:\github\HemSoft\hs-conductor\admin\electron\main.ts`
- **React Structure**: `D:\github\HemSoft\hs-conductor\admin\src\`
- **Build Config**: `D:\github\HemSoft\hs-conductor\admin\vite.config.ts`
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
