# PR audit: merges of 2026-08-21

Scope: the 12 PRs merged today, #537 through #548. All landed green (CI success on every check). Each diff was reviewed against the linked issue and the current working tree at `9def64f7`, and the suspicious spots were verified by reading final code or running the touched suites.

## Summary

No merge is broken today. Three items deserve follow-up work, in priority order:

1. **#547 regressed the org-email fallback loop.** A transient Slack HTTP error on the first guessed email now aborts the whole nudge instead of trying the second pattern. This is the one finding I would fix before the next release.
2. **#542 has a test that verifies semantics production does not have**, plus two leftovers: `buildMenu` is now dead production code, and nothing sets an application menu anymore, so macOS falls back to Electron's default menu bar.
3. **#537's backfill readiness guard is global**: during migration, count queries throw for every job, not just un-migrated ones.

Everything else is nits or documented trade-offs.

---

## #537 - Exact per-job run counts beyond 1,000 runs

Replaces the newest-1,000-run scan in `countsByJob` with a `@convex-dev/aggregate` table aggregate (`convex/lib/runStore.ts`), centralizes all `runs` writes through it, adds a schema version flag, a resumable 50-row/batch backfill cron, and a readiness guard.

Verdict: minor issues.

Verified correct: every production write to `runs` now flows through `runStore` (no direct `insert/patch/delete('runs')` outside tests); exactness past 1,000 rows is proven by test at `convex/__tests__/runs.test.ts:506`; the positional `values[index * 3]` mapping matches the aggregate library's result ordering.

Findings:

1. **low** - `convex/lib/runStore.ts:56`. The readiness guard is global. While any historical run lacks `runCountVersion`, `countsByJob` throws for every requested job, including brand-new jobs whose runs are fully aggregated. A deploy followed by a slow backfill breaks count consumers everywhere. Scope the guard to the requested jobs, or return partial data flagged unready.
2. **informational** - `convex/runs.ts:333`. `countsByJob` has no production caller yet (only tests). The motivating job badges are not wired up, so the breaking API reshape carries zero regression risk but also zero benefit until a caller lands.
3. **nit** - `convex/lib/runStore.ts:68`. Positional coupling between the queries array and the `values[index * 3 + k]` mapping. Reordering one without the other silently swaps total/completed/failed. A zipped structure would harden this.
4. **nit** - `convex/crons.ts:24`. Permanent 1-minute cron for a one-time migration. After completion each tick wakes the migrations runner to no-op forever. Deliberate per the comment, but droppable once backfill completes.
5. **nit** - `convex/__tests__/runs.test.ts:497`. Cleanup test uses `olderThanDays: -1` (a future cutoff) to force-delete terminal runs. Works, but obscure without a comment.

Tests: strong. Covers >1,000-row exactness, guard rejection pre-backfill, lifecycle transitions keeping the aggregate exact, cleanup decrements, and the 100-job cap boundary. Gap: backfill idempotency on re-run relies on library semantics rather than an explicit assertion.

## #538 - Prevent markRunning from resurrecting terminal runs

`markRunning` (`convex/runs.ts:137`) now fetches the run, throws if missing, and returns early unless status is `pending`.

Verdict: sound.

Verified the race matrix: late `complete` hits the terminal guard at `convex/runs.ts:173`; `cancel` rejects terminal states; the reaper patches failed via `patchRun`, which keeps the aggregate consistent. No hole remains where `markRunning` flips a finalized run back.

Findings:

1. **nit** - `convex/runs.ts:140`. The run is read for the guard, then `patchRun` re-reads it internally. One redundant read per call inside the same transaction.
2. **nit** - `convex/runs.ts:149`. The silent early return is indistinguishable from a successful transition. Matches the issue's idempotency criteria and how callers use it.

Tests: cover every source state, including failed-to-markRunning-to-complete preserving status, error, stats, and aggregate counts. Net coverage improved over what was deleted.

