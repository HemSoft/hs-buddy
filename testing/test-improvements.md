# Test Coverage Improvement — Auto-Pilot Prompt

## Goal

Improve test coverage across the codebase to **90%** (statements, branches, functions, and lines).

## Instructions

You are an autonomous test-improvement agent.

<loop id="coverage-loop" max_iterations="5">

<!--
  THIS IS A LOOP. You MUST execute iterations 1 through 5 (or until 90% is
  reached). After completing one iteration you MUST go back to <step_1>.

  ❌ WRONG: Complete one iteration → call task_complete
  ❌ WRONG: Complete one iteration → ask user what to do next
  ❌ WRONG: Complete one iteration → summarize and stop
  ✅ RIGHT: Complete one iteration → go back to <step_1> → start next iteration
-->

<step_1 name="Measure Current Coverage">

Run the test suite with coverage enabled:

```bash
npx vitest run --coverage
```

Record the coverage summary for **statements**, **branches**, **functions**, and **lines**.

</step_1>

<step_2 name="Check Completion">

<exit_condition>
  If ALL FOUR coverage metrics (statements, branches, functions, lines) are ≥ 90%:
  → Log "All coverage thresholds reached 90%." and call task_complete.
  THIS IS THE ONLY CONDITION THAT ALLOWS YOU TO STOP.
</exit_condition>

If any metric is below 90% → continue to step_3.

</step_2>

<step_3 name="Identify the Biggest Gaps">

Analyze the coverage report:

- Sort files by **uncovered lines** (descending).
- Prioritize files with the **most uncovered branches and statements**.
- Focus on source files under `src/` (excluding `src/test/`, `src/types/`, `src/main.tsx`, `src/vite-env.d.ts`).

</step_3>

<step_4 name="Implement Test Improvements">

Pick **1–3 files** with the lowest coverage and:

- Write or expand unit tests in the corresponding `*.test.ts` or `*.test.tsx` file.
- Follow existing test conventions (Vitest + Testing Library, `happy-dom` environment).
- Use the setup file at `src/test/setup.ts` for shared test configuration.
- Mock external dependencies (APIs, Electron IPC, Convex) — do not make real network calls.
- Cover **happy paths**, **edge cases**, and **error handling**.
- Do **not** add tests for type-only files, barrel exports, or trivial re-exports.

</step_4>

<step_5 name="Validate">

Run:

```bash
npx vitest run --coverage
```

- All new tests must **pass**.
- Coverage numbers must **not decrease** for any file.
- Fix any failing tests before proceeding.

</step_5>

<step_6 name="Log Iteration">

Append a summary to `testing/test-improvements.md` (this file) under the **Iteration Log** section. Each entry must include:

| Field               | Description                                          |
|---------------------|------------------------------------------------------|
| **Iteration**       | Sequential number (1, 2, 3, …)                       |
| **Date**            | Date of the run                                      |
| **Files Targeted**  | Which source files were tested                       |
| **Tests Added**     | Count of new test cases                              |
| **Coverage Before** | Statements / Branches / Functions / Lines (%)        |
| **Coverage After**  | Statements / Branches / Functions / Lines (%)        |
| **Key Takeaways**   | What was learned, patterns found, or obstacles hit   |

</step_6>

<continue_loop>
  GO BACK TO <step_1> NOW.
  Do NOT stop. Do NOT call task_complete. Do NOT ask the user.
  Do NOT yield control. Start the next iteration immediately.
</continue_loop>

</loop>

<on_loop_exit reason="max_iterations_reached">
  You have completed 5 iterations without reaching 90%.
  Log "Safety cap reached (5 iterations). Re-invoke to continue." in the iteration log.
  ONLY NOW may you call task_complete.
</on_loop_exit>

## Rules

- **Never skip the coverage check.** Always measure before and after.
- **Never lower coverage.** If a refactor is needed, ensure net coverage stays the same or increases.
- **Keep tests focused and fast.** No integration tests, no browser tests, no slow I/O.
- **Respect existing patterns.** Match the style, naming, and structure of existing test files.
- **Do NOT call task_complete** until either 90% is reached or 5 iterations are done.

## Current Thresholds (vitest.config.ts)

```text
statements: 0.5%
branches:   0.3%
functions:  0.3%
lines:      0.5%
```

Target: **90%** across all four metrics.

---

## Iteration Log

<!-- Append iteration entries below this line -->

### Iteration 1

| Field | Description |
|---|---|
| **Iteration** | 1 |
| **Date** | 2026-03-16 |
| **Files Targeted** | `src/services/dataCache.ts`, `src/api/github.ts` |
| **Tests Added** | 22 new test cases (6 for dataCache, 16 for github API) |
| **Coverage Before** | 12.70% / 11.79% / 9.24% / 12.61% |
| **Coverage After** | 13.54% / 12.56% / 10.53% / 13.52% |
| **Key Takeaways** | **dataCache.ts** jumped from 69.56% → 93.47% by covering error paths (`set`/`delete`/`clear` disk failures), `isInitialized()`, and default `fetchedAt`. Remaining gap is the `initialize()` method's disk-load path (lines 46-47) which is hard to test due to module-level initialization. **github.ts** gained coverage for 9 previously-untested methods: `fetchRepoIssues`, `fetchRepoIssueDetail`, `replyToReviewThread`, `resolveReviewThread`, `unresolveReviewThread`, `addPRComment`, `addCommentReaction`, `approvePullRequest`, `getRateLimit`. The `isInitialized()` test initially failed because the module's `initialized` flag defaults to `false` and requires an explicit `initialize()` call — fixed by calling it in the test. Most remaining coverage gaps are in React components (0%) and hooks (0-5%) which require more setup to test. |

