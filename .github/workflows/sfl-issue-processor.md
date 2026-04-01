---
description: |
  Triggered when the `agent:fixable` label is added to an issue, when
  Analyzer C finds blocking feedback on an existing draft PR, or when
  unresolved review comments (from Copilot review or human reviewers) are
  detected by PR Label Actions. Claims or resumes the issue, advances the
  implementation on the same draft PR when one exists, and dispatches
  Analyzer A after creating or updating the draft PR. Also supports targeted
  `workflow_dispatch` handoffs for a specific issue or PR.
  One work item per run.

on:
  label_command:
    name: "agent:fixable"
    events: issues
    remove_label: false
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

checkout:
  fetch-depth: 0

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
      echo "GIT_CONFIG_VALUE_0=Authorization: basic ${header}" >> "$GITHUB_ENV"
  - name: Checkout PR branch for dispatch runs
    if: github.event_name == 'workflow_dispatch' && github.event.inputs.pull-request-number != ''
    env:
      GH_TOKEN: ${{ github.token }}
      PR_NUMBER: ${{ github.event.inputs.pull-request-number }}
    run: |
      gh pr checkout "$PR_NUMBER"
  - name: Precompute unresolved review threads for PR dispatch runs
    if: github.event_name == 'workflow_dispatch' && github.event.inputs.pull-request-number != ''
    env:
      GH_TOKEN: ${{ github.token }}
      PR_NUMBER: ${{ github.event.inputs.pull-request-number }}
    run: |
      mkdir -p /tmp/gh-aw/agent
      gh api graphql -f query='
        query($owner: String!, $repo: String!, $number: Int!) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $number) {
              reviewThreads(first: 100) {
                nodes {
                  id
                  isResolved
                  comments(first: 5) {
                    nodes {
                      id
                      author { login }
                      body
                      path
                      line
                    }
                  }
                }
              }
            }
          }
        }' \
        -f owner="${{ github.repository_owner }}" \
        -f repo="$(echo ${{ github.repository }} | cut -d/ -f2)" \
        -F number="$PR_NUMBER" \
        --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false) | { thread_id: .id, first_comment_id: .comments.nodes[0].id, author: .comments.nodes[0].author.login, body: .comments.nodes[0].body, path: .comments.nodes[0].path, line: .comments.nodes[0].line }]' \
        > /tmp/gh-aw/agent/review-threads.json
      COUNT=$(jq 'length' /tmp/gh-aw/agent/review-threads.json)
      echo "Precomputed $COUNT unresolved review thread(s) for PR #$PR_NUMBER"

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
    protected-files: fallback-to-issue
  push-to-pull-request-branch:
    target: "*"
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
  dispatch-workflow:
    workflows: ["sfl-analyzer-a", "sfl-pr-label-actions"]
    max: 1
