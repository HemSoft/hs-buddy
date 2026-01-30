# hs-buddy

> Your universal productivity companion

[![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue.svg)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-30-47848F.svg)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF.svg)](https://vitejs.dev/)

## Overview

**hs-buddy** is a desktop application built to help you manage your work and personal life. It sits on top of the HemSoft skills infrastructure (110+ skills), providing a beautiful interface to automate tasks, manage workflows, and access information from various sources all in one place.

Built on the same architecture as [hs-conductor](https://github.com/HemSoft/hs-conductor), hs-buddy is your magical tool for daily productivity.

## Features

- **Tree View Navigation**: Organize tools and views in a familiar left-sidebar structure
- **Pull Request Viewer**: Beautiful UI for viewing and managing your GitHub PRs
- **Skills Management**: Browse and interact with 110+ automation skills
- **Task Integration**: Connect with Todoist, GitHub, and other productivity tools
- **Unified Dashboard**: All your important information in one place

## Tech Stack

- **Electron 30** - Cross-platform desktop framework
- **React 18** - UI framework
- **TypeScript** - Type-safe development
- **Vite** - Lightning-fast build tool
- **Monaco Editor** - VSCode's editor component
- **React Complex Tree** - Tree view navigation
- **Allotment** - Resizable split panes

## Installation

### Prerequisites

- **Node.js 22+** - [Download](https://nodejs.org/)
- **Bun** (optional, for faster package management) - [Install](https://bun.sh/)

### Setup

```bash
# Clone the repository
git clone https://github.com/HemSoft/hs-buddy.git
cd hs-buddy

# Install dependencies
npm install
# or with bun
bun install

# Start development
npm run dev
# or with bun
bun run dev
```

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

```
hs-buddy/
├── electron/           # Main process (Electron)
│   ├── main.ts        # Window management, menus, IPC
│   └── preload.ts     # Secure context bridge
├── src/               # Renderer process (React)
│   ├── components/    # React components
│   ├── App.tsx        # Main application component
│   └── main.tsx       # React entry point
├── dist/              # Vite build output (renderer)
├── dist-electron/     # Electron build output (main)
└── release/           # Packaged application binaries
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `F11` | Toggle fullscreen |
| `Ctrl+R` / `Cmd+R` | Reload window |
| `Ctrl+Shift+I` / `Cmd+Option+I` | Toggle DevTools |

## Roadmap

### Phase 1: Foundation ✓
- [x] Scaffold Electron + React project
- [ ] Tree view navigation
- [ ] PR viewer (first use case)

### Phase 2: Integration
- [ ] Skills browser
- [ ] Task management
- [ ] Notifications

### Phase 3: Advanced Features
- [ ] Dashboard views
- [ ] Custom layouts
- [ ] Plugin system

## Contributing

This is a personal productivity tool by HemSoft Developments. While contributions are welcome, please note this project is tailored to specific workflows and may not suit general use cases.

## License

MIT © HemSoft Developments

## Acknowledgments

Built upon the architecture of [hs-conductor](https://github.com/HemSoft/hs-conductor).
