# SFL Launch — Packaging the Set it Free Loop for Multi-Repo Deployment

> Tracking document for graduating the Set it Free Loop from hs-buddy (testing ground)
> back into the [set-it-free-loop](https://github.com/relias-engineering/set-it-free-loop)
> repository as a deployable, versioned product.

**Created**: 2026-02-22
**Status**: ✅ Operational — v2.0.0

---

## Context

hs-buddy has been the **reference consumer** and testing ground for the Set it Free Loop.
The workflows, governance policy, label taxonomy, and operational patterns have been
iterated here until stable. The system is now packaged in the
[set-it-free-loop](https://github.com/relias-engineering/set-it-free-loop) repo and ready
for deployment to other repositories.

---

## Goals — All Achieved

1. **Flexible deployment** ✅ — Three deployment tiers (minimal, standard, full) plus single-workflow mode.

2. **Version-controlled releases** ✅ — `sfl.json` manifest stamped in consumer repos at deployment time.
   SHA-pinned source references in every deployed workflow file.

3. **Drift visibility** ✅ — `sfl.json` carries `version`, `sourceSha`, `tier`, and `deployedAt`.
   Badge reads version from manifest for at-a-glance currency.

4. **Easy onboarding** ✅ — Single command: `.\deploy-workflow.ps1 -Tier full -Repos "org/repo"`.
   Script handles cloning, branching, copying, labeling, manifest creation, and PR opening.

5. **Upgrade path** ✅ — Re-run `deploy-workflow.ps1` at the desired SHA. Source pins update automatically.

---

## Decisions Made

| Question | Decision |
|----------|----------|
| Deployment tool | **PowerShell script** (`deploy-workflow.ps1`) with manifest-based approach |
| Component selection | **3-tier system**: minimal / standard / full, plus single-workflow custom mode |
| Version tracking | **`sfl.json`** manifest in consumer repo root |
| Badge design | Dynamic JSON badge reading `version` from `sfl.json` |
| Upgrade strategy | Re-run deploy script at new SHA (Option C) |

---

## What's Deployed in set-it-free-loop

### Workflows (9 total — `deployment/workflows/`)

| Workflow | Category | Model | Status |
|----------|----------|-------|--------|
| daily-repo-status | reporting | — | ✅ Active v1.0.0 |
| repo-audit | quality | — | ✅ Active v1.1.0 |
| issue-processor | automation | gh-aw default | ✅ Active v1.0.0 |
| simplisticate | quality | gh-aw default | ✅ Active v1.0.0 |
| pr-analyzer-a | review | claude-sonnet-4.6 | ✅ Active v1.0.0 |
| pr-analyzer-b | review | claude-opus-4.6 | ✅ Active v1.0.0 |
| pr-analyzer-c | review | gpt-5.3-codex | ✅ Active v1.0.0 |
| pr-fixer | automation | claude-opus-4.6 | ✅ Active v1.0.0 |
| pr-promoter | automation | claude-sonnet-4.6 | ✅ Active v1.0.0 |

### Infrastructure (2 — `deployment/infrastructure/`)

| Component | Type | Schedule |
|-----------|------|----------|
| sfl-dispatcher | Standard YAML | Every 30 min |
| sfl-auditor | Standard YAML | :15, :45 every hour |

### Governance (26 labels, policy doc, setup script)

| Component | Path |
|-----------|------|
| labels.json | `deployment/governance/labels.json` |
| policy.md | `deployment/governance/policy.md` |
| setup-labels.ps1 | `deployment/governance/setup-labels.ps1` |

### Deployment Tooling

| Component | Path |
|-----------|------|
| deploy-workflow.ps1 | `deployment/scripts/deploy-workflow.ps1` |
| sfl-manifest.schema.json | `deployment/sfl-manifest.schema.json` |

### Dogfooding

All workflows are staged in `.github/workflows/` on the set-it-free-loop repo itself,
so the SFL loop runs on its own codebase.

---

## What We've Proven in hs-buddy

- [x] Label taxonomy and lifecycle state machine work
- [x] SFL Auditor catches and repairs label/PR discrepancies
- [x] SFL Dispatcher orchestrates without wasting Copilot inference when idle
- [x] Three-model PR review (Analyzers A/B/C) produces high-quality feedback
- [x] PR Fixer implements suggestions and cycles correctly
- [x] PR Promoter gates on all-PASS before un-drafting
- [x] Repo Audit detects real issues and creates actionable agent:fixable items
- [x] Governance policy (merge authority, retry limits, safe-write boundaries) is sound
- [x] Workflow scheduling hygiene checks prevent duplicate/overlapping runs
- [x] Concurrency guards and idempotency markers prevent race conditions

---

## Remaining Work

- [ ] Test deployment on a second repo (not hs-buddy) via `deploy-workflow.ps1`
- [ ] Create dynamic badge service or GitHub Action for version currency color coding
- [ ] Write onboarding guide for new consumers (quick-start)
- [ ] Build `loop-cost-reporter` workflow for budget visibility
- [ ] Build `feature-intake-normalizer` workflow for Jira/GitHub normalization
