---
description: |
  This workflow runs a repository audit to detect documentation drift,
  stale artifacts, configuration hygiene issues, and cross-reference mismatches.
  It creates exactly ONE consolidated report discussion with all findings.

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
    lockdown: false

safe-outputs:
  create-discussion:
    title-prefix: "[repo-audit] "
    category: "General"
    max: 1
  update-discussion:
    target: "*"
    max: 5
  add-comment:
    target: "*"
    max: 1
---

# Repo Audit

Run a high-signal repository audit. Produce **exactly one Discussion**
containing all findings. Do NOT create multiple discussions — every finding goes
into a single consolidated report.

## CRITICAL — Single Discussion Output

This workflow creates **ONE discussion and one discussion only**. All findings —
regardless of category, severity, or fixability — are reported in that
single discussion (category: General). Do NOT create separate agent-fixable issues,
per-finding discussions, or per-category discussions. Everything belongs in one report.

## Step 0 — Close previous audit summary reports

Before creating today's audit, search for all **open** discussions whose title
starts with `[repo-audit]`. For each one found, close it using `update_discussion` with:

- `discussion_number`: the discussion number
- `status`: `"closed"`

## Goals

- Detect documentation vs implementation drift
- Surface stale/dead artifacts and outdated references
- Identify configuration or dependency hygiene risks
- Recommend small, prioritized next actions

## Audit Scope

1. Documentation Drift
   - README/docs structure and claims vs actual files and behavior
   - Broken or outdated internal references

2. Configuration Hygiene
   - Config/env keys that appear unused or mismatched
   - Potentially stale scripts, settings, or dependency declarations

3. Artifact Staleness
   - Deprecated, orphaned, or no-longer-relevant files/folders

4. Cross-Reference Accuracy
   - Mismatches between type/config docs and real usage patterns

5. React Health (react-doctor)
   - Run `npx -y react-doctor@latest . --yes` if a `package.json` with React
     dependencies exists at repo root
   - Parse the terminal output for errors and warnings
   - Group findings by category (Accessibility, Dead Code, State & Effects,
     Performance, Security, Architecture)
   - **False positive exclusion**: Files under `electron/` are Electron main
     process files — they are NOT part of the React import graph. Ignore any
     "Unused file" findings for `electron/**` paths.

6. Workflow Scheduling Hygiene
   - **Duplicate names**: Two or more `.yml` files in `.github/workflows/` that
     share the same `name:` value — they will appear identical in the Actions UI
     and may indicate redundant work
   - **Overlapping cron schedules**: Workflows whose cron expressions produce
     runs at the same minute, suggesting accidental double-execution (compare
     expanded cron minute/hour sets for collisions)
   - **Overlapping concerns**: A `.lock.yml` (gh-aw compiled) AND a standalone
     `.yml` that perform the same logical task — one should be removed
   - **Orphaned gh-aw prompt files**: A `.md` file in `.github/workflows/`
     whose corresponding `.lock.yml` no longer exists
   - **Stale `.disabled` files**: A `.lock.yml.disabled` sitting alongside an
     active `.lock.yml` or `.yml` of the same base name — the disabled copy
     should be deleted to avoid confusion

## Output — Single Consolidated Issue

Create **exactly one issue** titled `[repo-audit] Repo Audit — <date>`
with labels `report` and `audit`. This is the ONLY issue this workflow creates.

The issue body must contain:

### Executive Summary

A brief overall repo health assessment (1-3 sentences).

### Findings Table

| # | Category | Finding | Severity | Confidence | Agent-Fixable? |
|---|----------|---------|----------|------------|----------------|
| 1 | ... | ... | High/Medium/Low | High/Medium | Yes/No |

### Detailed Findings

For each finding in the table, include a detail section:

#### Finding N: <title>

- **Category**: e.g., Accessibility, Dead Code, Configuration
- **Severity**: High / Medium / Low
- **Confidence**: High / Medium
- **Agent-Fixable**: Yes / No (with brief justification)
- **Affected files**: List of files and lines involved
- **Recommended fix**: What should be done
- **Risk**: trivial / low / medium / high

### Summary

- Total findings: N
- Agent-fixable: N (these can be addressed by creating `agent:fixable` issues manually)
- Requires human review: N
- No action required (if clean)

## Process

1. Inspect repository structure and key docs
2. Cross-check docs/config claims against implementation
3. Compile findings with severity, confidence, and agent-fixability assessment
4. Close any previous open `[repo-audit]` report issues
5. Create the single consolidated report issue
6. Post activity log entry to **Discussion #95** using `add_comment` with `issue_number`: `95` and `body`: `YYYY-MM-DD h:mm AM/PM EST | Repo Audit | Audit | ✅ N findings (M agent-fixable)`
