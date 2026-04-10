---
name: sfl
description: >
  Commands: create-issue, status, explain, labels. SFL skill for interacting with the
  Set it Free Loop — create properly labeled issues, check pipeline status, and understand
  the SFL system. Use when the user mentions SFL, wants to create an agent-fixable issue,
  or asks about the automated quality loop.
---

# SFL — Set it Free Loop Skill

## What is SFL?

The Set it Free Loop is a continuous quality improvement system that:

1. Detects problems via scheduled audits (repo-audit, simplisticate-audit)
2. Converts findings into GitHub Issues with the `agent:fixable` label
3. Generates fixes via AI-assisted Draft PRs
4. Reviews PRs with 3 independent AI analyzers
5. Routes passing PRs to human review
6. Merges, closes the issue, and the loop repeats

## Commands

### `sfl create issue`

Guide the user through creating a well-formed SFL issue.

**Required information:**

1. **What needs to change** — clear description of the problem
2. **Risk level** — low, medium, or high

**Issue format:**

- Title: `[agent-fix] <description>`
- Labels: `agent:fixable`, `risk:<level>`
- Body: Problem description + acceptance criteria as checkboxes

**Example output:**

```text
Title: [agent-fix] Remove unused CSS imports in dashboard component
Labels: agent:fixable, risk:low
Body:
## Problem
The dashboard component imports three CSS modules that are never referenced.

## Acceptance Criteria
- [ ] Remove unused CSS imports
- [ ] No visual changes to the dashboard
- [ ] All existing tests pass
```

After composing the issue, ask the user to confirm before creating.

### `sfl status`

Check current SFL pipeline state by running:

```bash
# Open fixable issues (queue)
gh issue list --repo {owner}/{repo} --label "agent:fixable" --state open

# In-progress (being worked on)
gh issue list --repo {owner}/{repo} --label "agent:in-progress" --state open

# PRs awaiting review
gh pr list --repo {owner}/{repo} --label "human:ready-for-review" --state open

# PRs being analyzed
gh pr list --repo {owner}/{repo} --label "agent:pr" --state open
```

Present results as a summary table.

### `sfl explain`

Explain any SFL concept the user asks about:

- The overall loop and how it works
- What any label means
- What a specific workflow does
- How fix cycles work
- How to escalate or pause

Reference `.sfl/policy.md` for governance details.

### `sfl labels`

List all SFL labels with descriptions. Read from `.sfl/labels.json`.

## Label Quick Reference

| Label | Meaning |
|-------|---------|
| `agent:fixable` | Agent can auto-fix — enters the loop |
| `agent:in-progress` | Agent is actively working |
| `agent:pr` | PR created by automation |
| `agent:blocked` | Agent stopped — human intervention required |
| `agent:queued` | Queued behind fan-out ceiling |
| `analyzer:blocked` | Analyzer found blocking issues |
| `human:ready-for-review` | All analyzers passed — ready for human |
| `risk:low` | Low risk: formatting, deps, safe refactors |
| `risk:medium` | Medium: logic changes, features |
| `risk:high` | High: auth, payments, migrations |
| `report` | Informational only — no automation |
| `no-agent` | Opt out of SFL |

## Key Files

| File | Purpose |
|------|---------|
| `.sfl/sfl.json` | Deployment manifest |
| `.sfl/sfl-config.yml` | User-editable configuration |
| `.sfl/labels.json` | Label taxonomy snapshot |
| `.sfl/policy.md` | Governance policy reference |
| `.sfl/INTAKE.md` | How to create SFL issues |
