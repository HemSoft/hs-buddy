# ATTENTION

> Auto-maintained by the debug skill. Last updated: 2026-02-21

## Active Concerns

### Promoter Cannot Reliably Un-Draft Existing PRs

- **Severity**: Critical
- **Detected**: 2026-02-20
- **Status**: Active
- **Description**: Promoter logs show successful analyzer detection and even `create_pull_request` success messages, but PR #8/#10 remain draft. Evidence indicates `create_pull_request` safe output is not a reliable mechanism for converting an existing draft PR to ready-for-review in this environment.
- **Impact**: PRs can satisfy analyzer PASS conditions and still never reach human review, causing permanent draft-state deadlock.
- **Suggested Action**: Redesign promotion semantics: treat `agent:promoted` + linked issue `agent:review-requested` as the canonical handoff signal, and stop requiring draft-status flip as the only success condition.

### PR Body Bloat from Duplicate Reviews

- **Severity**: High
- **Detected**: 2026-02-20
- **Status**: Active
- **Description**: PR #8 body has grown to 61KB+ because analyzers re-appended reviews repeatedly before idempotency stabilized. PR #10 is clean by comparison.
- **Impact**: Large PR bodies slow down API calls, confuse human reviewers, and waste LLM tokens on every subsequent workflow that reads the body.
- **Suggested Action**: Once markers are working, consider a one-time body cleanup on stuck PRs — or close and re-create them with fresh bodies.

### Issue-Processor Failure Path Creates PR-Labeled Issues

- **Severity**: High
- **Detected**: 2026-02-21
- **Status**: Active
- **Description**: Issue #26 (`[agent-fix] Update .gitignore...`) is an issue, not a PR, but carries `agent:pr` and `type:fix`. Its body shows a push/create-PR failure fallback path from issue-processor.
- **Impact**: State model pollution: PR-only labels appear on issues, confusing status checks and any workflow logic that assumes `agent:pr` implies pull request semantics.
- **Suggested Action**: In issue-processor failure fallback, use `agent:pause` or `agent:human-required` labels instead of `agent:pr`; add SFL Auditor check to auto-detect issues with `agent:pr` and normalize labels.

### Label Complexity Reaching Threshold

- **Severity**: Medium
- **Detected**: 2026-02-20
- **Status**: Active
- **Description**: 30 labels across 7+ categories (agent, pr, risk, type, source, plus GitHub defaults). For a repo with 2 open issues and 2 open PRs, this is disproportionate overhead. Every workflow that reads labels pays a cognitive and computational tax.
- **Impact**: New workflows require understanding the full label taxonomy. Mistakes in label transitions cause state machine violations that the SFL Auditor must repair. Complexity breeds bugs.
- **Suggested Action**: Run `label-audit.ps1` to identify unused labels. Target reduction to ≤20 labels. Consider merging `risk:` levels from 5 to 3. Question whether `source:` and `type:` categories are earning their existence.

### Two Draft PRs May Need Reset

- **Severity**: Medium
- **Detected**: 2026-02-20
- **Status**: Monitoring
- **Description**: PRs #8 (README package manager fix) and #10 (hardcoded Windows paths) have all analyzer PASS markers but remain draft after repeated promoter runs.
- **Impact**: If markers work but analyzers re-read old duplicate content, they may produce inconsistent verdicts.
- **Suggested Action**: If marker fix resolves the progression issue, monitor one full cycle. If bodies still cause problems, close PRs, delete branches, remove `agent:in-progress` from issues (revert to `agent:fixable`), and let the pipeline re-create clean PRs.

## Resolved (last 30 days)

### Marker Format Migration (HTML comments → visible markers)

- **Resolved**: 2026-02-21
- **Resolution**: Analyzer outputs now include `[MARKER:pr-analyzer-<a|b|c> cycle:N]` tags in PR bodies. Legacy HTML comment marker dependency is removed.
