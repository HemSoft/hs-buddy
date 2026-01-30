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
- **Build Tool**: Vite 5
- **UI Libraries**:
  - `react-complex-tree` - Tree view navigation (left sidebar)
  - `allotment` - Resizable split panes
  - `@monaco-editor/react` - Code/text editing
  - `@vscode/webview-ui-toolkit` - VSCode-style UI components
  - `lucide-react` - Icons
- **Packaging**: electron-builder

## Project Vision

hs-buddy is designed to be **the** go-to tool for daily work and personal life management. It will:

1. **Manage 110+ Skills**: Provide a beautiful UI to interact with the extensive skill library
2. **Aggregate Information**: Display pull requests, tasks, notifications, and more in one place
3. **Left-Hand Navigation**: Tree view structure (like VS Code) for organizing different tools and views
4. **First Use Case**: UI version of the `hs-cli prs` command - display pull request information with a polished interface

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
│   ├── components/    # React components
│   ├── App.tsx
│   ├── main.tsx
│   └── *.css
├── dist/              # Built renderer (Vite output)
└── dist-electron/     # Built main process
```

## Roadmap

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
