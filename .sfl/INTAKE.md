# SFL Intake Guide

> How to create issues that the Set it Free Loop will pick up and process.

---

## Quick Start

Create a GitHub issue with the label `agent:fixable` and the loop takes over:

1. **Title**: Start with `[agent-fix]` followed by a clear description
2. **Labels**: Apply `agent:fixable` + a risk label (`risk:trivial`, `risk:low`, `risk:medium`, `risk:high`)
3. **Body**: Describe what needs to change and the acceptance criteria

### Example

**Title**: `[agent-fix] Update README badges to reflect new CI pipeline`
**Labels**: `agent:fixable`, `risk:trivial`, `source:manual`
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

1. The **SFL Issue Processor** claims the issue and opens a Draft PR
2. Three **Analyzers** (A, B, C) independently review the PR
3. If all pass → PR is marked `human:ready-for-review`
4. If any block → the Issue Processor pushes a fix and re-analyzes
5. A human reviews and merges

---

## Opting Out

Add the `no-agent` label to any issue to exclude it from SFL processing.

---

## Labels Reference

### Lifecycle

| Label | When to use |
|-------|------------|
| `agent:fixable` | Agent can auto-fix this |
| `agent:human-required` | Too complex for automation |
| `no-agent` | Opt out entirely |

### Risk

| Label | When to use |
|-------|------------|
| `risk:trivial` | Formatting, typos, doc updates |
| `risk:low` | Dependency bumps, safe refactors |
| `risk:medium` | Logic changes, new features |
| `risk:high` | Auth, payments, data migrations |

### Source

| Label | When to use |
|-------|------------|
| `source:manual` | You created this issue manually |
| `source:repo-audit` | Created by automated audit |
| `source:jira` | Normalized from a Jira ticket |

---

## Using the Copilot Skill

If your repo has the SFL Copilot skill installed, you can ask:

> `sfl create issue — the login page doesn't handle expired sessions`

The skill will guide you through creating a properly labeled issue.