jobs:
  format-pr-branch:
    needs: [agent, safe_outputs]
    if: "(!cancelled()) && needs.safe_outputs.result == 'success' && (needs.safe_outputs.outputs.created_pr_number != '' || needs.safe_outputs.outputs.push_commit_sha != '')"
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: read
    steps:
      - name: Determine PR branch
        id: pr-info
        run: |
          # Prefer explicit PR input (fix-cycle), fall back to newly created PR
          PR_NUM="${PR_NUM_INPUT}"
          if [ -z "$PR_NUM" ]; then
            PR_NUM="${CREATED_PR}"
          fi
          if [ -z "$PR_NUM" ]; then
            echo "No PR number available — skipping formatting"
            echo "skip=true" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          BRANCH=$(gh pr view "$PR_NUM" --repo "$REPO" --json headRefName,state --jq 'select(.state == "OPEN") | .headRefName')
          if [ -z "$BRANCH" ]; then
            echo "PR #$PR_NUM is not open or branch unavailable — skipping"
            echo "skip=true" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          echo "pr_number=$PR_NUM" >> "$GITHUB_OUTPUT"
          echo "skip=false" >> "$GITHUB_OUTPUT"
          # Pass branch via GITHUB_ENV to avoid template injection in subsequent steps
          echo "PR_BRANCH=$BRANCH" >> "$GITHUB_ENV"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PR_NUM_INPUT: ${{ github.event.inputs.pull-request-number }}
          CREATED_PR: ${{ needs.safe_outputs.outputs.created_pr_number }}
          REPO: ${{ github.repository }}
      - name: Checkout PR branch
        if: steps.pr-info.outputs.skip != 'true'
        run: |
          git clone --depth=1 --branch "$PR_BRANCH" \
            "https://x-access-token:${GH_TOKEN}@github.com/${REPO}.git" .
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          REPO: ${{ github.repository }}
      - name: Setup Node.js and Bun
        if: steps.pr-info.outputs.skip != 'true'
        run: |
          npm install -g bun@1.2.0
      - name: Install dependencies and format
        if: steps.pr-info.outputs.skip != 'true'
        id: format
        run: |
          bun install --frozen-lockfile || bun install
          bun run format
          if git diff --quiet; then
            echo "No formatting changes needed"
            echo "changed=false" >> "$GITHUB_OUTPUT"
          else
            echo "Formatting changes detected — committing"
            git config user.name "github-actions[bot]"
            git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
            git add -A
            git commit -m "style: auto-format with Prettier" --no-verify
            echo "changed=true" >> "$GITHUB_OUTPUT"
          fi
      - name: Push formatting fixes
        if: steps.pr-info.outputs.skip != 'true' && steps.format.outputs.changed == 'true'
        run: |
          git push
          echo "Pushed formatting fixes to ${PR_BRANCH} for PR #${PR_NUM}"
        env:
          PR_NUM: ${{ steps.pr-info.outputs.pr_number }}

  ensure-label-actions-dispatch:
    needs: [agent, safe_outputs, format-pr-branch]
    if: "(!cancelled())"
    runs-on: ubuntu-latest
    permissions:
      actions: write
      contents: read
      pull-requests: read
    steps:
      - name: Download agent output artifact
        continue-on-error: true
        uses: actions/download-artifact@v4
        with:
          name: agent-output
          path: /opt/gh-aw/safe-jobs/
      - name: Check agent output and dispatch label-actions if needed
        run: |
          AGENT_OUTPUT="/opt/gh-aw/safe-jobs/agent_output.json"
          if [ -z "$PR_NUM" ]; then
            echo "No PR number — skipping deterministic dispatch"
            exit 0
          fi
          if [ -f "$AGENT_OUTPUT" ]; then
            DISPATCHED=$(jq -r '.items[]? | select(.type == "dispatch_workflow") | .workflow' "$AGENT_OUTPUT" 2>/dev/null || echo "")
            if [ -n "$DISPATCHED" ]; then
              echo "Agent already dispatched: $DISPATCHED — skipping fallback"
              exit 0
            fi
          fi
          # Check if PR still has unresolved threads — only dispatch label-actions
          # if the agent resolved threads but failed to dispatch
          UNRESOLVED=$(gh api graphql -f query='
            query($owner: String!, $repo: String!, $number: Int!) {
              repository(owner: $owner, name: $repo) {
                pullRequest(number: $number) {
                  reviewThreads(first: 100) {
                    nodes { isResolved }
                  }
                }
              }
            }' \
            -f owner="${REPO%/*}" \
            -f repo="${REPO#*/}" \
            -F number="$PR_NUM" \
            --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length' 2>/dev/null || echo "0")
          if [ "$UNRESOLVED" -eq 0 ]; then
            echo "Deterministic fallback: all threads resolved, dispatching sfl-pr-label-actions for PR #$PR_NUM"
            gh workflow run sfl-pr-label-actions.yml -f pull-request-number="$PR_NUM" --repo "$REPO"
          else
            echo "PR #$PR_NUM still has $UNRESOLVED unresolved thread(s) — agent may not have resolved them. Skipping dispatch."
          fi
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PR_NUM: ${{ github.event.inputs.pull-request-number }}
          REPO: ${{ github.repository }}
  ensure-issue-labels:
    needs: [agent, safe_outputs]
    if: "(!cancelled())"
    runs-on: ubuntu-latest
    permissions:
      contents: read
      issues: write
      pull-requests: write
    steps:
      - name: Download agent output artifact
        continue-on-error: true
        uses: actions/download-artifact@v4
        with:
          name: agent-output
          path: /opt/gh-aw/safe-jobs/
      - name: Verify and repair issue labels after PR creation
        run: |
          AGENT_OUTPUT="/opt/gh-aw/safe-jobs/agent_output.json"

          # Determine target issue number — prefer event context, fall back to agent output
          ISSUE_NUM="${ISSUE_NUM_EVENT:-$ISSUE_NUM_INPUT}"
          if [ -z "$ISSUE_NUM" ] && [ -f "$AGENT_OUTPUT" ]; then
            ISSUE_NUM=$(jq -r '.items[]? | select(.type == "create_pull_request") | .body' \
              "$AGENT_OUTPUT" 2>/dev/null \
              | grep -oE 'Closes #[0-9]+' | head -1 | sed 's/Closes #//' || echo "")
          fi

          if [ -z "$ISSUE_NUM" ]; then
            echo "No issue number available — skipping label verification"
            exit 0
          fi

          echo "Checking label state for issue #$ISSUE_NUM..."

          # Verify a PR was actually created for this issue
          PR_NUM=$(gh pr list --state open --label "agent:pr" --json number,body --repo "$REPO" \
            | jq -r ".[] | select(.body | contains(\"Closes #${ISSUE_NUM}\")) | .number" 2>/dev/null \
            | head -1 || echo "")

          if [ -z "$PR_NUM" ]; then
            echo "No open agent:pr PR found for issue #$ISSUE_NUM — labels remain unchanged"
            exit 0
          fi

          # Copy risk labels from issue to PR (deterministic — agent may not do this)
          ISSUE_LABELS=$(gh api "repos/$REPO/issues/$ISSUE_NUM/labels" --jq '.[].name' 2>&1)
          if [ $? -ne 0 ]; then
            echo "Warning: Failed to fetch labels from issue #$ISSUE_NUM — skipping risk label copy"
            ISSUE_LABELS=""
          fi
          RISK_LABEL=$(echo "$ISSUE_LABELS" | grep -E '^risk:' | head -1)
          if [ -n "$RISK_LABEL" ]; then
            PR_LABELS=$(gh pr view "$PR_NUM" --repo "$REPO" --json labels --jq '[.labels[].name] | join("\n")' 2>/dev/null || echo "")
            if ! echo "$PR_LABELS" | grep -Fxq "$RISK_LABEL"; then
              gh pr edit "$PR_NUM" --repo "$REPO" --add-label "$RISK_LABEL"
              echo "Copied $RISK_LABEL from issue #$ISSUE_NUM to PR #$PR_NUM"
            fi
          fi

          # Check current issue labels
          LABELS=$(gh api "repos/$REPO/issues/$ISSUE_NUM/labels" --jq '.[].name' 2>/dev/null || echo "")

          if echo "$LABELS" | grep -q "^agent:in-progress$"; then
            echo "Issue #$ISSUE_NUM already has agent:in-progress — labels are correct"
            exit 0
          fi

          if echo "$LABELS" | grep -q "^agent:fixable$"; then
            echo "Deterministic fallback: issue #$ISSUE_NUM still has agent:fixable after PR #$PR_NUM was created"
            if echo '{"labels":["agent:in-progress"]}' | gh api "repos/$REPO/issues/$ISSUE_NUM/labels" --method POST --input - --silent; then
              gh api "repos/$REPO/issues/$ISSUE_NUM/labels/agent%3Afixable" --method DELETE --silent 2>/dev/null || true
              echo "Label repair complete: agent:fixable → agent:in-progress on issue #$ISSUE_NUM"
            else
              echo "Label repair failed: could not add agent:in-progress to issue #$ISSUE_NUM"
            fi
          else
            echo "Issue #$ISSUE_NUM has no agent:fixable label — no repair needed"
          fi
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ISSUE_NUM_EVENT: ${{ github.event.issue.number }}
          ISSUE_NUM_INPUT: ${{ github.event.inputs.issue-number }}
          REPO: ${{ github.repository }}
