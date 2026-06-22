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

Schedules are currently paused in this repository. The workflow files keep
manual dispatch entry points, and `sfl-dispatcher.yml` can dispatch gh-aw
workflows when there is work to process.

| Workflow file | Trigger | Output | Source |
| --- | --- | --- | --- |
| `sfl-dispatcher.yml` | Manual dispatch | Checks whether SFL work exists and dispatches issue, analyzer, fixer, and promoter workflows when useful | Local |
| `sfl-auditor.yml` | Manual dispatch | Detects and repairs issue/PR label discrepancies and stale SFL state | Local |
| `issue-processor.md` / `.lock.yml` | Manual dispatch through dispatcher | Claims the oldest eligible `agent:fixable` + `action-item` issue and opens one draft PR | Local |
| `pr-analyzer-a.md` / `.lock.yml` | Manual dispatch through dispatcher | Runs the first full-spectrum review pass for SFL draft PRs | Local |
| `pr-analyzer-b.md` / `.lock.yml` | Manual dispatch through dispatcher | Runs the second full-spectrum review pass for SFL draft PRs | Local |
| `pr-analyzer-c.md` / `.lock.yml` | Manual dispatch through dispatcher | Runs the final review pass and records the final analyzer verdict | Local |
| `pr-fixer.md` / `.lock.yml` | Manual dispatch through dispatcher | Applies analyzer feedback to one draft PR branch and advances the review cycle | Local |
| `pr-promoter.md` / `.lock.yml` | Manual dispatch through dispatcher | Promotes clean draft PRs to ready-for-review and merges approved ready PRs | Local |
| `repo-audit.md` / `.lock.yml` | Manual dispatch | Repository documentation/configuration audit | [CATALOG](https://github.com/relias-engineering/set-it-free-loop/blob/main/CATALOG.md) |
| `simplisticate.md` / `.lock.yml` | Manual dispatch | Code simplification audit and action-item creation | Local |
| `daily-repo-status.md` / `.lock.yml` | Manual dispatch | Repository status report | [CATALOG](https://github.com/relias-engineering/set-it-free-loop/blob/main/CATALOG.md) |

---

## Adding a workflow to this repo

1. Check the [SFL CATALOG](https://github.com/relias-engineering/set-it-free-loop/blob/main/CATALOG.md) for available workflows
2. Run from the SFL repo:

   ```powershell
   .\deployment\scripts\deploy-workflow.ps1 -Workflow <name> -Repos "relias-engineering/hs-buddy"
   ```

3. Review and merge the resulting PR

---

## Label reference

Labels are configured by running once:

```powershell
.\deployment\governance\setup-labels.ps1 -Owner relias-engineering -Repo hs-buddy
```

See the [full label taxonomy and governance policy](https://github.com/relias-engineering/set-it-free-loop/blob/main/deployment/governance/policy.md).
