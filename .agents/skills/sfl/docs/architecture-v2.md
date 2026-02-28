# SFL Architecture V2 — Simplified with Full Safe-Output Capabilities

> **Created**: 2026-02-28
> **Status**: PROPOSAL — awaiting human review
> **Triggered by**: Discovery that `push-to-pull-request-branch`, `add-comment`,
> `add-labels`/`remove-labels`, `close-pull-request`, and other safe-outputs
> exist but were never configured.

## What Changes

### PR Fixer — The Big Win

**Before (V1)**: Fixer uses `create-pull-request` to open a NEW PR with fixes,
then closes the old PR. This creates PR chains (supersession), cumulative cycle
tracking via META tags, and ~365-line prompt complexity.

**After (V2)**: Fixer uses `push-to-pull-request-branch` to push fixes directly
to the existing PR's branch. No new PRs, no chains, no supersession tracking.

| Removed | Replacement |
|---------|-------------|
| `create-pull-request` in fixer | `push-to-pull-request-branch` |
| Supersession model (Steps 9-11) | Gone entirely |
| `[META:cumulative-cycle:N]` tracking | Gone — cycle labels are sufficient |
| Close-old-PR logic | Gone — same PR throughout |
| 365-line prompt | ~150-line prompt |

**New fixer safe-outputs**:

```yaml
safe-outputs:
  push-to-pull-request-branch:
    max: 1
  update-issue:
    target: "*"
    max: 5
  add-comment:
    target: "*"
    max: 1
  add-labels:
    max: 3
  remove-labels:
    max: 3
  update-discussion:
    target: "*"
    max: 1
```

**New fixer flow**:

1. Find oldest draft PR with `agent:pr` + all 3 analyzer markers
2. Read findings, implement fixes
3. `push-to-pull-request-branch` — push fixes to existing PR branch
4. `add-comment` — post fix summary as a PR comment (cleaner than body append)
5. `add-labels` — add next cycle label
6. `remove-labels` — remove previous cycle label
7. Done. Same PR, same branch, new commit.

### PR Promoter — Better Label Management

**Before**: Uses `update-issue` with full `labels` array (replaces all labels,
easy to accidentally drop labels).

**After**: Uses `add-labels` and `remove-labels` for granular label changes.

| Before | After |
|--------|-------|
| `update-issue` with full labels array | `add-labels` / `remove-labels` |
| Risk of dropping labels on replace | Granular, additive ops |
| Promotion comment via body append | `add-comment` for cleaner comment |

**New promoter safe-outputs**:

```yaml
safe-outputs:
  add-labels:
    max: 3
  remove-labels:
    max: 3
  add-comment:
    target: "*"
    max: 2
  update-discussion:
    target: "*"
    max: 2
  update-issue:
    target: "*"
    max: 3
```

### PR Analyzers — Optional Upgrade

**Before**: Analyzers write verdicts into PR body via `update-issue` append.

**Potential upgrade**: Use `submit-pull-request-review` with
`APPROVE`/`REQUEST_CHANGES`/`COMMENT` events. This would integrate analyzer
verdicts into GitHub's native review system.

**Risk level**: Medium. Changing from body markers to PR reviews changes
how the fixer and promoter detect verdicts. Should be done AFTER the fixer
simplification is stable.

**Recommendation**: Phase 2. Keep body markers for now; switch to
`submit-pull-request-review` once the V2 fixer is proven stable.

### Issue Processor — Minor Improvements

**Before**: Uses `update-issue` to manage labels (risk of replacing all labels).

**After**: Uses `add-labels` to add `agent:in-progress` without touching other
labels.

### Dashboard (Discussion #51) — No Change

`update-discussion` already works. No changes needed.

## What's Removed

1. **Supersession model** — PR chains, close-old/open-new flow
2. **Cumulative cycle tracking** — `[META:cumulative-cycle:N]` in PR body
3. **Steps 9-11 of PR Fixer** — Open fix PR, close old PR, post fix record to old PR
4. **Label replacement risk** — `update-issue` with full labels array (replaced by `add-labels`/`remove-labels` where possible)

## What's Added

1. **`push-to-pull-request-branch`** — Pushes fixes to existing PR branch
2. **`add-comment`** — Clean comment posting (vs body append)
3. **`add-labels` / `remove-labels`** — Granular label management
4. **`close-pull-request`** — For future cleanup operations if needed

## Migration Plan

### Phase 1: PR Fixer Rewrite (Critical)

1. Rewrite `pr-fixer.md` to use `push-to-pull-request-branch`
2. Remove supersession model, META tags, PR chains
3. Add `add-comment`, `add-labels`, `remove-labels` safe-outputs
4. Reduce prompt from ~365 to ~150 lines
5. Recompile with `gh aw compile`
6. Test on PR #78 or #79

### Phase 2: PR Promoter Update

1. Switch label management from `update-issue` to `add-labels`/`remove-labels`
2. Switch promotion comment from body append to `add-comment`
3. Keep `update-issue` for merge phase (needs `status` field)
4. Recompile with `gh aw compile`

### Phase 3: Label Pruning

1. Audit all 40 labels
2. Remove unused labels
3. Target: ≤25 labels

### Phase 4 (Future): Analyzer PR Reviews

1. Switch analyzers to `submit-pull-request-review` with native review events
2. Update fixer/promoter to read PR reviews instead of body markers
3. Much cleaner PR history — review threads instead of body markers

## Risk Assessment

| Change | Risk | Reason |
|--------|------|--------|
| Fixer → push-to-branch | **Low** | Simpler than current model; removes complexity |
| Promoter → add/remove labels | **Low** | Additive change, safer than replace-all |
| Label pruning | **Low** | Only remove provably unused labels |
| Analyzers → PR reviews | **Medium** | Changes detection mechanism for fixer/promoter |
