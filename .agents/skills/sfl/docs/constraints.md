# SFL Constraints & Known Limitations

Known constraints discovered through operational experience. Update this file
whenever a new constraint is discovered or an existing one is resolved.

---

## Agentic Workflow Constraints

### 1. Agentic Cannot Trigger Agentic

**Discovered**: 2026-02 (initial architecture)

An agentic workflow's safe-output (e.g., `create-pull-request`) does NOT
trigger other agentic workflows that listen on the same event. For example,
`issue-processor` creates a draft PR, but `pr-analyzer-a/b/c` (which listen
on `pull_request: opened`) are not triggered by that creation.

**Workaround**: The `sfl-dispatcher` (standard YAML) polls every 30 minutes
and explicitly dispatches agentic workflows via `gh workflow dispatch`.

**Impact**: Forces at least one intermediary standard YAML workflow. Adds
latency (up to 30 minutes between issue claim and first analyzer run).

### 2. Safe-Output Max Limits

Each safe-output type has a `max` count per run. If the workflow tries to
exceed it, the run fails. This is a hard limit, not a soft warning.

**Mitigation**: Set `max` values conservatively. If a workflow legitimately
needs to create many entities, consider splitting the work across runs.

### 3. Lock File is Auto-Generated

The `.lock.yml` file is produced by `gh aw compile` and must never be
hand-edited. All changes go through the `.md` prompt file.

**Exception**: The `agentics-maintenance.yml` is also auto-generated when
any workflow uses `expires` in safe-outputs.

### 4. Model Availability

If the pinned model in `engine.model` becomes unavailable or is deprecated,
the workflow will fail. Models should be monitored for deprecation notices.

### 5. Safe-Output Entity Size Limits

PR bodies, issue bodies, and comment content have GitHub API size limits.
If a workflow tries to write content exceeding these limits, the API call
fails silently or is truncated.

**Practical limit**: ~65,000 characters for PR body. Workflows that accumulate
content across cycles (like analyzer reviews) must summarize rather than
append.

---

## Operational Constraints

### 6. Single Issue Processing

The `issue-processor` handles exactly one issue per run. If there are 10
`agent:fixable` issues, it takes 10 separate runs (~5 hours at 30-min
intervals) to process all of them.

**Rationale**: Prevents resource exhaustion and makes debugging tractable.

### 7. Cycle Cap

PRs have an implicit cycle cap based on retry policy (see governance doc).
If a PR hasn't converged after the allowed cycles, it should be escalated
or closed.

### 8. Token Scope Requirements

The `GH_AW_GITHUB_TOKEN` secret needs sufficient scopes for all dispatched
workflows. Missing scopes manifest as permission errors in workflow runs.

### 9. Schedule Overlap Risk

Multiple cron-scheduled workflows can overlap if their execution time exceeds
the interval. Concurrency guards prevent this, but only within the same
workflow — they don't prevent cross-workflow contention for shared state
(labels, PR body).

---

## GitHub Platform Constraints

### 10. Workflow Dispatch Rate Limits

GitHub has rate limits on workflow dispatches. The dispatcher should not
dispatch more than necessary — check before dispatch, don't dispatch
speculatively.

### 11. API Rate Limits

All `gh` CLI calls count against the repo's rate limit. Scripts that poll
frequently or list many entities should be mindful of this.

---

## Adding New Constraints

When you discover a new constraint:

1. Add it here with a descriptive title
2. Include: when it was discovered, what the impact is, and any workaround
3. If it was discovered during a debug session, cross-reference the
   `docs/lessons.md` entry
