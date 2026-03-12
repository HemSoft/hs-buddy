---
description: |
  Minimal test workflow to validate push_to_pull_request_branch works.
  Triggers on workflow_dispatch with a PR number.
  The agent checks out the PR branch, adds a timestamp file, and pushes.

on:
  workflow_dispatch:
    inputs:
      pull-request-number:
        description: Target PR number to push a test commit to
        required: true

permissions:
  contents: read
  issues: read
  pull-requests: read

checkout:
  fetch-depth: 0

steps:
  - name: Fetch all remote branches
    env:
      FETCH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    run: |
      header=$(printf "x-access-token:%s" "${FETCH_TOKEN}" | base64 -w 0)
      git -c "http.extraheader=Authorization: Basic ${header}" fetch origin '+refs/heads/*:refs/remotes/origin/*'

timeout-minutes: 10

engine:
  id: copilot

network: defaults

tools:
  github:
    lockdown: false

safe-outputs:
  push-to-pull-request-branch:
    target: "*"
    max: 1
  add-comment:
    target: "*"
    max: 1
---

# Test: Push to PR Branch

You are a test agent. Your only job is to verify that `push_to_pull_request_branch` works.

## Instructions

1. The target PR number is: `${{ github.event.inputs.pull-request-number }}`

2. Read the PR to get its `headRefName` (branch name).

3. Verify you are on the correct branch:

   ```bash
   git branch --show-current
   ```

   If not on the PR branch, switch to it:

   ```bash
   git checkout <pr-head-branch>
   ```

4. Create or update the file `test-push-verification.md` with:

   ```text
   Push verification test
   PR: #<pr-number>
   Timestamp: <current UTC timestamp>
   ```

5. Stage and commit the change:

   ```bash
   git add test-push-verification.md
   git commit -m "test: verify push_to_pull_request_branch"
   ```

6. Call `push_to_pull_request_branch` with:
   - `pull_request_number`: the PR number from step 1
   - `message`: "test: verify push_to_pull_request_branch"

7. If the push succeeds, call `add_comment` on the PR confirming success.

Do NOT do anything else. This is a minimal test.
