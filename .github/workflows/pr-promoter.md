---
description: |
  PR Promoter — two-phase workflow. Phase 1: converts clean draft PRs to
  ready-for-review when all three analyzers PASS. Phase 2: squash-merges
  approved PRs that have human approval and deletes the source branch.
  Processes exactly one promotion and one merge per run.

on:
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
    max: 2
  update-issue:
    target: "*"
    max: 5
---

# PR Promoter

Run every 30 minutes (offset 5 min after PR Fixer). Find the oldest draft PR
labeled `agent:pr` where all three analyzer verdicts are **PASS** in the
current cycle. Convert it from draft to ready-for-review and post a promotion
comment. Process exactly one PR per run.

## Dashboard Protocol — Discussion #51

Discussion #51 is a **live status dashboard**. Its body has named sections
delimited by HTML comment markers (`<!-- SECTION:pr-promoter -->` ...
`<!-- /SECTION:pr-promoter -->`). When posting a skip or status message:

1. Read discussion #51's current body
2. Find your section between the markers
3. Replace ONLY the line(s) between your markers with your new status
4. Call `update_discussion` with `discussion_number: 51` and the **complete** body

Never discard other workflows' sections. If the body is empty or missing
markers, write the full template with all 6 sections (pr-analyzer-a/b/c,
pr-fixer, pr-promoter, sfl-auditor) and populate only yours.

## Step 1 — Find the target PR

Search for open pull requests in this repository that meet ALL criteria:

- Is a **draft** PR
- Has the label `agent:pr`
- Does NOT have the label `agent:human-required`

Sort results by creation date ascending. Take the **single oldest** result.

If no PR matches, skip to Phase 2 (Step 11 — Merge Job).

## Step 2 — Determine the current review cycle

Check the PR's labels for a `pr:cycle-N` label (where N is 1, 2, or 3).

- If no `pr:cycle-N` label exists, the current cycle is `0`
- If `pr:cycle-1` exists, the current cycle is `1`
- If `pr:cycle-2` exists, the current cycle is `2`
- If `pr:cycle-3` exists, the current cycle is `3`

Do NOT assume cycle `0` means analyzers have not run. A cycle can remain `0`
when all analyzers PASS and the fixer skips without incrementing.

## Step 3 — Check if already promoted

If the PR is NOT a draft, it was already promoted. Skip to Phase 2
(Step 11 — Merge Job).

Search the PR body for the exact marker text:
`[MARKER:pr-promoter cycle:N]` where N is the cycle number that triggered
promotion (any value of N).

If any such marker exists AND the PR is still draft, DO NOT skip. This means a
previous promotion attempt partially succeeded (comment/labels) but did not
flip draft state. Continue to Step 4 and retry promotion.

If any such marker exists AND the PR is non-draft, skip to Phase 2
(Step 11 — Merge Job).

## Step 4 — Verify all three analyzers have reviewed the current cycle

Determine the cycle to check. This is the cycle BEFORE the current one if
the PR Fixer has already incremented it:

- If labels include `pr:cycle-N` (N ≥ 1), the fixer already ran cycle N-1
  and incremented to N. The analyzer verdicts to check are from cycle N-1.
- However, the fixer only increments the cycle AFTER fixing. If the fixer
  found nothing to fix (all PASS), it posts to the Activity Log and does NOT
  increment.

So the logic is:

1. Look for the **pr-fixer** marker: `[MARKER:pr-fixer cycle:N]`
   for the most recent cycle. If the fixer ran and incremented, the
   analyzer verdicts that matter are from that fixer's cycle (N).
2. If no fixer marker exists, check analyzer markers at the current cycle
  number (including cycle `0`).

Search the PR body for these exact marker texts for the target cycle (C):

- `[MARKER:pr-analyzer-a cycle:C]`
- `[MARKER:pr-analyzer-b cycle:C]`
- `[MARKER:pr-analyzer-c cycle:C]`

All three markers MUST be present. If any marker is missing:

1. Check whether the PR was created more than **2 hours ago**. If yes, this is
   a **stalled PR** — the analyzers should have run by now.

   Search the PR body/comments for the text "missing analyzer markers". If that
   text does NOT already exist, post a one-time warning by calling `update_issue`
   with:
   - `issue_number`: the PR number
   - `operation`: `"append"`
   - `body`: "⏰ **PR Promoter**: PR #<number> has been open for over 2 hours but is missing analyzer markers for cycle <C>. The PR Analyzers may not be running. A human should investigate."

2. Regardless of PR age, update the dashboard (see Dashboard Protocol) with:
   "PR #<number> cycle <C>: waiting for all 3 analyzers — skipping." and exit.

## Step 5 — Check all analyzer verdicts

From the three analyzer comments found in Step 4, find the **### Verdict**
line in each:

- Analyzer A verdict line
- Analyzer B verdict line
- Analyzer C verdict line

If ALL three verdicts say exactly `**PASS**`, the PR is clean and ready for
promotion. Proceed to Step 6.

