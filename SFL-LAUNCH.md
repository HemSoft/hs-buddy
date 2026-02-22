# SFL Launch — Packaging the Set it Free Loop for Multi-Repo Deployment

> Tracking document for graduating the Set it Free Loop from hs-buddy (testing ground)
> back into the [set-it-free-loop](https://github.com/relias-engineering/set-it-free-loop)
> repository as a deployable, versioned product.

**Created**: 2026-02-22
**Status**: Planning

---

## Context

hs-buddy has been the **reference consumer** and testing ground for the Set it Free Loop.
The workflows, governance policy, label taxonomy, and operational patterns have been
iterated here until stable. We're now close to packaging the system so it can be deployed
to other repositories — fully, partially, or minimally — with version tracking.

---

## Goals

1. **Flexible deployment**: Consumers pick which SFL components they want — full loop,
   audit-only, review-only, etc. Not all-or-nothing.

2. **Version-controlled releases**: The SFL repo carries a version (e.g., `2.0`). When
   deployed to a consumer repo, that version is stamped into the consumer. The SFL badge
   in the consumer's README reflects the *deployed* version, not the *latest* version.

3. **Drift visibility**: The SFL badge on the main repo shows the latest version. Consumer
   repos show their deployed version. At a glance you can see who's current and who's behind.

4. **Easy onboarding**: A single command (or minimal steps) to deploy SFL to a new repo.
   No deep knowledge of the internals required.

5. **Upgrade path**: A clear mechanism to upgrade a consumer repo from version N to N+1
   without breaking customizations.

---

## Open Questions

### Deployment Tool

What tool/mechanism handles deployment to consumer repos?

| Option | Pros | Cons |
|--------|------|------|
| **PowerShell script** (`deploy-workflow.ps1`) | Already exists in SFL repo, familiar | Manual, no dependency resolution |
| **GitHub CLI extension** (`gh sfl deploy`) | Native feel, cross-platform | Needs to be built and published |
| **GitHub App / Reusable workflows** | Centralized updates, no file copying | Consumer loses local control |
| **Template repository** | GitHub-native, one-click | No selective components, no versioning |
| **npm/bun package** | Versioned, dependency management built-in | Tooling overhead, not a natural fit for workflows |
| **gh-aw compile from shared prompts** | Already used for .lock.yml generation | Ties consumers to gh-aw toolchain |

**Leaning toward**: PowerShell script with a manifest-based approach — a `sfl.json` in the
consumer repo that declares which components are installed and at what version.

### Component Selection

How granular should the component picker be?

**Proposed tiers**:

| Tier | Components Included | Use Case |
|------|--------------------|----------|
| **Minimal** | SFL Auditor, labels, governance doc | Hygiene-only — no AI, no PRs |
| **Standard** | Minimal + Repo Audit, Issue Processor, Dispatcher | Detect + claim issues automatically |
| **Full** | Standard + PR Analyzers A/B/C, PR Fixer, PR Promoter | Complete autonomous loop |
| **Custom** | Pick individual components from a menu | Power users |

### Version Tracking

How does the consumer repo know its deployed version?

**Proposed**: A `sfl.json` manifest file in the consumer repo root:

```json
{
  "version": "2.0",
  "deployedAt": "2026-02-22T20:00:00Z",
  "components": ["auditor", "dispatcher", "repo-audit", "issue-processor", "pr-analyzers", "pr-fixer", "pr-promoter"],
  "tier": "full",
  "source": "relias-engineering/set-it-free-loop"
}
```

The SFL badge reads `version` from this file:

```markdown
![SFL](https://img.shields.io/badge/dynamic/json?url=...&query=$.version&label=Set%20it%20Free%20Loop&color=FFD700)
```

### Badge Design

- **SFL repo badge**: Shows the *latest* released version (e.g., `v2.1`)
- **Consumer repo badge**: Shows the *deployed* version from `sfl.json` (e.g., `v2.0`)
- **Color coding**: Green if current, yellow if one minor behind, red if major behind
  (would need a badge service or GitHub Action to calculate)

### Upgrade Strategy

When the SFL repo releases a new version, how do consumers upgrade?

- **Option A**: Consumer runs `deploy-workflow.ps1 -Upgrade` which diffs and patches
- **Option B**: Dependabot-style PR created automatically by an SFL workflow
- **Option C**: Consumer pulls latest and re-runs deploy with their manifest

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

## Next Steps

- [ ] Define the component manifest schema (`sfl.json`)
- [ ] Build the deployment script with tier selection
- [ ] Create version tagging strategy for the SFL repo
- [ ] Implement dynamic badge that reads version from `sfl.json`
- [ ] Write onboarding guide for new consumers
- [ ] Test deployment on a second repo (not hs-buddy)
- [ ] Document upgrade workflow
- [ ] Backport proven workflows from hs-buddy to set-it-free-loop repo
