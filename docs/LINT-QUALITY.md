# Lint quality debt

## Measured first tranche

[Issue #657](https://github.com/HemSoft/hs-buddy/issues/657) starts from commit
`743b931fcaaba52e1607bc45ed04c015857044ec`. Measurements on September 5, 2026:

| Step                               | Warnings | File/rule buckets |
| ---------------------------------- | -------: | ----------------: |
| Previously committed allowance     |    1,222 |               623 |
| Live floor before production edits |    1,201 |               615 |
| First production tranche           |    1,114 |               612 |

The initial update removed stale allowances before changing production code.
The next update removed 87 warnings from the three production files with the
highest warning counts at that starting revision.

| Production file                                         | Before | After |
| ------------------------------------------------------- | -----: | ----: |
| `src/components/sidebar/github-sidebar/RepoNode.tsx`    |     59 |     8 |
| `src/components/ralph-loops/RalphLaunchForm.tsx`        |     27 |    12 |
| `src/components/sidebar/github-sidebar/OrgRepoTree.tsx` |     24 |     3 |

Void callbacks now use statement bodies. Callback arguments, call order, event
propagation, and rendered markup are preserved. Named group props, shared toggle
handlers, and a PR state configuration keep the longer callback formatting from
introducing function-length warnings. No rule limits or suppressions changed.

## Remaining categories

These counts include production code and tests. A bucket is one file/rule pair.

| Rule                                              | Warnings | Buckets |
| ------------------------------------------------- | -------: | ------: |
| `max-lines-per-function`                          |      377 |     285 |
| `@typescript-eslint/no-confusing-void-expression` |      367 |     108 |
| `@typescript-eslint/no-unnecessary-condition`     |      183 |      83 |
| `max-lines`                                       |       64 |      64 |
| `unicorn/no-negated-condition`                    |       46 |      33 |
| `unicorn/no-useless-undefined`                    |       34 |      16 |
| `unicorn/prefer-node-protocol`                    |       29 |      11 |
| `unicorn/prefer-number-properties`                |       10 |       8 |
| `@typescript-eslint/no-meaningless-void-operator` |        2 |       2 |
| `unicorn/no-lonely-if`                            |        2 |       2 |
| Total                                             |    1,114 |     612 |

## Follow-up cohorts

Each row defines a separate PR scope. Recount against its starting revision and
keep unrelated modules out of that PR. The listed modules define ownership for
the work; no individual assignee is implied.

| Order | Module scope                                                   | Categories and verification                                                                                                                                                                                                          |
| ----- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Terminal sidebar, then bookmark list/sidebar in separate PRs   | Remaining void callbacks. Start with `TerminalSidebar.tsx` at 18 total warnings, `BookmarkList.tsx` at 16, and `BookmarksSidebar.tsx` at 15. Run each component's interaction tests and relevant terminal/bookmark browser journeys. |
| 2     | Automation and Ralph launch form, one module per PR            | Unnecessary conditions, negated branches, and useless undefined values. Prove optional-data and validation behavior before simplifying guards; run launch/configuration tests.                                                       |
| 3     | Remaining renderer and hook modules, one feature per PR        | Remaining callback, condition, meaningless-void, and lonely-if warnings. Include API-boundary cases and event-order tests for that feature.                                                                                          |
| 4     | Largest production components, one component family per PR     | File/function length. Extract coherent components or helpers with explicit inputs; run focused tests, coverage, and per-function CRAP checks. Avoid splitting solely to hide line counts.                                            |
| 5     | Node-facing scripts and Electron modules, one directory per PR | Node protocol imports and number properties. Run the affected script or Electron suite and typecheck.                                                                                                                                |
| 6     | Test-only files, one suite per PR                              | Remaining category warnings, especially long test functions. Preserve assertions and test discovery; execute the whole affected suite.                                                                                               |

All cohorts must lower the total and affected bucket allowances. They may not
increase any other bucket, add blanket disables, or widen thresholds. Keep
production work ahead of test-only cleanup. Update this snapshot and the TODO
entry after each accepted tranche.

## Verification

```sh
bun run lint:quality
bun scripts/lint-quality.ts --update-baseline
bun run lint
bun run typecheck
bun run test:coverage
bun run test:mutation
bun run test:e2e
bun run crap:check
```

The baseline update is allowed only after warnings decrease. Its refusal path
was exercised by temporarily setting the total allowance to 1,113 with 1,114
live warnings: the command exited 1, reported refusal, and left the input file
unchanged. The exact accepted baseline bytes were restored afterward.

Focused component coverage includes repository/group expansion, keyboard
activation, selection, and launch validation. The repository mutation suite
covers the utilities listed in `stryker.config.json`; it does not mutate these
three components. PR verification must report that scope accurately.
