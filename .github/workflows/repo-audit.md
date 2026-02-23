---
description: |
  This workflow runs a daily repository audit to detect documentation drift,
  stale artifacts, configuration hygiene issues, and cross-reference mismatches.
  It creates one summary report issue and individual agent-fixable issues for
  findings that an AI agent can safely resolve autonomously.

on:
  schedule: daily
  workflow_dispatch:

permissions:
  contents: read
  issues: read
  pull-requests: read

network: defaults

tools:
  github:
    lockdown: false

safe-outputs:
  create-issue:
    title-prefix: "[repo-audit] "
    labels: [report, audit]
    max: 10
  update-issue:
    target: "*"
    max: 5
---

# Daily Repo Audit

Run a high-signal daily repository audit. Produce a summary report issue and
individual fixable issues for findings an agent can resolve autonomously.

## Step 0 — Close previous audit summary reports

Before creating today's audit, search for all **open** issues whose title
starts with `[repo-audit] Daily Repo Audit` AND that have both `report`
and `audit` labels. For each one found, close it using `update_issue` with:

- `issue_number`: the issue number
- `status`: `"closed"`

Do NOT close agent-fixable action-item issues — only the dated summary reports.

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
   - Security findings (`dangerouslySetInnerHTML`, hardcoded secrets) should be
     flagged in the summary report but NOT auto-created as agent-fixable issues
     — they require human triage

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

## Output Requirements

### Summary issue (always)

Create one summary issue with labels `report` and `audit` containing:

- Executive summary (overall repo health)
- Findings table with severity, confidence, and whether each finding is agent-fixable
- A short "No action required" section if everything looks healthy

### Per-finding issues (grouped by category)

**Group findings by category and fix pattern.** Do NOT create one issue per
individual finding. Instead, create one issue per group of related,
mechanically similar fixes that share the same remediation approach.

For example:

- 50 "add `role` attribute" a11y warnings → ONE issue: "Fix accessibility roles"
- 12 unused exports across 6 files → ONE issue: "Remove unused exports"
- 3 `useState` lazy init fixes → ONE issue: "Fix useState lazy initialization"

Each grouped issue must meet ALL of the following criteria:

- Every fix in the group uses the **same mechanical pattern** (same type of change)
- Each individual fix is **deterministic** — one clear correct outcome per file
- Risk class is `risk:trivial` or `risk:low`
- No user-facing behavioral change is required

Label each agent-fixable issue with: `action-item`, `agent:fixable`, and
the appropriate risk label (`risk:trivial` or `risk:low`).

Issue title format: `[repo-audit] <short description of the group>`

Issue body must include:

- **Category**: The shared finding category (e.g., Accessibility, Dead Code)
- **Pattern**: The common fix pattern (e.g., "add `role` attr to clickable divs")
- **Affected files**: A checklist of every file and line, e.g.:
  - `[ ] src/components/TabBar.tsx:31 — add role="button"`
  - `[ ] src/components/TreeView.tsx:97 — add role="button"`
- **Acceptance criteria**: How to verify the group of fixes is correct
- **Risk**: `risk:trivial` or `risk:low` with justification

Do NOT create agent-fixable issues for:

- Findings requiring architectural decisions
- Findings where multiple valid fixes exist per instance
- Anything with risk:medium or higher
- Groups that would touch more than 15 files (split into smaller groups)

Cap total agent-fixable issues at 3 per run. Each issue may cover many
findings, but they must all share the same fix pattern.

## Process

1. Inspect repository structure and key docs
2. Cross-check docs/config claims against implementation
3. Compile findings with severity, confidence, and agent-fixability assessment
4. Create summary report issue
5. For each qualifying finding, create a scoped agent-fixable issue
