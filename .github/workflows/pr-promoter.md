---
description: |
  PR Promoter — two-phase workflow. Phase 1: converts clean draft PRs to
  ready-for-review when all three analyzers PASS. Phase 2: squash-merges
  approved PRs that have human approval and deletes the source branch.
  Processes exactly one promotion and one merge per run.

on:
  workflow_dispatch:
  pull_request_review:
    types: [submitted]

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

safe-inputs:
  read-sfl-config:
    description: "Read the SFL autonomy configuration file (.github/sfl-config.yml) from the repository. Returns the raw YAML content with autonomy flags, risk-tolerance, and cycle limits."
    inputs: {}
    run: |
      gh api "repos/$REPO_OWNER/$REPO_NAME/contents/.github/sfl-config.yml?ref=main" --jq '.content' | base64 -d
    env:
      GH_TOKEN: "${{ secrets.GITHUB_TOKEN }}"
      REPO_OWNER: "${{ github.repository_owner }}"
      REPO_NAME: "${{ github.event.repository.name }}"

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
  dispatch-workflow:
    workflows: ["pr-fixer"]
    max: 1
  add-comment:
    target: "*"
    max: 1
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
markers, write the full template with all 6 sections (sfl-analyzer-a/b/c,
pr-fixer, pr-promoter, sfl-auditor) and populate only yours.

## Step 0 — Read SFL autonomy config

Call `read_sfl_config` (no inputs). Parse the YAML and note these values:

- `autonomy.auto-merge` (boolean) — controls whether Phase 2 requires human
  approval before merging
- `autonomy.conflict-resolution` (boolean) — noted for awareness
- `risk-tolerance` (string) — noted for awareness

Keep these values in context for use in later steps.

## Step 1 — Find the target PR

Search for open pull requests in this repository that meet ALL criteria:

- Is a **draft** PR
- Has the label `agent:pr`
- Does NOT have the label `agent:human-required`

Sort results by creation date ascending. Take the **single oldest** result.

If no PR matches, skip to Phase 2 (Step 11 — Merge Job).

## Step 2 — Determine the current review cycle

Check the PR's labels for any `pr:cycle-N` labels. Find the highest N
among all matching labels. If no `pr:cycle-N` label exists, the current
cycle is `0`.

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

- `[MARKER:sfl-analyzer-a cycle:C]`
- `[MARKER:sfl-analyzer-b cycle:C]`
- `[MARKER:sfl-analyzer-c cycle:C]`

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

Call `add_labels` with `human:ready-for-review`. This adds the label without
touching existing labels — no risk of accidentally dropping labels.

If the PR has the legacy `agent:promoted` label, also call `remove_labels`
to remove it.

The `human:ready-for-review` label addition triggers `pr-label-actions.yml`
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
- Merge exactly ONE PR per run — never loop over multiple PRs
- For every skip path, you MUST update the dashboard (see Dashboard Protocol) — do not only write plain text
- Never modify the PR's code, title, or body content
- Never close or merge the PR during promotion — only convert from draft to ready-for-review
- Never remove labels except replacing legacy `agent:promoted` with `human:ready-for-review`
- Never touch the linked issue — only operate on the PR
- Use `add_labels` for label additions (safer than `update_issue` with full label array)
- Use `update_issue` with `operation: "append"` for marker comments (requires `status`/`title`/`body`)
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

**If `autonomy.auto-merge` is `false` (from Step 0):**

- Also require at least one GitHub review with state `APPROVED`

**If `autonomy.auto-merge` is `true`:**

- Skip the approval requirement — any non-draft PR with `human:ready-for-review`
  is eligible for merge

Sort results by creation date ascending. Take the **single oldest** result.

If no PR matches, update the dashboard with:
"No approved PRs awaiting merge." and exit.

## Step 10 — Verify merge eligibility

Check the PR merge state:

- `mergeable` must be `MERGEABLE`

**If `autonomy.auto-merge` is `true` (from Step 0):**

- Accept `mergeStateStatus` of `CLEAN` or `BLOCKED`.
  The `BLOCKED` state from missing required reviews is expected — the merge
  label triggers an admin-bypass merge, so review requirements do not apply.
  Proceed to Step 11.

**If `autonomy.auto-merge` is `false`:**

- `mergeStateStatus` must be `CLEAN`. If it is `BLOCKED`, update the
  dashboard with:
  "PR #<number> is not mergeable (state: BLOCKED) — human review required."
  and exit.

If the PR has merge conflicts (`mergeable` is `CONFLICTING`):

1. Dispatch the PR Fixer workflow to resolve conflicts:
   Call `dispatch_workflow` with:
   - `workflow`: `pr-fixer.lock.yml`
   - No inputs needed — the fixer will find the PR by label/state
2. Update the dashboard with:
   "PR #<number> has merge conflicts — dispatched PR Fixer to rebase." and exit.

If the PR is not mergeable for other reasons (failing checks, unexpected state),
update the dashboard with:
"PR #<number> is not mergeable (state: <mergeStateStatus>) — skipping." and exit.

## Step 11 — Add ready-to-merge label (triggers squash merge)

Call `add_labels` with `ready-to-merge`. This adds the label without touching
existing labels.

The `ready-to-merge` label addition triggers `pr-label-actions.yml` which
automatically squash-merges the PR and deletes the source branch.

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
**Approval**: <human-approved | auto-merge>

This PR was automatically merged <after human approval | via SFL auto-merge>.
```

Use "human-approved" / "after human approval" when `auto-merge` is `false`.
Use "auto-merge" / "via SFL auto-merge" when `auto-merge` is `true`.

Extract the linked issue number from `Closes #N` in the PR body.

## Step 13 — Clean up linked issue labels

Extract the linked issue number from `Closes #N` in the PR body.

Call `update_issue` on the **linked issue** (not the PR) with:

- `issue_number`: the linked issue number
- `status`: `"open"` (required — validation rejects calls without status/title/body)
- `labels`: remove `agent:in-progress`, keep all other labels unchanged

## Activity Log

As your **final action**, post a one-line comment to **Discussion #95** (the SFL Activity Log) using `add_comment`:

- `issue_number`: `95`
- `body`: `YYYY-MM-DD h:mm AM/PM EST | PR Promoter | PR #<number> | ✅ Promoted` or `✅ Merge requested (ready-to-merge)` or `✅ Dispatched PR Fixer` or `⏭️ No eligible PRs`

This is mandatory — every run must log exactly one entry.
