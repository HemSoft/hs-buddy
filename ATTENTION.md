# ATTENTION

> Auto-maintained by the debug skill. Last updated: 2026-02-22

## Active Concerns

### SFL Auditor Crashing — jq Word-Splitting Bug in Orphaned PRs Check

- **Severity**: Critical
- **Detected**: 2026-02-22
- **Status**: Fix applied locally, pending commit & push
- **Description**: `sfl-auditor.yml` step "Check: orphaned agent PRs" used `for ROW in $(jq -c '.[]' ...)` which bash word-splits on spaces in PR titles. Every run fails with `jq: parse error: Unfinished string at EOF`.
- **Impact**: SFL Auditor cannot complete — orphaned labels, conflicting labels, and orphaned PRs are not being detected or repaired.
- **Suggested Action**: Commit and push the fix (already applied in working tree), then monitor next cron run.

### Label Complexity Exceeds Threshold

- **Severity**: Medium
- **Detected**: 2026-02-20
- **Status**: Active
- **Description**: 30 labels, 25 unused on open items, health score 25/100. Disproportionate for a repo with 7 open issues and 4 open PRs.
- **Impact**: Cognitive and computational tax on every workflow that reads labels.
- **Suggested Action**: Run `label-audit.ps1` and prune unused labels. Target ≤20.

## Resolved (last 30 days)

### gh-aw Token Type Incompatibility

- **Resolved**: 2026-02-21
- **Resolution**: pr-promoter.yml and sfl-auditor.yml rewritten as standard GitHub Actions workflows. Issue-processor, repo-audit, and all analyzers now run successfully via gh-aw `.lock.yml` files. Old `.lock.yml.disabled` files retained as reference.

### PR Body Bloat (PRs #8, #10)

- **Resolved**: 2026-02-22
- **Resolution**: Both PRs merged successfully. No longer an issue.

### Issue #26 with Incorrect `agent:pr` Label

- **Resolved**: 2026-02-22
- **Resolution**: Label was cleaned up. Issue #26 now correctly has `agent:in-progress` with matching PR #53.

### Two Draft PRs #8/#10 Stuck

- **Resolved**: 2026-02-22
- **Resolution**: Both PRs were promoted and merged.

### Marker Format Migration (HTML comments → visible markers)

- **Resolved**: 2026-02-21
- **Resolution**: Analyzer outputs now include `[MARKER:pr-analyzer-<a|b|c> cycle:N]` tags in PR bodies. Legacy HTML comment marker dependency is removed.
