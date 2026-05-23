## 2025-07-14 — CRAP Score Snapshot (Electron)

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
