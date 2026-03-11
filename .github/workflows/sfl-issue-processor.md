---
description: |
  Triggered when a new fixable issue opens or when Analyzer C finds blocking
  feedback on an existing draft PR. Claims or resumes the issue, advances the
  implementation on the same draft PR when one exists, and re-dispatches
  Analyzer A only after follow-up implementation passes. Newly created PRs
  rely on the `pull_request: opened` event to start the analyzer chain. Also
  supports targeted `workflow_dispatch` handoffs for a specific issue or PR.
  One work item per run.

on:
  issues:
    types: [opened, reopened]
  workflow_dispatch:
    inputs:
      issue-number:
        description: Target issue number for a new-issue implementation pass
        required: false
      pull-request-number:
        description: Target draft PR number for a follow-up implementation pass
        required: false

permissions:
  contents: read
  issues: read
  pull-requests: read

timeout-minutes: 60

engine:
  id: copilot
  model: gpt-5.4

network: defaults

tools:
  github:
    lockdown: false

mcp-scripts:
  read-sfl-config:
    description: "Read the SFL autonomy configuration file (.github/sfl-config.yml) from the repository. Returns the raw YAML content with autonomy flags, cycle limits, and activity log settings."
    inputs: {}
    run: |
      gh api "repos/$REPO_OWNER/$REPO_NAME/contents/.github/sfl-config.yml?ref=main" --jq '.content' | base64 -d
    env:
      GH_TOKEN: "${{ secrets.GITHUB_TOKEN }}"
      REPO_OWNER: "${{ github.repository_owner }}"
      REPO_NAME: "${{ github.event.repository.name }}"

safe-outputs:
  create-pull-request:
    title-prefix: "[agent-fix] "
    labels: [agent:pr]
    draft: true
  push-to-pull-request-branch:
    target: "*"
    max: 1
  add-labels:
    max: 3
  remove-labels:
    max: 3
  update-issue:
    target: "*"
    max: 4
  add-comment:
    target: "*"
    max: 3
  dispatch-workflow:
    workflows: ["sfl-analyzer-a"]
    max: 1
---

# SFL Issue Processor / Implementer

Advance exactly one implementation work item per run.

## Tool-calling budget

You have multiple MCP tool types, each with its own independent per-run quota.
Calling one type does NOT reduce the quota of another type.

| Tool | Per-run max | When to use |
| --- | --- | --- |
| `add_labels` | 3 | Claim issue, set cycle labels |
| `remove_labels` | 3 | Release `agent:fixable`, clear old cycle label |
| `add_comment` | 3 | Claim comment, PR-link comment, activity log |
| `update_issue` | 4 | Failure notes |
| `create_pull_request` | 1 | First draft PR for a new issue |
| `push_to_pull_request_branch` | 1 | Follow-up fix on existing PR |
| `dispatch_workflow` | 1 | Re-dispatch Analyzer A after follow-up pass |

A typical new-issue flow uses **6 calls across 4 types** — this is normal and
expected. Never emit `missing_tool` because you think the budget is 1 call
total; it is 1 **per type** where marked, and up to 3–4 for the others.

The linked issue is always the canonical source of intent and acceptance
criteria. If that issue already has an open draft PR, continue work on that PR
using the current analyzer feedback. If no PR exists yet, create the first
draft PR.

## Step 0 — Read SFL autonomy config

Call `read_sfl_config` (no inputs). Parse the YAML so you have the current
autonomy flags, cycle limits, and activity log settings in context.

## Step 1 — Identify the target work item

There are two valid work item types:

1. **Existing draft PR that needs another implementation pass**
2. **New `agent:fixable` issue with no draft PR yet**

Untargeted runs should check for existing draft PR work FIRST.

Targeted handoff requirement:

- If `pull-request-number` or `issue-number` is provided in the context variables, process only that exact work item.
- Do NOT scan the broader queue during a targeted run.
- If both are provided in the same run, treat that as a broken targeted handoff. Report the failure and exit.

Normalization rule for targeted identifiers:

- The rendered GitHub context may show an absent identifier as a lone `#` placeholder.
- Normalize both `pull-request-number` and `issue-number` before making any routing decision:
  - strip leading `#`
  - trim whitespace
  - a value is valid only if the remaining characters are all digits
