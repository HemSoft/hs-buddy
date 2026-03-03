---
description: |
  Runs every 30 minutes (offset 15 min from sfl-issue-processor), audits the
  relationship between issue labels and open pull requests, and repairs any
  state discrepancies it finds. Keeps the agentic pipeline self-consistent
  without human intervention.

on:
  schedule:
    - cron: "15 * * * *"
  workflow_dispatch:

permissions:
  contents: read
  issues: read
  pull-requests: read

engine:
  id: copilot
  model: claude-sonnet-4.6

network: defaults

tools:
  github:
    lockdown: false

safe-outputs:
  update-discussion:
    target: "*"
    max: 1
  update-issue:
    target: "*"
    max: 10
  add-comment:
    target: "*"
    max: 1
  remove-labels:
    max: 1
  add-labels:
    max: 1
---

# SFL Auditor

Run every 30 minutes. Audit the relationship between issue labels and open
pull requests. Detect and repair state discrepancies to keep the agentic
pipeline self-consistent. Never modify PR content — only update issues.

## Dashboard Protocol — Discussion #51

Discussion #51 is a **live status dashboard**. Its body has named sections
delimited by HTML comment markers (`<!-- SECTION:sfl-auditor -->` ...
`<!-- /SECTION:sfl-auditor -->`). When posting a status message:

1. Read discussion #51's current body
2. Find your section between the markers
3. Replace ONLY the line(s) between your markers with your new status
4. Call `update_discussion` with `discussion_number: 51` and the **complete** body

Never discard other workflows' sections. If the body is empty or missing
markers, write the full template with all 6 sections (pr-analyzer-a/b/c,
pr-fixer, pr-promoter, sfl-auditor) and populate only yours.

## Step 1 — Gather current state

Collect two lists:

**A. In-progress issues**: all open issues that have the label `agent:in-progress`.

**B. Open agent PRs**: all open pull requests (including drafts) whose head
branch name matches the pattern `agent-fix/issue-<number>-<hash>` (e.g.
`agent-fix/issue-5-8508dd6f9171b056`).

For each PR in list B, extract the issue number: it is the digit(s) immediately
after `agent-fix/issue-` and before the next `-`.

**C. Recently merged agent PRs**: all *merged* (closed) pull requests whose head
branch name matches the pattern `agent-fix/issue-<number>-<hash>`, merged within
the last 7 days. For each, extract the issue number the same way as list B.

## Step 2 — Check: orphaned agent:in-progress labels

For each issue in list A, check whether list B contains a PR whose extracted
issue number matches this issue's number.

If NO matching open PR exists for an in-progress issue:

1. Call `update_issue` with ALL of these fields in a **single call**:
   - `issue_number`: the issue number
   - `labels`: the issue's current labels with `agent:in-progress` removed and
     `agent:fixable` added (keep all other existing labels unchanged)
   - `body`: "⚠️ **SFL Auditor**: No open PR found for this issue. Resetting to `agent:fixable` so the issue processor can reclaim it on the next run."
   - `operation`: `"append"`

**IMPORTANT**: Labels and body MUST be in the same `update_issue` call.
Splitting them into two calls causes label changes to be silently dropped.

## Step 3 — Check: conflicting labels

For each open issue that has BOTH `agent:in-progress` AND `agent:fixable`
simultaneously:

1. Call `update_issue` with:
   - `issue_number`: the issue number
   - `labels`: the issue's current labels with `agent:fixable` removed (keep
     `agent:in-progress` and all other existing labels)

## Step 4 — (Removed — consolidated into agent:fixable)

## Step 5 — Check: orphaned agent PRs

For each PR in list B, look up the corresponding issue (using the number
extracted in Step 1). If that issue does NOT have `agent:in-progress`:

1. Call `update_issue` with:
   - `issue_number`: the issue number
   - `body`: "ℹ️ **SFL Auditor**: PR #<pr-number> exists on branch `<branch-name>` but this issue is no longer labeled `agent:in-progress`. A human should decide whether to close the PR or restore the label."
   - `operation`: `"append"`

Skip this check if the issue was already processed in Step 2 (to avoid
double-commenting).

## Step 6 — Check: merged PRs with issues left open

For each PR in list C (recently merged agent PRs), look up the corresponding
issue using the extracted issue number. If that issue is still **OPEN**:

1. Call `update_issue` with ALL of these fields in a **single call**:
   - `issue_number`: the issue number
   - `status`: `"closed"`
   - `body`: "✅ **SFL Auditor**: PR #<pr-number> was merged but this issue was left open. Closing it now."
   - `operation`: `"append"`

Skip issues that still have `agent:in-progress` AND a matching open PR in
list B (those are handled by other steps).

## Step 7 — Check: stale report issues

Search for **open** issues that have the label `report` (or both
`daily-status` and `report`) but do NOT have any of:
`agent:fixable`, `agent:in-progress`.

These are pure informational report issues (daily status, audit summaries,
simplisticate summaries). If more than one issue shares the same title prefix
(e.g., multiple `[repo-status]` or `[repo-audit] Daily Repo Audit` issues),
close all but the most recent one using `update_issue` with:

