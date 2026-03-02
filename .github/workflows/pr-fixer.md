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

safe-inputs:
  check-pr-merge-state:
    description: "Check a PR's merge state via GitHub GraphQL API. Returns mergeable status (MERGEABLE, CONFLICTING, UNKNOWN) and mergeStateStatus (CLEAN, DIRTY, BLOCKED, UNSTABLE, BEHIND, UNKNOWN, DRAFT). Use this instead of REST API which returns null on first access."
    inputs:
      pr_number:
        type: number
        required: true
        description: "The pull request number to check"
    run: |
      gh api graphql -f query='
        query($owner:String!, $name:String!, $number:Int!) {
          repository(owner:$owner, name:$name) {
            pullRequest(number:$number) {
              number
              title
              mergeable
              mergeStateStatus
              headRefName
              baseRefName
              isDraft
            }
          }
        }' -f owner="$REPO_OWNER" -f name="$REPO_NAME" -F number="$INPUT_PR_NUMBER"
    env:
      GH_TOKEN: "${{ secrets.GITHUB_TOKEN }}"
      REPO_OWNER: "${{ github.repository_owner }}"
      REPO_NAME: "${{ github.event.repository.name }}"

  resolve-pr-conflicts:
    description: "Resolve a merge conflict on a PR by overwriting a conflicting file with main's version via the GitHub Contents API, then merging remaining main changes via update-branch. Call once per conflicting file. Returns JSON with status (success, partial, error) and details. The PR's changes to the resolved file are LOST — main's version wins."
    inputs:
      pr_number:
        type: number
        required: true
        description: "The pull request number to resolve conflicts for"
      file_path:
        type: string
        required: true
        description: "Path to the conflicting file to resolve (e.g., src/components/Foo.tsx)"
    timeout: 120
    run: |
      set -euo pipefail

      PR_NUM="$INPUT_PR_NUMBER"
      FILE="$INPUT_FILE_PATH"

      echo "Resolving conflict for file '$FILE' on PR #$PR_NUM"

      # Get PR head branch name
      HEAD_BRANCH=$(gh api "repos/$REPO_OWNER/$REPO_NAME/pulls/$PR_NUM" --jq '.head.ref')
      echo "PR branch: $HEAD_BRANCH"

      # Get main's version of the file (base64)
      MAIN_B64=$(gh api "repos/$REPO_OWNER/$REPO_NAME/contents/$FILE?ref=main" --jq '.content' | tr -d '\n')
      if [ -z "$MAIN_B64" ]; then
        echo '{"status":"error","message":"Could not read main version of file"}'
        exit 1
      fi

      # Get PR branch's file SHA (needed for update)
      PR_SHA=$(gh api "repos/$REPO_OWNER/$REPO_NAME/contents/$FILE?ref=$HEAD_BRANCH" --jq '.sha')
      if [ -z "$PR_SHA" ]; then
        echo '{"status":"error","message":"Could not read PR branch version of file"}'
        exit 1
      fi

      echo "Main b64 length: ${#MAIN_B64}, PR file SHA: $PR_SHA"

      # Commit main's version to PR branch — capture new commit SHA for update-branch
      NEW_SHA=$(gh api "repos/$REPO_OWNER/$REPO_NAME/contents/$FILE" \
        --method PUT \
        -f message="chore: resolve merge conflict in $FILE" \
        -f content="$MAIN_B64" \
        -f sha="$PR_SHA" \
        -f branch="$HEAD_BRANCH" \
        --jq '.commit.sha' 2>&1) || {
        echo "{\"status\":\"error\",\"message\":\"Contents API PUT failed: $NEW_SHA\"}"
        exit 1
      }

      echo "File committed with SHA: $NEW_SHA"

      # Merge main into PR branch using the commit SHA we just created (avoids race)
      MERGE_RESULT=$(gh api "repos/$REPO_OWNER/$REPO_NAME/pulls/$PR_NUM/update-branch" \
        --method PUT \
        -f expected_head_sha="$NEW_SHA" \
        --jq '.message' 2>&1) || {
        echo "{\"status\":\"partial\",\"message\":\"File committed but update-branch failed: $MERGE_RESULT\",\"file_committed\":\"$FILE\"}"
        exit 0
      }

      echo "{\"status\":\"success\",\"message\":\"$MERGE_RESULT\",\"file_resolved\":\"$FILE\",\"pr_branch\":\"$HEAD_BRANCH\"}"
    env:
      GH_TOKEN: "${{ secrets.GH_AW_GITHUB_TOKEN }}"
      REPO_OWNER: "${{ github.repository_owner }}"
      REPO_NAME: "${{ github.event.repository.name }}"

  write-file-to-pr-branch:
    description: "Write a file directly to a PR branch via the GitHub Contents API. Use this INSTEAD of push_to_pull_request_branch when modifying files that were CREATED by the PR (i.e., files that don't exist on main). This bypasses the patch mechanism which fails with add/add conflicts for PR-only files. Returns JSON with the new commit SHA."
    inputs:
      pr_number:
        type: number
        required: true
        description: "The pull request number"
      file_path:
        type: string
        required: true
        description: "Path to the file to update (e.g., src/components/Foo.tsx)"
      file_content:
        type: string
        required: true
        description: "The complete new file content (will be base64-encoded automatically)"
      commit_message:
        type: string
        required: true
        description: "The commit message for this file update"
    timeout: 60
    run: |
      set -euo pipefail

      PR_NUM="$INPUT_PR_NUMBER"
      FILE="$INPUT_FILE_PATH"
      CONTENT="$INPUT_FILE_CONTENT"
      MSG="$INPUT_COMMIT_MESSAGE"

      # Get PR head branch name
      HEAD_BRANCH=$(gh api "repos/$REPO_OWNER/$REPO_NAME/pulls/$PR_NUM" --jq '.head.ref')
      echo "PR branch: $HEAD_BRANCH"

      # Get current file SHA on the PR branch (needed for update)
      FILE_SHA=$(gh api "repos/$REPO_OWNER/$REPO_NAME/contents/$FILE?ref=$HEAD_BRANCH" --jq '.sha' 2>/dev/null || echo "")
      if [ -z "$FILE_SHA" ]; then
        echo '{"status":"error","message":"File does not exist on PR branch"}'
        exit 1
      fi

      # Base64-encode the content
      B64_CONTENT=$(echo -n "$CONTENT" | base64 -w 0)

      # Update the file on the PR branch
      RESULT=$(gh api "repos/$REPO_OWNER/$REPO_NAME/contents/$FILE" \
        --method PUT \
        -f message="$MSG" \
        -f content="$B64_CONTENT" \
        -f sha="$FILE_SHA" \
        -f branch="$HEAD_BRANCH" \
        --jq '{status: "success", commit_sha: .commit.sha, file: .content.path}' 2>&1) || {
        echo "{\"status\":\"error\",\"message\":\"Contents API PUT failed: $RESULT\"}"
        exit 1
      }

      echo "$RESULT"
    env:
      GH_TOKEN: "${{ secrets.GH_AW_GITHUB_TOKEN }}"
      REPO_OWNER: "${{ github.repository_owner }}"
      REPO_NAME: "${{ github.event.repository.name }}"

  replace-pr-body-text:
    description: "Perform a targeted find-and-replace on a PR's body text via the GitHub API. Use this to update checkboxes, fix text, or make small edits to the PR description without reproducing the entire body. The search_text must match EXACTLY one location in the body. Returns JSON with status."
    inputs:
      pr_number:
        type: number
        required: true
        description: "The pull request number"
      search_text:
        type: string
        required: true
        description: "The exact text to find in the PR body (must match exactly once)"
      replace_text:
        type: string
        required: true
        description: "The text to replace search_text with"
    timeout: 30
    run: |
      set -euo pipefail

      PR_NUM="$INPUT_PR_NUMBER"
      SEARCH="$INPUT_SEARCH_TEXT"
      REPLACE="$INPUT_REPLACE_TEXT"

      # Get current PR body
      BODY=$(gh api "repos/$REPO_OWNER/$REPO_NAME/pulls/$PR_NUM" --jq '.body')
      if [ -z "$BODY" ]; then
        echo '{"status":"error","message":"Could not read PR body"}'
        exit 1
      fi

      # Count occurrences to ensure exactly one match
      COUNT=$(echo "$BODY" | grep -cF "$SEARCH" || true)
      if [ "$COUNT" -eq 0 ]; then
        echo '{"status":"error","message":"search_text not found in PR body"}'
        exit 1
      fi
      if [ "$COUNT" -gt 1 ]; then
        echo "{\"status\":\"error\",\"message\":\"search_text found $COUNT times — must match exactly once\"}"
        exit 1
      fi

      # Perform the replacement
      NEW_BODY=$(echo "$BODY" | awk -v search="$SEARCH" -v replace="$REPLACE" '{
        idx = index($0, search)
        if (idx > 0) {
          printf "%s%s%s\n", substr($0, 1, idx-1), replace, substr($0, idx+length(search))
        } else {
          print
        }
      }')

      # Update the PR body
      gh api "repos/$REPO_OWNER/$REPO_NAME/pulls/$PR_NUM" \
        --method PATCH \
        --input <(jq -n --arg body "$NEW_BODY" '{"body": $body}') \
        --jq '{status: "success", body_length: (.body | length)}' 2>&1 || {
        echo '{"status":"error","message":"Failed to update PR body"}'
        exit 1
      }
    env:
      GH_TOKEN: "${{ secrets.GH_AW_GITHUB_TOKEN }}"
      REPO_OWNER: "${{ github.repository_owner }}"
      REPO_NAME: "${{ github.event.repository.name }}"

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
  push-to-pull-request-branch:
    target: "*"
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
  create-issue:
    max: 2
    title-prefix: "[follow-up] "
    labels: [agent:fixable, action-item]
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