- Treat empty strings, lone `#`, whitespace, and unresolved placeholder text as **missing**, not as a provided targeted identifier.
- If exactly one identifier normalizes to a valid number and the other normalizes to missing, use the valid one and continue.
- Only treat the handoff as broken when both identifiers normalize to valid numbers, or when the targeted identifier for the intended path normalizes to missing.

Examples:

| `pull-request-number` | `issue-number` | Meaning |
| --- | --- | --- |
| `#148` | `#` | Valid targeted PR run for PR 148 |
| `148` | `` | Valid targeted PR run for PR 148 |
| `#` | `147` | Valid targeted issue run for issue 147 |
| `#148` | `147` | Broken handoff: both identifiers are real |
| `#` | `#` | Broken handoff: neither identifier is real |

Determinism requirement:

- One `agent:in-progress` issue must map to exactly one open draft `agent:pr` PR.
- If you observe multiple open draft PRs for the same issue, this is a pipeline failure, not a recovery opportunity.
- In that state, do NOT pick one, do NOT create a superseding PR, and do NOT continue implementation. Report the failure and exit.

If `pull-request-number` is provided in the context variables, use that PR
number directly as the target follow-up PR candidate. Do NOT search for a
different PR in that case.

If `issue-number` is provided in the context variables, use that issue number
directly as the target new-issue candidate. Do NOT search for a different
issue in that case.

If both `pull-request-number` and `issue-number` normalize to valid numbers,
treat that as a broken targeted handoff. Do NOT guess which path to take.
Report the failure and exit so the handoff bug is visible.

If a `pull-request-number` field is present but it normalizes to missing,
treat it as absent unless this run is clearly intended to be a targeted PR run.
Do NOT let a lone `#` placeholder for a missing issue number invalidate an
otherwise valid targeted PR run.

If an `issue-number` field is present but it normalizes to missing, treat it as
absent unless this run is clearly intended to be a targeted issue run. Do NOT
let a lone `#` placeholder for a missing PR number invalidate an otherwise
valid targeted issue run.

If this run was triggered by an `issues` event:

- when the reopened issue already has exactly one open draft `agent:pr` PR,
  prefer resuming that PR deterministically instead of treating the issue as
  new work
- when the issue has `agent:fixable` and no draft PR yet, prefer that specific
  issue for **new issue** work once you confirm there is no older draft PR
  awaiting a follow-up implementation pass

### 1a — Existing draft PR needing fixes

If `pull-request-number` is provided:

1. Read that exact PR.
2. Verify it is an open **draft** PR with label `agent:pr` and without
  `agent:human-required`.
3. Determine current cycle N from the highest `pr:cycle-N` label (default `0`).
4. Search the PR **comments** for all three analyzer markers for cycle N:
   `[MARKER:sfl-analyzer-a cycle:N]`, `[MARKER:sfl-analyzer-b cycle:N]`,
   `[MARKER:sfl-analyzer-c cycle:N]`. Verify all three exist.
5. From the same PR comments, check the analyzer verdicts. Verify at least one
   verdict for cycle N is `**BLOCKING ISSUES FOUND**`.
6. Search the PR comments for `[MARKER:sfl-issue-processor cycle:N]`.
   Verify it is not already present.

If any of those checks fail, exit — there is no eligible follow-up work for
that specific PR.

Before continuing, verify the linked issue has exactly one open draft `agent:pr`
PR. If more than one exists, report the duplicate-PR failure and exit.

If they pass, use that PR as the work item and continue at Step 3.

Only when no `pull-request-number` is provided should you search for draft PRs
that need another implementation pass.

Search for open pull requests that meet ALL criteria:

- Is a **draft** PR
- Has the label `agent:pr`
- Does NOT have the label `agent:human-required`

Sort by creation date ascending. Evaluate candidates in that order.

For each candidate:

1. Extract the linked issue number from `Closes #N` in the PR body. If none,
   skip the candidate.
2. Determine the current cycle N from the highest `pr:cycle-N` label
   (default `0` if none exist).
3. Search the PR **comments** for ALL three analyzer markers for the current cycle:
   - `[MARKER:sfl-analyzer-a cycle:N]`
   - `[MARKER:sfl-analyzer-b cycle:N]`
   - `[MARKER:sfl-analyzer-c cycle:N]`
4. From the same PR comments, check the three analyzer verdicts for cycle N.
   - If all three verdicts are `**PASS**`, skip the candidate — promotion,
     not implementation, is the next step.
   - If any verdict is `**BLOCKING ISSUES FOUND**`, this PR needs another
     implementation pass.
