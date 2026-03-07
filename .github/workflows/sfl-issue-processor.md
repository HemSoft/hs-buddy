---
description: |
  Triggered when a new fixable issue opens or when Analyzer C finds blocking
  feedback on an existing draft PR. Claims or resumes the issue, advances the
  implementation on the same draft PR when one exists, and re-dispatches
  Analyzer A only after follow-up implementation passes. Newly created PRs
  rely on the `pull_request: opened` event to start the analyzer chain. One
  work item per run.

on:
  issues:
    types: [opened, reopened]
  workflow_dispatch:
    inputs:
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
  model: claude-opus-4.6

network: defaults

tools:
  github:
    lockdown: false

safe-inputs:
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
    max: 1
  dispatch-workflow:
    workflows: ["sfl-analyzer-a"]
    max: 1
---

# SFL Issue Processor / Implementer

Advance exactly one implementation work item per run.

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

Always check for existing draft PR work FIRST.

If `pull-request-number` is provided in the context variables, use that PR
number directly as the target follow-up PR candidate. Do NOT search for a
different PR in that case.

If this run was triggered by an `issues` event and the issue already has the
`agent:fixable` label, prefer that specific issue for **new issue** work once
you confirm there is no older draft PR awaiting a follow-up implementation pass.

### 1a — Existing draft PR needing fixes

If `pull-request-number` is provided:

1. Read that exact PR.
2. Verify it is an open **draft** PR with label `agent:pr` and without
  `agent:human-required`.
3. Determine current cycle N from the highest `pr:cycle-N` label (default `0`).
4. Verify all three analyzer markers exist for cycle N.
5. Verify at least one analyzer verdict for cycle N is `**BLOCKING ISSUES FOUND**`.
6. Verify `[MARKER:sfl-issue-processor cycle:N]` is not already present.

If any of those checks fail, exit — there is no eligible follow-up work for
that specific PR.

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
3. Verify that ALL three analyzer markers exist for the current cycle:
   - `[MARKER:sfl-analyzer-a cycle:N]`
   - `[MARKER:sfl-analyzer-b cycle:N]`
   - `[MARKER:sfl-analyzer-c cycle:N]`
4. Check the three analyzer verdicts for cycle N.
   - If all three verdicts are `**PASS**`, skip the candidate — promotion,
     not implementation, is the next step.
   - If any verdict is `**BLOCKING ISSUES FOUND**`, this PR needs another
     implementation pass.
5. If the PR body already contains `[MARKER:sfl-issue-processor cycle:N]`,
   skip the candidate — this cycle has already had an implementation pass.

Take the **first** candidate that still has unresolved blocking feedback.

If such a PR is found, this run is a **follow-up implementation pass**.
Use its linked issue as the canonical spec, and continue at Step 3.

### 1b — New issue with no draft PR yet

If no existing draft PR needs follow-up work, search for open issues with label
`agent:fixable` that do NOT have any of:

- `agent:in-progress`
- `agent:pause`
- `agent:human-required`

Sort by creation date ascending. Take the **single oldest** result.

If no PR candidate and no issue candidate exist, exit — nothing to do.

Risk labels are metadata for reviewer visibility only. Do NOT skip or escalate
an otherwise actionable work item solely because it is labeled `risk:medium`
or `risk:high`.

## Step 2 — Claim or resume the issue

If this is a **new issue** from Step 1b:

1. Call `add_labels` to add `agent:in-progress` to the issue.
2. Call `remove_labels` to remove `agent:fixable` from the issue.
3. Call `update_issue` with:
   - `issue_number`: the issue number from Step 1b
   - `body`: "🤖 Issue Processor claimed this issue. Working on a fix."
   - `operation`: `"append"`

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
2. If a draft PR already exists:
  - the PR description/body
  - the PR diff
  - the three analyzer reviews for the current cycle
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

### 6a — No PR exists yet

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

After the PR is created, call `update_issue` on the linked issue with:

- `issue_number`: the issue number
- `body`: "🔀 Opened PR #<number> — ready for review."
- `operation`: `"append"`

### 6b — Draft PR already exists

Call `push_to_pull_request_branch` to push your committed changes directly to
the existing PR branch. Provide:

- `pull_request_number`: the existing draft PR number
- `message`: the commit message that describes the fixes from this pass

Then increment the cycle label:

1. Call `remove_labels` to remove the current `pr:cycle-N` label if one exists.
2. Call `add_labels` to add the next cycle label `pr:cycle-(N+1)`.

Then append this summary marker to the PR body with `update_issue`:

```markdown
[MARKER:sfl-issue-processor cycle:N]
## 🔧 Issue Processor — Cycle N Implementation Pass

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

## Activity Log

As your **final action**, post a one-line comment to **Discussion #95** (the SFL Activity Log) using `add_comment`:

- `issue_number`: `95`
- `body`: `YYYY-MM-DD h:mm AM/PM EST | Issue Processor | Issue #<number> → PR #<pr> | ✅ Created PR`, `✅ Continued PR`, or `⏭️ No eligible work`

This is mandatory — every run must log exactly one entry.

## Guardrails

- Exit after processing exactly one work item per run — never loop over multiple issues/PRs
- Never force-push, amend commits, or modify files outside the Fix scope
- Never run `git push` directly — always use `create_pull_request` or `push_to_pull_request_branch`
- If any step fails unexpectedly: call `add_labels` with `agent:pause` and
  `remove_labels` with `agent:in-progress` when appropriate, then call `update_issue`
  to append the failure reason, then exit cleanly