source: relias-engineering/set-it-free-loop/workflows/sfl-issue-processor.md@79100291d171fa15d82a21338d23a2cf4f6063b6
---
source: relias-engineering/set-it-free-loop/workflows/sfl-issue-processor.md@79100291d171fa15d82a21338d23a2cf4f6063b6

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
| `reply_to_pull_request_review_comment` | 10 | Reply to review comments explaining how feedback was addressed |
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

**Dispatch inputs** (may be blank):

- `pull-request-number`: `${{ github.event.inputs.pull-request-number }}`
- `issue-number`: `${{ github.event.inputs.issue-number }}`

If a value above still shows raw template syntax (dollar-brace notation)
instead of a number, that input was not provided — treat it as blank.

**Routing rules:**

1. If `pull-request-number` above is a valid number (not blank, not `#`, not
   whitespace), this is a **targeted follow-up PR run**. Use that PR directly
   as the target. Skip to Step 1a.
2. Else if `issue-number` above is a valid number, this is a **targeted
   new-issue run**. Use that issue directly as the target. Skip to Step 1b.
3. Else this is an **untargeted run**. Check for existing draft PR work FIRST
   (Step 1a), then new issues (Step 1b).

For untargeted runs, if the `issue-number` context variable is available (from
an `issues` event), prefer that issue:

