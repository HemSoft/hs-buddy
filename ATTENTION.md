# ATTENTION

> Auto-maintained by the debug skill. Last updated: 2026-02-22

## Active Concerns

### Label Complexity Exceeds Threshold

- **Severity**: Medium
- **Detected**: 2026-02-20
- **Status**: Partially resolved (2026-02-23)
- **Description**: 30 labels, 25 unused on open items, health score 25/100. Disproportionate for a repo with few open issues/PRs.
- **Impact**: Cognitive and computational tax on every workflow that reads labels.
- **Suggested Action**: 3 labels removed in label simplification (type:report, type:action-item, type:fix). Consider further pruning to target ≤20.

### SFL Auditor Intermittent Failures (Transient API Errors)

- **Severity**: Low
- **Detected**: 2026-02-22
- **Status**: Monitoring
- **Description**: SFL Auditor succeeds ~60% of runs. Failures are transient Copilot API errors ("Failed to get response from the AI model; Unknown error"), not config issues. Engine block and model are correct.
- **Impact**: Delayed label/PR state repair when a run fails. Next hourly run usually succeeds.
- **Suggested Action**: Monitor. If failure rate stays above 30%, investigate Copilot API health.

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
- **Resolution**: Updated to valid Copilot CLI model names: A→claude-sonnet-4.6, B→gpt-5.3-codex, C→claude-opus-4.6.

### Missing Engine Blocks (PR Promoter, SFL Auditor, PR Fixer)

- **Resolved**: 2026-02-22
- **Resolution**: Added explicit `engine:` blocks. Empty model string was causing Copilot CLI auth failures.

### SFL Auditor Crashing — jq Word-Splitting Bug

- **Resolved**: 2026-02-22
- **Resolution**: Fixed bash word-splitting in orphaned PRs check.

### gh-aw Token Type Incompatibility

- **Resolved**: 2026-02-21
- **Resolution**: Workflows rewritten as standard GitHub Actions or gh-aw `.lock.yml` files.
