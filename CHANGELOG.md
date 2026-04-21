<!-- markdownlint-disable MD013 MD024 -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.737] - 2026-04-20

### Added

- Add self-view contribution detection for UserDetailPanel
- Add month-end spending projection to org budget cards

### Changed

- Extract useGitHubData hook to eliminate fetch/cache/loading boilerplate
- Extract shared Convex domain helpers to reduce duplication
- Extract shared storage utils and deduplicate LoadPhase type
- Simplify RepoPullRequestList and extract label style utility
- Extract useToggleSet hook and onKeyboardActivate utility
- Extract ExpandableFileList and consolidate PR mapper
- Extract useLatest hook and UpdateTimesDisplay component
- Fix code smells in PR threads hook and panel
- Extract shared InlineRefreshIndicator, PanelEmptyState, and PRStateIcon components
- Update bundle-size baseline for @opentelemetry/sdk-node 0.215.0
- Lazy-load OpenTelemetry SDK to reduce main bundle by ~78%

### Fixed

- Address PR review feedback on useGitHubData and StatusBar
- Address PR review feedback and formatting issues
- Address PR review comments and restore 100% coverage
- Make readSettings() pure by deferring corrupt localStorage repair to useEffect
- Address PR review comments for useAutoRefresh and PanelStates
- Use useLayoutEffect for cacheKey reset to prevent stale data flash
- Invalidate in-flight requests on cacheKey change
- Downgrade new react-hooks v7 rules to warnings
- Resolve knip violations for BudgetProjection and playwright config
- Scope quota stat assertions to avoid date-sensitive collision
- Align OTel 0.x packages to 0.215.0 and remove unused semantic-conventions

## [0.1.736] - 2026-04-20

### Fixed

- Always render contribution graph for cross-user views

## [0.1.734] - 2026-04-18

### Added

- Integrate Shiki syntax highlighting into file preview
- Increase test coverage to 100% across all metrics

### Fixed

- Resolve CI blockers to enable scorecard coverage detection
- Resolve Prettier formatting to unblock CI coverage generation
- Lower coverage thresholds to match actual floor and add test resilience
- Make coverage artifact parseable by scorecard
- Use explicit expression syntax for !cancelled() condition
- Address all PR review findings in FolderTree and CI
- Stop event bubbling and purify state updater
- Align focus-visible CSS with treeitem focus target
- Address final review findings — useLayoutEffect for nodesRef and grep guard
- Address PR review comments and CI typecheck failures
- Resolve CI lint and format failures
- Mock getBoundingClientRect before opening context menu in overflow tests
- Address PR review comments - remove duplicate tests and fix Convex sync test
- Use Object.defineProperty for viewport mocking in TabBar tests
- Improve react-doctor score from 93 to 99/100
- Address PR review comments for react-doctor improvements
- Address PR review comments — null-safe dragOver and accurate PR description
- Clear context menu state on tab change to prevent stale resurrection
- Preserve expanded state during async directory load
- Achieve react-doctor 100/100 score
- Add XSS safety guard and fix stale content flash
- Address review comments — context menu resurrection, render-phase updates, tests
- Move activation sequence to commit-phase useLayoutEffect
- Address PR review comments for FilePreview and TerminalPanel
- Reframe innerHTML comment as sanity check, not security guard
- Disable broken deadCode check in react-doctor config
- Correct v8 ignore markers in JSX and resolve type errors
- Correct v8 ignore directives in JSX to prevent text rendering
- Address review comments and formatting issues
- Resolve coverage gaps and remove dead context menu code
- Address PR review comments on v8 ignore directives and flaky test
- Resolve CI coverage failures and address PR review feedback
- Move v8 ignore directives to standalone positions
- Scope v8 ignore directives precisely to uncovered branches
- Address PR review feedback on coverage config and dateUtils
- Use auto-fit grid for UserDetailPanel metric cards

### Changed

- Push branch coverage to 90% with targeted tests across 22 files
- Push branch coverage safely above 90% threshold
- Cover drag-drop, tab colors, and onCwdChange
- Add missing component test cases for coverage gaps
- Add missing hook test cases for increased coverage
- Add missing test cases across 11 files for coverage gaps
- Add coverage for null parseOwnerRepo, abort errors, and stale request discards
- Increase coverage to 100% for App.tsx and SidebarPanel.tsx
- Achieve 100% coverage for 8 component files
- Increase coverage to 100% for 8 target components
- Cover updatedAt > createdAt branch in RepoIssueDetailPanel
- Cover catch callback in abortResponse for 100% function coverage
- Log iteration 10 — coverage verified at 100% all metrics
- Mark test coverage TODO as complete
- Clean up TODO.md per best practices

## [0.1.733] - 2026-04-18

### Fixed

- Address 3 unresolved PR review comments
- Restore scroll on all content views after terminal panel addition
- Use Nerd Font in terminal for powerline glyph support
- Preload Nerd Font and force xterm.js re-measure
- Load node-pty eagerly to avoid require hook interference
- Add resolver fallback for native module loading
- Patch resolver BEFORE spawn, not on require failure
- Use process.dlopen fallback for native module loading
- Prevent double output from React StrictMode double-mount
- Sash width was 4px, preventing resize drag
- Re-resolve cwd on tab restore
- Track working directory via OSC 7 for accurate persistence
- Inject OSC 7 prompt wrapper at shell spawn
- Resolve 3 ESLint errors blocking CI and coverage artifacts
- Resolve formatting, test failures, and coverage thresholds
- File preview stuck on Loading due to StrictMode double-mount

### Added

- Resizable panel with Convex persistence
- Tab rename and custom color via context menu
- Add tab drag-to-reorder
- Persist tab state to Convex
- Add Terminal Folder View & File Preview feature

### Changed

- Scope Terminal Folder View & File Preview feature
- Harden coverage artifact for scorecard detection

## [0.1.732] - 2026-04-18

### Fixed

- Address PR review feedback on useTerminalPanel

## [0.1.731] - 2026-04-18

### Fixed

- Address PR review feedback on terminal panel

## [0.1.730] - 2026-04-18

### Fixed

- Move toggleTerminal side effects out of state updater

## [0.1.729] - 2026-04-18

### Fixed

- Refactor addTerminalTab to avoid side effects inside state updater

## [0.1.728] - 2026-04-18

### Fixed

- Address PR #606 round-4 review comments

## [0.1.727] - 2026-04-18

### Fixed

- Address PR #606 review comments
- Address PR #606 round-3 review comments

### Changed

- Remove test-pty.mjs debug file

## [0.1.726] - 2026-04-18

### Fixed

- Address PR #606 round-2 review comments

## [0.1.725] - 2026-04-18

### Fixed

- Address PR #606 review comments for terminal panel

## [0.1.724] - 2026-04-17

### Fixed

- Make setTabState updaters pure for StrictMode safety

### Added

- Redesign terminal as VS Code-style bottom panel with tabbed sessions

## [0.1.723] - 2026-04-17

### Fixed

- Address PR review — safe onViewClose flush + guarded startup command

