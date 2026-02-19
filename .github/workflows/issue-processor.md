---
description: |
  This workflow runs every 30 minutes, picks the single oldest open issue
  labelled agent:fixable, claims it, implements the described fix on a new
  branch, and opens a pull request. One issue per run — no fan-out.

on:
  schedule:
    - cron: "*/30 * * * *"
  workflow_dispatch:

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
    max: 1
---

# Issue Processor

Run every 30 minutes. Find the oldest open `agent:fixable` issue, claim it,
implement the fix, and open a pull request. Process exactly one issue per run.

## Step 1 — Find the oldest claimable issue

Search for open issues in this repository that have ALL of the following labels:

- `agent:fixable`
- `type:action-item`

And do NOT have any of:

- `agent:in-progress`
- `agent:pause`
- `agent:human-required`
- `no-agent`

Sort results by creation date ascending. Take the **single oldest** result.

If no issue matches, exit immediately — nothing to do.

## Step 2 — Claim the issue

Before doing any other work, update the issue to add label `agent:in-progress`
and remove label `agent:fixable`. This prevents a concurrent run from picking
up the same issue.

Post a comment on the issue: "🤖 Issue Processor claimed this issue. Working on a fix."

## Step 3 — Validate the issue body

The issue body must contain all three sections: **Finding**, **Fix**, and
**Acceptance criteria**.

Extract:

- **Finding**: the file path(s) and exact problem described
- **Fix**: precisely what change to make
- **Acceptance criteria**: how to verify the fix is correct
- **Risk**: must be `risk:trivial` or `risk:low`

If any section is missing, or if risk is `risk:medium` or higher, or if the
fix would touch more than 3 files: add label `agent:human-required`, remove
`agent:in-progress`, post a comment explaining the reason, and exit.

## Step 4 — Inspect the codebase

Read the target file(s) in full before writing anything:

- Confirm the problem described in the Finding actually exists as stated
- If the file has already been fixed (the problem no longer exists), close
  the issue with the comment "✅ Already resolved — closing." and exit

## Step 5 — Implement the fix on a new branch

Create a branch named `agent-fix/issue-<issue-number>` from `main`.

Apply the minimal change that satisfies the acceptance criteria:

- Do not refactor surrounding code
- Do not rename symbols unless that is the stated fix
- Do not add comments, docs, or type annotations to unchanged lines
- Preserve existing formatting conventions exactly
- Touch only the files identified in the Fix section

## Step 6 — Open a pull request

Create a PR from `agent-fix/issue-<issue-number>` into `main` with:

- Title: `[agent-fix] <issue title, stripped of any [repo-audit] prefix>`
- Body:
  - `Closes #<issue number>`
  - One-paragraph summary of what was changed and why
  - Acceptance criteria quoted from the issue
  - Risk confirmation: `risk:trivial` or `risk:low` with one-line justification
- Labels: `agent:pr`, `type:fix`

## Step 7 — Update the issue

Post a comment: "🔀 Opened PR #<number> — ready for review."

## Guardrails

- Exit after processing exactly one issue per run — never loop over multiple issues
- Never force-push, amend commits, or modify files outside the Fix scope
- If any step fails unexpectedly: add `agent:pause`, remove `agent:in-progress`,
  post a comment with the failure reason, and exit cleanly