## #539 - Enforce Convex coverage thresholds in CI

CI now runs `bun run test:convex:coverage` so the 90% thresholds in `vitest.convex.config.ts:19` actually gate. Also adds `workflow_dispatch` to ci.yml and replaces the deleted approval script with inline dispatch-and-watch of CI on Dependabot lockfile commits.

Verdict: minor issues.

Findings:

1. **low** - `.github/workflows/dependabot-lockfile.yml:97` with `.github/workflows/ci.yml:13`. The dispatched CI inherits a branch-keyed concurrency group with `cancel-in-progress: true`. If Dependabot pushes a second lockfile update while the first dispatched run is mid-flight, the second dispatch cancels the first, and `gh run watch --exit-status` reports the cancellation as failure. Self-heals next update, but generates false reds. Key the group on event type or accept `cancelled` in the watch step.
2. **low** - `.github/workflows/dependabot-lockfile.yml:78`. The 60-second window (12 x 5s) for the dispatched run to appear can expire under GitHub queueing delay, failing the workflow even though CI will still run. Raise attempts or downgrade to a warning.
3. **nit** - `.github/workflows/dependabot-lockfile.yml:101`. `run_id` interpolated directly into shell instead of passed via `env:`. Value is server-generated numeric, so injection risk is nil, but env indirection is the safer convention.
4. **nit** - One-time transition: Dependabot branches created before this merge carry a ci.yml without `workflow_dispatch`, so dispatch fails for them until Dependabot recreates the branch.

Tests: the Vitest contract test pins the wiring (dispatch strings, coverage script, thresholds) but cannot exercise runtime behavior. The dispatch/poll/watch path was never executed end-to-end before merge and only fires on real Dependabot PRs.

## #540 - Keep pre-commit validation read-only until all checks pass

Defers `lint-staged` until markdown gate, full test suite, and typecheck pass; removes the full-tree `format:check` from pre-commit (CI keeps enforcing it); adds an isolated Git fixture proving both failure preservation and success ordering.

Verdict: minor issues, mostly acceptable trade-offs.

The issue's acceptance criteria are met for phase-1 failures: the fixture proves the index and worktree stay byte-identical when tests fail, and the success path formats and stages in order.

Findings:

1. **low** - `.husky/pre-commit:35-38`. Phase 2 itself can fail partway. If `coverage:ratchet` or `bump-revision.ts` errors after `lint-staged` already formatted and staged files, the commit aborts with hook-made mutations applied. That contradicts the strict reading of acceptance criterion 1 ("byte-for-byte unchanged"). Narrow in practice, but worth either making those steps non-fatal or documenting the residual window.
2. **nit** - Removing `format:check` means a local commit can land unformatted and only get rejected by CI, adding a push-fail-fix cycle. Documented in the PR body as intentional; flagging so nobody is surprised.
3. **nit** - `scripts/pre-commit-hook.test.ts:131`. Asserts the exact log sequence including `'bun scripts/bump-revision.ts'`. Brittle to reordering, though it deliberately pins the contract.

Tests: genuinely good. Real nested-git fixture, sanitized git-local env vars, binary index comparison on failure, and content assertions on success.

## #541 - About modal accessibility semantics

Full modal treatment: `role="dialog"` + `aria-modal` labeled by the Buddy heading, focus moved in on open, Tab trap with wrap, outside-focus redirect, Escape close, focus restore on unmount (with `returnFocusRef` so TitleBar returns focus to Help), semantic backdrop button replacing the presentation overlay.

Verdict: sound, with notes.

Findings:

1. **nit** - `src/components/AboutModal.test.tsx:79`. The StrictMode test also passes against the old ref-based implementation, so it documents intent rather than guarding the regression. The actual enforcement comes from lint rules. Acceptable given issue #444 asked for replay-safety coverage.
2. **nit** - `aria-modal="true"` without making the background inert. Screen readers in virtual-buffer mode may still reach background content. Common limitation; `inert` on the app root while open would close it.
3. **nit** - `getFocusableElements` (`AboutModal.tsx:16`) does not filter CSS-hidden elements. All controls here are always visible, so unreachable today.