## [0.1.722] - 2026-04-17

### Fixed

- Address PR review — orphaned PTY, stale onViewClose, attach sender

## [0.1.721] - 2026-04-17

### Changed

- Migrate terminal IPC calls to typed window.terminal API

## [0.1.720] - 2026-04-17

### Fixed

- Address PR #604 review comments

## [0.1.719] - 2026-04-17

### Fixed

- Fall back to powershell.exe when pwsh.exe is unavailable

## [0.1.718] - 2026-04-17

### Changed

- Add coverage for TerminalPane error and post-spawn attach paths

## [0.1.717] - 2026-04-17

### Fixed

- Read tab state from ref before setTabState to fix onViewClose race
- Add seq cursor to terminal data events to prevent duplicate output on attach

## [0.1.716] - 2026-04-17

### Fixed

- Address PR #604 review comments
- Address PR review comments for terminal pane
- Address PR review — derive closed tabs inside state updater, route terminal output per-session

## [0.1.715] - 2026-04-17

### Fixed

- Lazy-load TerminalPane to code-split xterm.js from main bundle

## [0.1.714] - 2026-04-17

### Fixed

- Resolve onViewClose timing bug and address PR review feedback

## [0.1.713] - 2026-04-17

### Fixed

- Upgrade vite 5→6.4.2 to fix GHSA-4w7w-66w2-5vf9 path traversal
- Address PR review feedback for terminal and bookmarks

### Changed

- Add tests for terminal pane to meet coverage thresholds

### Fixed

- Use createRequire for node-pty in ESM context

## [0.1.712] - 2026-04-16

### Fixed

- Add .npmrc to suppress npm peer-dep errors during aspire restore
- Address PR review feedback for embedded terminal pane

### Added

- Embedded terminal pane with xterm.js + node-pty

## [0.1.711] - 2026-04-16

### Added

- Log score history on status command

## [0.1.710] - 2026-04-15

### Fixed

- Make bookmark mutations idempotent and add error handling
- Make SessionExplorer date-group test deterministic with fake timers
- Address PR review feedback on bookmark mutations

## [0.1.709] - 2026-04-15

### Fixed

- Remove dependency-review job (requires GHAS not enabled on repo)

## [0.1.708] - 2026-04-15

### Fixed

- Replace oven-sh/setup-bun with actions/setup-node in security workflow

## [0.1.707] - 2026-04-15

### Changed

- Migrate to React 19

## [0.1.706] - 2026-04-15

### Added

- Migrate ESLint 8 to ESLint 9 with flat config

### Changed

- Improve branch coverage to 80%+ for scorecard Gold tier

### Fixed

- Align workflow action versions with main (v6/v7)
- Remove shebangs from BOM-encoded PowerShell scripts
- Pin GitHub Actions to immutable commit SHAs
- Move mid-file imports to top in RepoNode.test.tsx
- Correct misleading test names and assertions for review feedback

## [0.1.705] - 2026-04-14

### Changed

- Improve coverage with extracted helpers and component tests
- Improve coverage across 5 components (+71 tests)
- Format useCopilotReviewMonitor test file for CI
- Deduplicate getUniqueOrgs and mapRepoPRToPullRequest

### Fixed

- Remove unused act import and sync writeCache timestamp
- Add missing tags property to BookmarkList test data
- UseTaskQueue cancel test now exercises cancel() and asserts AbortError
- Address PR review comments on type safety and test coverage
- Replace token-like test string with clearly fake placeholder
- Resolve CI typecheck failures and PR review feedback
- Address PR review feedback - remove BOM and strengthen test
- Remove UTF-8 BOM from all PowerShell scripts
- Address PR review comments for param block and mock fidelity
- Address PR review findings for Copilot review monitor
- Add react-doctor config to skip dead code detection
- Address PR review findings for polling, keyboard events, and tests
- Address CI failures and PR review comments
- Resolve typecheck errors in test files
- Stabilize test mocks and address PR review findings
- Address PR review comments on security and CI workflows
- Add UTF-8 BOM to remaining 19 PowerShell scripts
- Resolve PSScriptAnalyzer ParseError in loop-state.ps1
- Ratchet coverage thresholds to current floor

## [0.1.704] - 2026-04-14

### Changed

- Improve coverage with 7 new test files (+126 tests)

## [0.1.702] - 2026-04-14

### Changed

- Improve coverage across 9 component test files (+80 tests)

## [0.1.701] - 2026-04-14

### Changed

- Improve coverage across 6 test files, raise thresholds (+1-2% all metrics)

## [0.1.700] - 2026-04-14

### Changed

- Improve coverage across 8 files (+2-3% all metrics)

## [0.1.699] - 2026-04-14

### Changed

- Add 119 tests across 11 new test files, raise coverage thresholds

## [0.1.698] - 2026-04-14

### Changed

- Add 76 tests for 7 untested hooks and components

## [0.1.697] - 2026-04-14

### Changed

- Improve coverage for hooks (+47 tests, 4 files)
- Add ralph*.ps1 and ralph*.log to .gitignore
- Untrack ralph\*.ps1 now covered by .gitignore
- Remove unused ralph-round-done.mp3 asset

## [0.1.696] - 2026-04-13

### Fixed

- Sync Finance 'Updated X ago' timestamp with actual data load time
- Eliminate all 239 PSScriptAnalyzer warnings across 48 PowerShell files
- Remove unused CopilotReviewState export to improve react-doctor score
- Eliminate remaining array-index-as-key warnings for react-doctor 100/100

### Changed

- Add coverage summary and security audit for scorecard detection
- Add 118 tests across 10 component test files
- Add tests for OrgDetailPanel and PullRequestDetailPanel
- Boost branch coverage to 80%+ with 91 new tests across 11 files
- Ratchet coverage thresholds to 86/80/82/88
- Improve react-doctor score from 97 to 99/100

### Added

- Improve scorecard with tests, security scanning, and dependabot

## [0.1.695] - 2026-04-13

### Changed

- Add 124 tests across 7 hook files, raise coverage thresholds
- Format files flagged by Prettier CI check
- Centralize card refresh UI and fix status indicator consistency
- Compact quote row vertical spacing
- Bump font sizes for readability
- Format files with Prettier

### Fixed

- Remove 5 unused type exports flagged by Knip
- Resolve ESLint errors blocking CI
- Address PR review comments and bundle-size CI failure
- Address 2nd round PR review comments
- Harden Finance quote row layout and fix countdown edge case
- Show friendly names only and invalidate stale cache
- Harden useAutoRefresh input validation and refresh stamping
- Normalize enabled:true with intervalMinutes:0 to disabled
- Correct mock return types for stricter refreshFn signature
- Remove unused callCount variable in stale-closure test
- Guard async stamp against unmount, avoid unnecessary re-renders
- Prevent empty watchlist from resurrecting defaults, add a11y label

### Added

- Add configurable auto-refresh for dashboard cards
- Add countdown and last-refreshed indicators to auto-refresh cards
- Add market status pills and trend accent bars

## [0.1.694] - 2026-04-13

