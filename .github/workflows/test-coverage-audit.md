---
description: |
  This workflow runs a daily test coverage audit to identify source
  files with zero or low test coverage and creates exactly one agent-fixable
  issue containing specific tests to write. Each issue targets a single file
  to keep scope manageable for the SFL Issue Processor.

on:
  schedule: "17 11 * * *"   # Daily at 6:17 AM EST (11:17 UTC)
  workflow_dispatch:

permissions:
  contents: read
  issues: read
  pull-requests: read

engine:
  id: copilot
  model: claude-opus-4.6

network: defaults

tools:
  github:
    lockdown: false

safe-outputs:
  create-issue:
    title-prefix: "[test-coverage-audit] "
    labels: [agent:fixable]
    max: 1
  update-issue:
    target: "*"
    max: 5
  add-comment:
    target: "*"
    max: 1
---

# Test Coverage Audit

> *"A test that isn't written is a bug waiting to happen."*

Run a focused test coverage audit every 4 hours. Identify **one source file**
with zero or low test coverage that would benefit most from new tests, and
produce **exactly one issue** with complete, step-by-step instructions for the
Issue Processor to write the tests in a single pass.

## Step 0 — Close previous test-coverage-audit issues

Before creating today's audit, search for all **open** issues whose title
starts with `[test-coverage-audit]`. For each one found, close it using
`update_issue` with:

- `issue_number`: the issue number
- `status`: `"closed"`

This ensures only one active test-coverage-audit issue exists at any time.

## Goals

- Identify the single highest-impact file that currently lacks test coverage
- Surface pure functions, utilities, and simple components that are easy to test
- Produce a bite-sized issue the Issue Processor can implement in one pass
- Gradually and steadily increase overall test coverage

## Test Infrastructure Context

This project uses:

- **Vitest** as the test runner (`vitest.config.ts`)
- **@testing-library/react** + **@testing-library/jest-dom** for component tests
- **happy-dom** as the test environment
- **@vitest/coverage-v8** for coverage reporting
- Test files live alongside source files as `*.test.ts` or `*.test.tsx`
- Test setup file: `src/test/setup.ts`
- Coverage thresholds are configured in `vitest.config.ts`

## File Selection Strategy

Pick the best candidate by following this priority order. Select **one file**
only — do not try to cover multiple files in a single issue.

### Priority 1 — Pure utility functions with zero coverage

Files in `src/utils/` or standalone utility files (e.g., `*Utils.ts`) that
export pure functions with no side effects, no IPC calls, and no React hooks.
These are the easiest to test and provide the most reliable coverage gains.

Check which `src/utils/*.ts` files already have a corresponding `.test.ts`
file. Pick one that does not.

### Priority 2 — Data transformation / formatting functions

Functions in component directories that handle data formatting, color mapping,
computation, or projection logic (e.g., `quotaUtils.ts`, `repoDetailUtils.ts`,
`appContentViewLabels.ts`). These are testable without mocking React or
Electron.

### Priority 3 — Simple presentational components

Small React components (<50 lines) that accept props and render UI without
complex hooks, IPC calls, or external API dependencies. These can be tested
with `render()` + query assertions from Testing Library.

### What to SKIP

Do NOT select files that:

- Depend heavily on Electron IPC (`window.ipcRenderer`, `window.electronAPI`)
- Make direct API calls (files in `src/api/`)
- Use complex React hooks with side effects (`useEffect` + fetch patterns)
- Are entry points (`main.tsx`, `App.tsx`)
- Are type-only files (`src/types/**`)
- Already have a corresponding `.test.ts` or `.test.tsx` file

## Audit Process

1. **Inventory existing tests**: List all `*.test.ts` and `*.test.tsx` files
   in `src/` to understand what is already covered.

2. **Identify candidates**: Scan `src/utils/`, `src/components/**/`, and
   `src/hooks/` for files matching the priority order above that do NOT have
   a corresponding test file.