5. Search the PR comments for `[MARKER:sfl-issue-processor cycle:N]`.
   If present, skip the candidate — this cycle has already had an
   implementation pass.

Take the **first** candidate that still has unresolved blocking feedback.

Before selecting a candidate, check whether its linked issue has multiple open
draft `agent:pr` PRs. If it does, report the duplicate-PR failure and exit
instead of choosing one arbitrarily.

If such a PR is found, this run is a **follow-up implementation pass**.
Use its linked issue as the canonical spec, and continue at Step 3.

### 1b — New issue with no draft PR yet

If no existing draft PR needs follow-up work, search for open issues with label
`agent:fixable` that do NOT have any of:

- `agent:in-progress`
- `agent:pause`
- `agent:human-required`

If `issue-number` is provided:

1. Read that exact issue.

2. Search for open draft PRs labeled `agent:pr` that already belong to that
  issue.

3. If more than one open draft `agent:pr` PR already exists for that issue,
   report the duplicate-PR failure and exit.

4. If exactly one open draft `agent:pr` PR already exists for that issue,
   treat this targeted issue run as a deterministic resume path instead of a
   new-issue path:

    - read that PR
    - verify it is an open **draft** PR without `agent:human-required`
    - determine current cycle N from the highest `pr:cycle-N` label (default `0`)
    - search the PR **comments** for all three analyzer markers for cycle N
    - verify at least one analyzer verdict for cycle N (from PR comments) is
      `**BLOCKING ISSUES FOUND**`
    - search the PR comments for `[MARKER:sfl-issue-processor cycle:N]` —
      verify it is not already present
    - if all checks pass, use that PR as the work item and continue at Step 3
    - if any check fails, exit — there is no eligible follow-up work for that
      specific issue/PR pair

5. Verify it is open, has label `agent:fixable`, and does NOT have any of
   these labels: `agent:in-progress`, `agent:pause`, `agent:human-required`.

6. If any validation above fails, exit — there is no eligible new-issue work
   for that specific issue.

If those checks pass, use that issue as the work item and continue at Step 2.

Only when no `issue-number` is provided should you search for the oldest open
fixable issue.

Sort by creation date ascending. Evaluate candidates in that order.

For each candidate issue:

1. Search for open draft PRs labeled `agent:pr` that already belong to that
  issue (for example via branch naming `agent-fix/issue-<issue-number>-...`
  or `Closes #<issue-number>` in the PR body).
2. If more than one open draft `agent:pr` PR already exists for that issue,
  report the duplicate-PR failure and exit.
3. If exactly one open draft `agent:pr` PR already exists for that issue, do
  NOT treat the issue as new work and do NOT create another PR. Report that the
  new-issue path observed existing draft PR state for the issue, pause if
  needed, and exit so the state-selection bug is visible.
4. Only select the first candidate issue with **zero** open draft `agent:pr`
  PRs.

If no PR candidate and no issue candidate exist, exit — nothing to do.

Risk labels are metadata for reviewer visibility only. Do NOT skip or escalate
an otherwise actionable work item solely because it is labeled `risk:medium`
or `risk:high`.

## Step 2 — Claim or resume the issue

If this is a **new issue** from Step 1b:

1. Call `add_labels` to add `agent:in-progress` to the issue.

2. Call `remove_labels` to remove `agent:fixable` from the issue.

3. Call `add_comment` with `issue_number` set to the issue number from Step 1b and `body` set to "🤖 Issue Processor claimed this issue. Working on a fix."

Do NOT append progress updates to the issue body. Keep the issue body as the
canonical implementation spec and put operational status in comments.

If this is a **follow-up PR** from Step 1a:

- Do NOT modify issue labels.
- Use the linked issue and existing draft PR as the active work item.

## Step 3 — Validate the issue body

Preferred format includes all three sections: **Finding**, **Fix**, and
**Acceptance criteria**.

However, do not reject a valid autonomous task only because headings differ.
Accept either:

1. Canonical format: `Finding` + `Fix` + `Acceptance criteria`

2. Feature-spec format with enough actionable detail, such as:

- `Goal` or `Summary`
- implementation details (e.g., `Implementation Plan`, `Files to Create or Modify`, API/route/component lists)
- verifiable success criteria (`Acceptance criteria` or equivalent testable outcomes)

When canonical headings are missing but feature-spec content is sufficient,
derive internal equivalents:

