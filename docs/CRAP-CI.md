# Per-function CRAP gate

Run `bun run crap:check` to collect fresh coverage and enforce the policy.
`bun run crap:coverage` collects renderer/shared, Electron, and Convex suites;
`bun run crap` evaluates their existing reports and rejects stale source inputs.

## Measurement

The [CRAP formula](https://testing.googleblog.com/2011/02/this-code-is-crap.html)
combines complexity and a function's coverage:

```text
CRAP = complexity² × (1 − coverage)³ + complexity
```

Complexity comes from ESLint's maintained `complexity` rule in classic mode,
including optional chains, logical expressions and default arguments. Nested
functions receive separate scores. Inline ESLint disable comments cannot turn
off this measurement.

The dedicated Istanbul collection instruments original TypeScript before Vite
transforms it. Vitest's supported custom-instrumenter hook preserves those
original counters rather than instrumenting the transformed code again. This
avoids source-map collisions between nested callbacks. Coverage-ignore directives
are neutralized inside comments without changing source positions or string
literals. Normal V8 coverage jobs and their thresholds remain unchanged.

Each source function joins to its exact body-start location in the coverage map.
Missing or ambiguous matches fail the command. Branch outcomes belonging to the
innermost function determine its coverage fraction. A function without branches
uses its own statement counters, or its invocation counter if it has no statements.
Uncalled functions have zero coverage. A parent's counters never cover its nested
functions. Reports retain the numerator, denominator and coverage kind.

Branch-outcome coverage is the available operational input, not exhaustive
basis-path coverage or proof of assertion quality. This distinction applies even
when the coverage fraction is 100%.

## Maintained scope

The command enumerates owned `.ts` and `.tsx` files under `src`, `shared`,
`electron`, and `convex`, independently of the coverage report. It includes
untested runtime files and entry points. Exclusions in `scripts/crap-scope.ts` are:

- Type declarations, test/spec/benchmark files, test suites and mocks.
- Convex-generated bindings.
- Renderer test helpers, BDD step definitions, development diagnostics, and the
  browser-only IPC mock.

Type-only declarations have no executable functions. Class field initialization,
static blocks and module-level statements are not explicit functions and are not
reported as functions. Explicit constructors, methods, getters/setters, functions,
arrows and anonymous callbacks are measured.

Coverage manifests fingerprint source and test inputs, collection configuration,
instrumentation code and the lockfile before and after execution. The report
requires matching fingerprints. CI transfers all three manifests and coverage
maps from the same run; paths are normalized across Windows and Linux checkouts.

## Threshold and baseline

The historical actionable threshold remains **10**. A new function above 10
fails. Existing debt is recorded in `crap-baseline.json`; each accepted function
must stay at or below its recorded score. Baseline identities use file path,
lexical context, comment/whitespace-independent token hash and duplicate ordinal. A changed
function does not inherit an old exception merely because its name matches.

The initial baseline measures production source at commit
`3d5e565159cfa1dc341ce9831b0d6f6107a74183`: **6,713 functions**, **44 above 10**,
and a **worst score of 20**. The old file-coverage approximation is not comparable
to this measurement. No production behavior was changed to establish this baseline.

`bun run crap:ratchet` can remove debt or lower accepted scores. It cannot add
exceptions or increase scores. CI also compares the committed baseline with the
PR/merge-group base or pre-push revision, rejecting manual increases. Initialization
uses an exclusive file create and cannot overwrite an existing baseline. Policy
changes require an explicit reviewed implementation change; there is no automatic
baseline increase path.

Every exception must still identify a measured function. Removing or changing an
accepted function requires `bun run crap:ratchet` to prune its old exception.
Restoring that function later is checked as new debt. Coverage freshness includes
the root, Node, Convex, and script TypeScript configurations for every suite.

Every suite fingerprints all TypeScript under `src`, `shared`, `electron`,
`convex`, `scripts`, and `perf` because tests import code across those roots.
An unrelated edit there may require recollection of every suite. Function
identities include lexical owners, including class
fields and constructor calls. Renaming or moving an owner changes its descendants'
identities; accepted debt must be reduced rather than automatically transferred
to a different owner. Whitespace and line insertion do not change identities.
Otherwise indistinguishable callbacks also include the containing file's token
hash in their IDs. Deleting or changing code in that file invalidates those
ambiguous allowances, preventing an ordinal shift from transferring accepted debt.
Whitespace and comments do not change that token hash.

## CI and verification

Three `crap-coverage` jobs collect suites independently, with four test workers
to bound instrumentation contention and a 15-minute job limit. The `crap` job
requires every suite to pass, checks the baseline, and uploads `crap-report` with
the deterministic machine-readable report. `ci-complete` directly requires
`crap`. Missing coverage, invalid counters and source mismatches fail the gate.

Run the focused tests with:

```sh
bun run test -- scripts/crap-metric.test.ts scripts/crap-instrumenter.test.ts scripts/crap-policy.test.ts
```

The instrumentation tests execute real counters for differently covered functions
in one file, nested returned callbacks, anonymous functions, and ignored/uncovered
code. An uncovered function of complexity 5 scores 30 and fails an empty baseline.
The policy tests prove increases and new exceptions fail while reductions pass.

A local end-to-end probe added an uncovered production-scope function with four
conditions. `bun run crap:coverage` collected it, then `bun run crap` reported
`uncoveredCrapProbe`, CRAP 30, as its only regression and exited 1. The temporary
source file was removed before final validation.

The generated `reports/crap/report.json` lists every function and its evidence.
It is the authoritative current result used by `scripts/whats-next.ps1`.
Historical snapshots in `docs/crap-score-log.md` are retained for context only.
