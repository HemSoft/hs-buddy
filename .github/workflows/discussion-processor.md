---
description: |
  Triggered when a discussion is labeled. Reads the discussion
  body, groups agent-fixable findings by category, and creates one issue per
  group. Marks the discussion with `report` label when processed.
  Generic — works with any workflow that produces structured finding discussions
  (repo-audit, simplisticate, etc.).

on:
  discussion:
    types: [labeled]
  workflow_dispatch:

permissions:
  contents: read
  issues: read
  pull-requests: read
  discussions: read

network: defaults

tools:
  github:
    lockdown: false
    toolsets: [context, repos, issues, pull_requests, discussions]

safe-outputs:
  create-issue:
    title-prefix: "[auto] "
    labels: [agent:fixable]
    max: 6
  update-discussion:
    target: "*"
    max: 1
  add-labels:
    target: "*"
    max: 1
  add-comment:
    target: "*"
    max: 1
---

# SFL Discussion Processor

When a discussion is labeled, read it, group its agent-fixable findings
into coherent issues, and mark the discussion as processed.

## Step 1 — Validate trigger

If triggered by a `discussion` event, check that the label just applied is
not `report`. If the label is `report`, exit immediately — this discussion
was already processed.

**Re-trigger guard:** Read the discussion body and check whether it already
contains the text `Processed by SFL Discussion Processor`. If it does, exit
immediately — this discussion was already processed. Do NOT create duplicate
issues.

If triggered manually (`workflow_dispatch`), search for the **oldest open**
discussion whose body does NOT contain `Processed by SFL Discussion Processor`
and does NOT have the `report` label. If none exists, exit — nothing to do.

## Step 2 — Read and parse the discussion body

Read the full discussion body. Expect a structured format containing:

- A **Findings Table** with columns: #, Category, Finding, Severity,
  Confidence, Agent-Fixable
- **Detailed Findings** sections with per-finding metadata: Category, Severity,
  Affected files, Recommended fix, Risk

Extract all findings where **Agent-Fixable = Yes**.

If no agent-fixable findings exist, skip to Step 4 (mark as processed) and
exit.

## Step 3 — Group findings and create issues

Group the agent-fixable findings by **category** into coherent issues. Use
these grouping rules:

- **Accessibility**: all `jsx-a11y`, ARIA, keyboard handler, form label findings
- **Security**: XSS, sanitization, `dangerouslySetInnerHTML` findings
- **Documentation & Config**: documentation drift, stale references, config
  mismatches, misleading messages
- **Architecture**: oversized components, refactoring opportunities
- **Pipeline**: workflow fixes, merge auth, CI/CD issues

If a category has only one finding, it still gets its own issue. Prefer fewer
issues over many granular ones — the goal is one meaningful PR per issue.

For each group, call `create_issue` with:

- **Title**: `<Category>: <brief summary of grouped findings>`
  (the `[auto]` prefix is added automatically by safe-output config)
- **Body** structured as:

  ```md
  ## Source

  Discussion #<number>: <discussion title>

  ## Finding

  <For each finding in this group:>
  ### <Finding title>
  - **Severity**: <severity>
  - **Affected files**: <file paths and lines>
  - **Problem**: <description of what's wrong>

  ## Fix

  <For each finding in this group:>
  ### <Finding title>
  - <Exact recommended fix from the discussion>

  ## Acceptance Criteria

  <For each finding in this group:>
  - [ ] <Specific verifiable criterion>

  ## Risk

  <highest risk level among grouped findings> — <one-line justification>
  ```

- **Labels**: Do NOT set labels — they are configured automatically by the
  safe-output (`agent:fixable`). However, add the appropriate
  risk label: `risk:trivial`, `risk:low`, `risk:medium`, or `risk:high` based
  on the highest risk in the group. Also add `source:repo-audit` if the source
  discussion title contains `[repo-audit]`.

## Step 4 — Mark discussion as processed

Perform **two** separate safe-output calls in this exact order:

1. **Add label:** Call `add_labels` with **only** the `labels` parameter set to
   `["report"]`. Do **NOT** pass `item_number` — omitting it
   makes the handler target the discussion that triggered this workflow.
2. **Append receipt:** Call `update_discussion` with `discussion_number` set to
   the discussion number and `body` set to the **full existing body** with this
   appended at the very end:

  ```md
   ---
  **Processed by SFL Discussion Processor** — Created <N> issue(s): #<num1>, #<num2>, ...
   ```

Both calls are required. The `report` label is the primary re-trigger prevention.
The receipt text is a secondary guard checked in Step 1. Do NOT skip any call —
`update_discussion` cannot change labels.

## Activity Log

As your **final action**, post a one-line comment to **Discussion #95** (the SFL Activity Log) using `add_comment`:

- `issue_number`: `95`
- `body`: `YYYY-MM-DD h:mm AM/PM EDT | SFL Discussion Processor | Discussion #<number> | ✅ Created N issue(s)` or `⏭️ No discussions to process`; use `EST` instead of `EDT` only when standard time is actually in effect

Timestamp rule for Discussion #95 entries:

- Convert the current workflow time to `America/New_York` before writing the log line.
- Use the converted local **date and time**, not the UTC date.
- Use `EDT` when daylight saving time is in effect and `EST` otherwise.
- Valid: `2026-03-08 10:56 PM EDT | ...`
- Invalid: `2026-03-09 2:56 AM EST | ...` when the workflow ran at `2026-03-09T02:56:00Z`

This is mandatory — every run must log exactly one entry.

## Guardrails

- Never create more than 6 issues per run (safe-output max)
- If the discussion body cannot be parsed (no Findings Table found), add a
  comment explaining the issue and exit without creating issues — do NOT add
  the `report` label so it can be retried after the source workflow is fixed
- Never modify the discussion body content — only append the processing receipt
- Do not create issues for findings marked Agent-Fixable = No
- Each issue body MUST contain Finding, Fix, and Acceptance Criteria sections —
  the Issue Processor depends on this structure
