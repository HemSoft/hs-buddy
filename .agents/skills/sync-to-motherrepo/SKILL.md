---
name: sync-to-motherrepo
description: "V1.0 - Commands: Sync, Diff, Status. Copies evolved SFL workflow prompts, infrastructure, governance, and docs from hs-buddy back to the HemSoft/set-it-free-loop motherrepo."
---

# Sync to Motherrepo

Syncs SFL artifacts from `hs-buddy` (the primary development repo) back to the
canonical `HemSoft/set-it-free-loop` motherrepo so other consumer repos can
deploy the latest versions.

## Motherrepo

- **Repo**: `HemSoft/set-it-free-loop`
- **Local clone expected at**: `d:\github\HemSoft\set-it-free-loop`
- If not cloned: `gh repo clone HemSoft/set-it-free-loop d:\github\HemSoft\set-it-free-loop`

## Commands

### Sync

Run the sync script to copy all SFL artifacts:

```powershell
& ".agents/skills/sync-to-motherrepo/scripts/sync.ps1"
```

What it does:

1. Verifies the motherrepo clone exists (clones if missing)
2. Copies workflow prompts (`.md` files only — NOT `.lock.yml`) to `deployment/workflows/`
3. Copies infrastructure files (`sfl-dispatcher.yml`) to `deployment/infrastructure/`
4. Copies governance files (`labels.json`, `sfl-config.yml`) to `deployment/governance/`
5. Copies the self-hosted workflow copies to `.github/workflows/` (motherrepo dogfoods itself)
6. Copies documentation (`docs/SET_IT_FREE_GOVERNANCE.md`, `docs/SFL_ONBOARDING.md`)
7. Shows a `git diff --stat` summary at the end

After sync, you manually review the diff, commit, and push from the motherrepo.

### Diff

Preview what would change without copying anything:

```powershell
& ".agents/skills/sync-to-motherrepo/scripts/sync.ps1" -DryRun
```

### Status

Check sync freshness — compare timestamps between source and target:

```powershell
& ".agents/skills/sync-to-motherrepo/scripts/sync.ps1" -StatusOnly
```

## File Mapping

| Source (hs-buddy) | Target (motherrepo) | Notes |
|--------------------|----------------------|-------|
| `.github/workflows/{name}.md` | `deployment/workflows/{name}.md` | Canonical prompts for deployment to consumers |
| `.github/workflows/{name}.md` | `.github/workflows/{name}.md` | Dogfood copies for motherrepo's own SFL |
| `.github/workflows/{name}.lock.yml` | `.github/workflows/{name}.lock.yml` | Dogfood lock files |
| `.github/workflows/sfl-dispatcher.yml` | `deployment/infrastructure/sfl-dispatcher.yml` | Standard YAML infrastructure |
| `.github/workflows/sfl-dispatcher.yml` | `.github/workflows/sfl-dispatcher.yml` | Dogfood copy |
| `.github/workflows/sfl-pr-label-actions.yml` | `.github/workflows/sfl-pr-label-actions.yml` | Dogfood only (not a deployable component) |
| `.github/workflows/README.md` | `.github/workflows/README.md` | Workflow catalog |
| `.github/sfl-config.yml` | `deployment/governance/sfl-config.yml` | Default governance config |
| `docs/SET_IT_FREE_GOVERNANCE.md` | `docs/SET_IT_FREE_GOVERNANCE.md` | Governance docs |
| `docs/SFL_ONBOARDING.md` | `docs/SFL_ONBOARDING.md` | Onboarding guide |
| `.github/prompts/sfl-*.prompt.md` | `.github/prompts/sfl-*.prompt.md` | SFL prompt files |

## What is NOT synced

- `.lock.yml` files to `deployment/` — consumers compile their own from prompts
- `sfl.json` — each repo has its own manifest; motherrepo has `sourceSha: "self"`
- `.agents/skills/sfl/` — the SFL skill is repo-specific operational tooling
- `scripts/pause-sfl.ps1`, `scripts/resume-sfl.ps1` — repo-specific control scripts
- `scripts/sfl-debug/` — repo-specific debug sequence
- `assets/set-it-free-loop/` — presentation assets, not SFL infrastructure
- `ATTENTION.md`, `SFL-LAUNCH.md` — repo-specific operational state
- `AGENTS.md` — repo-specific standing orders

## Rules

1. **Never auto-commit or auto-push** — the script only copies files; human reviews the diff
2. **Prompt files are the source of truth** — `.md` prompts flow from hs-buddy to motherrepo; `.lock.yml` files are compiled per-repo
3. **Dogfood copies go to `.github/workflows/`** — the motherrepo runs its own SFL loop
4. **Deployment templates go to `deployment/workflows/`** — for consumer repos to pull from
