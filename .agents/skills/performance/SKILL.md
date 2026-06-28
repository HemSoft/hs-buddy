---
name: performance
description: 'V1.0 - Commands: Run, Compare, Gaps. Runs vitest benchmarks, compares against baseline, flags regressions, and identifies uncovered code paths. Use when checking performance, adding benchmarks, or validating no degradation after changes.'
---

# Performance

Run `bun run bench` to execute vitest benchmarks. Compare results against the baseline below. Slowdowns are not acceptable — fix them before merging.

## Commands

### Run (default)

1. Run `bun install --frozen-lockfile`, then record `bun --version`, `node --version`, and `bun pm ls --all` entries for `vitest` and `@vitest/coverage-v8` before benchmarking.
2. Run `bun run bench` **five times** and take the **median** hz for each benchmark. This filters CPU jitter and GC noise.
3. Compare each median ops/sec (hz) against the baseline table below only when Bun, Node, and Vitest match the captured baseline toolchain. If they differ, refresh the baseline or run a same-runner base/candidate comparison instead.
4. **Regression threshold**: Any benchmark whose median hz drops **more than 5%** below baseline is a failure. Fix every regression before proceeding.
5. If all benchmarks pass, report a summary table showing current median vs baseline with pass/fail per row.
6. Run the **Gaps** check automatically after every Run.

### Compare

Compare two benchmark runs side-by-side. Pass two sets of results and report:

- Benchmarks that improved (green)
- Benchmarks that regressed (red, >5% drop below baseline)
- Benchmarks within noise (≤5% variance)

### CI Gating

- Never gate hosted CI against a cached benchmark result from another runner.
  Host variance can present as broad false regressions across unrelated suites.
- Benchmark the base revision and candidate revision in the same CI job on the
  same runner. Cached results are suitable for artifacts and trends, not gates.
- Keep using five-run medians for performance decisions and baseline refreshes,
  even when CI uses a quicker paired comparison.

### Gaps

Scan the codebase for functions that should have benchmarks but don't. Check:

1. **New files**: Any new `.ts` files in `src/utils/`, `src/services/`, `electron/services/`, `electron/ipc/`, `convex/lib/` that export computation-heavy functions without a corresponding `.bench.ts`.
2. **New exports**: Any new exported functions in files that already have benchmarks but whose bench file doesn't cover the new export.
3. **Known gaps** from the coverage table below — prompt the user to add them.

Report a table of uncovered functions with file path, function name, and priority.

## Benchmark Files