- `issue_number`: the issue number
- `status`: `"closed"`
- `body`: "🧹 **SFL Auditor**: Closing stale report issue — a newer report exists."
- `operation`: `"append"`

## Step 8 — Check: stale unclaimed issues

Search for **open** issues that have the label `agent:fixable` but do NOT have
`agent:in-progress`, `agent:pause`, `agent:human-required`, or `agent:escalated`.

For each such issue, check whether it was created more than **2 hours ago**.

If an `agent:fixable` issue is older than 2 hours and has not been claimed:

1. Call `update_issue` with ALL of these fields in a **single call**:
   - `issue_number`: the issue number
   - `body`: "⏰ **SFL Auditor**: This issue has been `agent:fixable` for over 2 hours without being claimed by the Issue Processor. This may indicate a pipeline stall. A human should investigate whether the Issue Processor is running correctly."
   - `operation`: `"append"`

Only flag each issue **once** — if the issue already has a comment containing
"over 2 hours without being claimed", skip it.

## Step 9 — Check: stalled draft PRs without analyzer reviews

For each PR in list B (open agent PRs), check whether the PR is a **draft**
and was created more than **2 hours ago**.

For each such stale draft PR, check the PR body for analyzer markers:
`[MARKER:pr-analyzer-a cycle:`, `[MARKER:pr-analyzer-b cycle:`,
`[MARKER:pr-analyzer-c cycle:`.

If ANY of the three markers is missing, check the **PR body text** for the
string `missing one or more analyzer markers`. Search the FULL body — not
comments, not just the last paragraph. The body is the main description
returned by `GET /repos/{owner}/{repo}/pulls/{number}` in the `body` field.

If that exact string already appears ANYWHERE in the PR body, this PR was
already flagged — **skip it entirely, do NOT append another warning**.

Only if the string is truly absent from the body, call `update_issue` with:

- `issue_number`: the PR number
- `body`: "⏰ **SFL Auditor**: Draft PR #<pr-number> has been open for over 2 hours and is missing one or more analyzer markers. The PR Analyzers may not be dispatching for this PR. A human should investigate."
- `operation`: `"append"`

## Step 10 — Check: unexplained agent:pause

For each open issue with `agent:pause`, check whether any comment on that
issue contains the words "pause" or "paused" or "agent:pause".

If NO such comment exists:

1. Call `update_issue` with:
   - `issue_number`: the issue number
   - `body`: "🔍 **SFL Auditor**: This issue has `agent:pause` but no explanation comment was found. A human should add a comment explaining the pause, or remove the label to resume processing."
   - `operation`: `"append"`

## Step 11 — Check: stuck ready-to-merge PRs

Search for open pull requests (non-draft) that have the label `ready-to-merge`.

For each such PR, check when the `ready-to-merge` label was added. Use the
timeline events API (`GET /repos/{owner}/{repo}/issues/{number}/timeline`) to
find the `labeled` event where `label.name` is `ready-to-merge`. Note the
`created_at` timestamp of that event.

If the label was added **more than 2 hours ago** and the PR is still open
(not merged), the merge event failed and needs to be retried.

To retry:

1. Call `remove_labels` with `ready-to-merge` on the PR
2. Call `add_labels` with `ready-to-merge` on the PR

This re-fires the `pull_request: labeled` event, which triggers the
`pr-label-actions.yml` squash-merge job.

Only retry **one** PR per auditor run (the oldest stuck one). If multiple
PRs are stuck, subsequent auditor runs will handle the rest.

If the PR body already contains the text `SFL Auditor: retried ready-to-merge`,
skip it — a previous auditor run already toggled it and the merge is still
failing for a different reason. Flag it with `update_issue` (append):
"⚠️ **SFL Auditor**: PR #<number> has `ready-to-merge` but merge retry
already attempted. A human should investigate."

If the retry is performed, also call `update_issue` (append) on the PR:
"🔄 **SFL Auditor**: retried ready-to-merge — label toggled after 2+ hours
without merge."

## Step 12 — Signal completion

After completing all checks (Steps 2–11), you MUST always call exactly one of:

- `update_issue` — if any discrepancy was found and repaired (already called above)
- Update the dashboard (see Dashboard Protocol) — if ALL checks
  passed and NO discrepancies were found

Never finish the run without calling at least one safe output. A run with zero
safe outputs is treated as a failure.

## Activity Log

As your **final action**, post a one-line comment to **Discussion #95** (the SFL Activity Log) using `add_comment`:

- `issue_number`: `95`
- `body`: `YYYY-MM-DD h:mm AM/PM EST | SFL Auditor | Audit | ✅ All checks passed` or `⚠️ N discrepancies repaired`

This is mandatory — every run must log exactly one entry.

## Guardrails

- Never modify PR content — only update issues/PRs via `update_issue`
- The only permitted PR label modification is the `ready-to-merge` toggle in Step 11
- Never remove `agent:human-required` — that label requires explicit human action
- Never add `agent:fixable` to an issue that already has a matching open PR
- Always post the recovery comment in Step 2 even if a previous auditor run already commented — it documents the recurring issue and aids debugging
- If the GitHub API search fails for any step, skip that step and continue with the rest
- At most 10 `update_issue` calls per run (enforced by safe-outputs max)
