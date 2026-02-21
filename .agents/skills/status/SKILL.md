---
name: status
description: V1.0 - Fast pipeline status investigator for hs-buddy Set it Free Loop with scripted data collection and concise diagnosis. Use for checkpointed status reports and workflow/PR state triage.
hooks:
  PostToolUse:
    - matcher: "Read|Write|Edit"
      hooks:
        - type: prompt
          prompt: |
            If a file was read, written, or edited in the status directory (path contains 'status'), verify that history logging occurred.

            Check if History/{YYYY-MM-DD}.md exists and contains an entry for this interaction with:
            - Format: "## HH:MM - {Action Taken}"
            - One-line summary
            - Accurate timestamp (obtained via `Get-Date -Format "HH:mm"` command, never guessed)

            If history entry is missing or incomplete, provide specific feedback on what needs to be added.
            If history entry exists and is properly formatted, acknowledge completion.
  Stop:
    - matcher: "*"
      hooks:
        - type: prompt
          prompt: |
            Before stopping, if status was used (check if any files in status directory were modified), verify that the interaction was logged:

            1. Check if History/{YYYY-MM-DD}.md exists in status directory
            2. Verify it contains an entry with format "## HH:MM - {Action Taken}" where HH:MM was obtained via `Get-Date -Format "HH:mm"` (never guessed)
            3. Ensure the entry includes a one-line summary of what was done

            If history entry is missing:
            - Return {"decision": "block", "reason": "History entry missing. Please log this interaction to History/{YYYY-MM-DD}.md with format: ## HH:MM - {Action Taken}\n{One-line summary}"}

            If history entry exists:
            - Return {"decision": "approve"}

            Include a systemMessage with details about the history entry status.
---

# Status Skill

Purpose-built status and triage skill for the hs-buddy agentic loop.

## Use Cases

- Generate checkpointed pipeline status quickly
- Detect issue↔PR mismatches
- Summarize workflow failures since last checkpoint
- Check analyzer markers and cycle progression on draft PRs
- Produce concise “ALL GOOD vs ISSUES FOUND” verdicts

## Quick Start

```powershell
# Full report using .github/prompts/.status-checkpoint
& ".claude/skills/status/scripts/status-report.ps1"

# Full report with custom checkpoint
& ".claude/skills/status/scripts/status-report.ps1" -LastCheckUtc "2026-02-20T18:14:44Z"

# Raw JSON dataset for further analysis
& ".claude/skills/status/scripts/status-collect.ps1" -AsJson
```

## Scripts

- `status-checkpoint.ps1` — read/write checkpoint timestamp
- `status-collect.ps1` — gather issues, PRs, workflow runs, markers
- `status-report.ps1` — render concise markdown report in US Eastern

## Rules

- Prefer script outputs over ad-hoc `gh` loops
- Always convert display times to US Eastern
- Treat known transient `missing finish_reason for choice 0` as non-blocking
- Keep output concise and decision-oriented
