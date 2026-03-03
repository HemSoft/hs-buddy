# SFL Auditing & Quality Assurance

## Automated Health Checks

Run the unified health check script for a pass/fail overview:

```powershell
& ".agents/skills/sfl/scripts/health-check.ps1"
```

## Full Audit Checklist

When performing a thorough audit (weekly recommended), work through every
concern below. For each one, state what you found and whether it's clean or
broken. No "looks good" without evidence.

### 1. Workflow Count

**Target**: ≤ 14 files in `.github/workflows/`

Count standard YAML and agentic pairs (`.md` counts as one workflow even
though it has a `.lock.yml` companion). If the count is above 14, investigate
what was added and whether it can be eliminated.

### 2. Workflow State Alignment

Every workflow expected to be active should be `active`.
Every workflow expected to be paused should be `disabled_manually`.

```powershell
& "scripts/reports/list-workflows.ps1"
```

### 3. Label Health

Run the label audit to check for sprawl:

```powershell
& ".agents/skills/sfl/scripts/debug/label-audit.ps1"
```

**Thresholds**:

- Total labels ≤ 25: Healthy
- Total labels 26-30: Warning
- Total labels > 30: Alarm — labels are a cognitive tax on every workflow

### 4. Issue↔PR Harmony

Every issue labeled `agent:in-progress` should have a matching open PR
on a branch named `agent-fix/issue-<N>-*`.

Every open `agent:pr` PR should reference a valid, open issue.

No issue should have both `agent:in-progress` and `agent:fixable`.

```powershell
& ".agents/skills/sfl/scripts/debug/snapshot.ps1"
```

### 5. Marker Integrity

All open `agent:pr` draft PRs should have valid `[MARKER:...]` entries.
No legacy `<!-- ... -->` markers should be present (means workflows need
recompile).

```powershell
& ".agents/skills/sfl/scripts/debug/marker-check.ps1"
```

### 6. Model Drift

Lock files should match `sfl.json` model assignments:

```powershell
& ".agents/skills/sfl/scripts/health-check.ps1"
# or manually:
cat sfl.json | jq '.models'
# then check each lock file for GH_AW_ENGINE_MODEL
```

### 7. Phantom Child Issues

Report Discussions (repo-audit, simplisticate) sometimes claim they created
child issues. Verify that every referenced issue actually exists.

Look for:

- Placeholder tokens (`#aw_f1`, `#aw_f2`) instead of real numbers
- Real numbers that reference closed or non-existent issues

### 8. Oldest Open Issue

Find the oldest open issue that is not a report or tracking issue. If it has
`agent:in-progress`, check that a PR exists and is progressing. If it has
`agent:fixable`, check how long it's been waiting. The older it is, the more
suspicious.

### 9. Safe-Output Permission Review

Spot-check 2-3 agentic workflows:

- Are `max` values as low as they can be?
- Is `draft: true` set on all `create-pull-request`?
- Are permissions minimal (only `read` for non-mutating access)?

### 10. Concurrency Guards

Every scheduled workflow should have a `concurrency` block to prevent
overlapping runs. Check `sfl-dispatcher.yml`, `sfl-auditor.lock.yml`,
and all dispatcher-triggered workflows.

## Audit Output Format

All timestamps in audit output MUST be in **US Eastern (EST/EDT)**. Never
display raw UTC timestamps to the user.

```markdown
## SFL Audit — {date in EST/EDT}

| # | Check | Result | Detail |
|---|-------|--------|--------|
| 1 | Workflow count | ✅/❌ | {count} files |
| 2 | Workflow states | ✅/❌ | One-line |
| 3 | Label health | ✅/❌ | {count} labels, score {n}/100 |
| 4 | Issue↔PR harmony | ✅/❌ | One-line |
| 5 | Marker integrity | ✅/❌ | One-line |
| 6 | Model drift | ✅/❌ | One-line |
| 7 | Phantom children | ✅/❌ | One-line |
| 8 | Oldest open issue | ✅/❌ | Issue #{n}, age |
| 9 | Safe-output review | ✅/❌ | One-line |
| 10 | Concurrency guards | ✅/❌ | One-line |

### Verdict: CLEAN | PROBLEMS FOUND

### Failures (only if ❌ above)

#### ❌ {Check name}
- **Severity**: High / Medium / Low
- **Evidence**: {what you found}
- **Impact**: {what breaks if ignored}
- **Suggested Action**: {concrete next step}

### Observations & Takeaways

Capture notable behaviors even when all checks pass:
- Timing gaps between cron cycles that caused delays
- Concurrent PRs touching the same file (merge conflict risk)
- How many Dispatcher cycles for verdict propagation
- Safe-output behaviors (e.g., verdicts in PR body vs labels)
- Pipeline autonomy wins worth calling out
```

Use ✅ for pass, ❌ for fail. No other symbols. Every check MUST appear as
a row. Detail column is one sentence max.

After the audit, update `ATTENTION.md` with any new findings.
