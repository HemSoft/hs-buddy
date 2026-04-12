---
description: |
  Manual-only emergency-mode workflow that audits the
  relationship between issue labels and open pull requests, and repairs any
  state discrepancies it finds. Keeps the agentic pipeline self-consistent
  without human intervention.

on:
  workflow_dispatch:

permissions:
  contents: read
  issues: read
  pull-requests: read

concurrency:
  group: "gh-aw-copilot-${{ github.workflow }}"
  cancel-in-progress: false

engine:
  id: copilot
  model: gpt-5.4

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
source: relias-engineering/set-it-free-loop/.github/workflows/sfl-auditor.md@920f9ef4b146573d638fe871db44afc0f0dc6303
---

# SFL Auditor

Manual-only emergency mode. Audit the relationship between issue labels and open
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
markers, write the full template with all 5 sections (sfl-analyzer-a/b/c,
sfl-auditor) and populate only yours.

## Step 1 — Gather current state

Collect two lists:

**A. In-progress issues**: all open issues that have the label `agent:in-progress`.

**B. Open agent PRs**: all open pull requests (including drafts) labeled
`agent:pr`.

For each PR in list B, resolve the linked issue number using this order:

1. `Closes #<number>` in the PR body
2. `**Linked Issue**: #<number>` in the PR body
3. Fallback only: branch name pattern `agent-fix/issue-<number>-<hash>`

**C. Recently merged agent PRs**: all *merged* (closed) pull requests whose head
branch or title identifies them as SFL agent PRs and whose linked issue number
can be resolved using the same order as list B, merged within the last 7 days.

Treat the PR label `agent:pr`, the standard SFL body markers, and the linked-issue
metadata in the body as the source of truth. Branch naming is only a fallback
for older PRs.

## Step 2 — Check: orphaned agent:in-progress labels

For each issue in list A, check whether list B contains a PR whose extracted
issue number matches this issue's number.

Count the matches exactly — do not treat "one or more" as automatically healthy.

If NO matching open PR exists for an in-progress issue:

1. Call `update_issue` with ALL of these fields in a **single call**:
   - `issue_number`: the issue number
   - `labels`: the issue's current labels with `agent:in-progress` removed and
     `agent:fixable` added (keep all other existing labels unchanged)
   - `body`: "⚠️ **SFL Auditor**: No open PR found for this issue. Resetting to `agent:fixable` so the issue processor can reclaim it on the next run."
   - `operation`: `"append"`

**IMPORTANT**: Labels and body MUST be in the same `update_issue` call.
Splitting them into two calls causes label changes to be silently dropped.

If MORE THAN ONE matching open PR exists for an in-progress issue, this is a
split-brain pipeline failure.

1. Call `update_issue` with ALL of these fields in a **single call**:
   - `issue_number`: the issue number
   - `labels`: the issue's current labels with `agent:in-progress` removed and
     `agent:pause` added (keep all other existing labels unchanged)
   - `body`: "⚠️ **SFL Auditor**: Multiple open agent PRs were found for this issue. This violates the one-issue-one-PR invariant, so the issue is being paused for human cleanup. Investigate duplicate draft PRs before resuming automation."
   - `operation`: `"append"`

This is not a warning-only condition. It is a discrepancy that must be surfaced
and paused.

## Step 3 — Check: conflicting labels

For each open issue that has BOTH `agent:in-progress` AND `agent:fixable`
simultaneously:

1. Call `update_issue` with:
   - `issue_number`: the issue number
   - `labels`: the issue's current labels with `agent:fixable` removed (keep
     `agent:in-progress` and all other existing labels)

## Step 4 — (Removed — consolidated into agent:fixable)

## Step 5 — Check: open agent PRs whose linked issue state is invalid

For each PR in list B, look up the corresponding issue (using the number
extracted in Step 1).

If that issue is **CLOSED**, this is a broken state. An open `agent:pr` PR
cannot belong to a closed issue.

1. Build repaired labels from the issue's current labels.
2. If the repaired labels do NOT already contain any of `agent:in-progress`,
  `agent:pause`, `agent:human-required`, or `agent:escalated`, add
  `agent:in-progress`.
3. Call `update_issue` with ALL of these fields in a **single call**:

    - `issue_number`: the issue number
    - `status`: `"open"`
    - `labels`: the repaired labels
    - `body`: "⚠️ **SFL Auditor**: PR #<pr-number> is still open on branch `<branch-name>` but this issue was closed. Reopening the issue so PR and issue state stay aligned."
    - `operation`: `"append"`

Skip the rest of Step 5 for that issue after reopening it.

If the issue is OPEN but does NOT have `agent:in-progress`:

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

## Step 7 — Check: closed issues with stale `agent:in-progress`

