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
    labels: [type:report, audit]
    max: 10
---

# Daily Repo Audit

Run a high-signal daily repository audit. Produce a summary report issue and
individual fixable issues for findings an agent can resolve autonomously.

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

5. Workflow Scheduling Hygiene
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

Create one summary issue with labels `type:report` and `audit` containing:

- Executive summary (overall repo health)
- Findings table with severity, confidence, and whether each finding is agent-fixable
- A short "No action required" section if everything looks healthy

### Per-finding issues (for agent-fixable findings only)

For each finding that meets ALL of the following criteria, create a separate issue:

- The fix is **scoped to one or two files** — no broad refactors
- The fix is **deterministic** — there is one clear correct outcome
- Risk class is `risk:trivial` or `risk:low`
- No user-facing behavioral change is required

Label each agent-fixable issue with: `type:action-item`, `agent:fixable`, and the appropriate risk label (`risk:trivial` or `risk:low`).

Issue title format: `[repo-audit] <short description of the specific fix>`

Issue body must include:

- **Finding**: What was detected and where (file path, line if known)
- **Fix**: Exactly what change to make
- **Acceptance criteria**: How to verify the fix is correct
- **Risk**: `risk:trivial` or `risk:low` with justification

Do NOT create agent-fixable issues for:

- Findings requiring architectural decisions
- Findings that touch more than 3 files
- Anything with risk:medium or higher
- Ambiguous findings where multiple valid fixes exist

Cap total agent-fixable issues at 3 per run to avoid noise.

## Process

1. Inspect repository structure and key docs
2. Cross-check docs/config claims against implementation
3. Compile findings with severity, confidence, and agent-fixability assessment
4. Create summary report issue
5. For each qualifying finding, create a scoped agent-fixable issue
