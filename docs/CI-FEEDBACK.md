# CI feedback and memory qualification

CI exposes two aggregate checks. Use `ci-feedback` while implementing changes and
addressing review comments. It covers lint, type checks, unit, mutation, Electron,
IPC, Convex, browser E2E, and build checks. Start reviews and fix actionable feedback
as it arrives, without waiting for memory qualification. The required `ci-complete`
check also requires `test-electron-memory` and remains the final merge gate.

Keep a PR draft while working through review corrections. For changes that can
affect runtime memory, the expensive samples are deferred in drafts. The memory
check and `ci-complete` deliberately fail with a deferred-qualification explanation;
this is not a product regression. A green `ci-feedback` is the review signal.
Mark the PR ready after feedback is resolved. The `ready_for_review` event starts
full qualification. Every subsequent push to a ready PR requalifies its new
revision. Returning a PR to draft cancels obsolete work and defers qualification.
A draft result never establishes permission to merge the same SHA after promotion.

The existing SFL promoter advances drafts based on analyzer verdicts, so it does
not depend on a passing memory gate before marking ready. Other PR automation
must use `ci-feedback` during review and wait for the required checks on the final
candidate before declaring it merge-ready. Do not interpret the draft deferral as
a defect to fix or bypass.

## Change selection

Only pull requests can skip memory qualification. The allowlist contains `docs/`,
`e2e/`, `playwright.config.ts`, root README, CHANGELOG, CONTRIBUTING, and a
`package.json` change that alters only `version`. Dependency, script, lockfile,
production-code, packaging, workflow, and unknown changes run the full check.
The classifier compares the complete PR diff from its merge base, includes both
sides of renames, and fails on missing comparison data. A failed classifier,
failed sample, cancellation, or unexpected skip cannot pass the final gate.
Expand this allowlist only after proving a path cannot affect packaged output.

## Parallel memory samples

Three isolated Windows runners each package the same revision and collect one
fresh-profile sample. Each sample retains the five-minute warmup, five-second
settling delay, three navigation cycles, and all existing lifecycle scenarios.
Packaging happens once per runner, increasing setup cost in exchange for shorter
wall-clock time. Dependency and Electron download caches remain enabled.

Individual budget failures do not fail collection. Runtime errors still do.
The aggregate requires all three distinct samples from the current workflow SHA,
matching app and Electron versions and Windows image versions. It reuses the
existing median evaluator, preserving each profile's baseline-to-cleanup ratios.
Budgets remain 605 MiB total, 230 MiB renderer, and ten percent cleanup growth.
A noisy individual sample cannot replace or override the combined decision.

The result artifacts contain each sample and the combined median. Compare job and
step timings and sample variance with prior serial runs before claiming a measured
speedup. Shortening the warmup or changing budgets requires separate measurement
and baseline justification.

## Full coverage and releases

Pushes to `main`, manual dispatches, and merge groups always run full qualification.
A daily run at 07:23 UTC provides an additional backstop. GitHub can delay scheduled
runs, so a nightly success does not validate a different release candidate. Before
release, require successful checks for that candidate. HemSoft owns investigation
of failed default-branch or scheduled qualification before the next release.

Run the complete workflow manually with `gh workflow run ci.yml --ref <ref>` after
verifying the active GitHub identity. Merge queue triggers are supported here;
enabling a queue also requires checking every other required workflow's triggers.

## Local verification

```sh
bun x vitest run scripts/ci-memory-policy.test.ts scripts/ci-memory-workflow.test.ts perf/electron-memory-aggregate.test.ts perf/electron-memory.test.ts perf/electron-memory-model.test.ts
bun run perf:memory:electron --runs 3 --output electron-memory-result.json
```

The local command retains serial execution and enforces the same budgets. CI's
`--collect-only` option is for sample collection followed by mandatory aggregation;
it is not a successful memory qualification on its own.
