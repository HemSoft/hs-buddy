# SFL Session Tracking

## Active Session: Issue #173 Pipeline Stall — Timeline Debugging

**Started:** 2026-03-11 09:36 AM ET
**Trigger:** Repo Audit auto-created Issue #173 with `agent:fixable`
**Purpose:** First production run of Pipeline V2 after E2E validation. Investigating repeated Issue Processor failures.

## Expected Pipeline Flow

| Step | Workflow | Trigger | Expected Output |
|------|----------|---------|-----------------|
| 1 | Repo Audit | `schedule` (cron) | Creates issue with `agent:fixable` label |
| 2 | SFL Issue Processor | `issues: opened` or `workflow_dispatch` | Claims issue, implements fixes, creates draft PR with `agent:pr` |
| 3 | Analyzer A | `pull_request: opened` (auto) | Reviews PR, posts `[MARKER:sfl-analyzer-a cycle:0]` |
| 4 | Analyzer B | `workflow_dispatch` from A | Reviews PR, posts `[MARKER:sfl-analyzer-b cycle:0]` |
| 5 | Analyzer C | `workflow_dispatch` from B | Reviews PR, posts `[MARKER:sfl-analyzer-c cycle:0]` |
| 6 | Label Actions | `pull_request: labeled` (auto) | If blocked: dispatch fix cycle. If clean: mark ready-for-review. |

## Run Tracking

| Time (ET) | Run ID | Workflow | Status | Notes |
|-----------|--------|----------|--------|-------|
| 08:59 AM | -- | Repo Audit | completed | Created Issue #173 with `agent:fixable`. 3 findings: README doc drift, React key-index, useEffect patterns. |
| 09:36 AM | 22955284575 | Issue Processor | failure | **Fix #1 worked** (budget table fixed hallucination) — agent emitted `create_pull_request`. But safe_outputs rejected: `.github/workflows/README.md` blocked by `protected_path_prefixes`. |
| 09:43 AM | 22955600380 | Issue Processor | success | Wrong issue — auto-triggered by Issue #174 (failure notice), not #173. No-op. |
| 09:58 AM | 22956264060 | Issue Processor | failure | `allowed-files` whitelist blocked all `src/` files. Labels stuck at `agent:in-progress` (emitted before PR). |
| 10:32 AM | 22957832236 | Issue Processor | success | Blank `issue-number` (dispatch inputs don't map to event vars) + stuck labels = "No eligible work." |
| 10:51 AM | 22958664401 | Issue Processor | success | **PR #175 created!** But agent verified too early (deferred safe-outputs), concluded PR didn't exist, self-paused #173. Contradictory emit sequence. |
| 11:01 AM | 22959166936 | Analyzer A | success | Reviewed PR #175. Dispatched Analyzer B. |
| 11:08 AM | 22959474084 | Analyzer B | success | Reviewed PR #175. Dispatched Analyzer C. |
| 11:15 AM | 22959834329 | Analyzer C | success | Reviewed PR #175. **BLOCKING**: README.md update skipped (`.github/` protected). |
| 11:21 AM | 22960096857 | Label Actions | success | Detected blocking, removed `analyzer:blocked`, dispatched Issue Processor for fix cycle. |
| 11:21 AM | 22960108718 | Issue Processor | success | No-op — #173 was incorrectly `agent:pause` from contradictory emit in run 22958664401. |
| ~12:44 PM | 22964044907 | Issue Processor | success | **Failure #6**: `pull-request-number=175` dispatched but input wasn't wired to prompt (blank). "No eligible work." |

## Fixes Applied

| # | Version | Commit | Fix | Confirmed |
|---|---------|--------|-----|-----------|
| 1 | v0.1.312 | bf3875b | Tool-calling budget table — fixed gpt-5.4 "1 call total" hallucination | Yes — run 22955284575 emitted `create_pull_request` |
| 2 | v0.1.313 | c342cd1 | Added `allowed-files` to safe-outputs | **Wrong** — whitelist blocked `src/` |
| 3 | v0.1.314 | f277226 | Removed `allowed-files`, added protected-path guardrail in prompt | Yes — agent skipped README finding |
| 4 | v0.1.315 | 49773ad | Deferred label changes to after `create_pull_request` | Yes — labels not stuck on PR failure |
| 5 | v0.1.316 | 37a327a | Deferred safe-output guardrail — prevent contradictory emit sequences | Pending — next run will validate |
| 6 | v0.1.320 | e6efa85 | Handlebars blocks for dispatch inputs — matching Analyzer pattern | Pending — next run will validate |

## Platform Discoveries

1. `workflow_dispatch` inputs do NOT populate `GH_AW_GITHUB_EVENT_ISSUE_NUMBER`
2. `allowed-files` in safe-outputs is a WHITELIST, not an exemption list
3. safe_outputs processes messages in emission order; already-processed messages are NOT rolled back
4. Safe-output tools are DEFERRED — agent cannot verify their result during its run
5. `.github/` is always in `protected_path_prefixes`
6. `github.event.inputs.*` needs `{{#if}}` Handlebars blocks in `.md` to be wired to prompt — `<github-context>` env vars don't cover dispatch inputs

## Manual Interventions

| Time (ET) | Action | Reason |
|-----------|--------|--------|
| ~11:40 AM | `gh issue edit 173 --remove-label agent:in-progress --add-label agent:fixable` | Labels stuck from run 22956264060 failure |
| ~12:44 PM | `gh issue edit 173 --remove-label agent:pause --add-label agent:in-progress` | Labels corrupted by contradictory emit in run 22958664401 |
| ~12:44 PM | `gh workflow run "SFL Issue Processor / Implementer" --field pull-request-number=175` | Re-dispatch follow-up pass after label recovery |

## Current State

- **Issue #173**: OPEN, `agent:in-progress`
- **PR #175**: OPEN, draft, `agent:pr` — all 3 analyzer markers present (cycle 0)
- **Analyzer C verdict**: BLOCKING (README.md update can't be done by agent)
- **Waiting on**: Fix #6 pushed (v0.1.320) — ready for re-dispatch to validate
- **Timeline doc**: `docs/timeline/2026-03-11-issue-173-pipeline.md`