Verified good: capture-phase listeners removed on unmount; cleanup restores focus via `isConnected` guard (`AboutModal.tsx:91`); backdrop button is `tabIndex={-1}` so it never enters the tab order; clicks inside the dialog cannot bubble to the backdrop because they are siblings, which fixes the old overlay's reliance on the `target === currentTarget` check.

Tests: strong lifecycle coverage (open/trap/wrap/outside-redirect/no-focusable fallback/Escape/restore), plus a TitleBar test proving Help-button restore.

## #542 - Rebind window behavior after macOS recreation

Introduces `MainWindowLifecycle` (create, track, rebind), registers IPC once with a live `WindowProvider`, resolves window controls and dialogs from each IPC sender, routes Ralph status pushes through the live provider.

Verdict: significant issues worth follow-up, none blocking.

The core design is right and the recreation matrix is well tested (`electron/windowLifecycle.test.ts`, repeated activate cycles in `electron/main.test.ts:177`). Findings:

1. **medium** - `electron/ipc/ralphHandlers.test.ts:14` mocks `ipcHandler` into a pass-through, then line 133 asserts `ralph:select-directory` _rejects_ when the sender has no window. In production the real `ipcHandler` (`electron/ipc/ipcHandler.ts:20`) catches that throw and **resolves** with `{ success: false, error }`. Two consequences:
   - The test verifies semantics the app does not have.
   - The resolve value violates the `Promise<string | null>` contract at `src/types/ralph.ts:172`. `RalphLaunchForm.tsx:862` treats any truthy result as a path, so `{ success: false }` would be stored as the repo path. Triggering requires a sender detached from a window, which is rare, but the contract gap is real. Either drop `ipcHandler` from this handler (matching `crewHandlers.CREW_ADD_PROJECT`, which lets the throw reject) or handle the error shape in the renderer.
2. **low** - `electron/menu.ts:30`. `buildMenu` is now dead production code; only its own test file references it. Knip does not flag exports used solely by tests, so the repo's zero-suppression policy misses it. Delete `buildMenu` (and the then-unused `dialog` import) or wire it somewhere real.
3. **low** - `electron/main.ts:282`. Nothing calls `Menu.setApplicationMenu` anymore. On Windows/Linux the frameless window hides the bar anyway, but on macOS Electron installs its default application menu (Edit roles, default View/Window items) where the custom File/View/Help template used to sit. If the intent is "no native menu," set an empty/minimal menu explicitly; if the intent is "default is fine," say so in the CHANGELOG entry.
4. **nit** - `bindWindowBehavior` (`electron/menu.ts:125`) is a pure alias for `registerKeyboardShortcuts`. One name would do.

Tests: the recreation coverage is the best in this batch. The gap is finding 1: the mocked wrapper hides the production error surface.

## #543 - Buffer Ralph output across stream boundaries

Replaces per-chunk `toString().split('\n')` with a UTF-8-aware `StringDecoder` line buffer per stream, flushing remainders on close and bounding lines at 64 KiB.

Verdict: sound.

Hand-verified: surrogate-pair-safe split at the 64 KiB boundary, remainder bounded after every write, flush idempotent, spawn-to-listener gap loses nothing (paused streams), close handler flushes before status update.

Findings:

1. **low** - `electron/services/ralphService.ts:646`. Bare-CR output (progress spinners emitting `\r` without `\n`) is never treated as a line boundary, so it accumulates until 64 KiB forces a fragment or the process ends. UI logs can lag minutes behind spinner-style tools. Bounded, so not a leak. Consider treating lone `\r` as a flush boundary.
2. **nit** - `electron/services/ralphService.ts:648`. `indexOf('\n')` restarts from 0 each iteration, O(n^2) on many-line chunks. Negligible at these chunk sizes.
3. **nit** - Test gaps: stderr's bounding branches are symmetric but untested; no test flushes an unterminated marker at close (process dies right after printing `=== ITERATION 9 ===` with no newline); no test for the `decoder.end()` replacement-character path.

