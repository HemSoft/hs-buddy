# SFL Constraints & Known Limitations

Known constraints discovered through operational experience. Update this file
whenever a new constraint is discovered or an existing one is resolved.

---

## Agentic Workflow Constraints

### 1. Agentic Cannot Trigger Agentic

**Discovered**: 2026-02 (initial architecture)

An agentic workflow's safe-output (e.g., `create-pull-request`) does NOT
trigger other agentic workflows that listen on the same event. For example,
`sfl-issue-processor` creates a draft PR, but `sfl-analyzer-a/b/c` (which listen
on `pull_request: opened`) are not triggered by that creation.

**Workaround**: Use explicit `dispatch-workflow` handoffs inside the hot path
and direct event triggers for issue intake.

**Impact**: The loop must be authored carefully so every next step is explicit,
but failures freeze in place instead of being mutated by a polling recovery pass.

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
`agent:fixable` issues, they are still processed one at a time across 10 runs.

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

### 12. create_pull_request Creates New Branches — But push-to-pull-request-branch Exists

**Discovered**: 2026-02-28 | **Corrected**: 2026-02-28

The `create_pull_request` safe-output creates a new branch with a random
suffix. However, the platform also provides `push-to-pull-request-branch`
which can push changes to an **existing** PR's branch. This was missed in
the initial constraint discovery because only existing code was inspected
instead of the official gh-aw documentation.

**Original (wrong) impact**: Assumed agents could never push to existing
branches, forcing the supersession model with PR chains.

**Corrected impact**: Agents CAN push to existing PR branches using
`push-to-pull-request-branch`. This eliminates the need for supersession
chains, cumulative cycle tracking, and PR close/open flows. The fixer can
push fixes directly to the PR it's fixing.

**Lesson**: Always verify platform constraints against official documentation
(`https://github.github.com/gh-aw/reference/safe-outputs/`), not just
existing code.

### 13. Agent Job Has Read-Only Permissions — Safe-Output Jobs Get Write

**Discovered**: 2026-02-28 | **Corrected**: 2026-02-28

The agent job runs with read-only permissions. Write operations are performed
by separate safe-output jobs that DO have write permissions (`contents: write`,
`pull-requests: write`, `issues: write` etc). Setting `contents: write` in
frontmatter `permissions:` doesn't grant it to the agent — but safe-output
jobs like `create-pull-request` and `push-to-pull-request-branch` get it
automatically.

**Original (wrong) impact**: Assumed `contents: write` was categorically
blocked. This led to abandoning the idea of pushing to existing branches.

**Corrected impact**: This is working as designed. Agents request actions
via structured output; separate permission-controlled jobs execute them.

---

## Available Safe-Output Types (Verified 2026-02-28)

Source: `https://github.github.com/gh-aw/reference/safe-outputs/`

This is the **complete** list of safe-output types available in gh-aw.
Previously, SFL only used a small subset. Capabilities marked ★ are
newly discovered and available for use.

### Issues & Discussions

| Type | Description | Max |
|------|-------------|-----|
| `create-issue` | Create GitHub issues | 1 |
| `update-issue` | Update status, title, body (append/prepend/replace/replace-island) | 1 |
| `close-issue` | Close issues with comment and state reason | 1 |
| ★ `link-sub-issue` | Link issues as parent-child sub-issues | 1 |
| `create-discussion` | Create GitHub discussions | 1 |
| `update-discussion` | Update discussion title, body, labels | 1 |
| ★ `close-discussion` | Close discussions with comment and resolution | 1 |

### Pull Requests

| Type | Description | Max |
|------|-------------|-----|
| `create-pull-request` | Create PRs with code changes (always new branch) | 1 |
| ★ `update-pull-request` | Update PR title or body (append/prepend/replace) | 1 |
| ★ `close-pull-request` | Close PRs without merging, filterable by labels/prefix | 10 |
| ★ `create-pull-request-review-comment` | Code-line review comments, buffered as PR review | 10 |
| ★ `reply-to-pull-request-review-comment` | Reply to existing review comments | 10 |
| ★ `resolve-pull-request-review-thread` | Resolve review threads | 10 |
| ★ `push-to-pull-request-branch` | Push changes to existing PR branch | 1 |

### Labels, Assignments & Comments

| Type | Description | Max |
|------|-------------|-----|
| ★ `add-comment` | Post comments on issues, PRs, or discussions | 1 |
| ★ `hide-comment` | Hide/minimize comments (requires GraphQL node IDs) | 5 |
| ★ `add-labels` | Add labels without replacing existing ones | 3 |
| ★ `remove-labels` | Remove specific labels | 3 |
| ★ `add-reviewer` | Add reviewers to PRs | 3 |
| ★ `assign-milestone` | Assign issues to milestones | 1 |
| ★ `assign-to-agent` | Assign Copilot coding agent to issues/PRs | 1 |
| ★ `assign-to-user` | Assign users to issues | 1 |
| ★ `unassign-from-user` | Remove user assignments | 1 |

### Infrastructure

| Type | Description | Max |
|------|-------------|-----|
| ★ `dispatch-workflow` | Trigger other workflows (same repo only) | 3 |
| ★ `upload-asset` | Upload files to orphaned git branch | 10 |
| ★ `create-agent-session` | Spawn new Copilot coding agent sessions | 1 |
| `noop` | Log completion (auto-enabled) | 1 |
| `missing-tool` | Report missing tools (auto-enabled) | ∞ |
| `missing-data` | Report missing data (auto-enabled) | ∞ |

### Key Unlocks for SFL

1. **`push-to-pull-request-branch`** — Eliminates PR chain explosion. Fixer
   can push fixes to existing PR instead of creating new PRs each cycle.
2. **`add-comment`** — Analyzers/promoter can leave comments on PRs/issues
   instead of only writing to the body. Cleaner than body-append.
3. **`add-labels` / `remove-labels`** — Granular label operations. Unlike
   `update-issue` labels (which replaces ALL), these add/remove individually.
4. **`close-pull-request`** — Can close PRs with comment. Promoter can close
   failed PRs cleanly.
5. **`dispatch-workflow`** — Agentic workflows CAN trigger other workflows
   via this safe-output (same repo only, max 3). Potential dispatcher replacement.

---

## Adding New Constraints

When you discover a new constraint:

1. Add it here with a descriptive title
2. Include: when it was discovered, what the impact is, and any workaround
3. If it was discovered during a debug session, cross-reference the
   `docs/lessons.md` entry
4. **Always verify against official docs** at
   `https://github.github.com/gh-aw/reference/safe-outputs/` —
   never assume from existing code alone
