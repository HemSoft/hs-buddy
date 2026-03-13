# TODO-SFL — Centralization Migration Plan

> Track the work to make `relias-engineering/set-it-free-loop` the canonical home
> for all SFL-centric components and convert hs-buddy into a lightweight consumer.

**Created**: 2026-03-12
**Status**: **ALL PHASES COMPLETE** — motherrepo v1.0.0 pushed, hs-buddy converted to consumer (2026-03-13)

---

## Resolved Decisions

| # | Question | Decision |
|---|----------|----------|
| Q1 | Org identity | **`relias-engineering/set-it-free-loop`** is canonical. No HemSoft involvement. |
| Q2 | Distribution model | **`gh aw add`/`update`** — native gh-aw distribution. Consumer pulls `.md` workflows from motherrepo with source tracking. See [Distribution Model Analysis](#distribution-model-analysis). |
| Q3 | Consumer customization | Accept defaults. Motherrepo runs the loop. Parameterization is a later concern. |
| Q4 | What goes where | Incremental — current table is the starting point. |
| Q5 | Retired components | **Remove entirely** — no archiving. |
| Q6 | Versioning | **1.0.0** — fresh start. |
| Q7 | Second repo target | Not yet. Get hs-buddy working from motherrepo first. |

---

## Context

hs-buddy has been the SFL testing ground for ~3 weeks. The architecture evolved:

- **Dispatcher removed** → direct issue-open / dispatch triggers
- **PR Fixer retired** → `sfl-issue-processor` handles create + fix cycles
- **PR Promoter retired** → `sfl-pr-label-actions` + direct chain
- **Sequential chain** → A dispatches B dispatches C dispatches label-actions
- **Label-based verdicts** → `analyzer:blocked` label, not PR body markers
- **Discussion Processor** added → converts Discussions into `agent:fixable` issues

The motherrepo is **frozen at the old architecture**: `sfl-dispatcher.yml`,
`pr-fixer.md`, `pr-promoter.md`, old `pr-analyzer-*` names — all dead code.

---

## Distribution Model Analysis

### Phase 0 — Validation Complete (2026-03-12)

All four validation points have been investigated. The key discovery: **gh-aw has
a native distribution mechanism** (`gh aw add` + `gh aw update`) that makes the
previously proposed Options A/B/C unnecessary.

### Constraint: gh-aw Safe-Outputs Are Repo-Scoped

gh-aw safe-outputs (`create-pull-request`, `dispatch-workflow`, etc.) all operate
on `github.repository` — the repo where the workflow is running. The compiled
`.lock.yml` explicitly states:

> *"This workflow must support workflow_dispatch and be in .github/workflows/
> directory in the same repository."*

Workflows **must live in the consumer repo** to work correctly.

### Validation Results

| # | Question | Result |
|---|----------|--------|
| 0.1 | Does gh-aw support `workflow_call` in frontmatter? | **N/A** — not needed. `gh aw add`/`update` is the native model. |
| 0.2 | Can `.lock.yml` work as reusable workflows? | **N/A** — workflows live in the consumer repo, not called cross-repo. |
| 0.3 | Does `dispatch-workflow` target the same repo? | **YES** — confirmed in compiled lock file: *"in .github/workflows/ directory in the same repository."* Works because `gh aw add` puts workflows in the consumer. |
| 0.4 | Is `relias-engineering/set-it-free-loop` accessible? | **YES** — repo exists (INTERNAL visibility), `gh aw add` successfully pulled from it. |

### Decision: Option D — `gh aw add` / `gh aw update` (Native Distribution)

**Verified by test**: The following command worked end-to-end:

```shell
gh aw add relias-engineering/set-it-free-loop/.github/workflows/simplisticate.md --force
```

- Downloaded the `.md` prompt from the motherrepo
- Placed it in the consumer's `.github/workflows/`
- Added a `source:` field with commit SHA for tracking:
  `source: relias-engineering/set-it-free-loop/.github/workflows/simplisticate.md@0c921bf...`
- Consumer runs `gh aw compile` locally to generate their own `.lock.yml`
- `gh aw update` does 3-way merge: preserves local customizations, applies upstream changes

**How it works**:

1. **Motherrepo** is the source of truth — owns all `.md` workflow prompts
2. **Consumer onboarding**: `gh aw add relias-engineering/set-it-free-loop/.github/workflows/<name>.md` for each workflow
3. **Updates**: `gh aw update` in the consumer — fetches upstream changes, 3-way merges with local mods
4. **Compilation**: `gh aw compile` runs locally in the consumer
5. **Dispatch chains**: work naturally — all workflows are in the consumer's `.github/workflows/`

| Pros | Cons |
|------|------|
| Built into gh-aw — zero custom tooling | Consumer has full `.md` + `.lock.yml` (not thin stubs) |
| 3-way merge preserves local customizations | Consumer could diverge if they never `gh aw update` |
| Source tracking via commit SHA | Default path expects `workflows/` at repo root (workaround: explicit path) |
| Version pinning via branch/tag/SHA | |
| `dispatch-workflow` chain works natively | |
| `gh aw update --create-pull-request` for safe updates | |

### Path Resolution Note

`gh aw add <owner/repo/name>` looks in a `workflows/` directory at repo root by default.
The motherrepo currently has workflows in `.github/workflows/` (not `workflows/`).

Two options:

1. **Add a `workflows/` directory at repo root** containing the canonical distribution copies
   → Clean: `gh aw add relias-engineering/set-it-free-loop/simplisticate`
2. **Use explicit paths** → `gh aw add relias-engineering/set-it-free-loop/.github/workflows/simplisticate.md`

Recommendation: **Option 1** — add a `workflows/` directory. The motherrepo `.github/workflows/`
is for dogfooding (running SFL on itself). The root `workflows/` directory is for distribution.
This replaces the old `deployment/workflows/` which held stale copies.

### Superseded Options (archived)

The following options were considered before discovering `gh aw add`/`update`:

- **Option A (Reusable Workflow Stubs)**: Would require `workflow_call` support in gh-aw — untested and unnecessary.
- **Option B (Cross-Repo Dispatch Relay)**: Breaks gh-aw security model — not viable.
- **Option C (Auto-Deploy Pipeline)**: Custom CI to push `.lock.yml` files — unnecessary given native tooling.

---

## What Stays Where

| Component | Home | Notes |
|-----------|------|-------|
| **SFL workflow `.md` prompts** (9 files) | motherrepo | Source of truth |
| **Compiled `.lock.yml` files** | motherrepo (if Option A) or consumer (if Option C) | Depends on distribution model |
| **`sfl-pr-label-actions.yml`** | motherrepo `deployment/infrastructure/` | Standard YAML, not agentic |
| **`sfl-config.yml`** | each consumer owns theirs; template in motherrepo | Consumer-owned config |
| **`labels.json` + `setup-labels.ps1`** | motherrepo `deployment/governance/` | Already exists, needs update |
| **Governance docs** | motherrepo `docs/` | Canonical home |
| **SFL skill** (`.agents/skills/sfl/`) | hs-buddy (stay) | Repo-specific operational tooling |
| **sync-to-motherrepo skill** | retire after migration | Direction reversed |
| **react-doctor-audit** | hs-buddy (stay) | Not SFL-core |
| **copilot-setup-steps** | motherrepo `deployment/infrastructure/` | All consumers need it |
| **Architecture docs + diagrams** | motherrepo | Product docs belong with the product |
| **`sfl.json`** | each consumer | Stamped at deploy; motherrepo has `source: "self"` |
| **SFL-SESSION-TRACKING.md** | hs-buddy (stay) | Operational state |
| **pause/resume scripts** | motherrepo template | Consumer adapts workflow names |
| **sfl-debug/ scripts** | hs-buddy (stay) | Repo-specific enablement |

---

## Migration Phases

### Phase 0 — Validate Distribution Model ✅ COMPLETE

| # | Task | Status |
|---|------|--------|
| 0.1 | Test: `gh aw add` from motherrepo → consumer | ✅ Verified — pulls `.md` with `source:` field |
| 0.2 | Test: `gh aw update` for keeping consumers in sync | ✅ Available — 3-way merge, version pinning |
| 0.3 | Confirm: `dispatch-workflow` targets the same repo | ✅ Confirmed — "in .github/workflows/ directory in the same repository" |
| 0.4 | Verify: `relias-engineering/set-it-free-loop` accessible | ✅ Verified — INTERNAL visibility, `gh aw add` succeeds |
| 0.5 | Decision: Distribution model | ✅ **Option D: `gh aw add`/`update`** (native gh-aw distribution) |

### Phase 1 — Sync Current Architecture to Motherrepo ✅ COMPLETE

Update the motherrepo with the current hs-buddy architecture.

| # | Task | Status |
|---|------|--------|
| 1.1 | Pull motherrepo to latest | ✅ Already up to date (main @ `0c921bf`) |
| 1.2 | Delete retired workflows: `pr-fixer`, `pr-promoter`, `sfl-dispatcher`, old `pr-analyzer-*`, old `issue-processor`, old `simplisticate` | ✅ Removed 17 files from `.github/workflows/`, `deployment/workflows/`, `deployment/infrastructure/` |
| 1.3 | Copy current `.md` prompts → motherrepo `deployment/workflows/` | ✅ 9 `.md` + 1 `.yml` copied |
| 1.4 | Copy current `.md` prompts → motherrepo `.github/workflows/` (dogfood) | ✅ 9 `.md` + 1 `.yml` copied |
| 1.5 | Add `sfl-pr-label-actions.yml` to motherrepo (deployment + dogfood) | ✅ Both locations |
| 1.6 | Add `discussion-processor.md` to motherrepo (deployment + dogfood) | ✅ Both locations |
| 1.7 | Add `copilot-setup-steps.yml` to motherrepo | ✅ `.github/workflows/` |
| 1.8 | Compile all `.md` workflows in motherrepo (`gh aw compile`) | ✅ 9 workflows compiled, 0 errors |
| 1.9 | Add `sfl-config.template.yml` to `deployment/governance/` | ✅ Created |
| 1.10 | Update `sfl.json` with current components (v1.0.0) | ✅ Retired components removed, new names added |

**Phase 1 Summary**: Motherrepo now mirrors hs-buddy architecture. All changes staged locally (not yet committed/pushed).

### Phase 2 — Update Governance & Labels ✅ COMPLETE

| # | Task | Status |
|---|------|--------|
| 2.1 | Update `labels.json` with current label taxonomy | ✅ Pruned from 27 → 18 labels; added `analyzer:blocked`, `human:ready-for-review`; removed unused `risk:critical`, `source:*`, `type:*` |
| 2.2 | Update `policy.md` with current architecture | ✅ Version 2.0; updated label taxonomy, state machine, analyzer flow |
| 2.3 | Update `setup-labels.ps1` if needed | ✅ No changes needed (reads from labels.json) |
| 2.4 | Copy updated `SET_IT_FREE_GOVERNANCE.md` | ✅ Copied to motherrepo `docs/` |
| 2.5 | Copy updated `SFL_ONBOARDING.md` + `SFL-ARCHITECTURE-POC2.md` | ✅ Copied to motherrepo `docs/` |

### Phase 3 — Implement Distribution Model (Option D) ✅ COMPLETE

| # | Task | Status |
|---|------|--------|
| 3.1 | Create `workflows/` directory at motherrepo root with canonical `.md` prompts | ✅ 10 files (9 `.md` + 1 `.yml`) |
| 3.2 | Test: `gh aw add relias-engineering/set-it-free-loop/workflows/<name>.md` from hs-buddy | ✅ All 9 pulled with `source:` field |
| 3.3 | Add all SFL workflows to hs-buddy via `gh aw add` (replaces local copies) | ✅ All 9 replaced, `source:` stamps on all |
| 3.4 | Compile in hs-buddy: `gh aw compile` | ✅ 9 workflows, 0 errors, 5 warnings |
| 3.5 | Test: `gh aw update` pulls changes from motherrepo | ✅ "Successfully updated and compiled 9 workflow(s)" |
| 3.6 | Test: end-to-end simplisticate → issue → PR → analyzers → label-actions | ☐ Deferred — requires scheduled run |
| 3.7 | Document consumer onboarding steps (add, compile, update workflow) | ✅ README.md + SFL_ONBOARDING.md updated |

### Phase 4 — Update Docs & Catalog ✅ COMPLETE

| # | Task | Status |
|---|------|--------|
| 4.1 | Rewrite `CATALOG.md` for new architecture | ✅ Complete rewrite — 10 workflows, chain diagram, `gh aw add` instructions |
| 4.2 | Update motherrepo `README.md` | ✅ Updated folder table, onboarding (gh aw add/update), workflow chain |
| 4.3 | Copy architecture docs + diagram assets | ✅ SET_IT_FREE_GOVERNANCE, SFL_ONBOARDING, SFL-ARCHITECTURE-POC2 |
| 4.4 | Update motherrepo `TODO.md` | ✅ Simplified — graduated table, updated resume section |

### Phase 5 — Convert hs-buddy to Consumer ✅ COMPLETE

| # | Task | Status |
|---|------|--------|
| 5.1 | Replace local `.md` workflows with `gh aw add`-sourced versions (with `source:` field) | ✅ All 9 have `source:` stamp |
| 5.2 | Update `sfl.json` to v1.0.0 with new source ref | ✅ SHA `e441260`, distribution: `gh-aw-add` |
| 5.3 | Update `WORKFLOW-README.md` to reflect consumer role and `gh aw update` workflow | ☐ Deferred |
| 5.4 | Retire `sync-to-motherrepo` skill | ☐ Deferred — mark as deprecated |
| 5.5 | Update SFL skill to reference motherrepo for canonical docs | ☐ Deferred |
| 5.6 | Test: full SFL loop works end-to-end from consumer | ☐ Next scheduled run will verify |

### Phase 6 — Version & Tag ✅ COMPLETE

| # | Task | Status |
|---|------|--------|
| 6.1 | Set motherrepo VERSION to `1.0.0` | ✅ |
| 6.2 | Tag `v1` in motherrepo | ☐ Deferred until post-verification |
| 6.3 | Update hs-buddy `sfl.json` to reference v1 | ✅ SHA `e441260` |

---

## Architecture — Before & After

### Before (Current)

```text
hs-buddy (owns everything)         relias-engineering/set-it-free-loop
├── .github/workflows/              ├── deployment/workflows/     ← STALE
│   ├── sfl-analyzer-a.md           │   ├── pr-analyzer-a.md      ← old names
│   ├── sfl-analyzer-b.md           │   ├── pr-fixer.md           ← retired
│   ├── sfl-analyzer-c.md           │   ├── pr-promoter.md        ← retired
│   ├── sfl-issue-processor.md      │   └── ...
│   ├── sfl-pr-label-actions.yml    ├── .github/workflows/        ← STALE
│   ├── discussion-processor.md     │   ├── sfl-dispatcher.yml    ← retired
│   ├── sfl-auditor.md              │   └── ...
│   ├── repo-audit.md               └── CATALOG.md                ← STALE
│   ├── daily-repo-status.md
│   ├── simplisticate-audit.md
│   └── *.lock.yml (compiled here)
├── sfl.json (v2.0.0)
└── .agents/skills/sfl/
```

### After — Option D (`gh aw add`/`update` Distribution)

```text
relias-engineering/set-it-free-loop    hs-buddy (consumer)
├── workflows/                          ├── .github/workflows/
│   ├── sfl-analyzer-a.md               │   ├── sfl-analyzer-a.md       ← sourced from motherrepo
│   ├── sfl-analyzer-b.md               │   ├── sfl-analyzer-a.lock.yml ← compiled locally
│   ├── sfl-analyzer-c.md               │   ├── sfl-analyzer-b.md       ← sourced
│   ├── sfl-issue-processor.md          │   ├── sfl-analyzer-b.lock.yml
│   ├── simplisticate-audit.md          │   ├── sfl-analyzer-c.md       ← sourced
│   ├── sfl-auditor.md                  │   ├── sfl-analyzer-c.lock.yml
│   ├── repo-audit.md                   │   ├── sfl-issue-processor.md  ← sourced
│   ├── daily-repo-status.md            │   ├── sfl-issue-processor.lock.yml
│   ├── discussion-processor.md         │   ├── simplisticate-audit.md  ← sourced
│   └── sfl-pr-label-actions.yml        │   ├── sfl-auditor.md          ← sourced
├── .github/workflows/                  │   ├── repo-audit.md           ← sourced
│   └── (dogfood — runs SFL on itself)  │   ├── daily-repo-status.md    ← sourced
├── deployment/                         │   ├── discussion-processor.md ← sourced
│   ├── governance/                     │   ├── sfl-pr-label-actions.yml← sourced
│   ├── infrastructure/                 │   ├── react-doctor-audit.md   ← repo-specific (stays)
│   └── scripts/                        │   └── *.lock.yml              ← all compiled locally
├── docs/                               ├── .github/sfl-config.yml      ← consumer-owned
├── CATALOG.md                          ├── sfl.json (v1.0.0, source: motherrepo)
├── VERSION (1.0.0)                     └── .agents/skills/sfl/         ← stays
└── sfl.json (source: "self")

Consumer workflow flow:
  gh aw add relias-engineering/set-it-free-loop/<workflow>  ← adds .md with source: field
  gh aw compile                                             ← generates .lock.yml locally
  gh aw update                                              ← pulls upstream changes (3-way merge)
```

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Consumer diverges from motherrepo | Prompt drift | `gh aw update` regularly; CI could enforce freshness check |
| `gh aw add` default path expects `workflows/` | Consumer onboarding friction | Create `workflows/` dir at motherrepo root; or document explicit path |
| 3-way merge conflicts on update | Update blocked | Manual resolution; keep local customizations minimal |
| `relias-engineering` org access changes | `gh aw add` breaks | Repo is INTERNAL — accessible to all org members |

---

## Notes

- **Local clone mapping**: `d:\github\Relias\set-it-free-loop` → `relias-engineering/set-it-free-loop` (canonical).
  The old clone at `d:\github\HemSoft\set-it-free-loop` points to `git@github-personal1:HemSoft/set-it-free-loop.git` which
  doesn't exist on GitHub. The HemSoft clone should be either deleted or repointed.
- The existing `sync-to-motherrepo` skill handles ~60% of Phase 1 but targets the old architecture.
- Consumer onboarding is now a simple `gh aw add` loop — no custom scripts needed.
- Active gh CLI auth: `fhemmerrelias` — has access to `relias-engineering` org.