Tests: seven new/extended tests covering split markers parsed once, independent stream interleaving, multi-byte UTF-8 across byte chunks, surrogate pairs at the fragment boundary, oversized remainders, CRLF, and post-error data. Substantive.

## #544 - Bootstrap Aspire before clean-checkout typecheck

Adds `bun run setup` (frozen install + non-interactive Aspire restore) and a `pretypecheck` preflight failing fast with guidance when generated SDK files or AppHost deps are missing.

Verdict: minor issues.

Verified Bun executes `pre*` lifecycle scripts, CI restores Aspire before typecheck so the preflight cannot false-positive there, and warm typechecks do only two `existsSync` calls.

Findings:

1. **low** - `scripts/setup.ts:18`. `spawnSync('aspire', ...)` resolves from PATH unpinned, while CI pins the CLI to `aspire.config.json`'s version with a SHA256-checked installer. Local/CI SDK drift is possible, and on Windows some distributions expose only a `.cmd` shim, which fails without `shell: true`. Print the pinned version or resolve equivalently to CI.
2. **nit** - `scripts/checkAspireBootstrap.ts:14`. Only `vscode-jsonrpc/package.json` is checked as a proxy for the whole AppHost tree; a partially installed tree missing `typescript` passes the preflight then fails `tsc` with raw compiler errors, the exact UX this PR set out to fix. Low likelihood.
3. **nit** - `scripts/aspire-layout.test.ts:50`. Asserts exact source substrings of `setup.ts`. Brittle coupling to formatting, though consistent with existing style in that file.

Tests: real unit tests against injected `fileExists` covering prepared, missing, and partially-missing states. Nothing executes `setup.ts` itself (it spawns processes).

## #545 - Initialize new PR indicators without render refs

Replaces render-phase ref mutation in `useNewPRIndicator` with a lazy `useState` initializer and collapses two setters into one atomic object update.

Verdict: sound.

The initializer is a pure read of the cache (StrictMode-safe), the single-object update makes count+URL atomic, and the public return shape is unchanged. One pre-existing timing gap (cache data landing between first render and effect subscription leaves initial counts stale until the next event) is unchanged by this PR.

Findings:

1. **nit** - `src/hooks/useNewPRIndicator.test.ts:132`. The new StrictMode test passes against the old implementation too; see #541 note above.

Tests: one added StrictMode test plus 13 existing ones covering seeding, mark-as-seen-before-load, and untracked keys.

## #546 - Reject invalid Ralph iteration and repeat values

Converts `iterations`/`repeats` state to strings, validates at submit with digits-only regex plus bounds (1-100 iterations, 1-50 repeats), forces safe defaults when a script mode disables a control, adds `noValidate` so app-owned errors show.

Verdict: sound.

The NaN/negative-zero/string-number surface is closed: `""`, `"0"`, `"1.5"`, `"100.000000000000001"` (which `Number()` would have rounded to exactly 100), and huge digit strings all fail. Backend already had its own range check (`electron/services/ralphService.ts:273`), so this is defense-in-depth, and the form is the only launch path.

Findings:

1. **low** - `src/components/ralph-loops/RalphLaunchForm.tsx:201`. The `?? DEFAULT_ITERATIONS` / `?? DEFAULT_REPEATS` fallbacks on the success path are unreachable: the early returns guarantee parsed values exist. Dead defensive code implying empty input is tolerated when it is not.
2. **nit** - `RalphLaunchForm.tsx:174`. `Number.isInteger` is redundant after the digits-only regex.
3. **nit** - When both fields are invalid, only the iterations error shows; the user must resubmit to see the repeats error.

