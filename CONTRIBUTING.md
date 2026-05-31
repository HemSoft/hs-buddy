# Contributing to Buddy

Thanks for your interest in contributing! This guide covers the setup, conventions, and expectations for PRs.

## Prerequisites

- [Bun](https://bun.sh/) (package manager & script runner)
- [Node.js](https://nodejs.org/) 20+
- [Convex CLI](https://docs.convex.dev/getting-started) (`npm i -g convex`)

## Getting Started

```bash
# Clone and install
git clone https://github.com/HemSoft/hs-buddy.git
cd hs-buddy
bun install

# Start Convex dev server (separate terminal)
bun run convex:dev

# Start Electron dev mode
bun run dev
```

### Environment Variables

Create a `.env.local` file in the project root with:

```env
VITE_CONVEX_URL=<your-convex-deployment-url>
```

## Development Scripts

| Command | Purpose |
|---------|---------|
| `bun run dev` | Start Electron in dev mode |
| `bun run test` | Run all unit tests |
| `bun run test:watch` | Run tests in watch mode |
| `bun run test:coverage` | Run tests with coverage (must be 100%) |
| `bun run test:electron` | Run Electron main-process tests |
| `bun run test:convex` | Run Convex server function tests |
| `bun run test:e2e` | Run Playwright E2E tests |
| `bun run lint` | ESLint (zero warnings allowed) |
| `bun run typecheck` | TypeScript across all tsconfigs |
| `bun run knip` | Dead code & unused dependency detection |
| `bun run format:check` | Prettier format verification |

## PR Conventions

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint:

```text
type(scope): subject
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

- Subject must be lowercase (no start-case, PascalCase, or UPPER_CASE)
- Header max length: 100 characters

### Branch Naming

Use descriptive branch names prefixed with the type:

```text
feat/terminal-folder-view
fix/coderabbit-edit-detection
docs/contributing-guide
```

### Pre-commit Hooks

Husky runs automatically on commit:

1. **lint-staged** — Prettier + ESLint on staged files
2. **Full test suite with coverage** — must maintain 100% coverage
3. **Typecheck** — all four tsconfig projects

> **Tip**: Use `--no-verify` only if you've already validated locally.

## Testing Expectations

- **100% code coverage** is enforced on statements, branches, functions, and lines
- Use `/* v8 ignore start */` / `/* v8 ignore next */` only for genuinely untestable paths (IPC bridges, audio playback, thin API wrappers)
- New features must include tests — no exceptions
- Test files live alongside source: `Component.test.tsx` or in a dedicated test file

### Test Stack

- **Vitest** with happy-dom environment
- **React Testing Library** for component tests
- **Playwright** for E2E tests

## Code Quality

- ESLint enforces `no-explicit-any` as error
- Catch clauses must be typed: `catch (_: unknown)`
- Max cyclomatic complexity: 10 for async arrow functions
- Knip must report zero findings (no dead exports or unused deps)
- This is a frameless Electron app — all menus live in `TitleBar.tsx`, not Electron's native menu

## Architecture Notes

- **Renderer**: React 19 + TypeScript + Vite
- **Main process**: Electron with IPC handlers in `electron/`
- **Backend**: Convex serverless (schemas in `convex/`)
- **GitHub API**: Domain modules under `src/api/github/`
- **Review providers**: Extensible pattern in `src/reviewProviders/`

## Getting Help

Open an issue or reach out to `@relias-engineering/developer-experience`.
