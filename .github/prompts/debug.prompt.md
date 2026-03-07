---
agent: agent
description: Deep pipeline debugger — diagnose stuck PRs, label sprawl, and architectural drift.
---

# Pipeline Debug

Invoke the SFL skill to diagnose and investigate pipeline issues.

Read the skill definition at `.agents/skills/sfl/SKILL.md` first, then follow
its Debugging guidance and Debug Checklist systematically.

---

## Step 1 — Read Context

1. Read `ATTENTION.md` for known active concerns
2. Read `AGENTS.md` and `.github/workflows/README.md` for pipeline architecture and standing orders
3. Read `VISION.md` for architectural alignment checks

---

## Step 2 — Ecosystem Snapshot

Run the full snapshot script to understand current state:

```powershell
& ".agents/skills/sfl/scripts/debug/snapshot.ps1"
```

Report the snapshot output. Identify any anomalies.

---

## Step 3 — Targeted Investigation

Based on the snapshot, investigate anything that looks wrong:

- **Stuck PRs**: Run `pr-forensics.ps1 -PRNumber <N>` for any PR that isn't progressing
- **Missing markers**: Run `marker-check.ps1` to verify idempotency tags
- **Label issues**: Run `label-audit.ps1` if label count is high or states look inconsistent
- **Workflow failures**: Run `workflow-timeline.ps1 -PRNumber <N>` to trace execution history
- **Body bloat**: Run `body-inspect.ps1 -PRNumber <N>` if a PR body looks oversized

---

## Step 4 — Root Cause Analysis

For each issue found:

1. Identify the **root cause**, not just the symptom
2. Check if the harmony rules in `AGENTS.md` and `.agents/skills/sfl/SKILL.md` are violated
3. Assess whether the fix adds or removes complexity
4. Apply the simplistication principle: can we fix this by removing something?

---

## Step 5 — Update ATTENTION.md

Add or update entries in `ATTENTION.md`:

- New concerns discovered during investigation
- Status changes on existing concerns (Active → Monitoring → Resolved)
- Move resolved items to the Resolved section with resolution notes

---

## Step 6 — Report

Print a structured report:

```
## Debug Report — <current date/time>

### Ecosystem Health
- Issues: N open (N agent-labeled)
- PRs: N open (N draft, N ready)
- Labels: N total (health score: N/100)
- Pipeline: HEALTHY | STALLED | DEGRADED

### Findings
1. **{Finding}** — Severity: {level}
   Root cause: {explanation}
   Suggested fix: {action}

### ATTENTION.md Changes
- Added: {items}
- Updated: {items}
- Resolved: {items}

### Complexity Assessment
- Labels: {count} (target: ≤20)
- Workflows: {count}
- State transitions: {count}
- Trend: SIMPLIFYING | STABLE | GROWING
```

---

## Rules

- **Read-only first**: Understand before changing. Run scripts before editing anything.
- **Simplisticate**: Every fix should reduce complexity, not add it.
- **Document everything**: ATTENTION.md must reflect what you found.
- **No silent fixes**: If you repair state, log what was wrong and why.
- **Architectural alignment**: Check every finding against `VISION.md`, `AGENTS.md`, and `.agents/skills/sfl/SKILL.md`.