## Step 0 — Read SFL autonomy config

Call `read_sfl_config` (no inputs). Parse the YAML and note these values:

- `autonomy.conflict-resolution` (boolean) — if `false`, do NOT attempt
  conflict resolution in Step 6b; instead post a comment requesting human
  intervention and exit
- `cycles.max-fix-cycles` (number) — the maximum cycle number before
  escalating to human

Keep these values in context for use in later steps.

## Step 1 — Find the target PR

First, check for non-draft PRs with merge conflicts (conflict resolution mode).
Then fall back to draft PRs needing analyzer fixes (standard mode).

### 1a — Conflict resolution mode

Search for open pull requests in this repository that meet ALL criteria:

- Is **NOT** a draft PR
- Has the label `human:ready-for-review`

For each match, call the `check-pr-merge-state` safe-input tool with the PR
number to get the accurate GraphQL merge state. The REST API returns `null`
for the mergeable field on first access — always use this tool instead.

If any PR has `mergeable: CONFLICTING`, skip to **Step 6b — Resolve merge conflicts**.

### 1b — Standard analyzer-fix mode

Search for open pull requests in this repository that meet ALL criteria:

- Is a **draft** PR
- Has the label `agent:pr`
- Does NOT have the label `agent:human-required`

Sort results by creation date ascending. Take the **single oldest** result.

