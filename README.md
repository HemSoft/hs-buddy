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

# Configure environment variables (for tokens)
cp .env.example .env
# Edit .env with your GitHub token

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

### Phase 1: Foundation

- [x] Scaffold Electron + React project
- [x] Tree view navigation
- [x] PR viewer (first use case)
- [x] electron-store configuration system
- [x] Settings UI
- [ ] Multi-account GitHub support (architecture ready)
- [ ] Bitbucket integration

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