### Iteration 2

| Field | Description |
|---|---|
| **Iteration** | 2 |
| **Date** | 2026-03-16 |
| **Files Targeted** | `src/hooks/useAssistantContext.ts`, `src/api/github.ts` |
| **Tests Added** | 21 new test cases (16 for useAssistantContext hook, 5 for github: fetchOrgRepos, fetchOrgMembers, fetchSFLStatus) |
| **Coverage Before** | 13.54% / 12.56% / 10.53% / 13.52% |
| **Coverage After** | 14.70% / 13.83% / 12.50% / 14.74% |
| **Key Takeaways** | **useAssistantContext.ts** reached 100% across all metrics by testing the `useAssistantContext` hook via `renderHook`. Covered all 10 VIEW_DEFINITIONS (pr-detail, repo-detail, repo-commits, repo-commit, repo-issue, repo-issues-closed, repo-issues, repo-prs-closed, repo-prs, copilot-result), pr-list variants (pr-my-prs, pr-needs-review, pr-recently-merged, pr-unknown→fallback), null→welcome, and settings→other default. **github.ts** gained coverage for `fetchOrgRepos` (via paginateRepos → repos.listForOrg), `fetchOrgMembers` (via paginate → orgs.listMembers), and `fetchSFLStatus` (matching SFL_CORE_WORKFLOW_FRAGMENTS against workflow names). Mock methods `repos.listForOrg`, `actions.listRepoWorkflows`, and `actions.listWorkflowRuns` were dynamically added to mockOctokit within each test. |

### Iteration 3

| Field | Description |
|---|---|
| **Iteration** | 3 |
| **Date** | 2026-03-16 |
| **Files Targeted** | `src/api/github.ts` |
| **Tests Added** | 4 new test cases (fetchUserActivity success + error, fetchOrgOverview success) |
| **Coverage Before** | 14.70% / 13.83% / 12.50% / 14.74% |
| **Coverage After** | 15.73% / 14.26% / 13.80% / 15.77% |
| **Key Takeaways** | **github.ts** jumped from 54.4% to 65.84% statements by testing `fetchUserActivity` (4 parallel API calls with search.issuesAndPullRequests + activity.listPublicEventsForUser) and `fetchOrgOverview` (aggregates org metrics from repos, issues, PRs, and per-repo commits). The `fetchUserActivity` error test confirmed all `.catch()` fallbacks work correctly. The `fetchOrgOverview` "no account" test was removed because the global mockInvoke always returns tokens, making it impossible to simulate missing accounts without restructuring the mock. **github.ts** now has 84.95% function coverage — only private helpers and some branch paths remain uncovered. All public methods are now tested. |

### Iteration 4

| Field | Description |
|---|---|
| **Iteration** | 4 |
| **Date** | 2026-03-16 |
| **Files Targeted** | `src/hooks/useBackgroundStatus.ts`, `src/hooks/useTaskQueue.ts` |
| **Tests Added** | 8 new test cases (4 for useBackgroundStatus hook via renderHook, 4 for useTaskQueue hook via renderHook) |
| **Coverage Before** | 15.73% / 14.26% / 13.80% / 15.77% |
| **Coverage After** | 16.69% / 14.63% / 14.54% / 16.77% |
| **Key Takeaways** | **useBackgroundStatus.ts** hook (lines 79-140) now tested via renderHook with mocked dependencies (usePRSettings, getTaskQueue, dataCache). Tests cover idle phase, syncing phase with active tasks, countdown computation from cache entries, and null countdown during sync. vi.useFakeTimers() used to control the 1-second setInterval. **useTaskQueue.ts** hook tested end-to-end using the real taskQueue service (no mocking needed since it's pure JS). Tests cover initial state, enqueue+complete flow, unmount cleanup, and cancelAll. Total coverage still low at 16.69% — remaining gaps are primarily in React components (.tsx files at 0%) which require more complex mocking of providers, routing, and context. |

### Iteration 5

| Item | Detail |
|---|---|
| **Target** | useConfig.ts (286 lines, 0% coverage) — useConfig, useGitHubAccounts, usePRSettings, useCopilotSettings hooks |
| **Tests Added** | 20 new test cases in useConfig.test.ts (4 useConfig, 6 useGitHubAccounts, 4 usePRSettings, 4 useCopilotSettings + 2 error cases) |
| **Coverage Before** | 16.69% / 14.63% / 14.54% / 16.77% |
| **Coverage After** | 18.23% / 15.60% / 16.08% / 18.39% |
| **Key Takeaways** | **useConfig.ts** hooks all follow a Convex-primary / electron-store-fallback pattern. Mocked useConvex hooks (useGitHubAccountsConvex, useGitHubAccountMutations, useSettings, useSettingsMutations) and window.ipcRenderer. Key learning: cannot use `vi.stubGlobal('window', ...)` in tests that renderHook — it replaces the entire happy-dom window and breaks React internals. Must use `Object.defineProperty(window, 'ipcRenderer', ...)` instead. Tested CRUD operations for accounts, settings getters/setters for PR and Copilot, config loading and refresh, and error handling paths. |

---

**Safety cap reached (5 iterations).** Re-invoke to continue. Current coverage: 18.23% stmts / 15.60% branches / 16.08% functions / 18.39% lines. Target: 90%.
