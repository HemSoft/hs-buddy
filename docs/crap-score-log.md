## 2026-06-13 — CRAP Score Snapshot (TypeScript)

| Metric | Value |
|--------|-------|
| Methods Analyzed | 2,659 (src/) |
| Methods > 30 (Critical) | 0 |
| Methods 16–30 (High) | 0 |
| Methods 6–15 (Moderate) | 62 |
| Methods >= 10 (Repo Threshold) | 0 |
| Highest CRAP | 7.0 (multiple fully covered complexity-only functions) |
| Overall Coverage | 99.90% lines / 99.35% branches / 99.97% functions / 99.82% statements |

**Critical Methods (CRAP > 30):** None — repo passes Gold scorecard rule.

**Threshold Rationale:**

- Issue #94 allowed documenting why a repo threshold of 10 is more appropriate than 6 for fully covered complexity-only functions.
- After this pass, the worst CRAP score is 7.0 and every function at the top of the report is at or near full branch coverage, so the remaining score is driven by modest cyclomatic complexity rather than poor tests.
- `crap-report.ps1 -Threshold 10 -Top 20 -Format json -Stack ts -SkipCoverage` exits 0 with 0 findings.
- Keep using threshold 6 for discovery, but treat threshold 10 as the actionable repo threshold unless coverage drops or CRAP exceeds 10.

**Improvements This Session:**

- `src/utils/cronUtils.ts` :: `enumerateCronOccurrences`, `parseSegment`, and `parseField`: CRAP 11.6 -> below threshold (split parsing/enumeration helpers and added malformed cron parser coverage)
- `src/utils/copilotEnterpriseUsers.ts` :: `totalsFromUsageItems`: CRAP 9.3 -> below threshold (extracted usage item accumulation helpers)
- `src/hooks/useCopilotUsage.ts` :: `computeAggregateSpend`: CRAP 9.0 -> below threshold (extracted dollar-spend eligibility and projection helpers)
- `src/components/copilot-usage/TopUsersSection.tsx` :: `EnterpriseUsersContent` and `TopUsersSection`: CRAP 8.4/7.3 -> below threshold (split render states into focused components)
- `src/hooks/useCopilotEnterpriseUsers.ts` :: `load`: CRAP 7.6 -> below threshold (extracted result-to-state conversion helpers)
- `src/utils/copilotEnterpriseUsers.ts` :: `directTotalsFromRecord`: CRAP 7.2 -> below threshold (reused model quantity accumulation helpers)

**Session Notes:**

- Fresh coverage was generated with `bun run test:coverage -- --reporter=dot --silent`.
- Fresh CRAP reports were generated with `crap-report.ps1 -Threshold 6` and `-Threshold 10` using the refreshed coverage summary.
- The threshold-6 report still has 62 moderate findings; the threshold-10 report has 0 findings and worst CRAP 7.0.

---

## 2026-06-07 — CRAP Score Snapshot (TypeScript)

| Metric | Value |
|--------|-------|
| Methods Analyzed | 2,619 (src/) |
| Methods > 30 (Critical) | 0 |
| Methods 16–30 (High) | 0 |
| Methods 6–15 (Moderate) | 70 |
| Highest CRAP | 9.3 (`src/utils/copilotEnterpriseUsers.ts` :: `totalsFromUsageItems`) |
| Average CRAP | Not reported by `crap-report.ps1` |
| Overall Coverage | 99.89% lines / 99.44% branches / 99.97% functions / 99.84% statements |

**Critical Methods (CRAP > 30):** None — repo passes Gold scorecard rule.

**Improvements This Session:**

- `src/hooks/useCopilotEnterpriseUsers.ts` :: `load`: CRAP 56 → 7.6 (added hook coverage for success, failure, unavailable preload API, thrown errors, and refresh reload)
- `src/hooks/useCopilotEnterpriseUsers.ts` :: `loadEnterpriseUsers`: CRAP 12 → below threshold (covered preload availability and success paths)
- `src/hooks/useCopilotUsage.ts` :: `selectOrgRepresentatives`: CRAP 10 → below threshold (extracted org grouping and representative selection helpers)
- Targeted `lint:quality` first-tranche scan: 12 warnings → 5 warnings; `electron/services/ralphService.ts` :: `launchLoop` max-lines warning removed

**Session Notes:**

- Fresh report generated with `~/.agents/skills/crap/scripts/crap-report.ps1 -Threshold 6 -Top 20 -Format table -Stack ts`.
- Remaining CRAP debt is moderate only; follow-up issue #94 tracks reducing worst CRAP below 6.
- Remaining targeted lint warnings are max-lines-only items in `ralphService.ts`, `usePRThreadsPanel.ts`, `useTerminalPanel.ts`, and `useTerminalWorkspace.tsx`.

---

## 2026-05-23 — CRAP Score Snapshot (Electron)

| Metric | Value |
|--------|-------|
| Methods Analyzed | ~450 (electron/) |
| Methods > 30 (Critical) | 0 |
| Methods 16–30 (High) | 0 |
| Methods 6–15 (Moderate) | 7 |
| Highest CRAP | 10.5 (electron/main.ts :: createWindow) |
| Average CRAP | ~2.1 |

**Critical Methods (CRAP > 30):** None — repo passes Gold scorecard rule.

**Improvements This Session:**

- `registerTerminalHandlers`: CRAP 15 → 4 (refactored — extracted handler functions, CC 15→4)
- `fetchPersonalAccountSpend`: CRAP 12 → 5 (added tests — coverage 0%→60%)

**Session Notes:**

- Refactored `registerTerminalHandlers` by extracting `handleResolveRepoPath`, `handleSpawn`, `handleAttach`, `handleKill` as named functions — reduced cyclomatic complexity from 15 to ~4
- Added 3 tests for `fetchPersonalAccountSpend` (personal account budget path) — previously 0% covered dead code
- All 837 electron tests and 6234 src tests pass; typecheck and lint clean
- V8 reports `complexity=1` for all methods — CRAP scores estimated from source control flow

---

## 2026-05-07 - CRAP Score Snapshot

| Metric | Value |
|--------|-------|
| Methods Analyzed | 1837 |
| Methods > 30 (Critical) | 0 |
| Methods 16-30 (High) | 0 |
| Methods 6-15 (Moderate) | 169 |
| Highest CRAP | 10 (src/components/PullRequestDetailPanel.tsx :: PullRequestDetailPanel) |
| Average CRAP | 2.76 |

### Critical Methods (CRAP > 30)

| Class/Module | Method | CRAP | Coverage | Complexity | Change from Last |
|--------------|--------|------|----------|------------|------------------|
| - | - | none | - | - | - |

### Improvements Since Last Snapshot

- src/components/terminal/TerminalPromptLibrary.tsx :: handleMouseDown: CRAP 13.26 -> 4.00 (added targeted terminal tests)
- src/components/terminal/TerminalPromptLibrary.tsx :: resolveErrorMessage: CRAP 12 -> 3.00 (added targeted terminal tests)
- src/components/ralph-loops/RalphDashboard.tsx :: RalphDashboard: CRAP 10 -> 4.00 (extracted focused dashboard sections and added section tests)

### Notes

- Estimated CRAP for TypeScript functions was computed from the TypeScript AST plus LCOV line coverage because Vitest's Cobertura output did not include usable per-method complexity.
- This snapshot counts named function-like nodes in coverage-included `src/` files; full-suite coverage remains 100%, so CRAP matches cyclomatic complexity for scored methods.
- The repo still has 0 methods above the CRAP 30 threshold after the RalphDashboard refactor; the highest remaining score is 10 in `PullRequestDetailPanel`.
