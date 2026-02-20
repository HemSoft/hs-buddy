---
description: |
  Runs every 30 minutes (offset 15 min from issue-processor), audits the
  relationship between issue labels and open pull requests, and repairs any
  state discrepancies it finds. Keeps the agentic pipeline self-consistent
  without human intervention.

on:
  schedule:
    - cron: "15,45 * * * *"
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
  update-issue:
    target: "*"
    max: 10
---

# SFL Auditor

Run every 30 minutes. Audit the relationship between issue labels and open
pull requests. Detect and repair state discrepancies to keep the agentic
pipeline self-consistent. Never modify PR content — only update issues.

## Step 1 — Gather current state

Collect two lists:

**A. In-progress issues**: all open issues that have the label `agent:in-progress`.

**B. Open agent PRs**: all open pull requests (including drafts) whose head
branch name matches the pattern `agent-fix/issue-<number>-<hash>` (e.g.
`agent-fix/issue-5-8508dd6f9171b056`).

For each PR in list B, extract the issue number: it is the digit(s) immediately
after `agent-fix/issue-` and before the next `-`.

## Step 2 — Check: orphaned agent:in-progress labels

For each issue in list A, check whether list B contains a PR whose extracted
issue number matches this issue's number.

If NO matching open PR exists for an in-progress issue:

1. Call `update_issue` with:
   - `issue_number`: the issue number
   - `labels`: the issue's current labels with `agent:in-progress` removed and
     `agent:fixable` added (keep all other existing labels unchanged)

2. Call `update_issue` with:
   - `issue_number`: the issue number
   - `body`: "⚠️ **SFL Auditor**: No open PR found for this issue. Resetting to `agent:fixable` so the issue processor can reclaim it on the next run."
   - `operation`: `"append"`

## Step 3 — Check: conflicting labels

For each open issue that has BOTH `agent:in-progress` AND `agent:fixable`
simultaneously:

1. Call `update_issue` with:
   - `issue_number`: the issue number
   - `labels`: the issue's current labels with `agent:fixable` removed (keep
     `agent:in-progress` and all other existing labels)

## Step 4 — Check: orphaned agent PRs

For each PR in list B, look up the corresponding issue (using the number
extracted in Step 1). If that issue does NOT have `agent:in-progress`:

1. Call `update_issue` with:
   - `issue_number`: the issue number
   - `body`: "ℹ️ **SFL Auditor**: PR #<pr-number> exists on branch `<branch-name>` but this issue is no longer labeled `agent:in-progress`. A human should decide whether to close the PR or restore the label."
   - `operation`: `"append"`

Skip this check if the issue was already processed in Step 2 (to avoid
double-commenting).

## Step 5 — Check: unexplained agent:pause

For each open issue with `agent:pause`, check whether any comment on that
issue contains the words "pause" or "paused" or "agent:pause".

If NO such comment exists:

1. Call `update_issue` with:
   - `issue_number`: the issue number
   - `body`: "🔍 **SFL Auditor**: This issue has `agent:pause` but no explanation comment was found. A human should add a comment explaining the pause, or remove the label to resume processing."
   - `operation`: `"append"`

## Guardrails

- Never modify PR content or labels — only update issues via `update_issue`
- Never remove `agent:human-required` — that label requires explicit human action
- Never add `agent:fixable` to an issue that already has a matching open PR
- If a check finds nothing wrong, do nothing — no noop comments
- If the GitHub API search fails for any step, skip that step and continue with the rest
- At most 10 `update_issue` calls per run (enforced by safe-outputs max)
