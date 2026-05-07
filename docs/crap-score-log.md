## 2026-05-07 - CRAP Score Snapshot

| Metric | Value |
|--------|-------|
| Methods Analyzed | 2317 |
| Methods > 30 (Critical) | 0 |
| Methods 16-30 (High) | 0 |
| Methods 6-15 (Moderate) | 187 |
| Highest CRAP | 10 (src/components/ralph-loops/RalphDashboard.tsx :: RalphDashboard) |
| Average CRAP | 2.69 |

### Critical Methods (CRAP > 30)

| Class/Module | Method | CRAP | Coverage | Complexity | Change from Last |
|--------------|--------|------|----------|------------|------------------|
| - | - | none | - | - | - |

### Improvements Since Last Snapshot

- src/components/terminal/TerminalPromptLibrary.tsx :: handleMouseDown: CRAP 13.26 -> 4.00 (added targeted terminal tests)
- src/components/terminal/TerminalPromptLibrary.tsx :: resolveErrorMessage: CRAP 12 -> 3.00 (added targeted terminal tests)

### Notes

- Estimated CRAP for TypeScript functions was computed from the TypeScript AST plus LCOV line coverage because Vitest's Cobertura output did not include usable per-method complexity.
- The repo has 0 methods above the CRAP 30 threshold after the terminal coverage improvements.
