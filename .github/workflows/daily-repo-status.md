---
description: |
  This workflow creates repo status reports. It gathers recent repository
  activity (issues, PRs, discussions, releases, code changes) and generates
  engaging GitHub discussions with productivity insights, community highlights,
  and project recommendations.

on:
  schedule: daily
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
  update-discussion:
    target: "*"
    max: 5
  add-comment:
    target: "*"
    max: 1
source: githubnext/agentics/workflows/daily-repo-status.md@d19056381ba48cb1f7c78510c23069701fa7ae87
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
4. Post activity log entry to **Discussion #95** using `add_comment` with `issue_number`: `95` and `body`: `YYYY-MM-DD h:mm AM/PM EST | SFL Repo Status | Report | ✅ Created discussion`
