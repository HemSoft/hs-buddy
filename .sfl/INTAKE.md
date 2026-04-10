# SFL Intake Guide

> How to create issues that the Set it Free Loop will pick up and process.

---

## Quick Start

Create a GitHub issue with the label `agent:fixable` and the loop takes over:

1. **Title**: Start with `[agent-fix]` followed by a clear description
2. **Labels**: Apply `agent:fixable` + a risk label (`risk:low`, `risk:medium`, `risk:high`)
3. **Body**: Describe what needs to change and the acceptance criteria

### Example

**Title**: `[agent-fix] Update README badges to reflect new CI pipeline`
**Labels**: `agent:fixable`, `risk:low`
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

1. `sfl-loop` claims the issue and starts the fix workflow
2. `sfl-implement` opens or updates a Draft PR with the proposed fix
3. Three independent analyzers (A, B, C) review the PR in parallel
4. If changes are requested, `sfl-loop` routes the feedback back to `sfl-implement`, updates the PR, and runs the analyzers again
5. If the analyzers pass, the PR is marked `human:ready-for-review`
6. A human reviews and merges

---

## Opting Out

Add the `no-agent` label to any issue to exclude it from SFL processing.

---

## Labels Reference

### Lifecycle

| Label | When to use |
|-------|------------|
| `agent:fixable` | Agent can auto-fix this |
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