| File                                               | Covers                                                                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/utils/dateUtils.bench.ts`                     | formatDistanceToNow, format, formatDateKey, formatDuration, formatUptime, formatDateFull, formatDateCompact, formatHour12                          |
| `src/services/jsonSerialization.bench.ts`          | JSON.stringify/parse at 10/100/1000 entries, cache entry lookup                                                                                    |
| `electron/services/copilotSessionParsing.bench.ts` | getSessionDetail streaming parse (10/100/500 requests), regex extraction hot path (scanInfo, JSON.parse, regex fallback, kind detection, key path) |
| `src/components/copilot-usage/quotaUtils.bench.ts` | computeProjection (4 scenarios: mid-cycle, early, near-reset, zero remaining)                                                                      |
| `src/services/taskQueue.bench.ts`                  | enqueue+drain (serial, concurrent, mixed priority), cancel, priority insertion                                                                     |
| `src/utils/reactions.bench.ts`                     | applyReactionToResult (small/medium/large PR, miss, new reaction type)                                                                             |
| `convex/lib/cronUtils.bench.ts`                    | calculateNextRunAt (6 cron patterns including timezone)                                                                                            |
| `src/utils/budgetUtils.bench.ts`                   | findCopilotBudget (5/50/200 budgets, with/without filter), findBudgetAcrossPages (1/3/5 pages)                                                     |
| `src/components/tempo/tempoUtils.bench.ts`         | nextStartTime (3/10/50 worklogs)                                                                                                                   |
| `electron/services/copilotSessionService.bench.ts` | resolveWorkspaceName (single-folder, multi-root, encoded URI, empty JSON fallback, missing file catch path)                                        |
| `perf/ipc-throughput.bench.ts`                     | ipcHandler dispatch overhead with small/medium/large payloads and error path, JSON serialization and round-trip payload simulation                 |
| `src/utils/billingParsers.bench.ts`                | parseBillingUsage (25/250/1000 items), settled-result billing JSON parsing, overage and assembled metrics helpers                                  |
| `src/utils/sessionDigest.bench.ts`                 | aggregateResults (10/100/500 requests), countSearchChurn, computeDominantTools, computeSessionDigest                                               |
| `src/utils/copilotEnterpriseUsers.bench.ts`        | parseCopilotEnterpriseUsersContent with BOM, normalizeCopilotEnterpriseUsersSnapshot for nested and direct aggregate user payloads                 |

## Baseline (2026-06-26, refresh #3)

Captured on: Windows, Bun 1.3.7, Node 24.12.0, Vitest 4.1.5. Median of 5 runs.
Vitest packages are pinned to 4.1.5 in `package.json` and `bun.lock`; refresh this baseline after any Bun, Node, or Vitest change.

### dateUtils

| Benchmark                              | ops/sec (hz) | mean (ms) |
| -------------------------------------- | ------------ | --------- |
| formatDistanceToNow — recent timestamp | 8,300,100    | 0.0001    |
| formatDistanceToNow — old timestamp    | 8,530,604    | 0.0001    |
| formatDistanceToNow — string date      | 3,815,798    | 0.0003    |
| formatDistanceToNow — Date object      | 6,864,482    | 0.0001    |
| format — yyyy-MM-dd                    | 2,343,776    | 0.0004    |
| format — MMMM dd, yyyy HH:mm:ss        | 1,804,986    | 0.0006    |
| format — MMM d, yyyy h:mm a            | 1,831,093    | 0.0005    |
| format — timestamp input               | 1,730,055    | 0.0006    |
| formatDateKey                          | 7,142,922    | 0.0001    |
| formatDuration — milliseconds          | 25,176,673   | 0.0001    |
| formatDuration — seconds               | 11,311,410   | 0.0001    |
| formatDuration — minutes               | 24,463,938   | 0.0001    |
| formatUptime — seconds                 | 24,672,901   | 0.0001    |
| formatUptime — hours and minutes       | 24,343,726   | 0.0001    |
| formatUptime — days and hours          | 24,888,753   | 0.0001    |
| formatDateFull — timestamp             | 38,046       | 0.0263    |
| formatDateFull — string                | 37,285       | 0.0268    |
| formatDateFull — null                  | 25,303,864   | 0.0001    |
| formatDateCompact — timestamp          | 38,440       | 0.0260    |
| formatHour12 — all 24 hours            | 5,388,644    | 0.0002    |

### jsonSerialization

| Benchmark                         | ops/sec (hz) | mean (ms) |
| --------------------------------- | ------------ | --------- |
| JSON.stringify — 10 entries       | 219,253      | 0.0046    |
| JSON.stringify — 100 entries      | 21,086       | 0.0474    |
| JSON.stringify — 1000 entries     | 1,649        | 0.6063    |
| JSON.parse — 10 entries           | 133,187      | 0.0075    |
| JSON.parse — 100 entries          | 13,278       | 0.0753    |
| JSON.parse — 1000 entries         | 1,254        | 0.7977    |
| cache entry lookup (1000 entries) | 1,234        | 0.8104    |

### copilotSessionParsing

| Benchmark                        | ops/sec (hz) | mean (ms) |
| -------------------------------- | ------------ | --------- |
| getSessionDetail — 10 requests   | 12,237       | 0.0817    |
| getSessionDetail — 100 requests  | 3,389        | 0.2951    |
| getSessionDetail — 500 requests  | 634          | 1.5779    |
| extractScanInfo regexes          | 2,741,559    | 0.0004    |
| extractResultData JSON.parse     | 1,099,546    | 0.0009    |
| extractResultData regex fallback | 11,517,732   | 0.0001    |
| kind detection regex             | 13,026,773   | 0.0001    |
| key path extraction regex        | 10,871,368   | 0.0001    |

### quotaUtils

| Benchmark                                  | ops/sec (hz) | mean (ms) |
| ------------------------------------------ | ------------ | --------- |
| computeProjection — mid-cycle with overage | 2,837,512    | 0.0004    |
| computeProjection — early cycle low usage  | 2,874,755    | 0.0003    |
| computeProjection — near-reset heavy usage | 2,644,847    | 0.0004    |
| computeProjection — zero remaining         | 2,784,350    | 0.0004    |

### taskQueue

| Benchmark                         | ops/sec (hz) | mean (ms) |
| --------------------------------- | ------------ | --------- |
| enqueue 10 tasks (serial)         | 242,353      | 0.0041    |
| enqueue 10 tasks (concurrent=5)   | 216,733      | 0.0046    |
| enqueue 50 tasks (mixed priority) | 46,895       | 0.0213    |
| cancel 10 of 20 pending           | 6,476        | 0.1544    |
| insert 100 prioritized tasks      | 37,910       | 0.0264    |

### reactions

| Benchmark                               | ops/sec (hz) | mean (ms) |
| --------------------------------------- | ------------ | --------- |
| applyReaction — small PR (9 comments)   | 7,035,854    | 0.0001    |
| applyReaction — medium PR (53 comments) | 2,509,577    | 0.0004    |
| applyReaction — large PR (303 comments) | 625,380      | 0.0016    |
| applyReaction — miss (not found)        | 3,189,610    | 0.0003    |
| applyReaction — add new type            | 2,520,882    | 0.0004    |

### cronUtils

| Benchmark                              | ops/sec (hz) | mean (ms) |
| -------------------------------------- | ------------ | --------- |
| calculateNextRunAt — every minute      | 18,631       | 0.0537    |
| calculateNextRunAt — every 5 minutes   | 17,322       | 0.0577    |
| calculateNextRunAt — daily at midnight | 34,507       | 0.0290    |
| calculateNextRunAt — weekdays at 9am   | 15,309       | 0.0653    |
| calculateNextRunAt — complex           | 39,383       | 0.0254    |
| calculateNextRunAt — no timezone (UTC) | 62,718       | 0.0159    |

### budgetUtils

| Benchmark                                   | ops/sec (hz) | mean (ms) |
| ------------------------------------------- | ------------ | --------- |
| findCopilotBudget — 5 budgets               | 11,310,276   | 0.0001    |
| findCopilotBudget — 50 budgets              | 2,855,225    | 0.0004    |
| findCopilotBudget — 200 budgets             | 529,934      | 0.0019    |
| findCopilotBudget — 50 w/ filter (match)    | 944,346      | 0.0011    |
| findCopilotBudget — 50 w/ filter (no match) | 1,289,115    | 0.0008    |
| findBudgetAcrossPages — found page 1        | 916,082      | 0.0011    |
| findBudgetAcrossPages — found page 3 of 5   | 286,275      | 0.0035    |
| findBudgetAcrossPages — not found (5 pages) | 191,442      | 0.0052    |

### tempoUtils

| Benchmark                   | ops/sec (hz) | mean (ms) |
| --------------------------- | ------------ | --------- |
| nextStartTime — 3 worklogs  | 15,372,925   | 0.0001    |
| nextStartTime — 10 worklogs | 14,841,679   | 0.0001    |
| nextStartTime — 50 worklogs | 11,595,382   | 0.0001    |

### copilotSessionService

| Benchmark                                               | ops/sec (hz) | mean (ms) |
| ------------------------------------------------------- | ------------ | --------- |
| resolveWorkspaceName — single-folder workspace          | 21,247       | 0.0471    |
| resolveWorkspaceName — multi-root workspace             | 21,951       | 0.0456    |
| resolveWorkspaceName — encoded URI with spaces          | 21,729       | 0.0460    |
| resolveWorkspaceName — empty JSON (fallback to dirname) | 23,739       | 0.0421    |
| resolveWorkspaceName — missing file (catch path)        | 72,182       | 0.0139    |

### ipcThroughput

| Benchmark                          | ops/sec (hz) | mean (ms) |
| ---------------------------------- | ------------ | --------- |
| ipcHandler — small payload (~50B)  | 7,601,154    | 0.0001    |
| ipcHandler — medium payload (~5KB) | 7,842,368    | 0.0001    |
| ipcHandler — large payload (~50KB) | 7,775,872    | 0.0001    |
| ipcHandler — error path            | 188,571      | 0.0053    |
| JSON serialize — small payload     | 8,882,396    | 0.0001    |
| JSON serialize — medium payload    | 121,951      | 0.0082    |
| JSON serialize — large payload     | 7,997        | 0.1250    |
| JSON round-trip — small payload    | 3,115,423    | 0.0003    |
| JSON round-trip — medium payload   | 42,089       | 0.0238    |
| JSON round-trip — large payload    | 2,744        | 0.3644    |

### billingParsers

| Benchmark                                   | ops/sec (hz) | mean (ms) |
| ------------------------------------------- | ------------ | --------- |
| parseBillingUsage — 25 billing items        | 1,445,283    | 0.0007    |
| parseBillingUsage — 250 billing items       | 155,331      | 0.0064    |
| parseBillingUsage — 1000 billing items      | 38,284       | 0.0261    |
| extractCopilotSpend — 250 items JSON stdout | 8,630        | 0.1159    |
| extractBudgetFromResult — two budgets       | 1,873,795    | 0.0005    |
| computeOverageSpend — premium snapshot      | 16,269,729   | 0.0001    |
| assembleCopilotMetrics — success payload    | 25,245,072   | 0.0000    |

### sessionDigest

| Benchmark                                 | ops/sec (hz) | mean (ms) |
| ----------------------------------------- | ------------ | --------- |
| aggregateResults — 10 requests            | 4,233,826    | 0.0002    |
| aggregateResults — 100 requests           | 739,057      | 0.0014    |
| aggregateResults — 500 requests           | 153,694      | 0.0065    |
| countSearchChurn — 500 requests           | 145,032      | 0.0069    |
| computeDominantTools — 500 requests       | 92,630       | 0.0108    |
| computeSessionDigest — 100-request digest | 206,229      | 0.0048    |

### copilotEnterpriseUsers

| Benchmark                                                            | ops/sec (hz) | mean (ms) |
| -------------------------------------------------------------------- | ------------ | --------- |
| parseCopilotEnterpriseUsersContent — 100 nested users JSON with BOM  | 3,281        | 0.3048    |
| normalizeCopilotEnterpriseUsersSnapshot — 10 nested users            | 22,503       | 0.0444    |
| normalizeCopilotEnterpriseUsersSnapshot — 100 nested users           | 2,253        | 0.4438    |
| normalizeCopilotEnterpriseUsersSnapshot — 500 nested users           | 436          | 2.2919    |
| normalizeCopilotEnterpriseUsersSnapshot — 500 direct aggregate users | 3,651        | 0.2739    |

## Known Coverage Gaps

Functions that should have benchmarks but don't yet. Address these when touching the related code.

| File                              | Priority | Notes                                                                                             |
| --------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `src/utils/financeCalc.ts`        | Medium   | Finance aggregation and projection helpers should get focused benchmarks before broad changes.    |
| `src/utils/networkSecurity.ts`    | Medium   | URL validation and security classification paths are worth benchmarking before further hardening. |
| `src/utils/terminalPathUtils.ts`  | Low      | Path parsing helpers are pure and currently lower throughput risk.                                |
| `src/utils/featureIntakeUtils.ts` | Low      | Intake formatting helpers are pure and lower frequency.                                           |
| `src/utils/scheduleUtils.ts`      | Low      | Schedule display helpers are pure and lower frequency.                                            |

## Updating the Baseline

When benchmark improvements are intentional (e.g., you optimized a function), update the baseline:

1. Confirm Bun, Node, and Vitest versions and decide whether the toolchain change justifies a baseline refresh.
2. Run `bun run bench` five times and take the median hz values.
3. Update the tables in this file with the new numbers and captured toolchain versions.
4. Note the date and reason in a commit message.

## Adding New Benchmarks

When adding a new `.bench.ts` file:

1. Place it alongside the source file (e.g., `foo.ts` → `foo.bench.ts`).
2. Add it to the "Benchmark Files" table above.
3. Run 5 times and record median hz in the Baseline section.
4. Remove the entry from "Known Coverage Gaps" if applicable.
