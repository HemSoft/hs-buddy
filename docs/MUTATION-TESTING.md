# Mutation testing

Buddy uses [StrykerJS](https://stryker-mutator.io/) 9.6.1 with its Vitest
runner to check whether the unit suite detects deliberate changes to production
logic. Version 9.6.1 is pinned because 10.0.0's Babel 8 printer crashes on the
repository's TypeScript function-type syntax before its test run starts. The
blocking command is:

```bash
bun run test:mutation
```

The command is noninteractive. It exits with code 1 when the mutation score is
below the `thresholds.break` value committed in `stryker.config.json`.

## Initial scope

The first cohort is an explicit allowlist of pure application logic. These
files cover parsing, security, budgeting, keyboard behavior, review prompts,
and diff display without requiring Electron, Convex, or browser lifecycle
fixtures. Keeping the cohort bounded gives the mutation step a 15-minute budget
on a fresh GitHub-hosted runner.

The exact production file list lives in `stryker.config.json`, and
`vitest.mutation.config.ts` pairs it with the corresponding focused unit tests.
The dedicated test include list prevents instrumented modules from pulling in
unrelated component suites whose module mocks can behave differently across
platforms. Add production and test files together as the suite grows. Do not
replace either allowlist with a broad glob until a fresh CI run proves the
larger scope stays deterministic and within the runtime budget.

| Excluded category                   | Reason                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| Tests, benchmarks, and fixtures     | They verify production code and are not mutation targets.                                   |
| Generated, vendor, and build output | The repository does not own this code, or regenerates it from another source.               |
| Type declarations and configuration | They contain no runtime behavior for Vitest to exercise.                                    |
| React components and hooks          | Their happy-dom lifecycle makes the initial cohort too slow; add them in measured groups.   |
| Electron main-process code          | It uses a separate Vitest configuration and process mocks.                                  |
| Convex functions                    | They use a separate Vitest configuration and generated server bindings.                     |
| Startup and environment adapters    | Mutating real process, filesystem, or network effects would make the gate nondeterministic. |
| Static mutants                      | Module-load mutations made 7% of mutants account for an estimated 98% of cold-run time.     |

## Reports and incremental runs

Stryker writes a terminal summary, `reports/mutation/mutation.json`, and
`reports/mutation/mutation.html`. Open the HTML report to inspect surviving
mutants and the tests that covered each line.

Per-test coverage limits each non-static mutant to related Vitest tests. Static
mutants are disabled because the cold-run planner measured them at an estimated
98% of total runtime. Stryker also writes
`reports/mutation/stryker-incremental.json`; CI caches that file and reuses
results only when Stryker's input hashes still match. A cold run remains the
source of truth for baseline changes.

## Baseline and threshold

The initial baseline used the final mutation tests against the unmodified
production code from `main`. Seven focused test cases killed 12 real survivors
found during setup.

| Baseline commit | Mutation score | Killed | Survived | Timeout | Runtime |
| --------------- | -------------: | -----: | -------: | ------: | ------: |
| `bbb5a491`      |         96.66% |    492 |       17 |       0 |  4m 36s |

The cold run exercised 509 non-static mutants with no uncovered mutants or
errors. It ran on the Home Windows workstation with Node 24.12.0, Bun 1.3.7,
Vitest 4.1.11, and concurrency set to two. GitHub Actions keeps the larger
15-minute budget to allow for runner variance.

The committed `thresholds.break` value may stay the same or increase during
ordinary changes. Lowering it requires a fresh cold run against `main`, the
result in this table, and an explanation in the pull request. Never lower the
threshold only to make a failing branch pass.

To refresh the baseline:

1. Start from current `main` with a clean checkout and frozen dependencies.
2. Delete only the ignored `reports/mutation/` directory for that checkout.
3. Run `bun run test:mutation` and record the commit, score, mutant counts, and
   wall-clock runtime.
4. Review every surviving mutant before changing the threshold or scope.
5. Run the gate again with the committed threshold.

## CI contract

The `mutation` job runs on pull requests and `main`, uploads the report even on
failure, and gives the mutation step 15 minutes. The whole job has 30 minutes
so a cold dependency install, checkout, reporting, and cache cleanup do not
consume the mutation budget. `ci-complete` depends on this job, so a timeout,
test failure, or score below the committed threshold blocks merging.