- when the reopened issue already has exactly one open draft `agent:pr` PR,
  prefer resuming that PR deterministically instead of treating the issue as
  new work
- when the issue has `agent:fixable` and no draft PR yet, prefer that specific
  issue for **new issue** work once you confirm there is no older draft PR
  awaiting a follow-up implementation pass

Determinism requirement:

- One `agent:in-progress` issue must map to exactly one open `agent:pr` PR (draft or non-draft).
- If you observe multiple open `agent:pr` PRs (draft or non-draft) for the same issue, this is a pipeline failure, not a recovery opportunity.
- In that state, do NOT pick one, do NOT create a superseding PR, and do NOT continue implementation. Report the failure and exit.

### 1a — Existing draft PR needing fixes

If `pull-request-number` is provided:

1. Read that exact PR.
2. Verify it is an open **draft** PR with label `agent:pr` and without
  `agent:human-required`.
3. Determine current cycle N from the highest `pr:cycle-N` label (default `0`).
4. Search the PR **comments** for all three analyzer markers for cycle N:
   `[MARKER:sfl-analyzer-a cycle:N]`, `[MARKER:sfl-analyzer-b cycle:N]`,
   `[MARKER:sfl-analyzer-c cycle:N]`. Verify all three exist.
5. From the same PR comments, check the analyzer verdicts. The PR is eligible
   if any condition is met:
   - At least one verdict for cycle N is `**BLOCKING ISSUES FOUND**`
     (blocking feedback needs code fixes), OR
   - All three verdicts are `**PASS**` but the PR has unresolved review
     threads (query `reviewThreads` with `isResolved: false`). This means
     PR Label Actions dispatched this run for review-comment resolution,
     not for blocking analyzer findings, OR
   - The PR has the label `ci:fix-attempted`. This means PR Label Actions
     detected that CI failed (e.g., test failures, lint errors) despite all
     analyzers passing. A PR comment titled "## CI Fix Cycle" contains the
     CI failure output — read it for diagnostic context. Treat this as a fix
     cycle: fix the code so CI passes. After pushing the fix via
     `push_to_pull_request_branch`, call `remove_labels` to remove
     `ci:fix-attempted` from the PR.
6. Search the PR comments for `[MARKER:sfl-issue-processor cycle:N]`.
   Verify it is not already present.

If any of those checks fail, exit — there is no eligible follow-up work for
that specific PR.

Before continuing, verify the linked issue has exactly one open `agent:pr`
PR (draft or non-draft). If more than one exists, report the duplicate-PR failure and exit.

If they pass, use that PR as the work item.

**Branch checkout** (dispatch runs only): When this run was triggered by
`workflow_dispatch` with a `pull-request-number`, the workflow has already
checked out the PR branch before the agent started. Verify the current branch
matches the PR's `headRefName` by running `git branch --show-current`. If it
does not match (e.g., still on `main`), switch to the PR's head branch:

