---
description: |
  SFL Implementer — Claims or resumes an issue, creates or updates exactly
  one draft PR. Dispatched by the SFL gate after issue validation.
  One work item per run.

on:
  workflow_call:
    inputs:
      issue-number:
        description: Target issue number for a new-issue implementation pass
        required: false
        type: string
      pull-request-number:
        description: Target draft PR number for a follow-up implementation pass
        required: false
        type: string
  workflow_dispatch:
    inputs:
      issue-number:
        description: Target issue number for a new-issue implementation pass
        required: false
        type: string
      pull-request-number:
        description: Target draft PR number for a follow-up implementation pass
        required: false
        type: string

permissions:
  contents: read
  issues: read
  pull-requests: read

checkout:
  fetch-depth: 0
  fetch: ["*"]

steps:
  - name: Fetch all remote branches and configure git auth
    env:
      FETCH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      SERVER_URL: ${{ github.server_url }}
    run: |
      header=$(printf "x-access-token:%s" "${FETCH_TOKEN}" | base64 -w 0)
      git -c "http.extraheader=Authorization: Basic ${header}" fetch origin '+refs/heads/*:refs/remotes/origin/*'
      echo "GIT_CONFIG_COUNT=1" >> "$GITHUB_ENV"
      echo "GIT_CONFIG_KEY_0=http.${SERVER_URL}/.extraheader" >> "$GITHUB_ENV"
      echo "GIT_CONFIG_VALUE_0=Authorization: Basic ${header}" >> "$GITHUB_ENV"
  - name: Checkout PR branch for follow-up runs
    if: (inputs.pull-request-number || github.event.inputs.pull-request-number) != ''
    env:
      GH_TOKEN: ${{ github.token }}
      PR_NUMBER: ${{ inputs.pull-request-number || github.event.inputs.pull-request-number }}
    run: |
      gh pr checkout "$PR_NUMBER"

timeout-minutes: 120

engine:
  id: copilot
  model: gpt-5.4

network:
  allowed:
    - defaults
    - dotnet

tools:
  github:
    lockdown: false

safe-outputs:
  create-pull-request:
    title-prefix: "[agent-fix] "
    labels: [agent:pr]
    draft: true
    max: 1
    protected-files: fallback-to-issue
  push-to-pull-request-branch:
    target: "*"
    title-prefix: "[agent-fix] "
    labels: [agent:pr]
    max: 1
    protected-files: fallback-to-issue
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
  reply-to-pull-request-review-comment:
    target: "*"
    max: 10
source: relias-engineering/set-it-free-loop/.github/workflows/sfl-implement.md@9d84e60e4cd4c9cd3810b602e90f865ed235faab
---

# SFL Implementer

Advance exactly one implementation work item per run. This workflow is
dispatched by the SFL gate after issue validation.

## Responsibilities

1. Validate the issue or PR input
2. Enforce the one-issue-to-one-open-PR invariant
3. Create the first draft PR when none exists
4. Push to the same PR branch for follow-up passes
5. Resolve addressed review threads when handling a PR follow-up
6. Emit deterministic markers in comments

## Non-responsibilities

- Do NOT dispatch analyzers — the gate handles this
- Do NOT make routing decisions — the gate handles this
- Do NOT update dashboard discussions

## Step 1 — Identify the target work item

**Dispatch inputs** (may be blank):

- `pull-request-number`: `${{ inputs.pull-request-number || github.event.inputs.pull-request-number }}`
- `issue-number`: `${{ inputs.issue-number || github.event.inputs.issue-number }}`

**Routing rules:**

1. If `pull-request-number` is a valid number, this is a **follow-up PR run**.
   Use that PR directly. Skip to Step 1a.
2. If `issue-number` is a valid number, this is a **new-issue run**.
   Use that issue directly. Skip to Step 1b.
3. Otherwise, exit — the orchestrator always provides explicit input.

### 1a — Follow-up PR run

1. Read the target PR.
2. Verify it is an open **draft** PR with label `agent:pr`.
3. Extract the linked issue number from `Closes #N` in the PR body.
4. Search the PR comments for analyzer verdicts and blocking findings.
5. If the PR has unresolved review threads, address them. After fixing
   the code, **reply to each review comment** using
   `reply_to_pull_request_review_comment` explaining what changed. The
   SFL gate will resolve the threads once it confirms your replies.
6. Continue at Step 3.

