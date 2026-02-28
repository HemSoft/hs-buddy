---
description: |
  Test workflow — POC for conflict resolution via safe-input tools.
  Dispatched manually with a PR number input. Resolves merge conflicts
  by committing main's version of conflicting files to the PR branch
  via GitHub Contents API, then merging main in via update-branch API.

on:
  workflow_dispatch:

permissions:
  contents: read
  pull-requests: read

engine:
  id: copilot
  model: claude-sonnet-4.6

network: defaults

tools:
  github:
    lockdown: false

safe-inputs:
  check-pr-merge-state:
    description: "Check a PR's merge state via GitHub GraphQL API. Returns mergeable status and mergeStateStatus."
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

  resolve-pr-conflicts:
    description: "Resolve merge conflicts on a PR by overwriting conflicting files with main's version, then merging main into the PR branch. This is a brute-force resolution — the PR's changes to conflicting files are lost. Only use for files where main's version is acceptable. Returns JSON with status and details."
    inputs:
      pr_number:
        type: number
        required: true
        description: "The pull request number to resolve conflicts for"
      file_path:
        type: string
        required: true
        description: "Path to the conflicting file to resolve (e.g., src/components/Foo.tsx)"
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

      # Commit main's version to PR branch
      RESULT=$(gh api "repos/$REPO_OWNER/$REPO_NAME/contents/$FILE" \
        --method PUT \
        -f message="chore: resolve merge conflict in $FILE" \
        -f content="$MAIN_B64" \
        -f sha="$PR_SHA" \
        -f branch="$HEAD_BRANCH" \
        --jq '{commit_sha: .commit.sha}' 2>&1) || {
        echo "{\"status\":\"error\",\"message\":\"Contents API PUT failed: $RESULT\"}"
        exit 1
      }

      echo "File committed: $RESULT"

      # Now try to merge main into PR branch
      HEAD_SHA=$(gh api "repos/$REPO_OWNER/$REPO_NAME/pulls/$PR_NUM" --jq '.head.sha')
      MERGE_RESULT=$(gh api "repos/$REPO_OWNER/$REPO_NAME/pulls/$PR_NUM/update-branch" \
        --method PUT \
        -f expected_head_sha="$HEAD_SHA" \
        --jq '.message' 2>&1) || {
        echo "{\"status\":\"partial\",\"message\":\"File committed but update-branch failed: $MERGE_RESULT\",\"file_committed\":\"$FILE\"}"
        exit 0
      }

      echo "{\"status\":\"success\",\"message\":\"$MERGE_RESULT\",\"file_resolved\":\"$FILE\",\"pr_branch\":\"$HEAD_BRANCH\"}"
    env:
      GH_TOKEN: "${{ secrets.GH_AW_GITHUB_TOKEN }}"

safe-outputs:
  add-comment:
    target: "*"
    max: 1
  update-discussion:
    target: "*"
    max: 1
  noop:
    max: 1
---

# Test Conflict Resolver

You are a test workflow for conflict resolution. Your job is simple:

## Step 1 — Find conflicting PRs

List all open PRs labeled `agent:pr` using `gh pr list`.

For each PR found, call `check-pr-merge-state` with the PR number.

## Step 2 — Resolve conflicts

For each PR where mergeStateStatus is `DIRTY` or mergeable is `CONFLICTING`:

1. List the PR's files: `gh api repos/{owner}/{repo}/pulls/{pr}/files --jq '.[].filename'`
2. For each conflicting file, call `resolve-pr-conflicts` with the PR number and file path
3. After resolving, call `check-pr-merge-state` again to verify the conflict is gone

## Step 3 — Report

Post a comment on each PR you resolved using `add-comment` with a summary of what was done.

If no conflicts were found, call `noop`.

**Important:** Only resolve conflicts where taking main's version of the file is acceptable.
For source code files, this means the PR's changes may be lost — note this in the comment.
