# Pipeline V2 — Label-Driven Architecture Plan

> Tracking document for the redesign of the SFL analysis pipeline.
> Replaces PR-body markers and the PR Router with a label-driven chain pattern.

---

## Design Decisions (Agreed)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Keep 3 full-spectrum analyzers** (A, B, C) | Model diversity is the value — different models catch different things |
| D2 | **Chain pattern** — A dispatches B, B dispatches C, C dispatches label-actions | Eliminates the PR Router entirely; simpler, fewer workflow runs |
| D3 | **`analyzer:blocked` label** for blocking verdicts | Deterministic binary signal; no need to parse PR body with awk/grep |
| D4 | **Labels for state, comments for output** | PR body is no longer a state store; comments are more natural for review output |
| D5 | **Eliminate PR Router** | Label-actions (enhanced) absorbs its aggregation responsibility |
| D6 | **Silent exits → Discussion log** | Every silent exit posts a note to Discussion #95 (SFL Activity Log) |
| D7 | **Shared analyzer prompt template** | Reduce duplication across the 3 analyzer `.md` files |
| D8 | **Clarify determinism principle** | Principle #2 wording update in GOAL-AND-GUIDING-PRINCIPLES.md |
| D9 | **Single `analyzer:blocked` label** (not per-analyzer) | Simpler; which model blocked is visible in its comment |
| D10 | **PR body is sacred** — written once by issue-processor, never altered | Analyzers post comments. Issue-processor resolves comments on fix cycles. Zero body rewrites. |
| D11 | **Label-actions owns `analyzer:blocked` lifecycle** | Removes label before dispatching issue-processor — single aggregation point, no split responsibility |

---

## Resolved Detail Questions

| # | Question | Answer | Rationale |
|---|----------|--------|-----------|
| Q1 | Single or per-analyzer blocked label? | **Single `analyzer:blocked` label** | Simpler. Which model blocked is visible in the comment it posted. |
| Q2 | Who removes `analyzer:blocked` on re-run? | **Label-actions removes it before dispatching issue-processor** | Most deterministic: the aggregation point (label-actions) owns the full lifecycle — it checks the label, acts on it, and cleans it up in one atomic step. No split responsibility. |
| Q3 | Do analyzers write anything to the PR body? | **No. PR body is sacred.** | The issue-processor writes the PR body once to describe what the PR solves. Nothing alters it after that. Analyzers post **comments**. When issue-processor returns for a fix cycle, it resolves all existing comments and addresses them. Zero body rewrites. |

---

## Implementation Phases

### Phase 0 — Input Expression Fix ✅

Fix the env var mapping that caused Issue #161 to stall.

**Root cause (corrected)**: NOT a compiler bug — it was a **usage bug**. The
`.md` source files declared `pull-request-number` as a `workflow_dispatch` input
in frontmatter, but never referenced it with `${{ github.event.inputs.pull-request-number }}`
expression syntax in the markdown body. The compiler only creates env var
mappings for expressions it finds in the source. The Templating reference
confirms `github.event.inputs.*` is a permitted expression in markdown.

**Fix applied**: Added `{{#if github.event.inputs.pull-request-number}}` /
`{{else}}` / `{{/if}}` conditional blocks to Step 1 of all three analyzers,
with `${{ github.event.inputs.pull-request-number }}` expression. The compiler
now generates `GH_AW_EXPR_7D9EF77E` env var mapped to the input value.

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 0.1 | ~~Direct lock.yml edits~~ — **REVERTED** (lock.yml is auto-generated, cannot be hand-edited) | N/A | `[x]` |
| 0.2 | Add `${{ github.event.inputs.pull-request-number }}` expression to all 3 analyzer `.md` files | `sfl-analyzer-a/b/c.md` | `[x]` |
| 0.3 | Recompile — verify `GH_AW_EXPR_7D9EF77E` env var exists in all 3 `.lock.yml` files | `*.lock.yml` | `[x]` |

---

### Phase 1 — Analyzer Chain Wiring

