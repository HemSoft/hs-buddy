# ATTENTION

> Auto-maintained by the debug skill. Last updated: 2026-02-26

## Active Concerns

### Pipeline Stall — PRs Stuck as Draft, Infinite No-Op Loop

- **Severity**: Critical
- **Detected**: 2026-02-24
- **Status**: Fix deployed (pending push)
- **Description**: 9 draft PRs with `agent:pr` label are stuck. Three root causes identified and fixed:
  1. **Fixer missing marker on all-PASS**: When all 3 analyzers PASS, the fixer called `noop` without writing `[MARKER:pr-fixer cycle:N]`. The dispatcher re-dispatched the fixer every 30 min forever.
  2. **Promoter auth failure**: Promoter tried `gh pr ready` but neither `$GITHUB_TOKEN` nor `$COPILOT_GITHUB_TOKEN` existed in the gh-aw runtime. The gh-aw platform blocks `pull-requests: write`. Switched to `create-pull-request` safe-output with `draft: false`.
  3. **Auditor dedup broken**: SFL Auditor appended 10-17 duplicate "missing analyzer markers" warnings to PR bodies. The agent failed to detect existing warnings in body text.
- **Impact**: Zero PRs progressed to promotion or human review. ~7 wasted workflow runs every 30 min (fixer + promoter + auditor spam).
- **Suggested Action**: Push the fixes, monitor next 2 dispatch cycles to confirm pipeline flow resumes.

### Model Drift — Recurring Wrong Model on Analyzer B

- **Severity**: High
- **Detected**: 2026-02-26
- **Status**: Mitigated (guard added to Dispatcher)
- **Description**: Analyzer B has been assigned the wrong model 6 times across 4 days. Most recently, `gemini-3-pro-preview` appeared at runtime despite the lock file specifying `claude-opus-4.6`. Root cause: the `generate_aw_info` step in lock files is set at compile time and can drift if branches are created before a model fix lands on `main`. Additionally, `sfl.json`, `.md` frontmatter, lock files, and docs (SFL-LAUNCH.md) can all diverge.
- **Impact**: Agent failures (400 Bad Request from unsupported model) and wasted workflow runs.
- **Suggested Action**: Model-drift guard added to SFL Dispatcher. Active agent branches rebased onto `main`. Monitor for recurrence.

### PR Body Bloat from Auditor/Analyzer Spam

- **Severity**: Medium
- **Detected**: 2026-02-24
- **Status**: Active — bodies need cleanup
- **Description**: PR bodies contain 10-17 duplicate auditor warnings plus duplicate Analyzer A markers. PR #20 has 4+ copies of `[MARKER:pr-analyzer-a cycle:0]`.
- **Impact**: Bloated bodies may confuse agents parsing markers, waste API bandwidth.
- **Suggested Action**: After pipeline flows normally, consider a one-time cleanup of duplicate content in PR bodies.

### Phase 2 (Merge) Still Uses gh CLI Auth

- **Severity**: Medium
- **Detected**: 2026-02-24
- **Status**: Active — deferred
- **Description**: The Promoter's Phase 2 merge job (Steps 11-13) still uses `gh pr merge` which requires CLI auth. This will fail for the same reason as the old `gh pr ready`.
- **Impact**: Once PRs get human approval, auto-merge will fail. Humans can still merge manually.
- **Suggested Action**: When a PR reaches approved state, investigate if `create-pull-request` safe-output can handle merges, or add a dedicated merge mechanism.

### Label Complexity Exceeds Threshold

- **Severity**: Medium
- **Detected**: 2026-02-20
- **Status**: Partially resolved (2026-02-23)
- **Description**: 30 labels, 25 unused on open items, health score 25/100. Disproportionate for a repo with few open issues/PRs.
- **Impact**: Cognitive and computational tax on every workflow that reads labels.
- **Suggested Action**: 3 labels removed in label simplification (type:report, type:action-item, type:fix). Consider further pruning to target ≤20.

## Resolved (last 30 days)

### Label Taxonomy Simplified — Dropped type: Prefixes

- **Resolved**: 2026-02-23
- **Resolution**: Renamed `type:action-item` → `action-item`, merged `type:report` into existing `report` label, deleted dead `type:fix` label (zero issues). Updated all workflow prompts, governance docs, scripts, and Convex backend. Net reduction: 3 labels eliminated.

### SFL Auditor Missing Check — Merged PRs with Open Issues

- **Resolved**: 2026-02-22
- **Resolution**: Issue #76 was fixed by merged PR #79 but the issue stayed open. Root cause: no auditor step checked for merged agent PRs whose linked issues remain open. Added Step 6 ("merged PRs with issues left open") to sfl-auditor.md — the auditor now gathers recently merged `agent-fix/` PRs and closes any linked issue that was left open.

### Workflow Run Waste — 825 Runs from Redundant Crons

- **Resolved**: 2026-02-22
- **Resolution**: Removed cron triggers from 6 dispatcher-gated workflows (PR Analyzers A/B/C, PR Fixer, PR Promoter, Issue Processor). They now run ONLY when SFL Dispatcher detects work. SFL Auditor reduced from 2x/hour to 1x/hour. Estimated savings: ~288 wasted Copilot inference runs/day when idle. Also fixed PR Promoter dispatch call (pr-promoter.yml → pr-promoter.lock.yml).

### PR Analyzers A/B/C — Invalid Model Names

- **Resolved**: 2026-02-22
- **Resolution**: Updated to valid Copilot CLI model names: A→claude-sonnet-4.6, B→claude-opus-4.6, C→gpt-5.3-codex. (Note: B and C were swapped in the original fix; corrected 2026-02-25.)

### Missing Engine Blocks (PR Promoter, SFL Auditor, PR Fixer)

- **Resolved**: 2026-02-22
- **Resolution**: Added explicit `engine:` blocks. Empty model string was causing Copilot CLI auth failures.

### SFL Auditor Crashing — jq Word-Splitting Bug

- **Resolved**: 2026-02-22
- **Resolution**: Fixed bash word-splitting in orphaned PRs check.

### gh-aw Token Type Incompatibility

- **Resolved**: 2026-02-21
- **Resolution**: Workflows rewritten as standard GitHub Actions or gh-aw `.lock.yml` files.
