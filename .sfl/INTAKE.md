# SFL Intake Guide

> How to create issues that the Set it Free Loop will pick up and process.

---

## Quick Start

Create a GitHub issue with the labels `agent:fixable` and `action-item`, and
the loop takes over:

1. **Title**: Start with `[agent-fix]` followed by a clear description
2. **Labels**: Apply `agent:fixable` + `action-item` + a risk label (`risk:low`, `risk:medium`, `risk:high`)
3. **Body**: Describe what needs to change and the acceptance criteria

### Example

**Title**: `[agent-fix] Update README badges to reflect new CI pipeline`
**Labels**: `agent:fixable`, `action-item`, `risk:low`
**Body**:

```markdown
## Problem
The README badges still reference the old Travis CI pipeline. We migrated to
GitHub Actions three months ago.

## Acceptance Criteria
- [ ] Replace Travis CI badge with GitHub Actions badge
- [ ] Verify badge URLs resolve correctly
- [ ] No other README content is changed
```

---

## What Happens Next

1. `sfl-dispatcher` sees eligible queued work and dispatches the next useful workflow
2. `issue-processor` claims the issue and opens a draft PR with the proposed fix
3. `pr-analyzer-a`, `pr-analyzer-b`, and `pr-analyzer-c` review the PR sequentially
4. If changes are requested, `pr-fixer` applies the feedback and advances the review cycle
5. If all analyzers pass, `pr-promoter` marks the PR `human:ready-for-review`
6. A human reviews the ready PR; `pr-promoter` can squash-merge approved ready PRs

---

## Opting Out

Add the `no-agent` label to any issue to exclude it from SFL processing.

---

## Labels Reference

### Lifecycle

| Label | When to use |
|-------|------------|
| `agent:fixable` | Agent can auto-fix this |
| `action-item` | Eligible for the SFL dispatcher and Issue Processor |
| `agent:blocked` | Agent stopped — human intervention required |
| `no-agent` | Opt out entirely |

### Risk

| Label | When to use |
|-------|------------|
| `risk:low` | Formatting, typos, doc updates, dependency bumps, safe refactors |
| `risk:medium` | Logic changes, new features |
| `risk:high` | Auth, payments, data migrations |

---

## Using the Copilot Skill

If your repo has the SFL Copilot skill installed, you can ask:

> `sfl create issue — the login page doesn't handle expired sessions`

The skill will guide you through creating a properly labeled issue.
