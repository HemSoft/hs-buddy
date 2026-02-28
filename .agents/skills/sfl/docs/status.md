# Status — Checkpointed Pipeline Reporting

Fast, checkpointed status reports with clear verdicts for the SFL pipeline.

## Use Cases

- Generate checkpointed pipeline status quickly
- Detect issue↔PR mismatches
- Summarize workflow failures since last checkpoint
- Check analyzer markers and cycle progression on draft PRs
- Produce concise **ALL GOOD** vs **ISSUES FOUND** verdicts

## Scripts

All scripts are in `.agents/skills/sfl/scripts/status/`.

### status-report.ps1

Full status report from the last checkpoint (or a custom time):

```powershell
# From last checkpoint
& ".agents/skills/sfl/scripts/status/status-report.ps1"

# From a specific time
& ".agents/skills/sfl/scripts/status/status-report.ps1" -LastCheckUtc "2026-02-20T18:14:44Z"
```

Outputs a concise markdown report with:

- Issue summary (open, in-progress, fixable)
- PR summary (draft, ready, review status)
- Workflow failure summary since checkpoint
- Verdict: ALL GOOD or ISSUES FOUND

### status-collect.ps1

Raw data collection (outputs JSON for further analysis):

```powershell
& ".agents/skills/sfl/scripts/status/status-collect.ps1" -AsJson
```

Gathers: open issues, open PRs, workflow runs since checkpoint, idempotency
markers on all active PRs.

### status-checkpoint.ps1

Read or write the checkpoint timestamp:

```powershell
# Read current checkpoint
& ".agents/skills/sfl/scripts/status/status-checkpoint.ps1"

# Write new checkpoint
& ".agents/skills/sfl/scripts/status/status-checkpoint.ps1" -Set "2026-02-20T18:14:44Z"
```

The checkpoint is stored in `.github/prompts/.status-checkpoint`.

## Rules

- Prefer script outputs over ad-hoc `gh` loops
- Always convert display times to US Eastern
- Treat `missing finish_reason for choice 0` as non-blocking (known transient)
- Keep output concise and decision-oriented
- Verdicts are binary: ALL GOOD or ISSUES FOUND — no ambiguity
