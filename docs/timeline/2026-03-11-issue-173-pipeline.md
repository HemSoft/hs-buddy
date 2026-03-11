# Issue #173 Pipeline Stall — 2026-03-11

## Time Zone

Eastern Time (EDT)

## Timeline Index

| Time | Summary | Detail |
|------|---------|--------|
| 2026-03-11 08:59:47 AM EDT | Repo Audit created Issue #173 with `agent:fixable`. | [Details](#event-085947) |
| 2026-03-11 09:36:06 AM EDT | Run 22955284575: agent emitted `create_pull_request` but safe_outputs rejected — `.github/` protected path. | [Details](#event-093606) |
| 2026-03-11 09:43:23 AM EDT | Run 22955600380: triggered by auto-created Issue #174, processed wrong issue. | [Details](#event-094323) |
| 2026-03-11 09:58:17 AM EDT | Run 22956264060: `allowed-files` whitelist blocked all `src/` files. Labels stuck at `agent:in-progress`. | [Details](#event-095817) |
| 2026-03-11 10:32:57 AM EDT | Run 22957832236: blank issue-number + stuck labels = "No eligible work." | [Details](#event-103257) |
| 2026-03-11 10:51:00 AM EDT | Run 22958664401: PR #175 created, but agent verified too early (deferred safe-output) and self-paused #173. | [Details](#event-105100) |
| 2026-03-11 11:21:49 AM EDT | Run 22960108718: found #173 paused, emitted noop to Discussion #95. | [Details](#event-112149) |
| 2026-03-11 12:44:00 PM EDT | Fix #5 applied: deferred safe-output guardrail added to prompt (v0.1.316, 37a327a). | [Details](#event-124400) |

## Detailed Entries

### 2026-03-11 08:59:47 AM EDT - Repo Audit created Issue #173 {#event-085947}

- Observed: SFL Repo Audit workflow created Issue #173 "[repo-audit] Repo Audit - 2026-03-11" with 3 findings: doc drift in `.github/workflows/README.md`, React key-index usage, useEffect patterns.
- Action: Issue labeled `agent:fixable` automatically.
- Result: Pipeline entry point activated.
- Evidence: Issue #173.

### 2026-03-11 09:36:06 AM EDT - Run 22955284575: protected path rejection {#event-093606}

- Observed: Agent correctly emitted `create_pull_request` (budget table fix from v0.1.312 worked).
- Action: safe_outputs attempted to create PR.
- Result: Rejected — patch included `.github/workflows/README.md` which is blocked by `protected_path_prefixes: [".github/"]`.
- Evidence: Run 22955284575, conclusion: failure.
- Fix applied: v0.1.313 added `allowed-files` (later discovered to be wrong approach).

### 2026-03-11 09:43:23 AM EDT - Run 22955600380: wrong issue processed {#event-094323}

- Observed: Auto-triggered by Issue #174 (auto-created failure notice from run 22955284575), not #173.
- Action: Agent processed #174 instead of #173.
- Result: Posted "No eligible work" to Discussion #95.
- Evidence: Run 22955600380, conclusion: success.

### 2026-03-11 09:58:17 AM EDT - Run 22956264060: allowed-files whitelist blocked src/ {#event-095817}

- Observed: `allowed-files: [".github/workflows/README.md"]` acts as a WHITELIST, not an exemption list.
- Action: safe_outputs rejected PR because `src/` files were not in the whitelist.
- Result: PR creation failed. Labels stuck at `agent:in-progress` because label changes were emitted BEFORE `create_pull_request` in this version.
- Evidence: Run 22956264060, conclusion: failure. Error: "patch modifies files outside the allowed-files list (src/components/...)".
- Fix applied: v0.1.314 removed `allowed-files` entirely, added protected-path guardrail in prompt.

### 2026-03-11 10:32:57 AM EDT - Run 22957832236: no eligible work {#event-103257}

- Observed: Two problems: (A) `workflow_dispatch` inputs don't populate `GH_AW_GITHUB_EVENT_ISSUE_NUMBER` — agent received blank issue-number. (B) Untargeted search found no `agent:fixable` issues because #173 was stuck at `agent:in-progress` from the prior failed run.
- Action: Agent searched for eligible work, found none.
- Result: Posted "No eligible work" to Discussion #95.
- Evidence: Run 22957832236, conclusion: success.
- Fix applied: v0.1.315 deferred label changes to after PR creation (ordering fix). Manually relabeled #173 back to `agent:fixable`.

### 2026-03-11 10:51:00 AM EDT - Run 22958664401: PR created but agent self-paused {#event-105100}

- Observed: Agent found #173 (relabel worked), implemented code changes, called `create_pull_request` (message 2/8).
- Action: safe_outputs processed all 8 messages successfully. PR #175 created at 11:01:36 AM EDT.
- Result: Agent tried to VERIFY PR existence via GitHub API reads AFTER calling `create_pull_request`. Since safe-outputs are deferred (processed after agent finishes), the PR didn't exist yet. Agent concluded PR wasn't created and emitted contradictory pause sequence.
- Evidence: Run 22958664401, PR #175, 8 messages: add_comment, create_pull_request, remove_labels, add_labels(in-progress), add_labels(pause), update_issue, remove_labels(in-progress), add_comment(log).
- Root cause: Agent doesn't understand that safe-output tools are deferred. No prompt guidance existed about this.
- Fix applied: v0.1.316 (37a327a) added CRITICAL deferred-execution section to Step 6a and contradictory-sequence guardrail.

### 2026-03-11 11:21:49 AM EDT - Run 22960108718: noop {#event-112149}

- Observed: Found #173 with `agent:pause` label. No eligible work.
- Action: Emitted 1 message: add_comment to Discussion #95.
- Result: No progress.
- Evidence: Run 22960108718, conclusion: success.

### 2026-03-11 12:44:00 PM EDT - Fix #5 applied {#event-124400}

- Observed: Root cause identified — agent attempted post-call verification of deferred safe-output tools.
- Action: Added deferred-execution CRITICAL section to Step 6a. Added guardrail: "Never emit contradictory safe-output sequences."
- Result: Committed as v0.1.316 (37a327a), pushed to main.
- Evidence: Commit 37a327a.

## Current State

- **Issue #173**: OPEN, label `agent:pause` (incorrectly paused by run 22958664401)
- **PR #175**: OPEN, draft, label `agent:pr` (correctly created by run 22958664401 safe_outputs)
- **Issue #174**: OPEN, stale failure notice

## Recovery Plan

1. Remove `agent:pause` from #173, add `agent:in-progress` — this reflects the true state (PR #175 exists).
2. Close Issue #174 (stale failure notice no longer relevant).
3. PR #175 should be picked up by Analyzer A via the `pull_request: opened` event.
4. Verify Analyzer A runs on PR #175.

## Fix History

| Version | Commit | Fix |
|---------|--------|-----|
| v0.1.312 | bf3875b | Tool-calling budget table — fixed gpt-5.4 hallucination |
| v0.1.313 | c342cd1 | Added `allowed-files` (WRONG — caused whitelist problem) |
| v0.1.314 | f277226 | Removed `allowed-files`, added protected-path guardrail |
| v0.1.315 | 49773ad | Deferred label changes to after PR creation |
| v0.1.316 | 37a327a | Deferred safe-output guardrail — prevent contradictory sequences |

## Platform Discoveries

1. `workflow_dispatch` inputs do NOT populate `GH_AW_GITHUB_EVENT_ISSUE_NUMBER`
2. `allowed-files` in safe-outputs is a WHITELIST, not an exemption list
3. safe_outputs processes messages in emission order; already-processed messages are NOT rolled back on later failures
4. Safe-output tools are DEFERRED — agent cannot verify their results during integration
5. `.github/` is always in `protected_path_prefixes` — agent cannot modify files there
