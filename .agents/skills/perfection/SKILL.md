---
name: perfection
description: "V1.0 - Commands: audit, fix, status. Runs every quality gate in the repo and drives all metrics to perfection: 100% test coverage, CRAP < 6, Gold 100 scorecard, zero lint/knip/e18e findings, clean typecheck, bundle-size within budget."
hooks:
  PostToolUse:
    - matcher: "Read|Write|Edit"
      hooks:
        - type: prompt
          prompt: |
            If a file was read, written, or edited in the perfection directory (path contains 'perfection'), verify that history logging occurred.
            
            Check if History/{YYYY-MM-DD}.md exists and contains an entry for this interaction with:
            - Format: "## HH:MM - {Action Taken}"
            - One-line summary
            - Accurate timestamp (obtained via `Get-Date -Format "HH:mm"` command, never guessed)
            
            If history entry is missing or incomplete, provide specific feedback on what needs to be added.
            If history entry exists and is properly formatted, acknowledge completion.
  Stop:
    - matcher: "*"
      hooks:
        - type: prompt
          prompt: |
            Before stopping, if perfection was used (check if any files in perfection directory were modified), verify that the interaction was logged:
            
            1. Check if History/{YYYY-MM-DD}.md exists in perfection directory
            2. Verify it contains an entry with format "## HH:MM - {Action Taken}" where HH:MM was obtained via `Get-Date -Format "HH:mm"` (never guessed)
            3. Ensure the entry includes a one-line summary of what was done
            
            If history entry is missing:
            - Return {"decision": "block", "reason": "History entry missing. Please log this interaction to History/{YYYY-MM-DD}.md with format: ## HH:MM - {Action Taken}\n{One-line summary}\n\nCRITICAL: Get the current time using `Get-Date -Format \"HH:mm\"` command - never guess the timestamp."}
            
            If history entry exists:
            - Return {"decision": "approve"}
            
            Include a systemMessage with details about the history entry status.
---

# Perfection — Total Quality Gate Audit

Drive every quality metric in this repository to its maximum possible score.
When invoked, systematically run all quality gates and fix every finding.

## Perfection Targets

| Gate | Command | Target | What It Measures |
|------|---------|--------|------------------|
| **Test Coverage** | `bun run test:coverage` | 100% statements, branches, functions, lines | Code exercised by tests |
| **CRAP Score** | `bun run test:coverage` + complexity analysis | CRAP < 6 for every function | Change Risk Anti-Patterns (complexity × coverage gap) |
| **Scorecard** | `scorecard status` (skill) | 100/100 Gold | Org-metrics service maturity (CI/CD, security, testing, docs) |
| **ESLint** | `bun run lint` | 0 errors, 0 warnings | Code quality, patterns, best practices |
| **TypeScript** | `bun run typecheck` | 0 errors | Type safety |
| **Knip** | `bun run knip` | 0 findings | Dead code, unused exports, unused dependencies |
| **e18e** | `bun run e18e` | 0 direct-dependency findings | Dependency health, bloat, duplicates |
| **Prettier** | `bun run format:check` | 0 unformatted files | Code formatting consistency |
| **Markdown Lint** | `bun run lint:md` | 0 findings | Documentation quality |
| **Bundle Size** | `bun run bundle-size` | Within baseline budget | Production bundle weight |
| **React Doctor** | `npx react-doctor` | Score 100 | React best practices and patterns |
| **Dependency Cruiser** | `bun run deps:check` | 0 violations | No circular or forbidden dependencies |

## Commands

### `perfection audit`

Default command. Run all quality gates and produce a consolidated report.

**Steps:**

1. Run each gate in this order (fail-fast: NO — run all, report all):

   ```bash
   bun run typecheck          # Fast — type errors block everything
   bun run lint               # ESLint (--max-warnings 0)
   bun run knip               # Dead code
   bun run test:coverage      # Tests + coverage in one pass
   bun run format:check       # Prettier formatting
   bun run lint:md            # Markdown quality
   bun run bundle-size        # Bundle budget
   bun run e18e               # Dependency health
   bun run deps:check         # Circular dependencies
   npx react-doctor           # React patterns
   ```

2. For CRAP scores, after test:coverage completes:
   - Run `npx eslint . --rule "complexity: [warn, 5]"` to identify complex functions
   - Cross-reference with coverage data to estimate CRAP per function
   - Flag any function with CRAP ≥ 6

3. Fetch scorecard via the `scorecard` skill (`scorecard status`)

4. Present consolidated report:

   ```markdown
   ## Perfection Audit — hs-buddy

   | Gate | Status | Detail |
   |------|--------|--------|
   | TypeScript | ✅ / ❌ | 0 errors / N errors |
   | ESLint | ✅ / ❌ | 0 warnings / N warnings, M errors |
   | Knip | ✅ / ❌ | Clean / N findings |
   | Test Coverage | ✅ / ❌ | 100% / statements X%, branches Y% |
   | CRAP Score | ✅ / ❌ | All < 6 / N functions ≥ 6 |
   | Prettier | ✅ / ❌ | Clean / N files unformatted |
   | Markdown Lint | ✅ / ❌ | Clean / N findings |
   | Bundle Size | ✅ / ❌ | Within budget / Over by X KB |
   | e18e | ✅ / ❌ | Clean / N direct-dep findings |
   | Dep Cruiser | ✅ / ❌ | Clean / N violations |
   | React Doctor | ✅ / ❌ | 100 / Score N |
   | Scorecard | ✅ / ❌ | 100/100 Gold / N/100 Classification |

   **Perfection Score: X/12 gates passing**
   ```

### `perfection fix`

Automatically fix as many failing gates as possible in priority order.

**Priority order** (most impactful first):

1. **TypeScript errors** — blocks everything, fix first
2. **ESLint errors** — try `bun run lint:fix` first, then manual fixes
3. **Prettier** — `bun run format` (auto-fix)
4. **Knip findings** — remove dead code/exports/dependencies
5. **Test coverage gaps** — write tests for uncovered code
6. **CRAP score** — refactor complex functions + add tests
7. **React Doctor** — fix React anti-patterns
8. **Markdown Lint** — `bun run lint:md:fix` then manual
9. **Bundle size** — analyze and reduce imports
10. **e18e** — `bun run e18e:migrate` for direct deps
11. **Dep Cruiser** — untangle circular dependencies
12. **Scorecard** — use `scorecard improve` skill for non-code fixes

**For each gate:**

1. Run the check
2. If failing: apply fixes
3. Re-run to verify the fix worked
4. Move to next gate
5. After all gates: re-run full `perfection audit` to confirm

**Rules:**
- Never skip a failing gate — attempt every fix
- After each fix, re-run that specific gate to verify
- If a fix introduces failures in other gates, roll back and try a different approach
- Commit fixes in logical batches (one commit per gate, not one giant commit)

### `perfection status`

Quick one-liner status of all gates without running them. Reads from the most
recent audit results if available, otherwise runs a fresh audit.

## Integration with Other Skills

- **scorecard**: Use `scorecard status` and `scorecard improve` for the scorecard gate
- **crap**: Use the `crap` skill for detailed CRAP score analysis if available
- **sfl**: When fixes are too large for a single session, create SFL issues for each gate

## Notes

- Coverage thresholds are enforced in `vitest.config.ts` (currently set to 100% for all metrics)
- Knip policy: zero suppressions — every finding must be fixed, never ignored
- e18e: direct-dependency findings are actionable; transitive findings are informational
- ESLint runs with `--max-warnings 0` — warnings are treated as errors
- The `coverage:ratchet` script (`bun run coverage:ratchet`) auto-tightens coverage thresholds
