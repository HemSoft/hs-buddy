---
description: |
  PR Fixer — Authority model. Reads all analyzer review comments on a draft
  PR labeled agent:pr, implements all blocking and non-blocking fixes, pushes
  fixes directly to the PR branch, updates cycle labels, and exits. Does NOT
  un-draft the PR — that is the Promoter's job.

on:
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
  push-to-pull-request-branch:
    max: 1
  add-comment:
    target: "*"
    max: 1
  add-labels:
    max: 3
  remove-labels:
    max: 3
  update-discussion:
    target: "*"
    max: 1
  update-issue:
    target: "*"
    max: 3
---

# PR Fixer — Authority

Run every 30 minutes (offset from analyzers). Find the oldest draft PR labeled
`agent:pr` whose current cycle has all three analyzer reviews posted. Read
every finding, implement all fixes, push them to the PR branch, update the
cycle label, and post a fix summary comment. Process exactly one PR per run.

**You do NOT un-draft the PR.** That is the PR Promoter's responsibility.

## Dashboard Protocol — Discussion #51

Discussion #51 is a **live status dashboard**. Its body has named sections
delimited by HTML comment markers (`<!-- SECTION:pr-fixer -->` ...
`<!-- /SECTION:pr-fixer -->`). When posting a skip or status message:

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

If no PR matches, update the dashboard with:
"No draft PRs with agent:pr label found — nothing to fix." and exit.

## Step 2 — Determine the current review cycle

Check the PR's labels for a `pr:cycle-N` label (where N is 1, 2, or 3).

- If no `pr:cycle-N` label exists, the current cycle is `0`
- If `pr:cycle-1` exists, the current cycle is `1`
- If `pr:cycle-2` exists, the current cycle is `2`
- If `pr:cycle-3` exists, the current cycle is `3`

If the current cycle is `3`, the PR has reached the cycle cap. Escalate:

1. Call `add_labels` to add `agent:human-required` to the PR
2. Call `add_comment` with:
   "🚨 **PR Fixer**: Cycle limit (3) reached. Escalating to human review."
3. Update the dashboard and exit.

## Step 3 — Verify all three analyzers have reviewed

Search the PR body for these exact marker texts for the current cycle (N):

- `[MARKER:pr-analyzer-a cycle:N]`
- `[MARKER:pr-analyzer-b cycle:N]`
- `[MARKER:pr-analyzer-c cycle:N]`

All three markers MUST be present. If any marker is missing, update the dashboard with:
"PR #<number> cycle <N>: waiting for all 3 analyzers (<missing> missing) — skipping."
and exit.

## Step 4 — Check if already fixed in this cycle

Search the PR body for the exact marker text:
`[MARKER:pr-fixer cycle:N]` where N is the current cycle number.

If that marker exists, update the dashboard with:
"PR #<number> already fixed in cycle <N> — skipping." and exit.

## Step 5 — Parse all analyzer findings

From the three analyzer reviews, extract every finding:

### Blocking Issues

Lines matching `- [ ] **[file:line]** — description` under "### Blocking Issues".

### Non-Blocking Suggestions

Lines matching `- **[file:line]** — description` under "### Non-Blocking Suggestions".

### Verdicts

Check each analyzer's "### Verdict" line:

- If ALL three verdicts say `**PASS**`, there is nothing to fix.
  Post the fixer marker (Step 9) noting "All three analyzers passed — no fixes
  needed." Then update the dashboard and exit.

## Step 6 — Read the PR content and codebase

1. Read the PR description to understand original intent
2. Read the linked issue (extract issue number from `Closes #N` in PR body)
3. Read the PR diff to see current changes
4. Read each file mentioned in the findings
5. Read surrounding context files if needed

## Step 7 — Implement all fixes

### Fix priorities

1. **Blocking issues first** — these prevent merge
2. **Non-blocking suggestions second** — improve quality

### Implementation rules

- Fix the exact issue described in each finding
- Make the minimum change necessary — do not refactor surrounding code
- Do not add comments, docs, or type annotations to unchanged lines
- Preserve existing formatting conventions exactly
- If findings conflict across analyzers, prefer safety (security > correctness > style)
- If a fix cannot be implemented, note it in the summary

### Early escalation — unfixable blocking issues

If ANY blocking issue cannot be fixed:

1. Call `add_labels` to add `agent:human-required`
2. Call `add_comment` with details of unfixable blocking issues
3. Update the dashboard and exit.

### After all fixes

Stage and commit all changes:

```bash
git add -A
git commit -m "fix: address analyzer findings from cycle N

Fixes applied:
- <one-line summary of each fix>"
```

## Step 8 — Push fixes to the PR branch

Call `push_to_pull_request_branch` to push your committed changes directly
to the existing PR's branch. This updates the PR in place — no new PR needed.

## Step 9 — Update cycle label

Increment the cycle label:

1. Call `remove_labels` to remove the current cycle label (e.g., `pr:cycle-0`
   or whichever `pr:cycle-N` exists). If no cycle label exists, skip removal.
2. Call `add_labels` to add the next cycle label (e.g., `pr:cycle-1`).

## Step 10 — Post fix summary

Call `update_issue` with `operation: "append"` to post the fixer marker and
summary to the PR body:

**CRITICAL**: The `[MARKER:...]` line MUST be the very first line.

```markdown
[MARKER:pr-fixer cycle:N]
## 🔧 PR Fixer — Cycle N Fix Summary

**Fixer**: Authority (Claude Opus)
**PR**: #<number>
**Linked Issue**: #<issue-number>

### Fixes Applied

- **[file:line]** — What was changed and why. (from Analyzer X)

### Unable to Fix

- **[file:line]** — Why this could not be fixed. (from Analyzer X)

_None._ (use this if all findings were fixed)

### Summary

- **Blocking issues fixed**: X of Y
- **Non-blocking suggestions fixed**: X of Y
- **Commit**: `<short SHA>`
```

Update the dashboard with:
"PR #<number> cycle <N>: fixed and pushed — <X> blocking, <Y> non-blocking fixes applied."

## Guardrails

- Process exactly ONE PR per run
- Never un-draft the PR — that is the Promoter's job
- Never close or merge the PR
- Never create a new PR — push fixes to the existing branch
- Maximum 3 fix cycles per PR — escalate after that
- For every skip path, update the dashboard
- If any step fails unexpectedly, update the dashboard and exit