If no PR matches either mode, update the dashboard with:
"No draft PRs with agent:pr label found — nothing to fix." and exit.

## Step 2 — Determine the current review cycle

Check the PR's labels for any `pr:cycle-N` labels. Find the highest N
among all matching labels. If no `pr:cycle-N` label exists, the current
cycle is `0`.

Use `cycles.max-fix-cycles` from Step 0 (default: 10) as the cycle cap.

If the current cycle equals the cap, the PR has reached the cycle limit. Escalate:

1. Call `add_labels` to add `agent:human-required` to the PR
2. Call `add_comment` with:
   "🚨 **PR Fixer**: Cycle limit (<cap>) reached. Escalating to human review."
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

- If ALL three verdicts say `**PASS**`, there is **nothing to fix — STOP HERE**.
  Do NOT proceed to Steps 6–9. Do NOT implement non-blocking suggestions.
  Do NOT increment the cycle label. Instead:
  1. Post ONLY the fixer marker (Step 10) noting "All three analyzers passed —
     no fixes needed. Non-blocking suggestions are informational only."
  2. Update the dashboard.
  3. **Exit immediately.** The PR Promoter will handle promotion.

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

### PR body and metadata fixes

Some findings reference the **PR body** (e.g., unchecked acceptance criteria
checkboxes, missing issue references, misleading descriptions). These are NOT
code fixes — do NOT try to fix them via `update_issue` with a full body
replacement (the body is too large).

Instead, use the `replace_pr_body_text` safe-input:

1. Identify the exact text to change (e.g., `- [ ] All remaining 9 oversized`)
2. Determine the replacement text (e.g., `- [x] All remaining 9 oversized`)
3. Call `replace_pr_body_text` with exact `search_text` and `replace_text`

**Examples of PR body fixes:**

- Checking acceptance criteria checkboxes: `search_text: "- [ ] criterion text"` → `replace_text: "- [x] criterion text — see #85"`
- Adding issue references: append `(see #N)` to relevant text
- Correcting misleading descriptions: targeted text replacement

Always verify the fix by confirming the tool returns `status: success`.

### Make progress — every cycle counts

Do NOT escalate to `agent:human-required` just because you cannot fix
everything in one cycle. The loop exists to iterate. Your job each cycle:

1. **Fix as many blocking issues as possible** — implement real code changes.
2. **Fix non-blocking suggestions** when time allows.
3. **Push whatever progress you made** — even partial progress is progress.
4. The analyzers will re-evaluate after your push and report what remains.
5. You will get another cycle to continue the work.

The ONLY reason to add `agent:human-required` is when the cycle cap
(from Step 2) is reached. Never escalate before that.

If a blocking issue requires work beyond what you can do in a single push
(e.g., refactoring many files), do as much as you can now. The next cycle
will show the analyzers that progress was made, and they will report the
remaining work.

### After all fixes

Stage and commit all changes:

```bash
git add -A
git commit -m "fix: address analyzer findings from cycle N

Fixes applied:
- <one-line summary of each fix>"
```

## Step 8 — Push fixes to the PR branch

### Choosing the right push mechanism

The PR branch may contain files that don't exist on `main` (the base branch).
The `push_to_pull_request_branch` safe-output generates patches relative to
`main`, so modifying PR-only files causes add/add merge conflicts.

**Decision rule:**

1. List the files you modified. For each, check if the file exists on `main`
   by running: `git show main:<file_path> > /dev/null 2>&1 && echo EXISTS || echo PR_ONLY`
2. If ALL modified files exist on `main`: use `push_to_pull_request_branch` (Step 8a).
3. If ANY modified file is PR-only: use `write_file_to_pr_branch` for EACH
   modified file (Step 8b) — this includes files that exist on main too.
   Do NOT mix both mechanisms in the same cycle.

### Step 8a — Push via patch (all files exist on main)

Call `push_to_pull_request_branch` to push your committed changes directly
to the existing PR's branch. This updates the PR in place — no new PR needed.

### Step 8b — Push via Contents API (PR-only files present)

For each file you modified, call `write_file_to_pr_branch` with:

- `pr_number`: the PR number
- `file_path`: the path to the file
- `file_content`: the COMPLETE updated file content
- `commit_message`: on the first file use the full commit message; on
  subsequent files use "fix: continued — update <filename>"

This writes each file directly to the PR branch via the GitHub Contents API,
bypassing the patch mechanism entirely.

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

---

## Conflict Resolution Mode (from Step 1a)

### Step 6b — Resolve merge conflicts

This mode runs when a non-draft, approved PR has merge conflicts preventing merge.

**Pre-check**: If `autonomy.conflict-resolution` is `false` (from Step 0),
do NOT attempt resolution. Instead, post a comment:
"⚠️ Conflict resolution is disabled in SFL config. Human intervention required."
Add label `agent:human-required`, update the dashboard, and exit.

**Do NOT use git fetch, git rebase, or git merge** — credential isolation in
the sandbox prevents git operations on remote branches.

Instead, use the `resolve-pr-conflicts` safe-input tool for each conflicting file:

1. List the PR's changed files using:
   `gh api repos/{owner}/{repo}/pulls/{pr_number}/files --jq '.[].filename'`
2. For **each** file in the list, call `resolve-pr-conflicts` with the PR number
   and file path. The tool overwrites the file on the PR branch with main's
   version via the Contents API, then merges remaining main changes.
3. After resolving all files, call `check-pr-merge-state` to verify the PR is
   now `MERGEABLE`. If still `CONFLICTING`, report the failure.

**Important**: This is a brute-force resolution — the PR's version of each
resolved file is replaced with main's version. The PR's changes to those
specific files are lost. This is acceptable for agent-generated PRs.

### Step 7b — Post resolution comment

Call `add_comment` with:

```markdown
## 🔀 Merge Conflicts Resolved

**PR**: #<number>
**Conflicting files**: <count>

### Resolved Files

| File | Resolution |
|------|-----------|
| `<file>` | Overwritten with main's version |

⚠️ The PR's changes to the above files were lost during conflict resolution.
Main's version was used to clear the conflicts.

Conflicts have been resolved. The PR Promoter can now merge this PR.
```

Update the dashboard with:
"PR #<number>: merge conflicts resolved — <count> files fixed."

---

## Guardrails

- Process exactly ONE PR per run
- Never un-draft the PR — that is the Promoter's job
- Never close or merge the PR
- Never create a new PR — push fixes to the existing branch
- Maximum fix cycles per PR is controlled by `cycles.max-fix-cycles` in sfl-config.yml — escalate after that
- For every skip path, update the dashboard
- If any step fails unexpectedly, update the dashboard and exit
