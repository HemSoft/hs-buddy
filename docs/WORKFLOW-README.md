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
| ---------- | ---------- | -------- | -------- |
| `react-doctor-audit` (`React Doctor Audit`) | Daily 1:00 AM EDT | Rolling React Doctor issue stream; older issues stay open while an active agent PR still depends on them | Local |
| `test-coverage-audit` (`Test Coverage Audit`) | Every 4 hours | Single `agent:fixable` test-coverage issue | Local |
| `simplisticate-audit` (`Simplisticate Audit`) | Daily 2:00 AM EDT | Single `agent:fixable` simplification issue | Local |
| `daily-repo-status` (`SFL Repo Status`) | Daily 3:00 AM EDT | `report` Discussion | [CATALOG](https://github.com/relias-engineering/set-it-free-loop/blob/main/CATALOG.md) |
| `repo-audit` (`Repo Audit`) | Daily 4:00 AM EDT | Single consolidated `report` Discussion | [CATALOG](https://github.com/relias-engineering/set-it-free-loop/blob/main/CATALOG.md) |
| `sfl-auditor` | Daily 5:00 AM EDT | Repairs issue/PR label discrepancies | Local |
| `discussion-processor` (`SFL Discussion Processor`) | `discussion: labeled` | Groups Discussion findings into `agent:fixable` issues | Local |
| `sfl-issue-processor` | `issues: opened/reopened` + Analyzer C dispatch | Single implementer: claims new issues or advances existing draft PRs from analyzer feedback | Local |
| `sfl-analyzer-a` | `pull_request: opened` | Starts the sequential A -> B -> C review chain for draft PRs (Model A) | Local |
| `sfl-analyzer-b` | Analyzer A dispatch | Continues the sequential full-spectrum review chain (Model B) | Local |
| `sfl-analyzer-c` | Analyzer B dispatch | Finishes the sequential full-spectrum review chain; dispatches label-actions for ready-for-review or fix-cycle decisions | Local |
| `sfl-pr-label-actions` (`SFL PR Label Actions`) | Analyzer C dispatch / manual dispatch | Deterministic aggregator: checks labels, flips draft → ready or dispatches issue-processor for fix cycle | Local |

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
