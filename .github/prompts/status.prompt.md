---
mode: agent
description: Quick pipeline status — issues vs PRs, failed runs since last check.
---

# Pipeline Status Check

Quick status snapshot of the hs-buddy agentic loop.

---

## Step 1 — Read last checkpoint

Read the file `.github/prompts/.status-checkpoint` in the workspace root.
If it exists, it contains a single ISO 8601 timestamp (e.g. `2026-02-20T07:30:00Z`)
representing when this prompt last ran. Store it as `LAST_CHECK`.

If the file does not exist, set `LAST_CHECK` to 24 hours ago.

---

## Step 2 — Gather state

Run these queries:

1. **All open issues** with any `agent:*` label — get number, title, labels
2. **All open PRs** — get number, title, draft status, head branch name
3. **Workflow runs since `LAST_CHECK`** for each of:
   - `sfl-auditor.lock.yml`
   - `issue-processor.lock.yml`
   - `repo-audit.lock.yml`

   Get their conclusion (success / failure / cancelled) and timestamp.

---

## Step 3 — Report

Print a concise report:

```
## Status — <current date/time>
(last checked: <LAST_CHECK or "first run">)

### Issues & PRs
| Issue | Labels | Matching PR | OK? |
|-------|--------|-------------|-----|
| #N title | agent:in-progress | PR #M (draft) | ✅/❌ |

### Workflow Runs Since Last Check
| Workflow | Runs | Failed |
|----------|------|--------|
| SFL Auditor | N | 0 or list |
| Issue Processor | N | 0 or list |
| Repo Audit | N | 0 or list |

### Verdict: ✅ ALL GOOD | ⚠️ ISSUES FOUND
<one-line summary>
```

Rules for the Issues & PRs table:

- An `agent:in-progress` issue is ✅ if exactly one open PR exists with branch `agent-fix/issue-<number>-*`
- An `agent:fixable` issue is ✅ (waiting to be claimed — normal)
- An `agent:pause` or `agent:human-required` issue is ⚠️ — note it
- An `agent:in-progress` issue with no matching PR is ❌

If there are no agent-labeled issues, just say "No active agent issues."

Rules for the Workflow Runs table:

- Show total runs and any with `conclusion != success`
- If a workflow has 0 runs since last check, note it as "(no runs)"
- List the run ID of any failures

### Verdict

- **ALL GOOD** if: every in-progress issue has a PR, and zero workflow failures
- **ISSUES FOUND** otherwise, with a one-line summary of what's wrong

---

## Step 4 — Update checkpoint

Write the current UTC timestamp (ISO 8601) to `.github/prompts/.status-checkpoint`,
replacing any previous content. This file is gitignored.

---

## Notes

- Do NOT apply fixes or make changes — this is a read-only status check
- For deeper investigation or fixes, use the `health` prompt instead
- Keep the output brief — no more than ~30 lines