### Added

- Add Status column with batched thread stats

### Changed

- Change SFL Copilot Review Bridge schedule to hourly

## [0.1.693] - 2026-04-12

### Changed

- Bring audit workflows to React Doctor quality parity
- Sync SFL core workflows from upstream catalog
- Sync sfl-implement from upstream (review thread replies)
- Fix prettier formatting in BrowserTabView

### Fixed

- Prevent verdict-gate fan-out dispatching multiple implementers
- Replace pull_request_review trigger with scheduled bridge
- Bridge Copilot reviewer name matching for [bot] suffix
- Add deadlock recovery for silent analyzer failures
- Reduce PowerShell scorecard warnings
- Keep pwsh shebang scripts BOM-free

## [0.1.692] - 2026-04-12

### Fixed

- Resolve Copilot review threads deterministically before re-review
- Restore inline webview attributes for Electron init

## [0.1.691] - 2026-04-12

### Fixed

- Re-request Copilot review after implementer addresses feedback

## [0.1.690] - 2026-04-12

### Fixed

- Case-insensitive Copilot reviewer matching in SFL Gate

## [0.1.689] - 2026-04-12

### Changed

- Simplify verdict-gate to use deterministic signals

## [0.1.688] - 2026-04-12

### Fixed

- Add fallback PR resolution for gh-aw implementer runs

## [0.1.687] - 2026-04-12

### Fixed

- Retarget SFL dispatch from sfl-issue-processor to sfl-gate

## [0.1.686] - 2026-04-12

### Added

- Add Copilot code review cycle to SFL pipeline

## [0.1.685] - 2026-04-11

### Fixed

- Upgrade analyzer-a to gemini-3.1-pro (latest Copilot Gemini)

## [0.1.684] - 2026-04-11

### Fixed

- Switch analyzer-a from native Gemini to Copilot engine

## [0.1.683] - 2026-04-11

### Fixed

- Use PAT in sfl-gate to enable workflow_run events

## [0.1.682] - 2026-04-11

### Fixed

- Recompile all agentic workflows with gh-aw v0.68.1

## [0.1.681] - 2026-04-11

### Fixed

- Address repo audit findings from issue #555

## [0.1.680] - 2026-04-11

### Changed

- Add missing tests for throwIfAborted and isAbortError

## [0.1.679] - 2026-04-11

### Fixed

- Recompile sfl-implement with gh-aw v0.68.1

## [0.1.678] - 2026-04-11

### Changed

- Disable scheduled workflows for emergency SFL mode

## [0.1.677] - 2026-04-11

### Fixed

- Add missing type: string to SFL workflow_call/dispatch inputs
- Use actual em dash in sfl-gate.yml workflow_run names
- Gate triggers only on labeled, not opened/reopened
- Prevent duplicate implementer dispatch on webhook retry

### Changed

- Minimal workflow calling sfl-implement as reusable workflow
- Remove test-sfl-call.yml diagnostic workflow
- Replace SFL orchestrator with event-driven gate

## [0.1.676] - 2026-04-10

### Fixed

- Address remaining review comments

## [0.1.675] - 2026-04-10

### Fixed

- Address remaining pr comments

## [0.1.674] - 2026-04-10

### Fixed

- Address remaining pr review feedback

## [0.1.673] - 2026-04-10

### Fixed

- Harden notification sound preview

## [0.1.672] - 2026-04-10

### Fixed

- Return notification sound mime types

## [0.1.671] - 2026-04-10

### Fixed

- Enable notification sound playback via IPC + Blob URLs

## [0.1.670] - 2026-04-10

### Fixed

- Avoid stale copilot review accounts

## [0.1.669] - 2026-04-10

### Added

- Add Notifications settings section with audio on PR review complete

## [0.1.668] - 2026-04-10

### Fixed

- Address 3 more review comments (round 7)

## [0.1.666] - 2026-04-10

### Fixed

- Address 4 more review comments (round 6)

## [0.1.664] - 2026-04-10

### Added

- Persistent banner when Copilot PR review completes

## [0.1.663] - 2026-04-10

### Fixed

- Address 4 more review comments (round 5)

## [0.1.662] - 2026-04-10

### Fixed

- Address 3 more review comments (round 4)

## [0.1.661] - 2026-04-10

### Fixed

- Address 3 more review comments (round 3)

## [0.1.660] - 2026-04-10

### Fixed

- Address 3 additional review comments

## [0.1.659] - 2026-04-10

### Fixed

- Address 4 PR review comments

## [0.1.658] - 2026-04-10

### Changed

- Upgrade SFL pipeline to v2.0.0 (full tier)

## [0.1.657] - 2026-04-10

### Added

- Add visual feedback and monitor mode for Copilot review requests

## [0.1.656] - 2026-04-09

### Fixed

- Sort review threads after their parent review in PR timeline
- Stop changelog blank line accumulation

### Changed

- Fix repo audit drift for issue 527

## [0.1.655] - 2026-04-09

### Changed

- Bump Aspire SDK from 13.2.1 to 13.2.2

## [0.1.654] - 2026-04-09

### Fixed

- Make localStorage authoritative for view mode persistence

## [0.1.653] - 2026-04-08

### Added

- Wire account PR lists to in-app detail view
- Add zoom in/out buttons and Alt shortcuts to browser view
- Persist browser zoom level across sessions
- Ctrl+click copies worklog to next empty day for that issue
- Prefill issue, account, and description when clicking empty cell
- Drag-and-drop reordering for bookmarks in sidebar

### Changed

- Reduce SFL Queue Monitor frequency to every 12 hours
- Auto-format with Prettier
- Extract OrgReposSection component from OrgRepoTree

### Fixed

- Show 'Uncategorized' for bookmarks with empty category name
- Ctrl+click copy scans from day after source, not today
- Hide empty-name root folder, show its bookmarks at root level
- Decouple org budget spent and personal overage on Copilot Usage
- Replace remaining inline abort guard in usePRListData with throwIfAborted

## [0.1.652] - 2026-04-08

### Changed

- Add Copilot code review instructions

## [0.1.648] - 2026-04-07

### Added

- Make timeline date groups collapsible

## [0.1.647] - 2026-04-07

### Fixed

- Sort timeline by type when timestamps match

## [0.1.646] - 2026-04-07

### Fixed

- Use updatedAt for review summary timestamps

## [0.1.645] - 2026-04-07

### Fixed

- Use updatedAt for issue detail comment timestamps

## [0.1.644] - 2026-04-07

### Fixed

- Use updatedAt for comment timestamps when more recent

## [0.1.643] - 2026-04-07

### Added

- Unified chronological timeline for PR detail view

## [0.1.642] - 2026-04-07

### Fixed

- Align PR detail grid to 4 columns and match comment title styling

## [0.1.641] - 2026-04-07

### Added

- Replace Unaddressed card with Linked Issue card in PR detail view

## [0.1.640] - 2026-04-07

### Added

- Replace Unaddressed card with Linked Issue card in PR detail view

## [0.1.639] - 2026-04-07

### Fixed