- **Finding (derived)**: current capability gap or missing behavior
- **Fix (derived)**: concrete implementation steps/files/components
- **Acceptance criteria (derived)**: explicit verifiable outcomes

Only escalate to `agent:human-required` when the body is truly non-actionable,
ambiguous, or lacks enough concrete implementation detail to make a safe change.

## Step 4 — Gather implementation context

Always read all of the following before writing code:

1. The linked issue body — this is the canonical source of intent and
  acceptance criteria.

2. If a draft PR already exists, read the PR description/body, the PR diff,
   and the three analyzer review **comments** for the current cycle.

3. The target file(s) in full and any surrounding context needed to implement safely.

For new issues without a PR yet, confirm the described problem actually exists.
If the problem has already been fixed and there is no draft PR to continue,
close the issue with the comment "✅ Already resolved — closing." and exit.

## Step 5 — Implement the next pass

If this is a **new issue** with no draft PR, create a new branch named
`agent-fix/issue-<issue-number>` from `main`.

If this is a **follow-up PR**, work against the existing PR branch and treat
the analyzer findings as additional implementation input.

Implementation priorities:

1. The issue's acceptance criteria and explicit implementation scope
2. Blocking analyzer findings for the current cycle
3. Non-blocking analyzer suggestions only after blocking items are addressed

Apply the minimal change that satisfies the acceptance criteria:

- Do not refactor surrounding code
- Do not rename symbols unless that is the stated fix
- Do not add comments, docs, or type annotations to unchanged lines
- Preserve existing formatting conventions exactly
- Prefer touching only files identified in the Fix section; if using derived
  feature-spec mapping, touch only files explicitly listed in the issue's
  implementation details.

For follow-up PR work:

- Fix the exact analyzer findings that are still unresolved in the current cycle.
- If analyzer findings conflict, prefer safety (security > correctness > style).
- If a finding cannot be fully resolved in one pass, make real progress and note
  what remains in your summary marker.

Commit the changes with a descriptive commit message.

**IMPORTANT**: Do NOT run `git push`. Use the safe outputs in the next step.

## Step 6 — Create or update the draft PR

Valid vs invalid outcomes for this step:

| Outcome | Valid? | Meaning |
| --- | --- | --- |
| New issue with no existing draft PR → `create_pull_request` | ✅ | correct first PR creation |
| Follow-up pass for existing draft PR → `push_to_pull_request_branch` | ✅ | correct in-place continuation |
| Follow-up pass cannot push to existing PR branch → report failure and exit | ✅ | visible hard failure |
| Follow-up pass claims a push failure without an actual `push_to_pull_request_branch` attempt in this run | ❌ | invented failure narrative |
| Follow-up pass creates a second/superseding PR for the same issue | ❌ | split-brain pipeline bug |

Never create a second draft PR for an issue that already has an open draft
`agent:pr` PR. There is no allowed "supersede" fallback during follow-up work.
If the existing PR branch cannot be updated, fail loudly and leave the live
state unchanged.

### 6a — No PR exists yet

Before calling `create_pull_request`, re-check the linked issue. If the issue
already has any open draft `agent:pr` PR, stop immediately and report the
failure instead of creating another PR. This is a defense-in-depth guardrail:
the create-PR path is valid only when the linked issue has zero open draft
agent PRs at the moment of creation.

Call the `create_pull_request` safe output tool. This is the ONLY way to
create the initial PR — it handles pushing the branch and opening the PR in
one step.

The tool will use your committed changes on the current branch. Provide:

- Title: `<issue title, stripped of any [repo-audit] prefix>`
  (the `[agent-fix]` prefix is added automatically by the safe-output config)
- Body:
  - `Closes #<issue number>`
  - One-paragraph summary of what was changed and why
  - Acceptance criteria quoted from the issue
  - Risk label carried from the issue with one-line justification

Do NOT set labels — they are configured automatically by the safe-output.

After the PR is created, call `add_comment` on the linked issue with:

- `issue_number`: the issue number
- `body`: "🔀 Opened PR #<number> — ready for analyzer review."

Do NOT append this status to the issue body.

### 6b — Draft PR already exists

Call `push_to_pull_request_branch` to push your committed changes directly to
the existing PR branch. Provide:

- `pull_request_number`: the existing draft PR number
- `message`: the commit message that describes the fixes from this pass

If `push_to_pull_request_branch` is unavailable, rejected, or fails for any
reason, stop immediately. Do NOT call `create_pull_request` as a fallback.
Instead:

