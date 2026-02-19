---
description: |
  This workflow processes GitHub issues labelled agent:fixable. It reads the
  issue, scopes the fix, creates a focused branch with the change applied,
  opens a pull request, and relabels the issue as agent:in-progress.

on:
  issues:
    types: [labeled]

permissions:
  contents: read
  issues: read
  pull-requests: read

network: defaults

tools:
  github:
    lockdown: false

safe-outputs:
  create-pull-request:
    title-prefix: "[agent-fix] "
    labels: [agent:pr, type:fix]
  update-issue:
    max: 3
---

# Issue Processor

When an issue is labelled `agent:fixable`, read it, implement the described fix,
open a scoped pull request, and mark the issue as in-progress.

## Trigger conditions

Only proceed if ALL of the following are true:

- The triggering label is exactly `agent:fixable`
- The issue also has `type:action-item`
- The issue does NOT have `agent:pause`, `agent:human-required`, or `no-agent`
- The issue body contains a **Finding**, **Fix**, and **Acceptance criteria** section

If any condition is not met, add the label `agent:pause` to the issue and stop.

## Process

### 1. Read and validate the issue

Extract from the issue body:

- **Finding**: the file(s) and problem described
- **Fix**: the exact change to make
- **Acceptance criteria**: how to verify correctness
- **Risk**: confirm it is `risk:trivial` or `risk:low` — abort if higher

If the fix would touch more than 3 files, add `agent:human-required` and stop.

### 2. Inspect the codebase

Before writing any change:

- Read the target file(s) in full
- Confirm the problem described in the issue actually exists as stated
- If the file has already been fixed, close the issue with a comment and stop

### 3. Implement the fix

Apply the minimal change that satisfies the acceptance criteria:

- Do not refactor surrounding code
- Do not rename symbols unless that is the stated fix
- Do not add comments, docs, or type annotations to unchanged lines
- Preserve existing formatting conventions exactly

### 4. Open a pull request

Create a PR with:

- Title: `[agent-fix] <issue title without the [repo-audit] prefix>`
- Body:
  - `Closes #<issue number>`
  - Summary of what was changed and why
  - Reference to the acceptance criteria from the issue
  - Risk assessment confirmation
- Base branch: `main`
- Labels: `agent:pr`, `type:fix`

### 5. Update the issue

- Remove label `agent:fixable`
- Add label `agent:in-progress`
- Post a comment linking to the PR: "Opened PR #<number> to address this finding."

## Guardrails

- Maximum 1 PR per issue processor run
- Never force-push or amend existing commits
- Never modify files outside the scope stated in the issue Fix section
- If the fix fails validation (e.g. the file does not exist), add `agent:pause` and comment with the reason