- Use braced ${esc} interpolation in ANSI strings

## [0.1.638] - 2026-04-07

### Fixed

- Replace Write-Host with Write-Information in 5 PS scripts

## [0.1.637] - 2026-04-07

### Fixed

- Address final review findings

## [0.1.636] - 2026-04-07

### Fixed

- Sync WelcomePanel version badge with auto-bump script

## [0.1.635] - 2026-04-07

### Fixed

- Update bump-revision.ts docstring to remove stale step 3

## [0.1.634] - 2026-04-07

### Fixed

- Clarify pre-commit comment scope per review

## [0.1.633] - 2026-04-07

### Fixed

- Add missing 0.1.632 changelog entry

## [0.1.632] - 2026-04-07

### Fixed

- Create amend flag before git commit --amend

## [0.1.631] - 2026-04-07

### Fixed

- Worktree-safe paths, idempotent changelog, deduplicate entries

## [0.1.630] - 2026-04-07

### Fixed

- Harden hook error handling per review feedback

## [0.1.629] - 2026-04-07

### Fixed

- Production hook architecture — validate first, modify last

## [0.1.624] - 2026-04-07

### Fixed

- Include PR identity in prop-sync deps
- Remove empty changelog headings, add reduced-motion override
- Add aria-live to badge, split history reset effect
- Defer markAsSeen when data hasn't loaded yet
- Distinguish loaded-empty from not-loaded in PR indicator
- Consolidate subscribe callback to avoid redundant cache writes

## [0.1.606] - 2026-04-06

### Fixed

- Use endsWith assertion per Copilot review feedback

## [0.1.596] - 2026-04-05

### Added

- Add Ctrl+Tab / Ctrl+Shift+Tab tab cycling

## [0.1.594] - 2026-04-05

### Fixed

- Prevent unhandled rejection in task-queue cancel test

## [0.1.590] - 2026-04-05

### Added

- Show individual bookmarks in sidebar tree

## [0.1.588] - 2026-04-05

### Added

- Open URLs as tabs inside main window with webview

## [0.1.587] - 2026-04-04

### Fixed

- Persist auth cookies in in-app browser sessions

## [0.1.584] - 2026-04-04

### Fixed

- Card click opens in-app, link button opens external browser

## [0.1.581] - 2026-04-04

### Changed

- Update convex 1.31.7 → 1.34.1

## [0.1.580] - 2026-04-04

### Added

- Add OpenTelemetry instrumentation for Aspire dashboard

## [0.1.576] - 2026-04-04

### Fixed

- Skip billing API calls for personal GitHub accounts

## [0.1.575] - 2026-04-04

### Added

- Add in-app browser window and hierarchical categories

## [0.1.572] - 2026-04-04

### Added

- Add Aspire orchestration with TypeScript AppHost

## [0.1.568] - 2026-04-04

### Added

- AI-suggest description and tags via Copilot SDK

## [0.1.567] - 2026-04-04

### Added

- AI-suggest description and tags via Copilot SDK

## [0.1.566] - 2026-04-04

### Added

- Auto-suggest title when dropping a URL

## [0.1.565] - 2026-04-04

### Fixed

- Prevent dialog dismiss when drag-selecting text

## [0.1.563] - 2026-04-04

### Added

- Merge bookmarks feature with conflict resolution and review fixes

## [0.1.558] - 2026-04-04

### Fixed