Search for **closed** issues that still have the label `agent:in-progress`.

For each such closed issue:

1. Call `update_issue` with ALL of these fields in a **single call**:
   - `issue_number`: the issue number
   - `labels`: the issue's current labels with `agent:in-progress` removed
     (keep all other existing labels unchanged)
   - `body`: "🧹 **SFL Auditor**: This issue is already closed, so removing stale `agent:in-progress` state."
   - `operation`: `"append"`

This is a cleanup step for cases where the issue was closed manually or by PR
keywords but no open agent PR still depends on it. If Step 5 already reopened
the issue because an open agent PR still points at it, skip this cleanup.

## Step 8 — Check: stale report issues

Search for **open** issues that have the label `report`
but do NOT have any of:
`agent:fixable`, `agent:in-progress`.

These are pure informational report issues (daily status, audit summaries,
simplisticate summaries). If more than one issue shares the same title prefix
(e.g., multiple `[repo-status]` or `[repo-audit] Repo Audit` issues),
close all but the most recent one using `update_issue` with:

- `issue_number`: the issue number
- `status`: `"closed"`
- `body`: "🧹 **SFL Auditor**: Closing stale report issue — a newer report exists."
- `operation`: `"append"`

## Step 9 — Check: stale unclaimed issues

Search for **open** issues that have the label `agent:fixable` but do NOT have
`agent:in-progress`, `agent:pause`, `agent:human-required`, or `agent:escalated`.

For each such issue, check how long it has remained unclaimed.

If an `agent:fixable` issue is older than **15 minutes** but not older than
**2 hours**, immediate dispatch likely failed even though the issue was ready
to process right away.

1. Call `update_issue` with ALL of these fields in a **single call**:

- `issue_number`: the issue number
- `body`: "⏱️ **SFL Auditor**: This issue has been `agent:fixable` for over 15 minutes without being claimed by the Issue Processor. Immediate issue intake may have failed. Investigate whether the issue opened with `agent:fixable` already present or whether Issue Processor concurrency blocked the run."
- `operation`: `"append"`

Only flag each issue **once** — if the issue already has a comment containing
"Immediate dispatch may have failed", skip it.

If an `agent:fixable` issue is older than 2 hours and has not been claimed:

1. Call `update_issue` with ALL of these fields in a **single call**:
   - `issue_number`: the issue number
   - `body`: "⏰ **SFL Auditor**: This issue has been `agent:fixable` for over 2 hours without being claimed by the Issue Processor. This may indicate a pipeline stall. A human should investigate whether the Issue Processor is running correctly."
   - `operation`: `"append"`

Only flag each issue **once** — if the issue already has a comment containing
"over 2 hours without being claimed", skip it.

## Step 10 — Check: stalled draft PRs without analyzer reviews

For each PR in list B (open agent PRs), check whether the PR is a **draft**
and was created more than **2 hours ago**.

For each such stale draft PR, check the PR body for analyzer markers:
`<!-- MARKER:sfl-analyzer-a cycle:`, `<!-- MARKER:sfl-analyzer-b cycle:`,
`<!-- MARKER:sfl-analyzer-c cycle:`.

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

## Step 11 — Check: analyzer starvation by oldest-draft selection

For open agent PRs in list B, create a draft-only subset and sort by creation
date ascending.

If there are at least 2 draft PRs:

1. Let `oldest` be the first draft PR in sorted order.
2. Determine `oldest` current cycle N from `pr:cycle-N` labels (default 0).
3. Check whether `oldest` body contains
  `<!-- MARKER:sfl-analyzer-a cycle:N -->`, `<!-- MARKER:sfl-analyzer-b cycle:N -->`, and
  `<!-- MARKER:sfl-analyzer-c cycle:N -->`.
4. Find any newer draft PR where at least one analyzer marker is missing for
  its current cycle.

If `oldest` has all three analyzer markers for its current cycle AND a newer
draft PR is missing one or more analyzer markers for its own current cycle,
append exactly one warning comment to that newer PR via `update_issue`:

- `issue_number`: the newer PR number
- `body`: "⚠️ **SFL Auditor**: Potential analyzer starvation detected. An older draft PR appears fully analyzed for its current cycle while this newer draft PR is still missing one or more analyzer markers. Analyzer target-selection logic may be stuck on oldest-first behavior."
- `operation`: `"append"`

Only flag each newer PR once. If its body already contains the exact string
`Potential analyzer starvation detected`, skip it.

Additional current-cycle label-actions handoff check:

For each open draft agent PR in list B:

1. Determine the current cycle N from `pr:cycle-N` labels (default 0).
2. Check whether the PR **comments** contain `<!-- MARKER:sfl-analyzer-c cycle:N -->`.

