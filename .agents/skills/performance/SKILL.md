---
name: performance
description: "V1.0 - Commands: Run, Compare, Gaps. Runs vitest benchmarks, compares against baseline, flags regressions, and identifies uncovered code paths. Use when checking performance, adding benchmarks, or validating no degradation after changes."
---

# Performance

Run `bun run bench` to execute vitest benchmarks. Compare results against the baseline below. Slowdowns are not acceptable — fix them before merging.

## Commands

### Run (default)

1. Run `bun run bench` **five times** and take the **median** hz for each benchmark. This filters CPU jitter and GC noise.
2. Compare each median ops/sec (hz) against the baseline table below.
3. **Regression threshold**: Any benchmark whose median hz drops **more than 5%** below baseline is a failure. Fix every regression before proceeding.
4. If all benchmarks pass, report a summary table showing current median vs baseline with pass/fail per row.
5. Run the **Gaps** check automatically after every Run.

### Compare

Compare two benchmark runs side-by-side. Pass two sets of results and report:

- Benchmarks that improved (green)
- Benchmarks that regressed (red, >5% drop below baseline)
- Benchmarks within noise (≤5% variance)

### Gaps

Scan the codebase for functions that should have benchmarks but don't. Check:

1. **New files**: Any new `.ts` files in `src/utils/`, `src/services/`, `electron/services/`, `electron/ipc/`, `convex/lib/` that export computation-heavy functions without a corresponding `.bench.ts`.
2. **New exports**: Any new exported functions in files that already have benchmarks but whose bench file doesn't cover the new export.
3. **Known gaps** from the coverage table below — prompt the user to add them.

Report a table of uncovered functions with file path, function name, and priority.

## Benchmark Files

| File | Covers |
|------|--------|
| `src/utils/dateUtils.bench.ts` | formatDistanceToNow, format, formatDateKey, formatDuration, formatUptime, formatDateFull, formatDateCompact, formatHour12 |
| `src/services/jsonSerialization.bench.ts` | JSON.stringify/parse at 10/100/1000 entries, cache entry lookup |
| `electron/services/copilotSessionParsing.bench.ts` | getSessionDetail streaming parse (10/100/500 requests), regex extraction hot path (scanInfo, JSON.parse, regex fallback, kind detection, key path) |
| `src/components/copilot-usage/quotaUtils.bench.ts` | computeProjection (4 scenarios: mid-cycle, early, near-reset, zero remaining) |
| `src/services/taskQueue.bench.ts` | enqueue+drain (serial, concurrent, mixed priority), cancel, priority insertion |
| `src/utils/reactions.bench.ts` | applyReactionToResult (small/medium/large PR, miss, new reaction type) |
| `convex/lib/cronUtils.bench.ts` | calculateNextRunAt (6 cron patterns including timezone) |
| `src/utils/budgetUtils.bench.ts` | findCopilotBudget (5/50/200 budgets, with/without filter), findBudgetAcrossPages (1/3/5 pages) |
| `src/components/tempo/tempoUtils.bench.ts` | nextStartTime (3/10/50 worklogs) |

## Baseline (2026-03-30, refresh #2)

Captured on: Windows, Bun, Vitest 4.1.0. Median of 5 runs.

### dateUtils

| Benchmark | ops/sec (hz) | mean (ms) |
|-----------|-------------|-----------|
| formatDistanceToNow — recent timestamp | 6,071,596 | 0.0002 |
| formatDistanceToNow — old timestamp | 5,749,211 | 0.0002 |
| formatDistanceToNow — string date | 2,666,121 | 0.0004 |
| formatDistanceToNow — Date object | 4,917,533 | 0.0002 |
| format — yyyy-MM-dd | 428,098 | 0.0023 |
| format — MMMM dd, yyyy HH:mm:ss | 270,754 | 0.0037 |
| format — MMM d, yyyy h:mm a | 291,757 | 0.0034 |
| format — timestamp input | 306,792 | 0.0033 |
| formatDateKey | 5,081,765 | 0.0002 |
| formatDuration — milliseconds | 19,396,202 | 0.0001 |
| formatDuration — seconds | 8,229,614 | 0.0001 |
| formatDuration — minutes | 18,517,654 | 0.0001 |
| formatUptime — seconds | 19,237,574 | 0.0001 |
| formatUptime — hours and minutes | 18,190,577 | 0.0001 |
| formatUptime — days and hours | 18,744,322 | 0.0001 |
| formatDateFull — timestamp | 23,695 | 0.0422 |
| formatDateFull — string | 23,702 | 0.0422 |
| formatDateFull — null | 19,789,666 | 0.0001 |
| formatDateCompact — timestamp | 25,813 | 0.0387 |
| formatHour12 — all 24 hours | 3,740,753 | 0.0003 |

### jsonSerialization

