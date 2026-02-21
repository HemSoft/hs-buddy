---
name: debug
description: V1.0 - Pipeline debugger and architectural watchdog for hs-buddy's Set it Free Loop. Use when diagnosing stuck PRs, label discrepancies, workflow failures, or checking ecosystem health. Maintains ATTENTION.md with active concerns.
---

# Debug — Pipeline Forensics & Architectural Watchdog

Deep-dive debugger for the hs-buddy agentic loop ecosystem. Diagnoses root causes,
not symptoms. Questions complexity. Maintains a living ATTENTION.md document of
things the human needs to know.

## Philosophy

> **Simplisticate.** Every label, every workflow, every state transition must earn its existence.
> If the system needs a new label to fix a problem, the system has the wrong problem.

## When to Invoke

- A PR is stuck (not progressing through cycles)
- A workflow is failing or producing unexpected output
- Labels are inconsistent or confusing
- You suspect architectural drift from VISION.md
- Periodic health audit (weekly recommended)
- After any pipeline change, to verify it didn't break harmony

## Core Capabilities

### 1. Pipeline Forensics

Diagnose why a PR or issue is stuck. Run the scripts in order:

```powershell
# Full ecosystem snapshot
& ".claude/skills/debug/scripts/snapshot.ps1"

# Deep-dive a specific PR
& ".claude/skills/debug/scripts/pr-forensics.ps1" -PRNumber 8

# Build timeline of workflow runs for a PR
& ".claude/skills/debug/scripts/workflow-timeline.ps1" -PRNumber 8
```

### 2. Label Audit

The labeling system is a liability if it grows unchecked. Run this to assess:

```powershell
& ".claude/skills/debug/scripts/label-audit.ps1"
```

This checks:

- Total label count (target: ≤20, alarm: >25)
- Labels with zero issues/PRs (candidates for removal)
- Labels that overlap in meaning
- Whether the state machine in SET_IT_FREE_GOVERNANCE.md matches reality

**Standing rule**: If the fix for a problem is "add another label", stop.
Ask: Can we remove a label instead? Can we encode this state differently?
Labels are a tax on every workflow that reads them.

### 3. Architectural Watchdog

Before approving any pipeline change, verify alignment:

1. Read `VISION.md` and `.github/copilot-instructions.md`
2. Do workflows match the catalog in `.github/workflows/README.md`?
3. Are safe-outputs permissions minimal?
4. Is state stored only in GitHub (labels, comments, branches, PRs)?
5. Are concurrency guards present on all cron workflows?
6. Is idempotency mechanism working? Run: `marker-check.ps1`

### 4. ATTENTION.md Maintenance

After every debug session, update `ATTENTION.md` in the repo root. This is the
living document of things that need human awareness.

**Format:**

```markdown
# ATTENTION

> Auto-maintained by the debug skill. Last updated: {date}

## Active Concerns

### {Concern Title}
- **Severity**: Critical | High | Medium | Low
- **Detected**: {date}
- **Status**: Active | Monitoring | Resolved
- **Description**: {1-2 sentences}
- **Impact**: {what breaks if ignored}
- **Suggested Action**: {concrete next step}

## Resolved (last 30 days)

### {Title}
- **Resolved**: {date}
- **Resolution**: {what fixed it}
```

**Rules for ATTENTION.md:**

- Never silently fix something — document it first
- Remove resolved items older than 30 days
- Keep it under 100 lines — if it's longer, the system has too many problems
- Severity definitions:
  - **Critical**: Pipeline is broken, PRs are not progressing
  - **High**: A workflow is producing incorrect output or wasting resources
  - **Medium**: Architectural drift, growing complexity, technical debt
  - **Low**: Cosmetic issues, minor inconsistencies

### 5. Complexity Assessment

When asked to evaluate a proposed change:

1. Read VISION.md and `.github/copilot-instructions.md`
2. Count the number of labels, workflows, and state transitions involved
3. Ask: Does this change add or remove complexity?
4. If it adds complexity, propose a simpler alternative
5. If no simpler alternative exists, document WHY in ATTENTION.md

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `snapshot.ps1` | Full ecosystem state: issues, PRs, labels, recent workflow runs |
| `pr-forensics.ps1` | Deep-dive a single PR: body markers, labels, linked issue, cycle state |
| `label-audit.ps1` | Audit label usage, find unused/redundant labels, health score |
| `marker-check.ps1` | Verify idempotency markers exist on all active PRs |
| `workflow-timeline.ps1` | Build chronological timeline of all workflow runs for a PR |
| `body-inspect.ps1` | Inspect PR body structure, detect bloat and duplicate content |

## Debug Checklist

When called to debug, work through this systematically:

1. **Run snapshot.ps1** — understand current state before touching anything
2. **Identify the symptom** — what is the user seeing?
3. **Trace the pipeline** — which workflow should have acted and didn't?
4. **Read the logs** — use workflow-logs.ps1 on the relevant run
5. **Check markers** — are idempotency markers present and correctly formatted?
6. **Check labels** — is the state machine in a valid state?
7. **Check permissions** — does the workflow have the right safe-output permissions?
8. **Determine root cause** — NOT the first thing that looks wrong, the ACTUAL cause
9. **Assess architectural impact** — does the fix add or remove complexity?
10. **Update ATTENTION.md** — document the finding
11. **Propose fix** — minimal change, maximum impact, simplisticate

## Anti-Patterns to Watch For

- **Label Creep**: Adding labels to solve state management problems (use comments/markers instead)
- **Workflow Sprawl**: Adding workflows when an existing one could be extended
- **Silent Fixes**: Repairing state without documenting what went wrong
- **Over-Engineering**: Adding retry logic, backoff strategies, or circuit breakers before proving they're needed
- **Marker Format Changes**: Changing how markers work without updating ALL consumers
- **Permission Escalation**: Giving workflows more permissions than they need