If the Analyzer C marker for cycle N exists in a comment, check the PR's labels:

- If the PR has neither `analyzer:blocked` nor `human:ready-for-review`, this
  suggests Analyzer C completed but `sfl-pr-label-actions` did not run or did
  not apply labels. Append exactly one warning comment to that PR via `add_comment`:

- `issue_number`: the PR number
- `body`: "⚠️ **SFL Auditor**: Analyzer C completed for current cycle <N>, but neither `analyzer:blocked` nor `human:ready-for-review` label is present. This suggests Analyzer C dispatched label-actions but it did not complete. Investigate the Analyzer C → label-actions handoff."

Only flag each PR once. If its comments already contain the exact string
`Analyzer C completed for current cycle` then skip it.

## Step 12 — Check: invalid supersede narrative on open agent PRs

For each open agent PR in list B, check the PR body for either of these
strings:

- `Supersedes #`
- `push_to_pull_request_branch failed`

These strings indicate an invalid replacement-PR narrative for the active SFL
model. Follow-up implementation passes must update the existing draft PR in
place or fail visibly. The Auditor cannot verify run-log evidence for a prior
push attempt, so any open PR that advertises itself as a superseding fallback
is itself a discrepancy that must be surfaced.

If either string is present in the PR body:

1. Resolve the linked issue number for that PR.
2. Call `update_issue` with ALL of these fields in a **single call**:
   - `issue_number`: the linked issue number
   - `labels`: the issue's current labels with `agent:in-progress` removed and
     `agent:pause` added (keep all other existing labels unchanged)
   - `body`: "⚠️ **SFL Auditor**: PR #<pr-number> contains a superseding replacement-PR narrative (`Supersedes #...` or `push_to_pull_request_branch failed`). Follow-up implementation must update the existing draft PR in place or fail visibly; replacement PRs are an SFL discrepancy. Investigate the originating run artifacts before resuming automation."
   - `operation`: `"append"`

Only flag each issue once for this condition. If the issue body already
contains the exact string `contains a superseding replacement-PR narrative`,
skip it.

## Step 13 — Check: unexplained agent:pause

For each open issue with `agent:pause`, check whether any comment on that
issue contains the words "pause" or "paused" or "agent:pause".

If NO such comment exists:

1. Call `update_issue` with:
   - `issue_number`: the issue number
   - `body`: "🔍 **SFL Auditor**: This issue has `agent:pause` but no explanation comment was found. A human should add a comment explaining the pause, or remove the label to resume processing."
   - `operation`: `"append"`

## Step 14 — Signal completion

After completing all checks (Steps 2–13), you MUST always call exactly one of:

- `update_issue` — if any discrepancy was found and repaired (already called above)
- Update the dashboard (see Dashboard Protocol) — if ALL checks
  passed and NO discrepancies were found

Never finish the run without calling at least one safe output. A run with zero
safe outputs is treated as a failure.

Examples:

| Observed state | Valid result |
| --- | --- |
| In-progress issue with zero matching PRs | reset to `agent:fixable` |
| In-progress issue with exactly one matching PR | no discrepancy from Step 2 |
| In-progress issue with two or more matching PRs | pause the issue and append split-brain explanation |
| Stale draft PR already flagged for missing markers | skip duplicate warning |

## Activity Log

As your **final action**, post a one-line comment to **Discussion #95** (the SFL Activity Log) using `add_comment`:

- `issue_number`: `95`
- `body`: `YYYY-MM-DD h:mm AM/PM EDT | SFL Auditor | Audit | ✅ All checks passed` or `⚠️ N discrepancies repaired`; use `EST` instead of `EDT` only when standard time is actually in effect

Timestamp rule for Discussion #95 entries:

- Convert the current workflow time to `America/New_York` before writing the log line.
- Use the converted local **date and time**, not the UTC date.
- Use `EDT` when daylight saving time is in effect and `EST` otherwise.
- Valid: `2026-03-08 10:56 PM EDT | ...`
- Invalid: `2026-03-09 2:56 AM EST | ...` when the workflow ran at `2026-03-09T02:56:00Z`

This is mandatory — every run must log exactly one entry.

## Guardrails

- Never modify PR content — only update issues/PRs via `update_issue`
- Never modify PR labels as part of auditor repairs
- Never remove `agent:human-required` — that label requires explicit human action
- Never add `agent:fixable` to an issue that already has a matching open PR
- Always post the recovery comment in Step 2 even if a previous auditor run already commented — it documents the recurring issue and aids debugging
- If the GitHub API search fails for any step, skip that step and continue with the rest
- At most 10 `update_issue` calls per run (enforced by safe-outputs max)