If ANY verdict says `**BLOCKING ISSUES FOUND**`, the PR has issues that need
fixing. Update the dashboard with:
"PR #<number> cycle <C>: blocking issues found — not promoting. The PR
Fixer will handle this." and exit.

## Step 6 — Add ready-for-review label (triggers draft flip)

Call `update_issue` with:

- `issue_number`: the PR number
- `status`: `"open"` (required — validation rejects calls without status/title/body)
- `labels`: the PR's current labels with `human:ready-for-review` added.
  If `agent:promoted` exists, remove it. Keep all other existing labels.

This label addition triggers the `pr-label-actions.yml` workflow which
automatically converts the PR from draft to ready-for-review.

**Important**: The `labels` field REPLACES all labels. You MUST include every
existing label on the PR plus `human:ready-for-review`. Do not drop any labels.

## Step 7 — Post the promotion comment

Call `update_issue` with:

- `issue_number`: the PR number
- `operation`: `"append"`
- `body`: the structured promotion comment in the exact format below

**CRITICAL**: The `[MARKER:...]` line below is the idempotency marker. It MUST
be the very first line of your output, exactly as shown. Without it, the
pipeline may re-promote this PR.

```markdown
[MARKER:pr-promoter cycle:C]
## ✅ PR Promoter — Ready for Human Review

**Promoter**: PR Promoter
**Cycle**: C
**PR**: #<number>
**Linked Issue**: #<issue-number>

### Analyzer Verdicts

| Analyzer | Verdict |
|----------|---------|
| A | **PASS** |
| B | **PASS** |
| C | **PASS** |

### Summary

All three analyzers found zero blocking issues. This PR has been converted
from draft to ready-for-review.

**Next step**: Human review and merge.
```

Replace C with the cycle number that was checked. Extract the linked issue
number from `Closes #N` in the PR body.

## Guardrails

- Promote exactly ONE PR per run — never loop over multiple PRs
- Merge exactly ONE PR per run — never loop over multiple PRs
- For every skip path, you MUST update the dashboard (see Dashboard Protocol) — do not only write plain text
- Never modify the PR's code, title, or body content
- Never close or merge the PR during promotion — only convert from draft to ready-for-review
- Never remove labels except replacing legacy `agent:promoted` with `human:ready-for-review`
- Never touch the linked issue — only operate on the PR
- Use `update_issue` with `labels` to add `human:ready-for-review` (triggers `pr-label-actions.yml` to flip draft)
- Every `update_issue` call MUST include at least one of `status`, `title`, or `body` — calls with only `labels` are silently rejected by validation
- Do NOT use `gh pr ready` or `create_pull_request` — the agent has no gh CLI access
- If any step fails unexpectedly, update the dashboard with the failure reason and exit
- At most 5 `update_issue` calls per run (enforced by safe-outputs max)

---

## Phase 2 — Merge Job

After completing Phase 1 (Promotion), check for approved PRs ready to merge.
This phase runs regardless of whether Phase 1 promoted a PR or posted to the
Activity Log.
Process exactly ONE merge per run.

## Step 9 — Find merge candidate

Search for open pull requests in this repository that meet ALL criteria:

- Is **NOT** a draft PR
- Has the label `human:ready-for-review`
- Has at least one GitHub review with state `APPROVED`

Sort results by creation date ascending. Take the **single oldest** result.

If no PR matches, update the dashboard with:
"No approved PRs awaiting merge." and exit.

## Step 10 — Verify merge eligibility

Check the PR merge state:

- `mergeable` must be `MERGEABLE`
- `mergeStateStatus` must be `CLEAN`

If the PR is not mergeable (e.g., conflicts, failing checks), update the dashboard with:
"PR #<number> is not mergeable (state: <mergeStateStatus>) — skipping." and exit.

## Step 11 — Add ready-to-merge label (triggers squash merge)

Call `update_issue` with:

- `issue_number`: the PR number
- `status`: `"open"` (required — validation rejects calls without status/title/body)
- `labels`: the PR's current labels with `ready-to-merge` added. Keep all
  existing labels.

This label addition triggers the `pr-label-actions.yml` workflow which
automatically squash-merges the PR and deletes the source branch.

**Important**: The `labels` field REPLACES all labels. You MUST include every
existing label on the PR plus `ready-to-merge`. Do not drop any labels.

## Step 12 — Post merge comment

Call `update_issue` with:

- `issue_number`: the PR number
- `operation`: `"append"`
- `body`: the structured merge comment in the exact format below

```markdown
[MARKER:pr-merge]
## ✅ PR Merged

**PR**: #<number>
**Linked Issue**: #<issue-number>
**Merge method**: squash
**Branch**: <branch-name> (deleted)

This PR was automatically merged after human approval.
```

Extract the linked issue number from `Closes #N` in the PR body.

## Step 13 — Clean up linked issue labels

Extract the linked issue number from `Closes #N` in the PR body.

Call `update_issue` on the **linked issue** (not the PR) with:

- `issue_number`: the linked issue number
- `status`: `"open"` (required — validation rejects calls without status/title/body)
- `labels`: remove `agent:in-progress`, keep all other labels unchanged
