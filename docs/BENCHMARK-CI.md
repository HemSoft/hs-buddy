# Pre-merge benchmark gate

CI calls `.github/workflows/benchmarks.yml` for pull requests, main pushes,
merge groups, scheduled runs, and manual dispatch. `ci-complete` requires that
call to succeed. The standalone benchmark workflow also supports manual dispatch;
main trend runs now come through CI, avoiding a duplicate workflow per push.

## Scope and advisory decisions

Every PR receives a benchmark job. `scripts/bench-policy.ts` classifies its
changes before dependency installation or measurements:

- Runtime changes under `src`, `electron`, `convex`, `shared`, or `perf`, lockfile
  changes, dependency changes, and CI wiring changes run a blocking comparison.
- Documentation and ordinary test-only changes succeed with an explicit skip
  reason. A package version bump does not change dependency or harness policy.
- Benchmark definitions, benchmark scripts/configuration, setup fixtures, and
  toolchain changes run an advisory comparison. The summary and `bench-policy.json`
  list the exact paths or package fields responsible. Changing an ordinary
  production dependency remains blocking.

An advisory comparison records measured regressions without failing the job.
An unavailable baseline dependency installation is also explicitly reported
for advisory changes. Other execution failures and incomplete measurement files
fail qualification, so missing evidence cannot silently pass.

## Measurements and decision

Base and candidate run on the same GitHub-hosted Ubuntu runner, with Node 24.12.0
and Bun 1.3.7. Each revision installs its own frozen dependencies. Results cached
from another runner are never used as the gate baseline.

The job collects three interleaved pairs, in this order:

1. Base, candidate.
2. Candidate, base.
3. Base, candidate.

`bench-qualify.ts` requires three compatible, nonempty samples per revision and
builds per-benchmark medians using `bench-median.ts`. The established CI threshold
remains a throughput drop **greater than 20%**. Qualification additionally
requires nonoverlapping reported uncertainty bounds: duration-relative RME is
converted to reciprocal throughput bounds before comparison. These bounds do
not account for every source of runner variance; interleaving and medians reduce
order effects and single-sample noise. The local performance skill's five-run,
5% baseline checks remain a separate, stricter investigation procedure.

The job has a **15-minute timeout**, including setup, six benchmark invocations,
comparison, and upload. Benchmark CLI calls use `--run` to disable watch mode.
Timeouts fail the required gate. Record the hosted job duration when changing
sample count or benchmark definitions; do not silently increase the budget.

## Evidence and reproduction

The `bench-results` artifact retains policy, all six samples, both median files,
and `bench-summary.md` for 30 days. The same comparison is printed in the job log
and Actions step summary, including the advisory reason when applicable.

- Run `bun run test -- scripts/bench-policy.test.ts scripts/bench-qualify.test.ts
  scripts/benchmarks-workflow.test.ts scripts/ci-memory-workflow.test.ts` to check
  path classification, version-only skips, sample cardinality, thresholds,
  uncertainty handling, and aggregate failure handling.
- Run `bunx vitest bench --run --outputJson <sample.json>` in each revision to
  collect samples. Name them `bench-baseline-run-1.json` through `-3.json` and
  `bench-results-run-1.json` through `-3.json` in the comparison directory.
- Save `bench-policy.json` with `mode` (`enforce` or `advisory`) and nonempty
  `reasons`, then run the absolute path to `scripts/bench-qualify.ts` with Bun
  from that directory. A measured regression in enforce mode exits 1.
- For a hosted failure proof, temporarily slow a benchmarked production
  function and verify the benchmark job and `ci-complete` fail. Remove the
  slowdown and require passing CI before merge. If the same PR changes the
  harness, explicitly record any temporary enforce-mode override used for this
  proof and remove it before final review.

The initial #655 hosted failure/success proof and measured duration will be
recorded in its pull request before merge.