| Benchmark | ops/sec (hz) | mean (ms) |
|-----------|-------------|-----------|
| JSON.stringify — 10 entries | 176,260 | 0.0057 |
| JSON.stringify — 100 entries | 16,721 | 0.0598 |
| JSON.stringify — 1000 entries | 1,103 | 0.9067 |
| JSON.parse — 10 entries | 104,154 | 0.0096 |
| JSON.parse — 100 entries | 10,034 | 0.0997 |
| JSON.parse — 1000 entries | 871 | 1.1476 |
| cache entry lookup (1000 entries) | 902 | 1.1091 |

### copilotSessionParsing

| Benchmark | ops/sec (hz) | mean (ms) |
|-----------|-------------|-----------|
| getSessionDetail — 10 requests | 2,798 | 0.3574 |
| getSessionDetail — 100 requests | 1,636 | 0.6111 |
| getSessionDetail — 500 requests | 510 | 1.9600 |
| extractScanInfo regexes | 1,977,156 | 0.0005 |
| extractResultData JSON.parse | 807,552 | 0.0012 |
| extractResultData regex fallback | 8,224,198 | 0.0001 |
| kind detection regex | 9,933,782 | 0.0001 |
| key path extraction regex | 8,211,544 | 0.0001 |

### quotaUtils

| Benchmark | ops/sec (hz) | mean (ms) |
|-----------|-------------|-----------|
| computeProjection — mid-cycle with overage | 2,134,164 | 0.0005 |
| computeProjection — early cycle low usage | 2,229,690 | 0.0004 |
| computeProjection — near-reset heavy usage | 2,078,517 | 0.0005 |
| computeProjection — zero remaining | 2,085,200 | 0.0005 |

### taskQueue

| Benchmark | ops/sec (hz) | mean (ms) |
|-----------|-------------|-----------|
| enqueue 10 tasks (serial) | 181,023 | 0.0055 |
| enqueue 10 tasks (concurrent=5) | 154,751 | 0.0065 |
| enqueue 50 tasks (mixed priority) | 33,672 | 0.0297 |
| cancel 10 of 20 pending | 5,012 | 0.1995 |
| insert 100 prioritized tasks | 27,076 | 0.0369 |

### reactions

| Benchmark | ops/sec (hz) | mean (ms) |
|-----------|-------------|-----------|
| applyReaction — small PR (9 comments) | 5,064,119 | 0.0002 |
| applyReaction — medium PR (53 comments) | 1,866,764 | 0.0005 |
| applyReaction — large PR (303 comments) | 452,496 | 0.0022 |
| applyReaction — miss (not found) | 2,276,403 | 0.0004 |
| applyReaction — add new type | 1,796,814 | 0.0006 |

### cronUtils

| Benchmark | ops/sec (hz) | mean (ms) |
|-----------|-------------|-----------|
| calculateNextRunAt — every minute | 13,000 | 0.0769 |
| calculateNextRunAt — every 5 minutes | 12,335 | 0.0811 |
| calculateNextRunAt — daily at midnight | 24,379 | 0.0410 |
| calculateNextRunAt — weekdays at 9am | 11,119 | 0.0899 |
| calculateNextRunAt — complex | 27,065 | 0.0369 |
| calculateNextRunAt — no timezone (UTC) | 45,004 | 0.0222 |

### budgetUtils

| Benchmark | ops/sec (hz) | mean (ms) |
|-----------|-------------|-----------|
| findCopilotBudget — 5 budgets | 8,417,272 | 0.0001 |
| findCopilotBudget — 50 budgets | 2,185,721 | 0.0005 |
| findCopilotBudget — 200 budgets | 410,643 | 0.0024 |
| findCopilotBudget — 50 w/ filter (match) | 698,423 | 0.0014 |
| findCopilotBudget — 50 w/ filter (no match) | 967,797 | 0.0010 |
| findBudgetAcrossPages — found page 1 | 589,980 | 0.0017 |
| findBudgetAcrossPages — found page 3 of 5 | 209,192 | 0.0048 |
| findBudgetAcrossPages — not found (5 pages) | 140,891 | 0.0071 |

### tempoUtils

| Benchmark | ops/sec (hz) | mean (ms) |
|-----------|-------------|-----------|
| nextStartTime — 3 worklogs | 13,838,211 | 0.0001 |
| nextStartTime — 10 worklogs | 12,706,606 | 0.0001 |
| nextStartTime — 50 worklogs | 9,782,148 | 0.0001 |

## Known Coverage Gaps

Functions that should have benchmarks but don't yet. Address these when touching the related code.

| Priority | File | Function(s) | Why |
|----------|------|-------------|-----|
| MEDIUM | `electron/services/copilotSessionService.ts` | `resolveWorkspaceName()` | File I/O + regex on 32KB buffers |

## Updating the Baseline

When benchmark improvements are intentional (e.g., you optimized a function), update the baseline:

1. Run `bun run bench` five times and take the median hz values.
2. Update the tables in this file with the new numbers.
3. Note the date and reason in a commit message.

## Adding New Benchmarks

When adding a new `.bench.ts` file:

1. Place it alongside the source file (e.g., `foo.ts` → `foo.bench.ts`).
2. Add it to the "Benchmark Files" table above.
3. Run 5 times and record median hz in the Baseline section.
4. Remove the entry from "Known Coverage Gaps" if applicable.