```bash
git checkout <pr-head-branch>
```

Replace `<pr-head-branch>` with the `headRefName` from the PR you just read.
If the checkout fails, report the failure and exit.

Continue at Step 3.

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
   - If all three verdicts are `**PASS**` and the PR has no unresolved review
     threads, skip the candidate — promotion, not implementation, is the
     next step.
   - If all three verdicts are `**PASS**` but the PR has unresolved review
     threads (`reviewThreads` with `isResolved: false`), this PR needs
     review-comment resolution (thread-only path).
   - If any verdict is `**BLOCKING ISSUES FOUND**`, this PR needs another
     implementation pass.
5. Search the PR comments for `[MARKER:sfl-issue-processor cycle:N]`.
   If present, skip the candidate — this cycle has already had an
   implementation pass.

Take the **first** candidate that still has unresolved blocking feedback.

Before selecting a candidate, check whether its linked issue has multiple open
`agent:pr` PRs (draft or non-draft). If it does, report the duplicate-PR
failure and exit instead of choosing one arbitrarily.

If such a PR is found, this run is a **follow-up implementation pass**.
Use its linked issue as the canonical spec.

**Branch checkout**: If the workspace is not already on the PR branch
(check with `git branch --show-current`), switch to the PR's head branch:

```bash
git checkout <pr-head-branch>
```

Continue at Step 3.

### 1b — New issue with no draft PR yet

If no existing draft PR needs follow-up work, search for open issues with label
`agent:fixable` that do NOT have any of:

- `agent:in-progress`
- `agent:pause`
- `agent:human-required`

If `issue-number` is provided:

1. Read that exact issue.

2. Search for open PRs labeled `agent:pr` (draft or non-draft) that already
  belong to that issue.

3. If more than one open `agent:pr` PR (draft or non-draft) already exists
   for that issue, report the duplicate-PR failure and exit.

4. If exactly one open `agent:pr` PR (draft or non-draft) already exists for
   that issue, treat this targeted issue run as a deterministic resume path
   instead of a new-issue path:

    - read that PR
    - verify it is an open **draft** PR without `agent:human-required`
    - determine current cycle N from the highest `pr:cycle-N` label (default `0`)
    - search the PR **comments** for all three analyzer markers for cycle N
    - verify at least one analyzer verdict for cycle N (from PR comments) is
      `**BLOCKING ISSUES FOUND**`
    - search the PR comments for `[MARKER:sfl-issue-processor cycle:N]` —
      verify it is not already present
    - if all checks pass, use that PR as the work item — verify you are
      on the PR's head branch (`git branch --show-current`), checkout if
      needed, then continue at Step 3
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

1. Search for open PRs labeled `agent:pr` (draft or non-draft) that already
  belong to that issue (for example via branch naming
  `agent-fix/issue-<issue-number>-...` or `Closes #<issue-number>` in the PR
  body).
2. If more than one open `agent:pr` PR (draft or non-draft) already exists
  for that issue, report the duplicate-PR failure and exit.
3. If exactly one open `agent:pr` PR (draft or non-draft) already exists for
  that issue, do NOT treat the issue as new work and do NOT create another PR. Report that the
  new-issue path observed existing PR state for the issue, pause if needed,
  and exit so the state-selection bug is visible.
4. Only select the first candidate issue with **zero** open `agent:pr` PRs
  (draft or non-draft).

If no PR candidate and no issue candidate exist, exit — nothing to do.

Risk labels are metadata for reviewer visibility only. Do NOT skip or escalate
an otherwise actionable work item solely because it is labeled `risk:medium`
or `risk:high`.

## Step 2 — Claim or resume the issue

If this is a **new issue** from Step 1b:

1. Call `add_comment` with `issue_number` set to the issue number from Step 1b and `body` set to "🤖 Issue Processor claimed this issue. Working on a fix."

