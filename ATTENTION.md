# ATTENTION

> Auto-maintained by the debug skill. Last updated: 2026-02-20

## Active Concerns

### Marker Format Migration In Progress

- **Severity**: Critical
- **Detected**: 2026-02-20
- **Status**: Monitoring
- **Description**: PR analyzers were producing HTML comment markers (`<!-- pr-analyzer-a cycle:0 -->`) that LLMs strip from output. Changed to visible `[MARKER:pr-analyzer-a cycle:N]` format in commit ff8e5a4. Awaiting confirmation that new cron cycles produce correct markers.
- **Impact**: PRs #8 and #10 are stuck in infinite analyzer loops (13+ runs, zero progression). Pipeline is effectively stalled until markers work.
- **Suggested Action**: After 2-3 cron cycles, run `marker-check.ps1` to verify new format is being produced. If still failing, check runtime-import mechanism.

### PR Body Bloat from Duplicate Reviews

- **Severity**: High
- **Detected**: 2026-02-20
- **Status**: Active
- **Description**: PR #8 body has grown to 36KB+ because analyzers re-appended reviews on every run without finding their skip markers. PR #10 similarly affected.
- **Impact**: Large PR bodies slow down API calls, confuse human reviewers, and waste LLM tokens on every subsequent workflow that reads the body.
- **Suggested Action**: Once markers are working, consider a one-time body cleanup on stuck PRs — or close and re-create them with fresh bodies.

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
- **Description**: PRs #8 (README package manager fix) and #10 (hardcoded Windows paths) have accumulated 13+ duplicate review cycles with no progression. Even after the marker fix, the bloated bodies may confuse future analyzer runs.
- **Impact**: If markers work but analyzers re-read old duplicate content, they may produce inconsistent verdicts.
- **Suggested Action**: If marker fix resolves the progression issue, monitor one full cycle. If bodies still cause problems, close PRs, delete branches, remove `agent:in-progress` from issues (revert to `agent:fixable`), and let the pipeline re-create clean PRs.

## Resolved (last 30 days)

_None yet — this is the first ATTENTION.md entry._
