---
description: |
  Test workflow — POC for SFL config reading. Reads .github/sfl-config.yml
  and reports the parsed values via noop. Validates that agentic workflows
  can read and act on the autonomy control plane.

on:
  workflow_dispatch:

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
    description: "Read the SFL autonomy configuration file (.github/sfl-config.yml) from the repository. Returns the raw YAML content."
    inputs: {}
    run: |
      gh api "repos/$REPO_OWNER/$REPO_NAME/contents/.github/sfl-config.yml?ref=main" --jq '.content' | base64 -d
    env:
      GH_TOKEN: "${{ secrets.GITHUB_TOKEN }}"
      REPO_OWNER: "${{ github.repository_owner }}"
      REPO_NAME: "${{ github.event.repository.name }}"

safe-outputs:
  add-comment:
    target: "*"
    max: 2
  noop:
    max: 1

---

# Test SFL Config Reader

You are a test workflow that validates the SFL autonomy control plane.

## Step 1 — Read the config

Call `read-sfl-config` (no inputs needed). This returns the raw YAML content
of `.github/sfl-config.yml`.

## Step 2 — Parse and validate

From the YAML content, extract these values:

- `autonomy.auto-merge` (boolean)
- `autonomy.auto-create-pr` (boolean)
- `autonomy.conflict-resolution` (boolean)
- `risk-tolerance` (string: trivial, low, medium, or high)
- `cycles.max-fix-cycles` (number)

## Step 3 — Report findings

Call `noop` with a structured message that includes:

1. Each config key and its parsed value
2. A simulated decision based on the config:
   - "Would auto-merge PR? YES/NO" (based on `auto-merge`)
   - "Would process risk:medium issue? YES/NO" (based on `risk-tolerance`)
   - "Would process risk:high issue? YES/NO" (based on `risk-tolerance`)
   - "Would resolve merge conflicts? YES/NO" (based on `conflict-resolution`)

Example format:

```
SFL Config Test Results:
- auto-merge: false → Would auto-merge PR? NO
- auto-create-pr: true → Would create PR from issue? YES
- conflict-resolution: true → Would resolve conflicts? YES
- risk-tolerance: low → Would process risk:medium? NO | risk:high? NO
- max-fix-cycles: 3
```

If the config file cannot be read, call `noop` with an error message explaining what happened.

## Activity Log

As your **final action**, post a one-line comment to **Discussion #95** (the SFL Activity Log) using `add_comment`:

- `issue_number`: `95`
- `body`: `YYYY-MM-DD h:mm AM/PM EST | Test SFL Config | Test | ✅ Config validated`
