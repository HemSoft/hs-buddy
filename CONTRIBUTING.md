# Contributing to Buddy

Thanks for your interest in contributing! This guide covers the setup, conventions, and expectations for PRs.

## Prerequisites

- [Bun](https://bun.sh/) (package manager & script runner)
- [Node.js](https://nodejs.org/) 20+
- [.NET Aspire CLI](https://aspire.dev/get-started/install-cli/) (AppHost orchestration)
- [Convex CLI](https://docs.convex.dev/getting-started) (`npm i -g convex`)

## Getting Started

```bash
# Clone and install
git clone https://github.com/HemSoft/hs-buddy.git
cd hs-buddy
bun run setup

# Start Convex dev server (separate terminal)
bun run convex:dev

# Start Electron dev mode
bun run dev
```

`bun run setup` installs the frozen root dependencies, installs the isolated
`aspire-apphost/` dependencies, and regenerates its ignored `.aspire/modules/`
SDK. The AppHost package is separate from the application dependency graph, and
warm `bun run typecheck` calls only perform a fast bootstrap preflight instead
of rerunning Aspire restore.

### Environment Variables

Create a `.env.local` file in the project root with:

```env
VITE_CONVEX_URL=<your-convex-deployment-url>
```

## Development Scripts

| Command                 | Purpose                                                  |
| ----------------------- | -------------------------------------------------------- |
| `bun run setup`         | Install root dependencies and restore the Aspire AppHost |
| `bun run dev`           | Start Electron in dev mode                               |
| `bun run test`          | Run all unit tests                                       |
| `bun run test:watch`    | Run tests in watch mode                                  |
| `bun run test:coverage` | Run tests with coverage (must be 100%)                   |
| `bun run test:mutation` | Run the blocking Stryker mutation-quality gate           |
| `bun run test:electron` | Run Electron main-process tests                          |
| `bun run test:convex`   | Run Convex server function tests                         |
| `bun run test:e2e`      | Run Playwright E2E tests                                 |
| `bun run lint`          | ESLint (zero warnings allowed)                           |
| `bun run typecheck`     | TypeScript across all tsconfigs                          |
| `bun run knip`          | Dead code & unused dependency detection                  |
| `bun run format:check`  | Prettier format verification                             |

## PR Conventions

### Required Merge Checks

The active [default-branch ruleset](https://github.com/HemSoft/hs-buddy/rules/15947577)
requires these GitHub Actions checks before a pull request can merge into `main`:

| Check context | Workflow            | Purpose                                                                         |
| ------------- | ------------------- | ------------------------------------------------------------------------------- |
| `ci-complete` | `CI`                | Aggregates lint, type, unit, Electron, IPC, Convex, E2E, memory, and build jobs |
| `npm audit`   | `Security Scanning` | Rejects high-severity dependency vulnerabilities                                |

Both checks must come from the GitHub Actions app (`integration_id: 15368`). The
ruleset also requires every change to the existing `main` branch to arrive
through a pull request. Its pull-request rule requires all review conversations
to be resolved and uses zero required approving reviews. Zero is intentional:
GitHub does not count an approval from the pull-request author, and this
repository currently uses the same `HemSoft` identity for authorship and merge
authorization.

A human authorizes a merge by explicitly selecting the exact pull request after
checking the required statuses and reviewer feedback, then using GitHub's merge
control. Automation acting for a human may merge only after that human names
the exact pull request in the automation's control channel. An issue label,
automated comment, workflow result, or general instruction does not authorize a
merge.

The ruleset has no bypass actors, does not exempt branch creation, does not
require a pull request branch to be updated with the latest `main` commit, and
allows the repository's configured merge, squash, and rebase methods. There is
no standing emergency bypass. If an urgent repair cannot use a pull request, a
repository administrator must record the reason in an issue or incident,
temporarily change the ruleset, make only the required repair, then immediately
restore and verify the ruleset. Any permanent bypass or policy change must be
documented here through a pull request.

The same ruleset requires CodeQL results for JavaScript and TypeScript. A
missing or running analysis blocks the update, as does a high or critical
security alert introduced by the proposed change. The CodeQL configuration,
scope, alert ownership, dismissal rules, and verification commands are in
[CodeQL scanning](docs/CODEQL.md).

Repository administrators can inspect the enforced policy with:

```bash
gh api repos/HemSoft/hs-buddy/rulesets/15947577 \
  --jq '{
    enforcement,
    conditions,
    bypass_actors,
    current_user_can_bypass,
    rules: [.rules[] | select(
      .type == "required_status_checks" or
      .type == "pull_request" or
      .type == "code_scanning"
    )]
  }'
```

### Dependency vulnerability response

Dependabot alerts and security-update pull requests are enabled. `HemSoft` owns
alert triage, and every high or critical alert must become assigned, tracked
work within the response times in
[Dependabot security response](docs/DEPENDABOT-SECURITY.md). The policy also
documents the required remediation checks and a safe tabletop verification.

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

### Mutation testing

Run `bun run test:mutation` before changing the mutation scope or threshold.
See [Mutation testing](docs/MUTATION-TESTING.md) for the maintained baseline,
exclusion reasons, report locations, runtime budget, and threshold-update
rules.

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