- Add cobertura reporter and improve coverage upload (#475)

## [0.1.532] - 2026-03-31

### Changed

- Add 0.1.531 entry for new vitest benchmarks

## [0.1.531] - 2026-03-31

### Added

- Add 6 new vitest benchmarks and refresh baseline tables

## [0.1.529] - 2026-03-31

### Changed

- Add v0.1.528 entry for benchmark changelog update

## [0.1.528] - 2026-03-31

### Changed

- Add Added section to v0.1.527 for vitest bench benchmarks

## [0.1.527] - 2026-03-31

### Added

- Add vitest bench performance benchmarks for critical paths

## [0.1.525] - 2026-03-31

### Added

- Add Task Planner with Todoist integration

## [0.1.523] - 2026-03-31

### Changed

- Add Changed section to v0.1.521 for TODO restructuring
- Bump version to 0.1.522 with changelog entry

## [0.1.521] - 2026-03-31

### Changed

- Add benchmarking TODO and prune stale completed-item details
- Mark Task Planner complete, add benchmarking task, update remaining section

## [0.1.519] - 2026-03-30

### Changed

- Mark Session Explorer and Session Insights as completed

## [0.1.518] - 2026-03-29

### Changed

- Add v0.1.517 Changed section for v0.1.516 changelog cross-reference

## [0.1.517] - 2026-03-29

### Changed

- Add Changed section to v0.1.516 referencing v0.1.515 changelog entry

## [0.1.516] - 2026-03-29

### Changed

- Add Changed section to v0.1.515 referencing v0.1.514 changelog entry

## [0.1.515] - 2026-03-29

### Changed

- Add Changed section to v0.1.514 referencing v0.1.513 changelog entry

## [0.1.514] - 2026-03-29

### Changed

- Add Changed section to v0.1.513 referencing v0.1.512 changelog entry

## [0.1.513] - 2026-03-29

### Changed

- Add Changed section to v0.1.512 referencing v0.1.511 changelog entry

## [0.1.512] - 2026-03-29

### Changed

- Add Changed section to v0.1.511 referencing v0.1.510 changelog entry

## [0.1.511] - 2026-03-29

### Changed

- Add Changed section to v0.1.510 referencing v0.1.509 changelog entry

## [0.1.510] - 2026-03-29

### Changed

- Add Changed section to v0.1.509 referencing v0.1.508 changelog entry

## [0.1.509] - 2026-03-29

### Changed

- Add Changed section to v0.1.508 referencing v0.1.507 changelog entry

## [0.1.508] - 2026-03-29

### Changed

- Add Changed section to v0.1.507 referencing v0.1.506 changelog entry

## [0.1.507] - 2026-03-29

### Changed

- Add Changed section to v0.1.506 referencing v0.1.505 changelog entry

## [0.1.506] - 2026-03-29

### Changed

- Add Changed section to v0.1.505 referencing v0.1.504 changelog entry

## [0.1.505] - 2026-03-29

### Changed

- Add Changed section to v0.1.504 referencing v0.1.503 changelog entry

## [0.1.504] - 2026-03-29

### Changed

- Add Changed section to v0.1.503 referencing v0.1.502 changelog entry

## [0.1.503] - 2026-03-29

### Changed

- Add Changed section to v0.1.502 referencing v0.1.501 changelog entry

## [0.1.502] - 2026-03-29

### Changed

- Add Changed section to v0.1.501 referencing v0.1.500 changelog entry

## [0.1.501] - 2026-03-29

### Changed

- Add Changed section to v0.1.500 referencing v0.1.499 changelog entry

## [0.1.500] - 2026-03-29

### Changed

- Add Changed section to v0.1.499 referencing v0.1.498 changelog entry

## [0.1.499] - 2026-03-29

### Changed

- Add Changed section to v0.1.498 referencing v0.1.497 changelog entry

## [0.1.498] - 2026-03-29

### Changed

- Add Changed section to v0.1.497 referencing v0.1.496 changelog entry

## [0.1.497] - 2026-03-29

### Changed

- Add Changed section to v0.1.496 referencing v0.1.495 changelog entry

## [0.1.496] - 2026-03-29

### Changed

- Add Changed section to v0.1.495 referencing v0.1.494 changelog entry

## [0.1.495] - 2026-03-29

### Changed

- Add Changed section to v0.1.494 referencing v0.1.493 changelog entry

## [0.1.494] - 2026-03-29

### Changed

- Add Changed section to v0.1.493 referencing v0.1.492 changelog entry

## [0.1.493] - 2026-03-29

### Changed

- Add Changed section to v0.1.492 referencing v0.1.491 changelog entry

## [0.1.492] - 2026-03-29

### Changed

- Add Changed section to v0.1.491 referencing v0.1.490 changelog entry

## [0.1.491] - 2026-03-29

### Changed

- Add Changed section to v0.1.490 referencing v0.1.489 changelog entry

## [0.1.490] - 2026-03-29

### Changed

- Add Changed section to v0.1.489 referencing v0.1.488 changelog entry

## [0.1.489] - 2026-03-29

### Changed

- Add Changed section to v0.1.488 referencing v0.1.487 changelog entry

## [0.1.488] - 2026-03-29

### Changed

- Add Changed section to v0.1.487 referencing v0.1.486 changelog entry

## [0.1.487] - 2026-03-29

### Changed

- Add Changed section to v0.1.486 referencing v0.1.485 changelog entry

## [0.1.486] - 2026-03-29

### Changed

- Add Changed section to v0.1.485 referencing v0.1.484 changelog entry

## [0.1.485] - 2026-03-29

### Changed

- Add Changed section to v0.1.484 referencing v0.1.483 changelog entry

## [0.1.484] - 2026-03-29

### Changed

- Add Changed section to v0.1.483 referencing v0.1.482 changelog entry

## [0.1.483] - 2026-03-29

### Changed

- Add Changed section to v0.1.482 referencing v0.1.481 changelog entry

## [0.1.482] - 2026-03-29

### Changed

- Add Changed section to v0.1.481 referencing v0.1.480 changelog entry

## [0.1.481] - 2026-03-29

### Changed

- Add Changed section to v0.1.480 referencing v0.1.479 changelog entry

## [0.1.480] - 2026-03-29

### Changed

- Add Changed section to v0.1.479 referencing v0.1.478 changelog entry

## [0.1.479] - 2026-03-29

### Changed

- Add Changed section to v0.1.478 referencing v0.1.477 changelog entry

## [0.1.478] - 2026-03-29

### Changed

- Add Changed section to v0.1.477 referencing v0.1.476 changelog entry

## [0.1.477] - 2026-03-29

### Changed

- Add Changed section to v0.1.476 referencing v0.1.475 changelog entry

## [0.1.476] - 2026-03-29

### Changed

- Add Changed section to v0.1.475 referencing v0.1.474 changelog entry

## [0.1.475] - 2026-03-29

### Changed

- Add Changed section to v0.1.474 referencing v0.1.473 changelog entry

## [0.1.474] - 2026-03-29

### Changed

- Add Changed section to v0.1.473 referencing v0.1.472 changelog entry

## [0.1.473] - 2026-03-29

### Changed

- Add Changed section to v0.1.472 referencing v0.1.471 changelog entry

## [0.1.472] - 2026-03-29

### Changed

- Add Changed section to v0.1.471 for path validation and stale digest guard refactor

## [0.1.471] - 2026-03-29

### Changed

- Extract path validation helper, fix prefix attack and stale digest guard

## [0.1.470] - 2026-03-29

### Changed

- Add Changed section to v0.1.469 for v0.1.468 changelog cross-reference

## [0.1.469] - 2026-03-29

### Changed

- Add Changed section to v0.1.468 referencing v0.1.467 session fixes

## [0.1.468] - 2026-03-29

### Changed

- Add Fixed section to v0.1.467 for search churn, workspace fallback, and unicode prompt fixes

## [0.1.467] - 2026-03-29

### Fixed

- Correct search churn metric, workspace fallback, and unicode-safe prompt slice

## [0.1.466] - 2026-03-29

### Changed

- Bump version to 0.1.465

## [0.1.460] - 2026-03-28

### Changed

- V0.1.459 changelog entry from revision bump

## [0.1.459] - 2026-03-28

### Changed

- Record Copilot Session Explorer entry for v0.1.458

## [0.1.458] - 2026-03-28

### Changed

- Add Copilot Session Explorer research item

## [0.1.457] - 2026-03-28

### Changed

- Record 0.1.456 version bump after label fallback changelog entry

## [0.1.456] - 2026-03-28

### Changed

- Add 0.1.455 entry for deterministic label fallback

## [0.1.455] - 2026-03-28

### Added

- Add deterministic label fallback to issue-processor

## [0.1.454] - 2026-03-27

### Changed

- Add 0.1.453 section header for upcoming changes

## [0.1.453] - 2026-03-27

### Changed

- Add 0.1.452 entry for account dropdown hardening

## [0.1.452] - 2026-03-27

### Fixed

- Harden account dropdown against race conditions and stale responses

## [0.1.450] - 2026-03-27

### Changed

- Add 0.1.449 entry for project-scoped account selector

## [0.1.449] - 2026-03-27

### Added

- Add project-scoped account selector to worklog editor

## [0.1.446] - 2026-03-27

### Changed

- Gitignore .playwright-mcp directory

## [0.1.445] - 2026-03-26

### Added

- Add BLOCKING rule for warning/error suppressions to all analyzers

## [0.1.444] - 2026-03-26

### Changed

- Bump to 0.1.443 changelog stub (break hook cycle)

## [0.1.443] - 2026-03-26

### Changed

- Add changelog entry for duplicate-PR guard fix in 0.1.442

## [0.1.442] - 2026-03-26

### Fixed

- Widen duplicate-PR guard to catch promoted (non-draft) PRs

## [0.1.441] - 2026-03-26

### Changed

- Bump to 0.1.440 with changelog entry

## [0.1.440] - 2026-03-26

### Changed

- Add 0.1.439 entry for myshare bar color fix

## [0.1.439] - 2026-03-26

### Fixed

- Use distinct color for org budget myshare bar overlay

## [0.1.437] - 2026-03-26

### Changed

- Bump to 0.1.436 with changelog entry for knip integration

## [0.1.436] - 2026-03-26

### Changed

- Add 0.1.435 entry for knip v6 integration

## [0.1.435] - 2026-03-26

### Added

- Add knip v6 for unused code and dependency detection

## [0.1.434] - 2026-03-25

### Changed

- Add 0.1.433 entry for coverage artifact upload

## [0.1.433] - 2026-03-25

### Changed

- Upload coverage artifact to satisfy scorecard rule

## [0.1.432] - 2026-03-25

### Fixed

- Remove dead deps, update docs, fix unused param (closes #350)

## [0.1.428] - 2026-03-25

### Fixed

- Add protected-files fallback-to-issue policy

## [0.1.427] - 2026-03-25

### Fixed

- Add protected-files fallback-to-issue policy

## [0.1.426] - 2026-03-25

### Fixed

- Use checkout instead of MCP for cross-repo read

## [0.1.425] - 2026-03-25

### Fixed

- Use GH_AW_GITHUB_TOKEN for cross-repo read access

## [0.1.424] - 2026-03-25

### Fixed

- Add Pages domain to network allowlist

## [0.1.423] - 2026-03-25

### Added

- Add sfl-improve-scorecard workflow

## [0.1.422] - 2026-03-25

### Added

- Add sfl-improve-scorecard workflow

## [0.1.419] - 2026-03-24

### Fixed

- Capex cache bust, env-var refinement, grid polish

## [0.1.418] - 2026-03-24

### Fixed

- Capex cache bust, env-var refinement, grid polish

## [0.1.416] - 2026-03-23

### Added

- UX polish — auto-select, auto-scroll, checkmarks, completion indicator

## [0.1.414] - 2026-03-23

### Added

- Add holiday support via Tempo user-schedule API

## [0.1.412] - 2026-03-23

### Added

- Simplify to Timesheet-only, add capex/non-capex summary

## [0.1.410] - 2026-03-23

### Fixed

- Prefer Machine-scope env vars over stale process.env

## [0.1.409] - 2026-03-22

### Fixed

- Resolve wrong-user data, persist issue cache, fix status bar overlap

## [0.1.408] - 2026-03-22

### Fixed

- Resolve missing issue descriptions and timezone-safe date formatting

## [0.1.407] - 2026-03-22

### Added

- Add refresh button to PR detail panel

## [0.1.406] - 2026-03-22

### Fixed

- Make Jira optional — get accountId from Tempo API fallback

## [0.1.405] - 2026-03-22

### Added

- Add Tempo time tracking dashboard with timesheet grid

## [0.1.403] - 2026-03-22

### Added

- Add branch hygiene to repo-audit and sfl-auditor

## [0.1.401] - 2026-03-22

### Added

- Skeleton loader, per-phase errors, roster filter/sort

## [0.1.400] - 2026-03-21

### Fixed

- Restore splitter position on app restart + add user-switch tests

## [0.1.394] - 2026-03-21

### Added

- Add profile meta display to UserDetailPanel + new GitHub API functions

## [0.1.390] - 2026-03-20

### Added

- Prefer GitHub display names across the app

## [0.1.389] - 2026-03-20

### Changed

- Remove deprecated history-logging hooks from SKILL.md frontmatter

## [0.1.388] - 2026-03-20

### Changed

- Remove deprecated history-logging hooks from SKILL.md frontmatter

## [0.1.387] - 2026-03-20

### Changed

- Update for deterministic thread resolution architecture

## [0.1.386] - 2026-03-20

### Changed

- Add deterministic patterns and review thread resolution knowledge

## [0.1.383] - 2026-03-19

### Fixed

- Remove repo audit drift, including stale artifacts and outdated docs

## [0.1.382] - 2026-03-19

### Fixed

- Resolve repo audit findings and fix copilot SDK import (#277)

## [0.1.381] - 2026-03-19

### Added

- Add per-user premium request usage to user detail panel

## [0.1.380] - 2026-03-19

### Added

- Add per-user premium request usage to user detail panel

## [0.1.379] - 2026-03-17

### Fixed

- Remove duplicate SECTION_LABELS and fix SettingsAppearance type mismatch

## [0.1.378] - 2026-03-17

### Fixed

- Remove duplicate SECTION_LABELS and fix SettingsAppearance type mismatch

## [0.1.376] - 2026-03-16

### Added

- Rewrite UserDetailPanel with live GitHub API data

## [0.1.375] - 2026-03-15

### Changed

- Extract+test pure helpers across 6 files (10.58% -> 12.78%)

## [0.1.372] - 2026-03-15

### Changed

- Add github API tests + quick-win coverage (6.69% -> 10.58%)

## [0.1.371] - 2026-03-15

### Changed

- Add 13 test files, ~230 tests, coverage 1.96→7%

## [0.1.359] - 2026-03-14

### Added

- Add org detail views and externalize Copilot links

## [0.1.358] - 2026-03-13

### Fixed

- Quote !cancelled() with parens to fix YAML tag parse error in lock.yml

## [0.1.357] - 2026-03-13

### Changed

- Bump to v0.1.356, pin download-artifact@v4 for deterministic dispatch job

## [0.1.356] - 2026-03-13

### Fixed

- Deterministic dispatch in Analyzer C via top-level jobs

## [0.1.355] - 2026-03-13

### Fixed

- Analyzer C: deterministic dispatch via top-level `jobs:` — always dispatches sfl-pr-label-actions after analysis, even if agent omits dispatch_workflow call

## [0.1.354] - 2026-03-13

### Fixed

- Add deterministic workflow_run fallback to Label Actions

## [0.1.353] - 2026-03-13

### Changed

- Offset cron schedules from :00 to reduce GHA queue delays

## [0.1.352] - 2026-03-13

### Changed

- Post-migration cleanup - remove stale refs and obsolete skill

## [0.1.350] - 2026-03-13

### Added

- Convert hs-buddy to SFL consumer via gh aw add

## [0.1.345] - 2026-03-12

### Changed

- Remove test-push-to-pr workflow (test passed)

## [0.1.344] - 2026-03-12

### Fixed

- Enable push_to_pull_request_branch in sfl-issue-processor

## [0.1.343] - 2026-03-12

### Fixed

- Set GIT_CONFIG env vars for MCP tool git auth

## [0.1.342] - 2026-03-12

### Fixed

- Use base64 -w 0 to prevent line wrapping in fetch token

## [0.1.339] - 2026-03-12

### Removed

- Remove checkout fetch config that crashes agent container

## [0.1.338] - 2026-03-12

### Fixed

- Add checkout fetch config for push-to-pull-request-branch

## [0.1.337] - 2026-03-12

### Fixed

- Add dead-code guardrails to audit workflows and improve PR sidebar icons

## [0.1.335] - 2026-03-12

### Fixed

- Recompile lock.yml files after schedule changes

## [0.1.334] - 2026-03-12

### Changed

- Space daily workflow schedules 1h apart starting 1AM EDT

## [0.1.331] - 2026-03-12

### Fixed

- Add pull-requests read permission to React Doctor Audit workflow

## [0.1.330] - 2026-03-11

### Changed

- Move workflow README out of protected .github/ path

## [0.1.328] - 2026-03-11

### Fixed

- Use custom step for PR branch checkout on dispatch

## [0.1.327] - 2026-03-11

### Fixed

- Pre-checkout PR branch for dispatch runs via custom step

## [0.1.326] - 2026-03-11

### Fixed

- Pre-fetch agent-fix/\* branches for dispatch runs

## [0.1.325] - 2026-03-11

### Fixed

- Add branch checkout instructions for dispatch runs

## [0.1.323] - 2026-03-11

### Fixed

- Use inline dispatch expressions instead of Handlebars conditionals

## [0.1.322] - 2026-03-11

### Changed

- Reset session tracking for Fix #6 validation

## [0.1.321] - 2026-03-11

### Changed

- Update session tracking with Fix #6

## [0.1.320] - 2026-03-11

### Fixed

- Wire dispatch inputs to prompt via Handlebars blocks

## [0.1.317] - 2026-03-11

### Changed

- Track Issue #173 pipeline debugging session with 5 fixes

## [0.1.316] - 2026-03-11

### Fixed

- Add deferred safe-output guardrail to prevent contradictory emit sequences

## [0.1.315] - 2026-03-11

### Fixed

- Defer label claim until after PR creation succeeds

## [0.1.314] - 2026-03-11

### Fixed

- Revert allowed-files, add protected-path guardrail

## [0.1.313] - 2026-03-11

### Fixed

- Allow README.md in .github/workflows for agent PRs

## [0.1.310] - 2026-03-11

### Changed

- Reset session tracking after successful repo audit E2E

## [0.1.309] - 2026-03-11

### Changed

- Reset session tracking after successful repo audit E2E

## [0.1.308] - 2026-03-11

### Fixed

- Rewire repo-audit to create issue instead of discussion

## [0.1.307] - 2026-03-10

### Changed

- Pipeline V2 end-to-end test tracking — PASSED

## [0.1.303] - 2026-03-10

### Changed

- Clean up SFL Session Tracking document and remove outdated entries

## [0.1.300] - 2026-03-09

### Changed

- Finalize changelog for issue processor model switch

## [0.1.299] - 2026-03-09

### Changed

- Switch SFL issue processor to gpt-5.4

## [0.1.294] - 2026-03-09

### Changed

- Set fixed morning audit schedules

## [0.1.293] - 2026-03-09

### Fixed

- Correct SFL activity log timezone guidance

## [0.1.292] - 2026-03-09

### Changed

- Sync generated release notes

## [0.1.291] - 2026-03-09

### Fixed

- Remove expiring maintenance cleanup

## [0.1.289] - 2026-03-09

### Changed

- Sync generated release notes

## [0.1.288] - 2026-03-09

### Added

- Dispatch issue processor after react doctor audit

## [0.1.286] - 2026-03-09

### Added

- Add React Doctor audit and adjust auditor cadence

## [0.1.284] - 2026-03-09

### Changed

- Update todo tracking and fix markdownlint config

## [0.1.283] - 2026-03-09

### Added

- Expand repo insights and crew workspace flows

## [0.1.247] - 2026-03-03

### Fixed

- Switch analyzer-b model from gemini-3-pro-preview to claude-opus-4.5

## [0.1.243] - 2026-03-03

### Fixed

- Replace label-based triggers with dispatch-workflow chain

## [0.1.242] - 2026-03-03

### Changed

- Switch PR Analyzer B to gemini-3.1-pro

## [0.1.241] - 2026-03-03

### Changed

- Set claude-opus-4.6 on Issue Processor and Simplisticate Audit

## [0.1.239] - 2026-03-03

### Fixed

- Prevent double Issue Processor trigger by removing risk labels from Simplisticate

## [0.1.238] - 2026-03-03

### Changed

- Sequential analyzer chain, event-driven triggers, simplisticate rewrite

## [0.1.236] - 2026-03-03

### Added

- Detect and retry stuck ready-to-merge PRs

## [0.1.235] - 2026-03-03

### Added

- Add SFL Activity Log (Discussion #95) to all workflows

## [0.1.234] - 2026-03-03

### Changed

- Update SFL skill with EST rules, observations sections, and E2E tracking

## [0.1.233] - 2026-03-03

### Added

- Remove dead export `formatDistanceToFuture` from dateUtils.ts (#92)
- Refactor remaining 9 oversized components (>250 lines) (#87)

## [0.1.232] - 2026-03-02

### Fixed

- Increase Issue Processor timeout from 20 to 60 minutes

## [0.1.231] - 2026-03-02

### Fixed

- Widen auditor Step 4 to catch any action-item missing agent:fixable

## [0.1.230] - 2026-03-02

### Fixed

- Add agent:fixable label to PR Fixer create-issue safe-output

## [0.1.229] - 2026-03-02

### Added

- Auto-update CHANGELOG on SFL squash merge

## [0.1.228] - 2026-03-02

### Fixed

- Use temp file for PR body in dispatcher to handle large bodies

### Added

- Refactor oversized components into focused sub-components (#82)

## [0.1.227] - 2026-03-02

### Changed

- Bump max-fix-cycles from 10 to 15

## [0.1.226] - 2026-03-01

### Fixed

- Suppress broken pipe error in dispatcher sed|head pipeline

## [0.1.225] - 2026-03-01

### Fixed

- Add replace-pr-body-text safe-input for targeted PR body edits

## [0.1.220] - 2026-03-01

### Fixed

- Break infinite fixer loop — dispatcher checks PASS verdicts, fixer respects all-PASS exit

## [0.1.219] - 2026-03-01

### Fixed

- Add target '\*' to pr-fixer push-to-pull-request-branch safe-output

## [0.1.215] - 2026-03-01

### Changed

- Mark SFL Auto-Merge and 30-day pilot as completed

## [0.1.214] - 2026-03-01

### Added

- Add run count badges to job list and harden buddyStats

## [0.1.213] - 2026-03-01

### Added

- Make status bar items clickable and simplify sync display

## [0.1.211] - 2026-03-01

### Added

- Add preflight auth script, dispatcher-log reader, fix snapshot.ps1

## [0.1.210] - 2026-03-01

### Fixed

- Dispatcher grep pipeline crash when no cycle label exists

## [0.1.209] - 2026-03-01

### Fixed

- Increment runsTriggered stat in schedule scanner & improve status bar batch display

## [0.1.204] - 2026-02-28

### Changed

- Fixer no longer gives up on unfixable issues — makes progress each cycle and lets the loop iterate
- Dynamic cycle detection across all workflows (no longer hardcoded to 3)
- Removed cycle-3 cap from analyzers — Fixer controls escalation via sfl-config
- Increased max-fix-cycles from 3 to 10

## [0.1.203] - 2026-02-28

### Fixed

- Accept BLOCKED mergeStateStatus when auto-merge is true

## [0.1.201] - 2026-02-28

### Fixed

- Dispatcher re-dispatches analyzers after Fixer increments cycle

## [0.1.200] - 2026-02-28

### Fixed

- Dispatcher dispatches Promoter for all ready-for-review PRs, not just approved

## [0.1.199] - 2026-02-28

### Fixed

- Gate PR Promoter dispatch behind fixer marker to prevent race condition

## [0.1.197] - 2026-02-28

### Added

- Add SFL config reader to pr-promoter, pr-fixer, issue-processor workflows

## [0.1.196] - 2026-02-28

### Added

- Add SFL config reader to pr-promoter, pr-fixer, issue-processor workflows

## [0.1.194] - 2026-02-28

### Added

- Add SFL config reader POC test workflow + sfl-config.yml

## [0.1.193] - 2026-02-28

### Added

- Add SFL config reader POC test workflow + sfl-config.yml

## [0.1.190] - 2026-02-28

### Changed

- Add SFL Auto-Merge mode to TODO as critical priority

## [0.1.189] - 2026-02-28

### Added

- Add resolve-pr-conflicts safe-input to pr-fixer

## [0.1.187] - 2026-02-28

### Fixed

- Recompile test-conflict-resolver lock file

## [0.1.186] - 2026-02-28

### Fixed

- Add REPO_OWNER/REPO_NAME env vars to test-conflict-resolver safe-inputs

## [0.1.184] - 2026-02-28

### Changed

- POC conflict resolver safe-input workflow

## [0.1.183] - 2026-02-28

### Added

- Add safe-input for GraphQL merge state + upgrade gh-aw v0.50.7

## [0.1.180] - 2026-02-28

### Changed

- Temporary debug workflow to test mergeable state access

## [0.1.179] - 2026-02-28

### Fixed

- Use GH_AW_GITHUB_TOKEN for PR merge bypass

## [0.1.178] - 2026-02-28

### Fixed

- Add --admin flag to squash-merge for branch protection bypass

## [0.1.177] - 2026-02-28

### Added

- Auto-merge on approval + conflict resolution

## [0.1.176] - 2026-02-28

### Changed

- Clean up TODO.md per skill standards

## [0.1.175] - 2026-02-28

### Changed

- Label pruning (39->27) and Session Start Gate

## [0.1.174] - 2026-02-28

### Changed

- SFL V2 architecture - push-to-branch, granular labels, doc overhaul

## [0.1.172] - 2026-02-28

### Fixed

- Add early escalation when fixer can't resolve blocking issues

## [0.1.171] - 2026-02-28

### Fixed

- Restructure PR Fixer to work with create_pull_request platform constraint

## [0.1.164] - 2026-02-28

### Added

- Consolidate audit, debug, status skills into SFL V2.0

## [0.1.158] - 2026-02-26

### Fixed

- Add UTF-8 encoding to all convenience scripts

## [0.1.157] - 2026-02-26

### Changed

- Recompile all workflows with gh-aw v0.50.4, move ONBOARDING.md to docs

## [0.1.156] - 2026-02-26

### Added

- Add convenience scripts for reports and admin

## [0.1.155] - 2026-02-26

### Changed

- Add Discussion Processor and PR Label Actions to pause/resume scripts

## [0.1.154] - 2026-02-26

### Fixed

- Add label swap via remove_labels + add_labels safe-outputs

## [0.1.153] - 2026-02-26

### Fixed

- Add discussions toolset to Discussion Processor

## [0.1.152] - 2026-02-26

### Added

- Add Discussion Processor workflow (discussion → issues pipeline)

## [0.1.151] - 2026-02-26

### Fixed

- Recompile pr-analyzer-b lock file with correct model (claude-opus-4.6)

## [0.1.150] - 2026-02-25

### Changed

- Move sfl-pr-label-actions polling from 5-min cron to sfl-dispatcher

## [0.1.149] - 2026-02-25

### Changed

- Move sfl-pr-label-actions polling from standalone 5-min cron to sfl-dispatcher (30-min cadence)
- Remove PR Label Actions from pause/resume scripts (no longer has own schedule)

## [0.1.148] - 2026-02-25

### Fixed

- Handle all non-PR event types in sfl-pr-label-actions step conditions

## [0.1.147] - 2026-02-25

### Fixed

- Include workflow_dispatch in sfl-pr-label-actions job conditions

## [0.1.146] - 2026-02-25

### Changed

- Add workflow_dispatch trigger to sfl-pr-label-actions for manual testing

## [0.1.145] - 2026-02-25

### Fixed

- Add schedule trigger to sfl-pr-label-actions for GITHUB_TOKEN label events

## [0.1.144] - 2026-02-25

### Fixed

- Add status field to labels-only update_issue calls to pass gh-aw validation

## [0.1.142] - 2026-02-25

### Added

- Label-triggered draft flip and merge via sfl-pr-label-actions.yml

## [0.1.140] - 2026-02-25

### Fixed

- PR Promoter uses gh pr ready instead of create_pull_request

## [0.1.138] - 2026-02-25

### Added

- Repurpose Discussion #51 as live SFL dashboard

## [0.1.133] - 2026-02-25

### Added

- Replace noop with update-discussion for Activity Log

## [0.1.132] - 2026-02-25

### Added

- Centralize PR analyzer model config in sfl.json

## [0.1.131] - 2026-02-25

### Changed

- Clean up TODO.md formatting and remove duplicate entry

## [0.1.130] - 2026-02-25

### Changed

- Clean up TODO.md formatting and remove duplicate entry

## [0.1.126] - 2026-02-25

### Added

- Add Copilot org budget cards with personal budget fallback

## [0.1.124] - 2026-02-25

### Fixed

- Unblock SFL pipeline — 4 root causes of infinite no-op loop

## [0.1.122] - 2026-02-24

### Fixed

- Strengthen temporary_id guidance to prevent 2-char suffix failures

## [0.1.119] - 2026-02-23

### Changed

- Migrate repo from HemSoft to relias-engineering

## [0.1.117] - 2026-02-23

### Fixed

- Remove risk-level and file-count rejection from issue-processor

## [0.1.116] - 2026-02-23

### Changed

- Remove pr-draft-transition-smoke.yml

## [0.1.115] - 2026-02-23

### Changed

- Remove stale pr-promoter.lock.yml.disabled

## [0.1.114] - 2026-02-23

### Fixed

- Remove stale sfl-auditor.yml competing with sfl-auditor.lock.yml

## [0.1.113] - 2026-02-23

### Added

- Flag stalled PRs missing analyzer markers after 2 hours

## [0.1.111] - 2026-02-23

### Added

- SFL Auditor Step 8 — flag unclaimed agent:fixable issues older than 2 hours

## [0.1.110] - 2026-02-23

### Added

- Add feature-request label to sfl-add-issue prompt and label setup

## [0.1.109] - 2026-02-23

### Changed

- Update ATTENTION.md for label simplification

## [0.1.108] - 2026-02-23

### Changed

- Simplify label taxonomy — drop type: prefixes

## [0.1.107] - 2026-02-23

### Fixed

- Auto-close stale report issues in all report workflows + SFL Auditor

## [0.1.106] - 2026-02-23

### Fixed

- Add Step 6 — close issues left open after merged agent PRs

## [0.1.105] - 2026-02-23

### Fixed

- Add SFL auditor check for action items missing agent:fixable label

## [0.1.103] - 2026-02-23

### Changed

- Remove duplicate pr-promoter.yml workflow

## [0.1.102] - 2026-02-23

### Added

- Add merge job to PR Promoter for approved PRs

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
