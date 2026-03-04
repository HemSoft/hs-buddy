---
description: |
  Dispatched by Simplisticate Audit after creating an agent:fixable issue,
  or dispatched manually. Claims the issue, implements the described fix on
  a new branch, and opens a pull request. One issue per run.

on:
  workflow_dispatch:

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
    description: "Read the SFL autonomy configuration file (.github/sfl-config.yml) from the repository. Returns the raw YAML content with autonomy flags, risk-tolerance, and cycle limits."
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
  add-labels:
    max: 3
  remove-labels:
    max: 3
  update-issue:
    target: "*"
    max: 3
  add-comment:
    target: "*"
    max: 1
---

# SFL Issue Processor

Claim an `agent:fixable` issue, implement the fix, and open a pull request.
Process exactly one issue per run.

## Step 0 — Read SFL autonomy config

Call `read_sfl_config` (no inputs). Parse the YAML and note:

- `risk-tolerance` (string: `trivial`, `low`, `medium`, or `high`) — the
  maximum risk level the agent may process autonomously

The risk hierarchy is: `trivial` < `low` < `medium` < `high`.

Keep this value in context for use in Step 1.

## Step 1 — Identify the target issue

Search for open issues with label `agent:fixable` that do NOT have any of:
`agent:in-progress`, `agent:pause`, `agent:human-required`, `no-agent`.

Sort by creation date ascending. Take the **single oldest** result.
If no issue matches, exit — nothing to do.

### Risk tolerance check

Before claiming, check the issue's `risk:*` label against `risk-tolerance`
from Step 0:

- If the issue has `risk:medium` and tolerance is `low` or `trivial` → skip it
- If the issue has `risk:high` and tolerance is `medium`, `low`, or `trivial` → skip it

When skipping due to risk: add label `agent:human-required`, post a comment
"⚠️ Issue risk level (`risk:<level>`) exceeds SFL tolerance (`<tolerance>`).
Requires human review.", and try the next oldest issue. If no eligible
issues remain, exit — nothing to do.

## Step 2 — Claim the issue

Before doing any other work:

1. Call `add_labels` to add `agent:in-progress` to the issue
2. Call `remove_labels` to remove `agent:fixable` from the issue
3. Call `update_issue` with:
   - `issue_number`: the issue number from Step 1
   - `body`: "🤖 Issue Processor claimed this issue. Working on a fix."
   - `operation`: `"append"`

This prevents a concurrent run from picking up the same issue.

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

## Step 4 — Inspect the codebase

Read the target file(s) in full before writing anything:

- Confirm the problem described in the Finding actually exists as stated
- If the file has already been fixed (the problem no longer exists), close
  the issue with the comment "✅ Already resolved — closing." and exit

## Step 5 — Implement the fix

Checkout a new branch named `agent-fix/issue-<issue-number>` from `main`.

Apply the minimal change that satisfies the acceptance criteria:

- Do not refactor surrounding code
- Do not rename symbols unless that is the stated fix
- Do not add comments, docs, or type annotations to unchanged lines
- Preserve existing formatting conventions exactly
- Prefer touching only files identified in the Fix section; if using derived
  feature-spec mapping, touch only files explicitly listed in the issue's
  implementation details.

Commit the changes with a descriptive commit message.

**IMPORTANT**: Do NOT run `git push`. The safe-output tool in the next step
handles branch pushing and PR creation together. A direct `git push` will fail
because the workflow token does not have push permissions.

## Step 6 — Open a pull request via safe output

Call the `create_pull_request` safe output tool. This is the ONLY way to
create a PR — it handles pushing the branch and opening the PR in one step.

The tool will use your committed changes on the current branch. Provide:

- Title: `<issue title, stripped of any [repo-audit] prefix>`
  (the `[agent-fix]` prefix is added automatically by the safe-output config)
- Body:
  - `Closes #<issue number>`
  - One-paragraph summary of what was changed and why
  - Acceptance criteria quoted from the issue
  - Risk confirmation: `risk:trivial` or `risk:low` with one-line justification

Do NOT set labels — they are configured automatically by the safe-output.

## Step 7 — Update the issue

Call `update_issue` with:

- `issue_number`: the issue number from Step 1 (always required)
- `body`: "🔀 Opened PR #<number> — ready for review."
- `operation`: `"append"`

## Activity Log

As your **final action**, post a one-line comment to **Discussion #95** (the SFL Activity Log) using `add_comment`:

- `issue_number`: `95`
- `body`: `YYYY-MM-DD h:mm AM/PM EST | Issue Processor | Issue #<number> → PR #<pr> | ✅ Created PR` or `⏭️ No eligible issues`

This is mandatory — every run must log exactly one entry.

## Guardrails

- Exit after processing exactly one issue per run — never loop over multiple issues
- Never force-push, amend commits, or modify files outside the Fix scope
- Never run `git push` directly — always use the `create_pull_request` safe output
- If any step fails unexpectedly: call `add_labels` with `agent:pause` and
  `remove_labels` with `agent:in-progress`, then call `update_issue` to append
  the failure reason, then exit cleanly
