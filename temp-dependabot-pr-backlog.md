# Dependabot PR Backlog Tracker

Clear all open Dependabot PRs under the HemSoft account using live PR state,
local verification where needed, and conservative merge ordering.

## Progress Tracking

- **Total Items**: 7
- **Completed**: 4
- **Remaining**: 3
- **Status**: In Progress
- **Last Updated**: 2026-06-12 03:39

## Items

- [x] HemSoft/hs-buddy#156 - actions/checkout 6.0.2 to 6.0.3
  - Current evidence: mergeable; full CI green.
  - Risk note: touches generated `.lock.yml` workflow files.
  - Result: squash-merged at 7c7ccc848685892ceec354caba260f393b0ee553.
- [x] HemSoft/hs-buddy#157 - @opentelemetry/instrumentation-dns 0.57.0 to 0.62.0
  - Current evidence: mergeable; lightweight Dependabot checks only.
  - Result: resolved after #161, full CI green, squash-merged at adff1a0068cce5edd217644622b019e4c97b7c1b.
- [x] HemSoft/hs-buddy#158 - convex 1.40.0 to 1.41.0
  - Current evidence: mergeable; lightweight Dependabot checks only.
  - Result: updated against main, local install/typecheck/Convex tests passed, full remote CI/security/benchmarks/E2E/lockfile workflow passed, squash-merged at b51a0a29d37c84789be91ffb5dfc0927e0d61165.
- [ ] HemSoft/hs-buddy#159 - sharp 0.34.5 to 0.35.0
  - Current evidence: mergeable; lightweight Dependabot checks only.
- [ ] HemSoft/hs-buddy#160 - vscode-jsonrpc 8.2.1 to 9.0.0
  - Current evidence: mergeable; lightweight Dependabot checks only.
- [x] HemSoft/hs-buddy#161 - @opentelemetry/sdk-logs 0.218.0 to 0.219.0
  - Current evidence: mergeable; lightweight Dependabot checks only.
  - Result: local typecheck and telemetry tests passed; squash-merged at 04bc7dd41720dcdbfafd8735198895c9ee51c373.
- [ ] HemSoft/TCE-Admin#2 - Newtonsoft.Json 12.0.2 to 13.0.2
  - Current evidence: open since 2022; local checkout absent.
  - Risk note: stale out-of-repo major dependency update; inspect separately.

## Merge Order

1. Low-risk or fully validated PRs first.
2. Runtime libraries requiring full local validation after lightweight-check PRs.
3. Major/stale/out-of-repo PRs only after repository inspection.

## Continuation Instructions

Use `gh pr view`/`gh pr list` as authoritative PR state. Before each merge,
confirm the PR is mergeable, inspect changed files, run local checks matching
the dependency blast radius, merge with squash/delete-branch when evidence is
clean, update this file, and update `TODO.md` if any risk remains.
