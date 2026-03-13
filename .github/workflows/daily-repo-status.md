---
description: |
  This workflow creates repo status reports. It gathers recent repository
  activity (issues, PRs, discussions, releases, code changes) and generates
  engaging GitHub discussions with productivity insights, community highlights,
  and project recommendations.

on:
  schedule:
    - cron: "0 7 * * *"  # 3:00 AM EDT
  workflow_dispatch:

permissions:
  contents: read
  issues: read
  pull-requests: read
  discussions: read

network: defaults

tools:
  github:
    # If in a public repo, setting `lockdown: false` allows
    # reading issues, pull requests and comments from 3rd-parties
    # If in a private repo this has no particular effect.
    lockdown: false

safe-outputs:
  create-discussion:
    title-prefix: "[repo-status] "
    category: "General"
    expires: false
  update-discussion:
    target: "*"
    max: 5
  add-comment:
    target: "*"
    max: 1
source: relias-engineering/set-it-free-loop/workflows/daily-repo-status.md@e441260656008f767cf67a816219c0713623f8e8
---

# SFL Repo Status

Create an upbeat status report for the repo as a GitHub Discussion.

## Step 0 — Close previous status reports

Before creating today's report, search for all **open** discussions whose title
starts with `[repo-status]`. For each one found, close it using
`update_discussion` with:

- `discussion_number`: the discussion number
- `status`: `"closed"`

This ensures only today's report remains open.

## What to include

- Recent repository activity (issues, PRs, discussions, releases, code changes)
- Progress tracking, goal reminders and highlights
- Project status and recommendations
- Actionable next steps for maintainers

## Style

- Be positive, encouraging, and helpful 🌟
- Use emojis moderately for engagement
- Keep it concise - adjust length based on actual activity

## Process

1. Gather recent activity from the repository
2. Study the repository, its issues and its pull requests
3. Create a new GitHub Discussion (category: General) with your findings and insights
4. Post activity log entry to **Discussion #95** using `add_comment` with `issue_number`: `95` and `body`: `YYYY-MM-DD h:mm AM/PM EDT | SFL Repo Status | Report | ✅ Created discussion` or `YYYY-MM-DD h:mm AM/PM EST | ...` when standard time is actually in effect

Timestamp rule for Discussion #95 entries:

- Convert the current workflow time to `America/New_York` before writing the log line.
- Use the converted local **date and time**, not the UTC date.
- Use `EDT` when daylight saving time is in effect and `EST` otherwise.
- Valid: `2026-03-08 10:56 PM EDT | ...`
- Invalid: `2026-03-09 2:56 AM EST | ...` when the workflow ran at `2026-03-09T02:56:00Z`
