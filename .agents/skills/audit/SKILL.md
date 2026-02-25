---
name: audit
description: V1.0 - Exhaustive SFL pipeline audit. Finds what status checks miss.
---

# Audit Skill

Critical, exhaustive audit of the hs-buddy SFL pipeline. Goes beyond green
checkmarks to find real problems.

## Prerequisites

Load the debug skill (`.agents/skills/debug/SKILL.md`) for forensic scripts.

## Checklist

Work through every concern below. For each one, state what you found and
whether it's clean or broken. No "looks good" without evidence.

### Risk Acknowledgment

When auditing agent-fixable determinations (e.g., simplisticate findings),
medium or high risk is **not** a valid reason to mark a finding as
non-agent-fixable. Agents should attempt the fix; the risk is surfaced at
human-review time via `risk:medium`/`risk:high` labels and a **Risk
Acknowledgment** line in the issue body.

### Concerns

#### Oldest Open Issue

Find the oldest open issue that is not a report or tracking issue. Investigate
why it's still open. If it has `agent:in-progress`, check that a PR exists and
is progressing. If it has `agent:fixable`, check how long it's been waiting.
The older it is, the more suspicious.

**Skip**: Issue #1 (`[agentics] No-Op Runs`) — this is a logging/tracking
issue, not a bug. It stays open by design.

#### Phantom Child Issues

Report issues (simplisticate audits, repo audits, etc.) often claim they
created agent-fixable child issues. Verify that every referenced child issue
actually exists.

How to check:

1. Find all open report issues (labels: `report` + `audit`).
2. In each report body, look for an "Agent-Fixable Issues Created" section
   or similar listing of child issues.
3. For each referenced issue:
   - If it uses placeholder tokens (e.g., `#aw_f1`, `#aw_f2`) instead of
     real issue numbers (`#31`, `#32`), the workflow failed to create them.
   - If it references a real number, verify that issue actually exists in the
     repo and has the expected `agent:fixable` + `action-item` labels.
4. If any referenced issues are phantoms (placeholders or non-existent),
   flag this as a **High** severity finding. The pipeline thinks work was
   queued but nothing was actually created — findings are silently lost.

## Output

After all concerns are investigated, produce a scannable results table
followed by detail sections only for failures. The human should be able to
glance at the table and immediately know what passed and what didn't.

```
## SFL Audit — <date>

| # | Check | Result | Detail |
|---|-------|--------|--------|
| 1 | Oldest open issue healthy | ✅ or ❌ | One-line summary |
| 2 | Phantom child issues | ✅ or ❌ | One-line summary |
| … | … | … | … |

### Verdict: CLEAN | PROBLEMS FOUND

### Failures (only if any ❌ above)

#### ❌ <Check name>
- **Severity**: High / Medium / Low
- **Evidence**: <what you found>
- **Impact**: <what breaks if ignored>
- **Suggested Action**: <concrete next step>

### Actions Taken
- <what was fixed or flagged>
```

Rules:

- Every concern in the Checklist MUST appear as a row in the table — no skipping.
- Use ✅ for pass, ❌ for fail. No other symbols.
- The Detail column is one sentence max. Full explanation goes in the Failures section.
- If all rows are ✅, the Failures section is omitted and Verdict is `CLEAN`.

Update `ATTENTION.md` with any new findings.
