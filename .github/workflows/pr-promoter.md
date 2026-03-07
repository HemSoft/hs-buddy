---
name: "SFL PR Promoter"
description: |
  PR Promoter — promotes exactly one clean draft PR to ready-for-review
  when all three analyzers PASS. Human review and human merge happen
  outside this workflow.

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
  add-labels:
    max: 3
  remove-labels:
    max: 3
  update-discussion:
    target: "*"
    max: 2
  update-issue:
    target: "*"
    max: 5
  add-comment:
    target: "*"
    max: 1
---

# PR Promoter

Find the oldest draft PR
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
markers, write the full template with all 6 sections (sfl-analyzer-a/b/c,
pr-fixer, pr-promoter, sfl-auditor) and populate only yours.

## Step 1 — Find the target PR

Search for open pull requests in this repository that meet ALL criteria:

- Is a **draft** PR
- Has the label `agent:pr`
- Does NOT have the label `agent:human-required`

Sort results by creation date ascending. Take the **single oldest** result.

If no PR matches, update the dashboard with:
"No draft PRs are ready for promotion." and exit.

## Step 2 — Determine the current review cycle

Check the PR's labels for any `pr:cycle-N` labels. Find the highest N
among all matching labels. If no `pr:cycle-N` label exists, the current
cycle is `0`.

Do NOT assume cycle `0` means analyzers have not run. A cycle can remain `0`
when all analyzers PASS and the fixer skips without incrementing.

## Step 3 — Check if already promoted

If the PR is NOT a draft, update the dashboard with:
"PR #<number> is already ready for review — skipping." and exit.

Search the PR body for the exact marker text:
`[MARKER:pr-promoter cycle:N]` where N is the cycle number that triggered
promotion (any value of N).

If any such marker exists AND the PR is still draft, DO NOT skip. This means a
previous promotion attempt partially succeeded (comment/labels) but did not
flip draft state. Continue to Step 4 and retry promotion.

If any such marker exists AND the PR is non-draft, update the dashboard with:
"PR #<number> is already ready for review — skipping." and exit.

## Step 4 — Verify all three analyzers have reviewed the current cycle

Use the current cycle number from Step 2 directly. Promotion should depend
only on the current analyzer results, not on how many implementation passes
produced them.

Search the PR body for these exact marker texts for the target cycle (C):

- `[MARKER:sfl-analyzer-a cycle:C]`
- `[MARKER:sfl-analyzer-b cycle:C]`
- `[MARKER:sfl-analyzer-c cycle:C]`

All three markers MUST be present. If any marker is missing, update the
dashboard (see Dashboard Protocol) with:
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
Issue Processor will handle this." and exit.

## Step 6 — Add ready-for-review label (triggers draft flip)

Call `add_labels` with `human:ready-for-review`. This adds the label without
touching existing labels — no risk of accidentally dropping labels.

The `human:ready-for-review` label addition triggers `sfl-pr-label-actions.yml`
which automatically converts the PR from draft to ready-for-review.

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
- For every skip path, you MUST update the dashboard (see Dashboard Protocol) — do not only write plain text
- Never modify the PR's code, title, or body content
- Never close or merge the PR during promotion — only convert from draft to ready-for-review
- Never remove labels during promotion
- Never touch the linked issue — only operate on the PR
- Use `add_labels` for label additions (safer than `update_issue` with full label array)
- Use `update_issue` with `operation: "append"` for marker comments (requires `status`/`title`/`body`)
- Do NOT use `gh pr ready` or `create_pull_request` — the agent has no gh CLI access
- If any step fails unexpectedly, update the dashboard with the failure reason and exit
- At most 5 `update_issue` calls per run (enforced by safe-outputs max)

## Activity Log

As your **final action**, post a one-line comment to **Discussion #95** (the SFL Activity Log) using `add_comment`:

- `issue_number`: `95`
- `body`: `YYYY-MM-DD h:mm AM/PM EST | PR Promoter | PR #<number> | ✅ Promoted` or `⏭️ No eligible PRs`

This is mandatory — every run must log exactly one entry.