**Invariant check**: Verify the linked issue has exactly one open `agent:pr`
PR. If more than one exists, report the duplicate-PR failure and exit.

### 1b — New issue run

1. Read the target issue.
2. Verify it is open, has label `agent:fixable`, and does NOT have
   `agent:blocked` or `no-agent`.
3. Search for open PRs labeled `agent:pr` that belong to this issue.
4. If any `agent:pr` PR already exists for this issue, report the
   conflict and exit.
5. Continue at Step 2.

## Step 2 — Claim the issue

Post a claim comment:

- Call `add_comment` with `issue_number` set to the issue number and
  `body` set to "🤖 Implementer claimed this issue. Working on a fix."

Label changes (`agent:fixable` → `agent:in-progress`) happen AFTER
`create_pull_request` succeeds in Step 6a. If PR creation fails, the
issue must remain `agent:fixable` for retry.

## Step 3 — Validate the issue body

The issue body must contain enough information to implement safely:

- **Finding** or equivalent problem statement
- **Fix** or implementation direction
- **Acceptance criteria** or verifiable outcomes

Accept alternative headings (Goal, Summary, Implementation Plan) when they
provide equivalent actionable detail. Only exit with a failure comment when
the body is truly non-actionable.

## Step 4 — Gather implementation context

1. Read the linked issue body (canonical source of intent).
2. If a draft PR already exists, read the PR diff and analyzer review comments.
3. Read the target file(s) in full for surrounding context.
4. For new issues, confirm the described problem actually exists. If already
   fixed and no draft PR exists, close the issue with "Already resolved" and exit.

## Step 5 — Implement the next pass

For **new issues**: determine the repository's default branch from repository
metadata, then create branch `agent-fix/issue-<issue-number>` from that
default branch.

For **follow-up PRs**: work on the existing PR branch.

Implementation priorities:

1. Issue acceptance criteria and explicit scope
2. Blocking analyzer findings for the current cycle
3. Unresolved review comments — reply to **every** unresolved review
   thread after addressing it (the gate checks for replies before
   resolving threads and re-requesting Copilot review)
4. Non-blocking suggestions (only after blocking items are addressed)

Rules:

- Apply the minimal change that satisfies acceptance criteria
- Do not refactor surrounding code
- Do not rename symbols unless that is the stated fix
- Do not add comments, docs, or type annotations to unchanged lines
- Before committing, format changed files only with tooling already configured and available in the repo; if Prettier is configured locally, run `npx --no-install prettier --write` on changed files, otherwise use the repo's existing formatter if applicable, and do not install new formatting tooling just for this run

**IMPORTANT**: Do NOT run `git push`. Use the safe outputs in Step 6.

## Step 6 — Create or update the draft PR

| Scenario | Action |
| --- | --- |
| New issue, no existing PR | `create_pull_request` |
| Follow-up, existing PR | `push_to_pull_request_branch` |
| Follow-up, push fails | Report failure and exit |
| Follow-up, would create second PR | **NEVER** — exit with error |

### 6a — No PR exists yet

Before calling `create_pull_request`, re-check that no open `agent:pr` PR
exists for the linked issue. If one exists, stop and report the failure.

After calling `create_pull_request`, emit label changes:

- `add_labels`: `agent:in-progress` on the issue
- `remove_labels`: `agent:fixable` from the issue

### 6b — Follow-up on existing PR

Call `push_to_pull_request_branch` to push fixes to the existing branch.

## Step 7 — Post the implementation marker

First, determine the cycle number N:

1. Read all PR comments and find markers matching `<!-- MARKER:sfl-implement cycle:N -->`
   or `<!-- MARKER:sfl-analyzer-{a|b|c} cycle:N -->`
2. Take the highest N found across all SFL markers
3. Set N = highest + 1 (or 1 if no markers exist)

Post a comment on the PR with the cycle marker:

```markdown
<!-- MARKER:sfl-implement cycle:N -->
## Implementation Pass — Cycle N

**Issue**: #<issue-number>
**Changes**: Brief summary of what was changed and why.
**Blocking findings addressed**: N of M
```

This marker prevents duplicate implementation passes in the same cycle.

## Guardrails

- Process exactly ONE work item per run
- Never create a second PR for an issue that already has an open `agent:pr` PR
- Never dispatch other workflows — the gate owns sequencing
- Never modify the PR body — it is written once at creation
- All safe-output tools are deferred and execute after this run completes