3. **Select the best candidate**: Pick the single file that gives the most
   test coverage value for the least effort. Prefer files with:
   - Multiple exported functions (more coverage per test file)
   - Pure logic (no mocks needed)
   - Clear input/output contracts

4. **Analyze the file**: Read the selected file completely. Identify every
   exported function/component and determine what tests are needed.

5. **Design the tests**: For each exported function/component, write out the
   exact test cases needed. Follow the AAA pattern (Arrange, Act, Assert).

6. **Create the issue**: Use `create_issue` with the structure below.

7. **Log activity**: Post to Discussion #95.

## Output — Single Issue

Create **exactly one issue** using `create_issue`. The safe-output config
automatically adds the `[test-coverage-audit]` title prefix and `agent:fixable` label.

If no suitable candidate is found (all pure functions already have tests),
do NOT create an issue — skip to the activity log and report
`0 candidates — no issue created`.

### Title

`Add tests for <filename> — YYYY-MM-DD`

(The `[test-coverage-audit]` prefix is added automatically.)

### Issue body structure

The issue body must give the Issue Processor everything it needs to create
the test file in one pass. Use this exact structure:

```markdown
## Summary

Add unit tests for `<file path>` to improve test coverage.
This file contains <N> exported functions/components with zero test coverage.
Estimated coverage gain: <estimate> lines.

## Target File

- **Path**: `<file path>`
- **Exports**: <list of exported functions/components>
- **Dependencies**: <list any imports that need mocking, or "none — pure functions">
- **Test file to create**: `<test file path>`

## Tests to Write

### Test 1: `<function/component name>`

```typescript
describe('<function/component name>', () => {
  it('<test description>', () => {
    // Arrange
    <setup code>

    // Act
    <execution code>

    // Assert
    <assertion code>
  })

  it('<another test case>', () => {
    // ...
  })
})
```

<Repeat for each exported function/component>

## Implementation Notes

- Import from: `import { <exports> } from '<relative path>'`
- Test file location: `<test file path>`
- No mocks needed / Mock setup required: <details>
- Run tests with: `bun run test`
- Run coverage with: `bun run test:coverage`

## Acceptance Criteria

- [ ] Test file `<test file path>` exists
- [ ] All tests pass: `bun run test`
- [ ] No TypeScript errors: `bun run typecheck`
- [ ] Coverage for `<file>` is above 80%

```text

Formatting requirements for the issue body:

- Leave a blank line after every heading.
- Leave a blank line before and after every list.
- Leave a blank line before and after every fenced code block.
- Do NOT collapse headings, paragraphs, and lists onto the same line.
- Prefer plain Markdown over decorative formatting.

### Writing effective test instructions

The Issue Processor is an AI agent that will read this issue and implement
every test in a single PR. To maximize its success:

- **Show complete code**: Write out the actual test code, not pseudocode.
  Include imports, describe blocks, and full test bodies.
- **Be exact**: Specify the test file path, import paths, and function names.
- **Cover edge cases**: Include tests for boundary values, empty inputs,
  null/undefined handling where applicable.
- **Keep it focused**: Target 5–15 test cases per file. Enough to be thorough,
  not so many that the PR becomes unwieldy.
- **One file only**: Each issue targets exactly one source file.

### Risk assessment

Test additions are inherently low risk — they do not modify production code.
Do NOT apply risk labels. The only label is `agent:fixable` (enforced by
safe-outputs).

## Activity Log

Post an entry to **Discussion #95** using `add_comment` with
`issue_number`: `95` and `body`:

`YYYY-MM-DD h:mm AM/PM EDT | Test Audit | Coverage | ✅ <filename> — N test cases`

or if no candidate was found:

`YYYY-MM-DD h:mm AM/PM EDT | Test Audit | Coverage | ⏭️ 0 candidates — no issue created`

Timestamp rule:

- Convert the current workflow time to `America/New_York` before writing.
- Use `EDT` when daylight saving time is in effect, `EST` otherwise.
