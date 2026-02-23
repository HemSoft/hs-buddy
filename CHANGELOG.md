# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.105] - 2026-02-23

## [0.1.104] - 2026-02-23

## [0.1.103] - 2026-02-23

### Changed

- Remove duplicate pr-promoter.yml workflow

## [0.1.102] - 2026-02-23

### Added

- Add merge job to PR Promoter for approved PRs

## [0.1.101] - 2026-02-23

## [0.1.100] - 2026-02-23

### Added

- Conventional commit changelog with backfilled history

## [0.1.99] - 2026-02-23

### Fixed

- Allow all risk levels in sfl-add-issue prompt

### Added

- `sfl-add-issue` prompt for manual pipeline issue creation

## [0.1.97] - 2026-02-23

### Added

- Rebase conflict resolution, merge-failure handling, grouped audit issues, react-doctor scope

### Fixed

- Remove unused queue exports from services/index.ts (#80)
- Remove dead export `parsePRDetailViewId` in prDetailView.ts (#79)

## [0.1.94] - 2026-02-22

### Added

- Dynamic SFL badge and architecture infographic
- SFL architecture flow diagram
- Daily simplisticate audit workflow (1:00 AM EST)
- Workflow scheduling hygiene checks to repo-audit
- Set it Free Loop section and badge to README
- Per-workflow model diversity via engine frontmatter
- Merge job for auto-merging approved PRs in PR Promoter

### Fixed

- PR Analyzer models updated to Sonnet 4.6, Gemini 3 Pro, Opus 4.6
- PR Analyzer B model compatibility (gpt-5.3-codex)
- Engine blocks for PR Promoter, SFL Auditor, and PR Fixer workflows
- Correct false-completion entry for AGENTS.md in TODO.md (#67)
- Handle missing CI checks in PR Promoter merge job

### Changed

- Remove redundant cron triggers from dispatcher-gated workflows
- Remove duplicate SFL Auditor lock workflow and orphaned prompt
- Update ATTENTION.md — resolve completed issues, add run waste fix
- Update SFL-LAUNCH.md — status operational v2.0.0
- Add version number to SFL badge
- Add SFL-LAUNCH.md planning document
- Update Project Structure in README.md (#66)
- Clarify build output directories in .gitignore (#53)
- Update workflow docs, fix auditor bug, add promoter dispatch
- Remove stale react-doctor diagnostic output (#59)
- Delete orphaned assets/backup/ directory (#65)

## [0.1.73] - 2026-02-21

### Added

- SFL Dispatcher to gate gh-aw runs and eliminate no-op waste

### Fixed

- Mark human review handoff with `human:ready-for-review`
- PR promotion uses `gh pr ready` (deterministic undraft)
- Bootstrap gh auth for promoter draft→ready transition
- Wire GitHub token into promoter agent runtime
- Grant promoter write permissions for ready-for-review transition
- Recompile pr-promoter and restore strict-compatible frontmatter

### Changed

- Consolidate AGENTS.md, migrate skills, and add usage telemetry
- Rewrite pr-promoter and sfl-auditor as standard workflows
- Enforce workflow-only PR promotion and verified human handoff
- Default hs-buddy workflow credentials to fhemmerrelias
- Add manual PR draft-transition smoke workflow

## [0.1.53] - 2026-02-20

### Added

- PR Analyzer workflows (x3) — correctness, security, style
- PR Fixer workflow — authority model with cycle-aware fix loop
- PR Promoter workflow — un-drafts clean PRs for human review
- Debug skill with pipeline forensics arsenal
- Status skill and unblock analyzer/promoter no-op flow
- `status.prompt.md` for quick pipeline status checks
- `health.prompt.md` — pipeline harmony audit prompt
- Idempotency standing order in docs

### Fixed

- Three pipeline bugs causing issue #12 claim-fail-reset loop
- Replace HTML comment markers with visible text markers in all PR workflows
- Unblock promoter by adding empty promotion commit strategy
- Avoid promoter patch failures on large PR bodies
- SFL-auditor — add noop safe-output, require explicit signal

### Changed

- Rewrite AGENTS.md with agentic loop mission as primary focus

## [0.1.32] - 2026-02-19

### Added

- SFL-auditor workflow — detect and repair issue/PR label discrepancies
- Issue processor — 30min schedule, oldest-first, claim-then-fix pattern
- PR review pipeline design — draft PRs, analyzer+fixer+promoter lifecycle

### Fixed

- Issue processor — non-draft PRs, working `agent:in-progress` labeling

### Changed

- Rename weekly-repo-audit to repo-audit

## [0.1.24] - 2026-02-18

### Added

- AI review run tracking and improved PR thread UX
- Daily repo audit with agent-fixable issues + issue processor workflow
- Agentic workflow daily-repo-status

### Changed

- Move SFL operating model to relias-engineering/set-it-free-loop
- Rebrand as Set it Free Loop with alternate infographic suite
- Launch Agentic Loop Methodology with harmonized infographics
- Align vision and actionable roadmap to Set it Free Loop

## [0.1.15] - 2026-02-15

### Changed

- Simplify app shell and GitHub account resolution

## [0.1.14] - 2026-02-13

### Added

- Hierarchical PR details and automation sidebar drill-down

## [0.1.11] - 2026-02-10

### Added

- Auto-resolve GitHub account from repo URLs in Copilot prompts
- Configurable status bar background and foreground colors
- Per-account Copilot premium usage tracking
- "Needs a nudge" PR view for approved but unmerged PRs

### Changed

- Extract shared CopilotClient singleton and fix modal input blocking

## [0.1.7] - 2026-02-08

### Added

- Copilot SDK settings page with dynamic model fetching and account switching
- Husky pre-commit hooks with ESLint and markdownlint validation
- Auto revision bumping on every build
- CHANGELOG.md

### Fixed

- Handle CRLF line endings in CHANGELOG bump

### Changed

- Extract CopilotSidebar and GitHubSidebar components

## [0.1.0] - 2026-02-08

### Added

- Initial Electron + React + TypeScript scaffold
- Tree view navigation (left sidebar)
- Pull Request viewer with GitHub integration
- Multi-account GitHub support
- Copilot SDK prompt execution and result display
- Convex backend for real-time data sync
- Configuration system with electron-store
- Settings UI (Accounts, PR Settings, Appearance, Copilot SDK)
- About modal with version display
- Status bar with live stats
- Repo detail panel with issues and PRs
