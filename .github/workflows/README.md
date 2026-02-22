# Workflows

This folder contains the workflows running on the **hs-buddy** repository as part of the Set it Free Loop™.

hs-buddy is the **reference consumer** of the Set it Free Loop operating model.

---

## Canonical source

All workflow definitions, governance policy, and deployment tooling live in:

**[relias-engineering/set-it-free-loop](https://github.com/relias-engineering/set-it-free-loop)**

That repo contains:

- `deployment/workflows/` — the production workflow library
- `deployment/governance/` — label taxonomy, policy, setup scripts
- `deployment/scripts/deploy-workflow.ps1` — deploy to N repos via PR
- `.github/prompts/new-workflow.prompt.md` — VS Code intake prompt for authoring new workflows
- `CATALOG.md` — all graduated, deployable workflows
- `TODO.md` — the ideas pipeline

---

## Workflows active in this repo

| Workflow | Schedule | Output | Source |
|----------|----------|--------|--------|
| `daily-repo-status` | Daily | `type:report` issue | [CATALOG](https://github.com/relias-engineering/set-it-free-loop/blob/main/CATALOG.md) |
| `repo-audit` | Daily | `type:report` + `agent:fixable` issues | [CATALOG](https://github.com/relias-engineering/set-it-free-loop/blob/main/CATALOG.md) |
| `sfl-dispatcher` | `*/30 * * * *` | Dispatches workflows only when work exists (no Copilot inference) | Local |
| `sfl-auditor` | `15 * * * *` (hourly) | Repairs issue/PR label discrepancies | Local |
| `issue-processor` | Dispatcher-only | Claims `agent:fixable` issue, opens draft PR | Local |
| `pr-analyzer-a` | Dispatcher-only | Full-spectrum review comments on draft PRs (Model A) | Local |
| `pr-analyzer-b` | Dispatcher-only | Full-spectrum review comments on draft PRs (Model B) | Local |
| `pr-analyzer-c` | Dispatcher-only | Full-spectrum review comments on draft PRs (Model C) | Local |
| `pr-fixer` | Dispatcher-only | Implements analyzer fixes on draft PRs, increments cycle | Local |
| `pr-promoter` | Dispatcher-only | Un-drafts clean PRs (all analyzers PASS) and applies `human:ready-for-review` handoff label. Merges approved PRs per Merge Authority Matrix (squash + delete branch). | Local |

---

## Adding a workflow to this repo

1. Check the [SFL CATALOG](https://github.com/relias-engineering/set-it-free-loop/blob/main/CATALOG.md) for available workflows
2. Run from the SFL repo:

   ```powershell
   .\deployment\scripts\deploy-workflow.ps1 -Workflow <name> -Repos "HemSoft/hs-buddy"
   ```

3. Review and merge the resulting PR

---

## Label reference

Labels are configured by running once:

```powershell
.\deployment\governance\setup-labels.ps1 -Owner HemSoft -Repo hs-buddy
```

See the [full label taxonomy and governance policy](https://github.com/relias-engineering/set-it-free-loop/blob/main/deployment/governance/policy.md).