Do NOT call `add_labels` or `remove_labels` yet. The label change from
`agent:fixable` to `agent:in-progress` MUST happen **after** `create_pull_request`
succeeds in Step 6a. This is critical: if the PR creation fails, the issue
must remain `agent:fixable` so it can be retried. See Step 6a for where to
emit the label changes.

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

3. If a draft PR already exists, check for pre-fetched review thread data at
   `/tmp/gh-aw/agent/review-threads.json`. This file is populated by a
   deterministic precomputation step that runs before the agent. It contains
   a JSON array of unresolved review threads with these fields per entry:
   - `thread_id`: GraphQL node ID (for reference only — thread resolution is handled deterministically by PR Label Actions)
   - `first_comment_id`: Comment ID for `reply_to_pull_request_review_comment`
   - `author`: Login of the reviewer (e.g., `copilot-pull-request-reviewer[bot]`)
   - `body`: The review comment text
   - `path`: File path the comment targets
   - `line`: Line number the comment targets

   If the file does not exist or is empty (`[]`), there are no unresolved
   review threads to address.

4. The target file(s) in full and any surrounding context needed to implement safely.

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
3. Unresolved review comments from Copilot review or human reviewers
4. Non-blocking analyzer suggestions only after blocking items are addressed

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
- Address unresolved review comments from Copilot review or human reviewers.
  Use the pre-fetched data in `/tmp/gh-aw/agent/review-threads.json` (from
  Step 4) as the authoritative list of threads to process. For each entry:
  1. Read the `body` and `path`/`line` to understand the feedback.
  2. Apply the requested fix or improvement in code. If it is a false positive
     or subjective suggestion that cannot be meaningfully addressed, note it in
     the summary marker rather than ignoring it.
  3. Call `reply_to_pull_request_review_comment` with `comment_id` set to the
     entry's `first_comment_id` and a brief explanation of how the feedback was
     addressed (or why no change is needed).
  This is mandatory — every entry in the pre-fetched array must be replied to.
  Do NOT call `resolve_pull_request_review_thread` — thread resolution is handled
  deterministically by PR Label Actions after this run completes.
- If analyzer findings conflict, prefer safety (security > correctness > style).
- If a finding cannot be fully resolved in one pass, make real progress and note
  what remains in your summary marker.

Before committing, run `npx prettier --write` on every file you changed or
created. This project enforces Prettier formatting in CI (`format:check`). If
you skip this step the PR will fail CI and cannot be auto-merged.

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

Never create a second PR for an issue that already has an open `agent:pr` PR
(draft or non-draft). There is no allowed "supersede" fallback during
follow-up work. If the existing PR branch cannot be updated, fail loudly and
leave the live state unchanged.

### 6a — No PR exists yet

Before calling `create_pull_request`, re-check the linked issue. If the issue
already has any open `agent:pr` PR (draft or non-draft), stop immediately and
report the failure instead of creating another PR. This is a defense-in-depth
guardrail: the create-PR path is valid only when the linked issue has zero open
`agent:pr` PRs (draft or non-draft) at the moment of creation.

Call the `create_pull_request` safe output tool. This is the ONLY way to
create the initial PR — it handles pushing the branch and opening the PR in
one step.

**CRITICAL — Deferred execution**: All safe-output tools (`create_pull_request`,
`add_labels`, `remove_labels`, `add_comment`, etc.) are **deferred**. They are
queued during your run and executed by a separate `safe_outputs` job AFTER your
agent step finishes. This means:

- You CANNOT verify a PR was created by reading the GitHub API after calling
  `create_pull_request`. The PR does not exist yet during your run.
- You CANNOT verify labels changed by reading the issue after calling
  `add_labels`. The label change has not happened yet.
- Do NOT attempt any post-call verification reads for safe-output tools.
  Trust that the tool call was accepted and will be processed.
- **Never emit contradictory safe-output sequences.** If you called
  `create_pull_request`, do NOT also emit `add_labels` with `agent:pause`
  in the same run. Pick one path (success or failure) and commit to it.

The tool will use your committed changes on the current branch. Provide:

- Title: `<issue title, stripped of any [repo-audit] prefix>`
  (the `[agent-fix]` prefix is added automatically by the safe-output config)