Change dispatch targets so analyzers chain directly instead of going through the router.

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1.1 | Analyzer A: change `dispatch-workflow` from `sfl-pr-router` to `sfl-analyzer-b` | `sfl-analyzer-a.md` | `[x]` |
| 1.2 | Analyzer B: change `dispatch-workflow` from `sfl-pr-router` to `sfl-analyzer-c` | `sfl-analyzer-b.md` | `[x]` |
| 1.3 | Analyzer C: change `dispatch-workflow` from `sfl-pr-router` to `sfl-pr-label-actions` | `sfl-analyzer-c.md` | `[x]` |
| 1.4 | Recompile all 3 `.lock.yml` files after `.md` changes | `*.lock.yml` | `[x]` |

---

### Phase 2 — Label-Based Verdicts + Sacred PR Body

Update analyzer prompts: comments only, labels for state, PR body untouched.

**Key rule:** The PR body is written **once** by the issue-processor to describe
what the PR solves. No workflow or analyzer may alter it after that. All review
output goes to PR comments. When issue-processor returns for a fix cycle, it
resolves all existing analyzer comments and addresses their feedback.

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 2.1 | Create `analyzer:blocked` label (red) in the repository | GitHub Labels | `[x]` |
| 2.2 | Update analyzer prompt: post review as **PR comment** (not body rewrite) | `sfl-analyzer-a.md`, `b.md`, `c.md` | `[x]` |
| 2.3 | Update analyzer prompt: add `analyzer:blocked` label when BLOCKING ISSUES FOUND | Same | `[x]` |
| 2.4 | Remove ALL instructions to write markers or verdicts to PR body; update idempotency to check PR comments | Same | `[x]` |
| 2.5 | Remove `update-issue` safe-output from analyzer frontmatter (analyzers don't touch issue/PR bodies) | Same | `[x]` |
| 2.6 | Update issue-processor prompt: check PR comments for analyzer/processor markers instead of body | `sfl-issue-processor.md` | `[x]` |
| 2.7 | Recompile all `.lock.yml` files | `*.lock.yml` | `[x]` |

---

### Phase 3 — Enhanced Label-Actions (Aggregator)

Upgrade `sfl-pr-label-actions.yml` to become the pipeline's aggregation point.

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 3.1 | Add check: if `analyzer:blocked` label exists → dispatch `sfl-issue-processor.lock.yml` for fix cycle | `sfl-pr-label-actions.yml` | `[x]` |
| 3.2 | Add label cleanup: remove `analyzer:blocked` before dispatching issue-processor | Same | `[x]` |
| 3.3 | Keep existing logic: if `human:ready-for-review` and no `analyzer:blocked` → flip draft → ready | Same | `[x]` |
| 3.4 | Add `human:ready-for-review` label when all analyzers pass (no blocked label) | Same | `[x]` |
| 3.5 | Add permissions: `actions: write` (for dispatch) + `discussions: write` | Same | `[x]` |
| 3.6 | Add Discussion #95 log posting on every decision (pass or block) | Same | `[x]` |

---

### Phase 4 — Silent Exit Logging

Make every silent `exit 0` across the pipeline post a note to the SFL Activity Log.

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 4.1 | Label-actions: post to Discussion #95 when exiting silently (no eligible PR, missing label, etc.) | `sfl-pr-label-actions.yml` | `[x]` |
| 4.2 | Audit all analyzer `.md` prompts for silent exit paths; add Discussion logging instruction | `sfl-analyzer-a/b/c.md` | `[x]` |

---

### Phase 5 — Shared Analyzer Template

**SKIPPED** — gh-aw v0.57.2 has no template inclusion, partial, or import mechanism. Each `.md` file is self-contained. Revisit if a future gh-aw version adds this capability.

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 5.1 | Create `sfl-analyzer-template.md` with shared review instructions, verdict format, label scheme, and comment structure | `.github/workflows/sfl-analyzer-template.md` | `N/A` |
| 5.2 | Refactor `sfl-analyzer-a.md` to include/reference the template (keeping only model-specific frontmatter) | `sfl-analyzer-a.md` | `N/A` |
| 5.3 | Refactor `sfl-analyzer-b.md` same | `sfl-analyzer-b.md` | `N/A` |
| 5.4 | Refactor `sfl-analyzer-c.md` same | `sfl-analyzer-c.md` | `N/A` |
| 5.5 | Verify gh-aw supports template inclusion or determine alternative approach | Research | `[x]` |

---

### Phase 6 — Remove PR Router

Once Phases 1–3 are validated, the router is dead code.

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 6.1 | Disable `sfl-pr-router.yml` workflow | GitHub Actions | `[x]` |
| 6.2 | Remove `sfl-pr-router.yml` from the repository | `.github/workflows/` | `[x]` |
| 6.3 | Remove any references to `sfl-pr-router` in auditor, config, docs | Various | `[x]` |

---

### Phase 7 — Documentation Updates

Align docs with the new architecture.

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 7.1 | Update Ideal Workflow table in GOAL-AND-GUIDING-PRINCIPLES.md to reflect chain pattern | `GOAL-AND-GUIDING-PRINCIPLES.md` | `[x]` |
| 7.2 | Clarify Principle #2 (Determinism) wording — make explicit that labels are the state mechanism | Same | `[x]` |
| 7.3 | Update `.github/workflows/README.md` to remove router, update flow description | `.github/workflows/README.md` | `[x]` |
| 7.4 | Update AGENTS.md if any standing orders reference the router or body markers | `AGENTS.md` | `[x]` |
| 7.5 | Archive this plan document (move to `docs/` or mark complete) | `PLAN-PIPELINE-V2.md` | `[x]` |

---

## New Architecture — Visual Flow

```text
Issue (agent:fixable)
  │
  ▼
sfl-issue-processor ──► Draft PR (agent:pr, pr:cycle-N)
  │
  ▼
sfl-analyzer-a ──► Comment + label? ──► dispatches ──► sfl-analyzer-b
  │
  ▼
sfl-analyzer-b ──► Comment + label? ──► dispatches ──► sfl-analyzer-c
  │
  ▼
sfl-analyzer-c ──► Comment + label? ──► dispatches ──► sfl-pr-label-actions
  │
  ▼
sfl-pr-label-actions (AGGREGATOR)
  ├── analyzer:blocked exists? ──► remove label, dispatch sfl-issue-processor (fix cycle)
  └── no blocked label? ──► add human:ready-for-review, flip draft → ready
```

---

## New Label Scheme

| Label | Color | Added By | Removed By | Purpose |
|-------|-------|----------|------------|---------|
| `analyzer:blocked` | Red | Any analyzer that finds blocking issues | Label-actions (before dispatching fix cycle) | Binary signal: at least one analyzer objected |
| `human:ready-for-review` | Green | Label-actions (all pass) | Human (after merge) | Signals PR is ready for human review |
| `agent:pr` | — | Issue-processor | — | Marks a draft PR for the agentic pipeline |
| `pr:cycle-N` | — | Issue-processor | — | Tracks implementation/review cycle number |

---

## Current vs New — Comparison

| Aspect | Current (V1) | New (V2) |
|--------|-------------|----------|
| **Analyzer verdicts** | Written as markers + verdicts in PR body | Posted as PR comments + `analyzer:blocked` label |
| **PR body** | Rewritten by router and analyzers (markers, verdicts, decisions) | Written once by issue-processor, never touched again |
| **State tracking** | PR body markers (`[MARKER:sfl-analyzer-X cycle:N]`) | Labels on PR |
| **Routing** | PR Router reads body, dispatches next step | Chain: A→B→C→label-actions (no router) |
| **Aggregation** | PR Router parses 3 verdicts via awk | Label-actions checks for `analyzer:blocked` label |
| **All PASS** | Router adds `human:ready-for-review` + dispatches label-actions | Label-actions adds label + flips draft |
| **Any BLOCKING** | Router dispatches issue-processor | Label-actions removes `analyzer:blocked`, dispatches issue-processor |
| **Fix cycles** | Unclear who addresses previous feedback | Issue-processor resolves all analyzer comments |
| **Silent exits** | Lost — no logging | Posted to Discussion #95 |
| **Workflow runs** | ~7 per cycle (A + Router + B + Router + C + Router + Label-actions) | ~5 per cycle (A + B + C + Label-actions + optional fix dispatch) |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| gh-aw doesn't support cross-analyzer dispatch (lock.yml naming) | Low | High | Test in Phase 1 before proceeding |
| Removing body markers loses audit trail | Medium | Low | Comments provide equivalent trail; Discussion log adds redundancy |
| Template approach not supported by gh-aw compiler | Medium | Medium | Phase 5 is independent; can skip if not feasible |
| Breaking change to auditor assumptions | Medium | Medium | Update auditor in Phase 7 to check labels instead of markers |

---

Created: 2026-03-10 — Tracks redesign from Issue #161 investigation findings