1. Call `add_comment` on the linked issue describing that the follow-up pass
  could not update the existing PR branch.
2. Call `add_labels` to add `agent:pause` to the linked issue.
3. Call `update_issue` on the PR or issue with a short failure note if needed.
4. Exit cleanly.

Failure-reporting requirements for this path:

- Only describe `push_to_pull_request_branch` as failed if this same run
  actually called that safe output and received a concrete failure.
- Quote the real failure reason from the tool response as precisely as possible.
- Never claim a git auth, CI, permission, or branch-update limitation unless
  that exact limitation was returned by the tool.
- If no `push_to_pull_request_branch` attempt occurred in this run, do NOT
  mention a push failure at all. Report the real discrepancy you observed
  instead, such as invalid state selection or missing targeted PR evidence.

Then increment the cycle label:

1. Call `remove_labels` to remove the current `pr:cycle-N` label if one exists.
2. Call `add_labels` to add the next cycle label `pr:cycle-(N+1)`.

Then post the implementation summary as a **PR comment** using `add_comment`
(do NOT append to the PR body — the PR body is sacred, written once):

- `issue_number`: the PR number
- `body`: the structured summary in the exact format below

```markdown
[MARKER:sfl-issue-processor cycle:N]
## :wrench: Issue Processor &mdash; Cycle N Implementation Pass

**PR**: #<number>
**Linked Issue**: #<issue-number>

### Summary

- Applied fixes for the current analyzer feedback cycle.
- Pushed changes to the existing draft PR branch.
- Analyzer A has been re-dispatched for the next review pass.
```

Use cycle `N` for the feedback cycle you just addressed, not the incremented label.

## Step 7 — Handoff to Analyzer A

If you created a brand-new draft PR in Step 6a, do NOT dispatch
`sfl-analyzer-a`. The PR open event is the intended trigger for Analyzer A on
the first review cycle.

If you updated an existing draft PR in Step 6b, dispatch `sfl-analyzer-a` as
the next explicit handoff for the follow-up review cycle.

When dispatching `sfl-analyzer-a` for an existing draft PR, include input
`pull-request-number: <number>` so Analyzer A reviews that exact PR instead of
searching for the oldest eligible draft PR.

## Activity Log

As your **final action**, post a one-line comment to **Discussion #95** (the SFL Activity Log) using `add_comment`:

- `issue_number`: `95`
- `body`: `YYYY-MM-DD h:mm AM/PM EDT | Issue Processor | Issue #<number> -> PR #<pr> | :white_check_mark: Created PR`, `:white_check_mark: Continued PR`, or `:fast_forward: No eligible work`; use `EST` instead of `EDT` only when standard time is actually in effect

Timestamp rule for Discussion #95 entries:

- Convert the current workflow time to `America/New_York` before writing the log line.
- Use the converted local **date and time**, not the UTC date.
- Use `EDT` when daylight saving time is in effect and `EST` otherwise.
- Valid: `2026-03-08 10:56 PM EDT | ...`
- Invalid: `2026-03-09 2:56 AM EST | ...` when the workflow ran at `2026-03-09T02:56:00Z`

This is mandatory — every run must log exactly one entry.

UTF-8 safety rule for PR body writes:

- For decorative characters in PR body content, use GitHub-safe Markdown shortcodes and HTML entities instead of raw glyphs when an equivalent exists.
- Preferred examples: `:wrench:` instead of `🔧`, `&mdash;` instead of `—`, `:white_check_mark:` instead of `✅`.
- Keep the body visually rich on GitHub, but avoid raw decorative Unicode that can be mojibake-corrupted by intermediate workflow write paths.

## Guardrails

- Exit after processing exactly one work item per run — never loop over multiple issues/PRs
- Never force-push, amend commits, or modify files outside the Fix scope
- Never run `git push` directly — always use `create_pull_request` or `push_to_pull_request_branch`
- Never create a superseding PR for a follow-up implementation pass
- Never write a supersede or push-failure narrative unless this run actually attempted `push_to_pull_request_branch` and you can cite the returned failure
- Treat blank targeted PR input or one-issue-two-PR state as a hard failure that must be surfaced
- If any step fails unexpectedly: call `add_labels` with `agent:pause` and
  `remove_labels` with `agent:in-progress` when appropriate, then call `update_issue`
  to append the failure reason, then exit cleanly
