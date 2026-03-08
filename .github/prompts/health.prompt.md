---
description: Audit the health of the hs-buddy agentic pipeline. Checks that GitHub Actions, Issues, and PRs are in harmony per AGENTS.md and the SFL skill. Always apply Standing Orders from AGENTS.md.
---

# Pipeline Health Check

You are auditing the **hs-buddy agentic loop**. The single mission is:
**GitHub Actions, GitHub Issues, and GitHub Pull Requests must be in perfect harmony at all times.**

Read `AGENTS.md` and `.agents/skills/sfl/SKILL.md` before proceeding to ensure you have the current Standing Orders.

---

## Step 1 — Gather state

Run these queries in parallel:

1. **Open issues** with any agent label: `agent:fixable`, `agent:in-progress`, `agent:pause`, `agent:human-required`
2. **All open PRs** (including draft) with branch names matching `agent-fix/*`
3. **Recent workflow runs** (last 5) for each of:
   - `sfl-auditor.lock.yml`
   - `sfl-issue-processor.lock.yml`
   - `repo-audit.lock.yml`
   - `sfl-analyzer-a.lock.yml`
   - `sfl-analyzer-b.lock.yml`
   - `sfl-analyzer-c.lock.yml`
   - `sfl-pr-router.yml`
   - `sfl-pr-label-actions.yml`
4. **Open issues** with labels `agent:pause` or `agent:escalated` that mention workflow failures

---

## Step 2 — Evaluate harmony

Check every harmony condition from the current repo guidance (`AGENTS.md`) and SFL docs:

| Check | Pass Condition |
|-------|----------------|
| **A. In-progress ↔ PR** | Every `agent:in-progress` issue has exactly one open PR whose branch matches `agent-fix/issue-<number>-*` |
| **B. No conflicting labels** | No issue has both `agent:in-progress` AND `agent:fixable` simultaneously |
| **C. No unexplained pauses** | No `agent:pause` issue exists without a comment explaining the pause |
| **D. No orphaned PRs** | No open `agent-fix/` PR exists whose linked issue is closed or lacks `agent:in-progress` |
| **E. No stale fixable issues** | No `agent:fixable` issue has been open longer than ~1 hour without being claimed |
| **F. PR cycle integrity** | Every draft PR with `agent:pr` has a valid `pr:cycle-N` label (0 ≤ N ≤ 3); no PR has multiple cycle labels |
| **G. No stuck PRs** | No draft `agent:pr` PR has been at the same cycle for more than 3 hours (analyzers + router + implementer should advance it within ~1h) |
| **H. Idempotency markers** | No PR has duplicate analyzer or implementer markers for the same cycle |
| **I. Promoted PRs are non-draft** | Every PR with `human:ready-for-review` label is NOT a draft |

For each check, state: ✅ Pass / ❌ Fail / ⚠️ Warning — and list the specific issue/PR numbers when failing.

---

## Step 3 — Evaluate SFL Auditor health

The SFL Auditor (`sfl-auditor.lock.yml`) is the health guardian. Evaluate:

- Did the last run **succeed** (conclusion: `success`)?
- Did it produce **safe outputs** (no "no safe outputs" warning in associated issues)?
- Is it running on schedule (`15,45 * * * *`) — i.e., was the last run within the last 46 minutes?
- Are there any open `agent:pause` / `agent:escalated` issues pointing at `sfl-auditor` failures?

State: ✅ Healthy / ❌ Failing / ⚠️ Degraded — with specific run IDs and failure reasons.

---

## Step 4 — Evaluate other workflow health

For each of `sfl-issue-processor.lock.yml`, `repo-audit.lock.yml`, `sfl-analyzer-a.lock.yml`,
`sfl-analyzer-b.lock.yml`, `sfl-analyzer-c.lock.yml`, `sfl-pr-router.yml`, and `sfl-pr-label-actions.yml`:

- Last run conclusion (success/failure/cancelled)
- Last run timestamp
- Any open `agent:pause` / `agent:escalated` workflow-failure issues linked to it
- Whether the workflow ran on schedule (check cron vs last-run gap)

---

## Step 5 — Report

Produce a concise health report in this format:

```
## Pipeline Health Report — <timestamp>

### Overall Status: ✅ HEALTHY | ⚠️ DEGRADED | ❌ UNHEALTHY

### Harmony Checks
| Check | Status | Details |
|-------|--------|---------|
| A. In-progress ↔ PR | ✅/❌/⚠️ | ... |
| B. No conflicting labels | ✅/❌/⚠️ | ... |
| C. No unexplained pauses | ✅/❌/⚠️ | ... |
| D. No orphaned PRs | ✅/❌/⚠️ | ... |
| E. No stale fixable issues | ✅/❌/⚠️ | ... || F. PR cycle integrity | ✅/❌/⚠️ | ... |
| G. No stuck PRs | ✅/❌/⚠️ | ... |
| H. Idempotency markers | ✅/❌/⚠️ | ... |
| I. Promoted PRs non-draft | ✅/❌/⚠️ | ... |
### SFL Auditor
- Last run: <run ID> at <time> — <conclusion>
- Safe outputs: ✅/❌
- On schedule: ✅/❌
- Open failure issues: none | #<numbers>

### Issue Processor
- Last run: <run ID> at <time> — <conclusion>
- Open failure issues: none | #<numbers>

### Repo Audit
- Last run: <run ID> at <time> — <conclusion>
- Open failure issues: none | #<numbers>

### PR Analyzers (A / B / C)
- Analyzer A last run: <run ID> at <time> — <conclusion>
- Analyzer B last run: <run ID> at <time> — <conclusion>
- Analyzer C last run: <run ID> at <time> — <conclusion>
- Open failure issues: none | #<numbers>

### PR Router
- Last run: <run ID> at <time> — <conclusion>
- Open failure issues: none | #<numbers>

### PR Label Actions
- Last run: <run ID> at <time> — <conclusion>
- Open failure issues: none | #<numbers>

### Action Items
<list any failures found, in priority order>
```

---

## Step 6 — Apply Standing Orders

**After reporting**, apply the Standing Orders from `AGENTS.md` and `.agents/skills/sfl/SKILL.md`:

1. **If the SFL Auditor is failing** — diagnose and fix it immediately, before addressing any harmony failures. A broken auditor is always the top priority.

2. **For each harmony failure found** — do NOT silently fix it. Instead:
   - Apply any urgent manual fix (e.g., reset orphaned `agent:in-progress` label)
   - Identify which SFL Auditor check should have caught this
   - **Propose a specific improvement to `sfl-auditor.md`** — state the check that's missing and the exact change you would make
   - Wait for user approval before committing the auditor change

3. **For each workflow failure** — pull the run log and diagnose the root cause. Present findings to the user with a proposed fix.

4. **If everything is healthy** — confirm harmony is intact and no action is needed.

---

## Known Transient Failures

The following failure patterns are **known transient LLM API issues** — not pipeline bugs.
When evaluating workflow health, downgrade these to ⚠️ (not ❌) and note them as known.

- **`missing finish_reason for choice 0`** — The Copilot CLI crashes after completing
  all substantive work when the LLM API returns an incomplete response during summary
  generation. Zero state impact (no mislabeled issues, no orphaned branches). The
  `.lock.yml` is auto-generated by `gh aw compile` and does not expose retry options.
  No action needed — monitor for recurrence.
