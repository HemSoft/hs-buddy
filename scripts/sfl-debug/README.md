# SFL Debug Scripts

Step-by-step scripts for gradually enabling (or disabling) the Set it Free Loop
from a clean slate. Each script covers one stage, explains what it does, and asks
for confirmation before making changes.

## Enablement Stages (run in order)

These stage filenames predate the current router-based architecture. Some file
names still contain legacy terms like `dispatcher`, `pr-fixer`, or `promoter`,
but the current hs-buddy hot path is: Issue Processor -> Analyzers A/B/C ->
PR Router -> PR Label Actions -> Auditor.

| Script | What it does |
|--------|-------------|
| `01-verify-clean-slate.ps1` | Confirms all workflows are disabled, no open issues/PRs |
| `02-enable-reporting.ps1` | Enables `repo-audit`, `daily-repo-status` (SFL Repo Status), and `simplisticate` (finding generators) |
| `03-enable-discussion-processor.ps1` | Enables `discussion-processor` (SFL Discussion Processor; converts findings → issues) |
| `04-enable-dispatcher-and-issue-processor.ps1` | Legacy filename; actually enables `sfl-issue-processor` (claims issues → draft PRs) |
| `05-enable-pr-analyzers.ps1` | Enables PR Analyzer A/B/C (review draft PRs on open) |
| `06-enable-pr-fixer-and-labels.ps1` | Legacy stage for older fixer-based stacks; not part of the current single-implementer hs-buddy hot path |
| `07-enable-promoter-and-auditor.ps1` | Legacy filename; currently enables `sfl-pr-router` + `sfl-auditor` |

## Disablement Stages (reverse order)

| Script | What it does |
|--------|-------------|
| `08-disable-promoter-and-auditor.ps1` | Legacy filename; disables `sfl-pr-router` + `sfl-auditor` |
| `09-disable-pr-fixer-and-labels.ps1` | Legacy stage for older fixer-based stacks |
| `10-disable-pr-analyzers.ps1` | Disables PR Analyzer A/B/C |
| `11-disable-dispatcher-and-issue-processor.ps1` | Legacy filename; disables `sfl-issue-processor` |
| `12-disable-discussion-processor.ps1` | Disables `discussion-processor` (SFL Discussion Processor) |
| `13-disable-reporting.ps1` | Disables `repo-audit`, `daily-repo-status`, `simplisticate` |
| `14-verify-all-disabled.ps1` | Confirms everything is off |

## Quick Reference

- **Full enable**: Run scripts 01 through 07 in sequence
- **Full disable**: Run scripts 08 through 14 in sequence
- **Bulk enable/disable**: Use `../resume-sfl.ps1` / `../pause-sfl.ps1` instead

## Notes

- Each script is idempotent — safe to re-run
- Scripts use the repo from `gh repo view`, not a hardcoded value
- The em-dash in workflow names (—) matters for `gh workflow` commands