Tests: each invalid case asserts the exact error text renders AND `onLaunch` was not called; boundaries assert numeric maxima reach `onLaunch`; disabled-mode tests assert stale values are replaced and `repeats` omitted. Not covered: whitespace-padded input.

## #547 - Handle Slack HTTP failures before parsing response bodies

Adds `assertSlackHttpSuccess()` before `res.json()` on all three Slack calls, special-cases `users_not_found` as a lookup miss, throws endpoint+status errors otherwise.

Verdict: minor issues, one worth fixing.

Findings:

1. **medium** - `electron/services/slackClient.ts:137`. Regression in `tryOrgEmailPatterns`. Pre-merge, an HTTP failure whose body parsed as `{ok:false}` returned null and the loop continued to the second candidate pattern. Post-merge, `assertSlackHttpSuccess` throws out of the loop, so a transient 429/502 on the _first guess_ fails the entire nudge without trying the second pattern. Slack rate limiting makes 429 realistic. Wrap the lookup call in try/catch inside the loop and continue, at minimum on transient statuses. The issue did not ask for this trade-off, and no test covers loop continuation, which is why it shipped unnoticed.
2. **low** - `slackClient.ts:74`. Non-`users_not_found` app errors (e.g. `invalid_auth`) previously collapsed into the not-found message; now they throw with endpoint detail. Intended per issue #446, and nothing string-matches the old text, but reviewers should know error text changed.
3. **low** - `slackClient.ts:78`. New `ok:true`-but-missing-user branch throws; no test covers it.
4. **nit** - Mixed conventions in one file: lookup throws, DM functions return `slackError` objects. Works because `nudgePRAuthor` catches everything, but two styles for one concept.

Tests: strong per-endpoint HTTP-failure tests asserting `json` was never called, non-JSON bodies covered, app-error preservation covered. Missing exactly the loop-continuation case from finding 1.

## #548 - Preserve defaults when optional component props are undefined

Replaces `{ ...DEFAULTS, ...props }` spreads (where explicit `undefined` clobbers defaults) with parameter defaults in `TaskPlannerView`, `AccountPicker`, `ModelPicker`, `RepoPicker`.

Verdict: sound.

Verified no falsy-clobbering regressions: `placeholder=""`, `className=""`, `allowNone={false}`, `persist={false}`, `disabled={false}` all pass through intact, since parameter defaults fire only on `undefined`. All 11 `ModelPickerProps` fields are handled.

Findings:

1. **nit** - `src/components/shared/ModelPicker.tsx:455`. Uses a `resolveModelPickerProps()` helper that rebuilds an object just to destructure it again, while the other three components destructure with defaults directly in the signature. Pure indirection; align with `AccountPicker.tsx:34`.
2. **nit** - Parameter defaults do not catch `null` where the old `??` fallback for `title` did. TypeScript forbids null here, so unreachable.

Tests: assert behavior, including a dedicated intentional-falsy test in `RepoPicker.test.tsx` and a persist-stays-false assertion in `AccountPicker.test.tsx`. Verified passing at HEAD.

---

## Cross-cutting observations

- **Process worked, mostly.** Every PR closed a real, evidenced issue, stated its risk level, and listed validation commands. CI was green everywhere. The two regressions found (#547's fallback loop, #542's error-surface mismatch) share a root cause: tests verified the happy path of the new code but not the behavior of the old code that silently disappeared. A quick "what did this replace, and who depended on it" pass would catch both.
- **Knip blind spot.** Exports referenced only by their own test files (now including `buildMenu`) survive the zero-suppression policy. Worth deciding whether that class of dead code should be swept manually once in a while.
- **Version/CHANGELOG hygiene is consistent.** Sequential bumps 0.1.954 through 0.1.961 across the batch, matching entries, no conflicts.
- **Test quality is generally high** for agent-authored fixes: real fixtures (#540), byte-exact aggregate assertions (#537/#538), UTF-8 boundary tests (#543). The exceptions are noted per-PR above.