- Body:
  - `Closes #<issue number>`
  - One-paragraph summary of what was changed and why
  - Acceptance criteria quoted from the issue
  - Risk label carried from the issue with one-line justification

Do NOT set labels — they are configured automatically by the safe-output.

After the PR is created, update the issue labels to reflect the claimed state:

1. Call `add_labels` to add `agent:in-progress` to the linked issue.
2. Call `remove_labels` to remove `agent:fixable` from the linked issue.

These label calls MUST come after `create_pull_request` in your output. Safe
outputs processes messages in order — if the PR creation fails, subsequent
messages are cancelled, keeping the issue labeled `agent:fixable` for retry.

Then call `add_comment` on the linked issue with:

- `issue_number`: the issue number
- `body`: "🔀 Opened PR #<number> — ready for analyzer review."

Do NOT append this status to the issue body.

### 6b — Draft PR already exists

There are two sub-paths depending on whether code changes are needed:

#### 6b-i — Code changes needed

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

#### 6b-ii — Thread-only resolution (no code changes needed)

When all unresolved review threads have been addressed by replying
(via `reply_to_pull_request_review_comment`), but no code changes were necessary:

- Do NOT call `push_to_pull_request_branch` — there is nothing to push.
- Do NOT increment the cycle label — no new code means no new analysis cycle.
- Post the implementation summary as a **PR comment** using `add_comment`:

```markdown
[MARKER:sfl-issue-processor cycle:N]
## :wrench: Issue Processor &mdash; Cycle N Review Thread Resolution

**PR**: #<number>
**Linked Issue**: #<issue-number>

### Summary

- Replied to <count> unresolved review thread(s).
- No code changes required — all feedback was non-blocking or already addressed.
- PR Label Actions has been re-dispatched for thread resolution and promotion check.
```

Then proceed to Step 7 (thread-only dispatch path).

## Step 7 — Handoff to Analyzer A or PR Label Actions

If you created a brand-new draft PR in Step 6a, do NOT dispatch
`sfl-analyzer-a`. The PR open event is the intended trigger for Analyzer A on
the first review cycle.

If you updated an existing draft PR in Step 6b (code changes were pushed),
dispatch `sfl-analyzer-a` as the next explicit handoff for the follow-up
review cycle.

When dispatching `sfl-analyzer-a` for an existing draft PR, include input
`pull-request-number: <number>` so Analyzer A reviews that exact PR instead of
searching for the oldest eligible draft PR.

If this was a **thread-only resolution** (you replied to unresolved review
threads but made no code changes and did not push), dispatch
`sfl-pr-label-actions` instead of `sfl-analyzer-a`. Include input
`pull-request-number: <number>`. PR Label Actions will resolve the threads
deterministically and promote the PR to ready-for-review.

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
- **Never create, edit, or delete files under `.github/` or `.agents/`** — these are protected paths and will cause the PR to be rejected by safe-outputs. If an issue finding targets a file in these directories, skip that finding and note it as non-agent-fixable in the activity log.
- **Avoid modifying dependency manifests** (`package.json`, `package-lock.json`, `yarn.lock`, etc.) unless the issue specifically requires it. These are protected files — if changed, the PR falls back to a human-review issue instead of being created normally.
- Never run `git push` directly — always use `create_pull_request` or `push_to_pull_request_branch`
- Never create a superseding PR for a follow-up implementation pass
- Never write a supersede or push-failure narrative unless this run actually attempted `push_to_pull_request_branch` and you can cite the returned failure
- Treat blank targeted PR input or one-issue-two-PR state as a hard failure that must be surfaced
- If any step fails unexpectedly: call `add_labels` with `agent:pause` and
  `remove_labels` with `agent:in-progress` when appropriate, then call `update_issue`
  to append the failure reason, then exit cleanly
- **Never emit contradictory safe-output sequences.** If you already called
  `create_pull_request` or `push_to_pull_request_branch`, you have committed to
  the success path. Do NOT also emit pause/failure labels in the same run.
  Safe-output tools are deferred — you cannot verify their result by reading
  GitHub API during your run. Trust the call and let safe_outputs handle it.
