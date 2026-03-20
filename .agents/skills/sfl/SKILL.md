---
name: sfl
description: "V2.0 - Commands: Explain, Debug, Audit, Report, Status, Simplicity, Memory, pr-approve, create-issue. Expert in hs-buddy's Set it Free Loop \u2014 GitHub agentic workflow architecture, debugging, auditing, status reporting, and operational health. Consolidates audit, debug, and status capabilities into one skill. Use when creating, modifying, debugging, or auditing SFL workflows, checking pipeline state, or running status reports."
hooks:
  PostToolUse:
    - matcher: "Read|Write|Edit"
      hooks:
        - type: prompt
          prompt: |
            If a file was read, written, or edited in the sfl directory (path contains 'skills/sfl'), verify that history logging occurred.

            Check if History/{YYYY-MM-DD}.md exists and contains an entry for this interaction with:
            - Format: "## HH:MM - {Action Taken}"
            - One-line summary
            - Accurate timestamp (obtained via `Get-Date -Format "HH:mm"` command, never guessed)

            If history entry is missing or incomplete, provide specific feedback on what needs to be added.
            If history entry exists and is properly formatted, acknowledge completion.
  Stop:
    - matcher: "*"
      hooks:
        - type: prompt
          prompt: |
            Before stopping, if sfl was used (check if any files in sfl directory were modified), verify that the interaction was logged:

            1. Check if History/{YYYY-MM-DD}.md exists in sfl directory
            2. Verify it contains an entry with format "## HH:MM - {Action Taken}" where HH:MM was obtained via `Get-Date -Format "HH:mm"` (never guessed)
            3. Ensure the entry includes a one-line summary of what was done

            If history entry is missing:
            - Return {"decision": "block", "reason": "History entry missing. Please log this interaction to History/{YYYY-MM-DD}.md with format: ## HH:MM - {Action Taken}\n{One-line summary}\n\nCRITICAL: Get the current time using `Get-Date -Format \"HH:mm\"` command - never guess the timestamp."}

            If history entry exists:
            - Return {"decision": "approve"}

            Include a systemMessage with details about the history entry status.
---

# SFL — Set it Free Loop

Expert skill for the GitHub agentic workflow system that powers hs-buddy's
autonomous quality loop. This is a consolidated skill — it supersedes the
former `audit`, `debug`, and `status` skills.

---

## Hands-Off Prime Directive

**Never manually nudge the SFL pipeline.** The system must prove itself autonomously.

- Do NOT manually dispatch workflows, flip labels, un-draft PRs, or merge PRs to "help" the pipeline.
- If something isn't working, fix the workflow prompt/logic — don't work around it.
- The only permitted manual actions are: config changes (`sfl-config.yml`), enabling/disabling workflows during rollout, and human code review when required.
- This applies to both interactive sessions and automated agents.

---

## Capabilities

When asked "what can you do?", answer from this list:

| # | Capability | Sub-skill | Quick reference |
|---|------------|-----------|-----------------|
| 1 | **Explain architecture** — workflow types, state machine, safe-outputs, models | [Architecture](#architecture) | [docs/architecture.md](docs/architecture.md) |
| 2 | **Debug the pipeline** — stuck PRs, failing workflows, label inconsistencies | [Debugging](#debugging) | [docs/debugging.md](docs/debugging.md) |
| 3 | **Audit the pipeline** — exhaustive pass/fail health checks, phantom issues | [Auditing](#auditing) | [docs/auditing.md](docs/auditing.md) |
| 4 | **Report pipeline status** — checkpointed status, verdicts, failure summaries | [Status](#status) | [docs/status.md](docs/status.md) |
| 5 | **Guard simplicity** — complexity assessment, anti-patterns, architectural watchdog | [Simplicity](#simplicity) | [docs/constraints.md](docs/constraints.md) |
| 6 | **Remember & reflect** — lessons learned, constraint discoveries, self-improvement | [Memory](#memory) | [docs/lessons.md](docs/lessons.md) |
| 7 | **Approve PR command** — submit an approval review by PR number | [Debugging](#debugging) | [scripts/pr-approve.ps1](scripts/pr-approve.ps1) |
| 8 | **Create SFL issue command** — create labeled issues from text or TODO context | [Debugging](#debugging) | [scripts/create-issue.ps1](scripts/create-issue.ps1) |

Every capability maps to one sub-skill section below. Each sub-skill owns its
scripts, its docs page, and its rules.

---

## Preflight

**Run these checks before ANY `gh` or debug command.** Skipping preflight
is the #1 cause of confusing errors in SFL sessions.

### 1. Auth Check

```powershell
# Ensures the correct gh account is active for the target repo
& ".agents/skills/sfl/scripts/ensure-auth.ps1"
# For a different repo:
& ".agents/skills/sfl/scripts/ensure-auth.ps1" -Repo "relias-engineering/set-it-free-loop"
```

The agent has 4 gh accounts. Each org requires a specific one:

| Org | Required Account |
|-----|------------------|
| `relias-engineering` | `fhemmerrelias` |
| `HemSoft` | `HemSoft` |
| `franzhemmer` | `franzhemmer` |
| `fhemmer2-relias` | `fhemmer2-relias` |

### 2. Use Scripts, Not Ad-Hoc Commands

**Never manually construct `gh run view | grep` pipelines.** There is almost
certainly a script for what you need. Check the [All Scripts Reference](#all-scripts-reference)
section below. If a script is missing, **create it** before proceeding.

### 3. Session Start Gate

Before modifying any SFL workflow:

```powershell
& ".agents/skills/sfl/scripts/health-check.ps1"
```

This verifies workflow count (≤14), label count (≤25), and other ceilings.

---

## Architecture

> Deep reference: [docs/architecture.md](docs/architecture.md)

The Set it Free Loop is a **minimal, autonomous pipeline** that:

1. **Detects** quality findings via scheduled audits (repo-audit, simplisticate)
2. **Groups** findings into actionable issues (discussion-processor)
3. **Implements** one issue at a time and either opens or advances its draft PR (sfl-issue-processor)
4. **Reviews** the PR with three independent AI models (sfl-analyzer-a/b/c)
5. **Loops** back through the implementer until the current cycle is clean
6. **Aggregates** analyzer verdicts via label-actions and promotes clean PRs to ready-for-review when all analyzers PASS
7. **Hands off** clean PRs for human review and merge decision

### Two Workflow Types

| Type | Files | Compilation | Example |
|------|-------|-------------|---------|
| **Agentic** | `.md` prompt + `.lock.yml` compiled | `gh aw compile` | sfl-issue-processor, sfl-analyzer-a/b/c |
| **Standard** | `.yml` only | N/A | sfl-pr-label-actions (`SFL PR Label Actions`) |

**Key constraint**: Agentic workflows use `safe-outputs` for all mutations
and **cannot directly trigger other agentic workflows** via events. The
loop now relies on explicit `dispatch-workflow` handoffs where needed. However, agentic workflows CAN use the
`dispatch-workflow` safe-output to trigger other workflows in the same repo.

> **Important**: Always verify available safe-output types against official docs
> at `https://github.github.com/gh-aw/reference/safe-outputs/` — never assume
> from existing code. See [docs/constraints.md](docs/constraints.md) for the
> complete inventory of 25+ available types.

### Workflow Inventory

| Workflow | Type | Schedule/Trigger | Purpose |
|----------|------|------------------|---------|
| `sfl-auditor` | Agentic | `:15 * * * *` | Repairs issue↔PR label discrepancies |
| `daily-repo-status` (`SFL Repo Status`) | Agentic | Daily | Produces status report Discussion |
| `repo-audit` (`Repo Audit`) | Agentic | Daily | Finds code quality issues → Discussion |
| `simplisticate` | Agentic | Daily | Finds simplification opportunities → Discussion |
| `discussion-processor` (`SFL Discussion Processor`) | Agentic | `discussion: labeled` | Groups Discussion findings → `agent:fixable` issues |
| `sfl-issue-processor` | Agentic | `issues: opened/reopened` + Analyzer C dispatch | Single implementer: creates or advances the draft PR for one issue |
| `sfl-analyzer-a` | Agentic | `pull_request: opened` | Starts the sequential A -> B -> C review chain (claude-sonnet-4.6) |
| `sfl-analyzer-b` | Agentic | Analyzer A dispatch | Continues the sequential review chain (gemini-3-pro-preview) |
| `sfl-analyzer-c` | Agentic | Analyzer B dispatch | Finishes the sequential review chain and dispatches label-actions for verdict aggregation (gpt-5.4) |
| `sfl-pr-label-actions` (`SFL PR Label Actions`) | Standard | Analyzer C dispatch / manual dispatch | Deterministic aggregator: checks labels, flips draft → ready or dispatches issue-processor for fix cycle |
| `agentics-maintenance` | Standard | Daily | Auto-generated: closes expired safe-output entities |

### Model Configuration

Models are pinned in `sfl.json` at the repo root. To change a model: update
`sfl.json`, recompile with `gh aw compile`.

### Deterministic Patterns

The SFL pipeline uses two key deterministic patterns from the gh-aw platform
to reduce non-deterministic surface area:

1. **Precomputation Steps** — Deterministic shell `steps:` blocks that run BEFORE
   the AI agent. These fetch data via GitHub API / GraphQL and write structured
   JSON to `/tmp/gh-aw/agent/`. The agent reads this pre-computed data rather
   than constructing API queries at runtime. Files placed in this directory are
   auto-uploaded as artifacts and accessible to the agent during execution.

2. **Deterministic Fallback Jobs** — Post-agent `jobs:` blocks (`needs: [agent]`,
   `if: "(!cancelled())"`) that check the agent's NDJSON output artifact and
   perform fallback actions if the agent failed to do so. These use
   `actions/download-artifact@v4` to read agent output, then verify whether
   expected safe-output entries (like `dispatch_workflow`) were emitted.

   Example: Analyzers C and the issue-processor both have `ensure-label-actions-dispatch`
   fallback jobs that dispatch `sfl-pr-label-actions` if the agent didn't.

### Review Thread Resolution Flow

When PR Label Actions detects all 3 analyzers passed but unresolved review
threads exist (e.g., from `copilot-pull-request-reviewer[bot]` or human
reviewers), it dispatches `sfl-issue-processor` with the PR number via the
`review-comments-pending` path.

The issue-processor handles this with a 3-layer deterministic approach:

1. **Precomputation** — A shell step fetches all unresolved threads via GraphQL
   and writes structured data to `/tmp/gh-aw/agent/review-threads.json`
2. **Agent execution** — The agent reads the JSON, addresses each thread (code
   fix or explanation), calls `reply_to_pull_request_review_comment` and
   `resolve_pull_request_review_thread` safe outputs with exact IDs from the
   pre-computed data
3. **Deterministic fallback** — The `ensure-label-actions-dispatch` job verifies
   threads are resolved and dispatches `sfl-pr-label-actions` if the agent didn't

This ensures the pipeline never gets stuck on unresolved review threads.

### Safe Outputs Quick Reference

| Safe Output | Purpose | Typical Max |
|-------------|---------|-------------|
| `create_pull_request` | Create a new draft PR | 1 |
| `push_to_pull_request_branch` | Push commits to existing PR branch | 1 |
| `add_comment` | Comment on issue/PR/discussion | 1 |
| `add_labels` / `remove_labels` | Manage labels granularly | 3 each |
| `reply_to_pull_request_review_comment` | Reply to review comment | 10 |
| `resolve_pull_request_review_thread` | Mark review thread resolved | 10 |
| `dispatch_workflow` | Trigger another workflow | 3 |
| `mark_pull_request_as_ready_for_review` | Convert draft to ready | 1 |

### gh-aw Platform Reference

| Resource | URL |
|----------|-----|
| Safe Outputs Spec | `https://github.github.com/gh-aw/reference/safe-outputs-specification/` |
| Custom Safe Outputs | `https://github.github.com/gh-aw/reference/custom-safe-outputs/` |
| Deterministic Patterns | `https://github.github.com/gh-aw/guides/deterministic-agentic-patterns/` |

---

## Debugging

> Deep reference: [docs/debugging.md](docs/debugging.md)

Use when the pipeline is stuck, a PR isn't progressing, or a workflow produces
unexpected output.

### Scripts

```powershell
# Full ecosystem snapshot (issues, PRs, labels, recent runs)
& ".agents/skills/sfl/scripts/debug/snapshot.ps1"

# Deep-dive a specific PR
& ".agents/skills/sfl/scripts/debug/pr-forensics.ps1" -PRNumber <n>

# Check all open PRs for idempotency markers
& ".agents/skills/sfl/scripts/debug/marker-check.ps1"

# Build timeline of workflow runs for a PR
& ".agents/skills/sfl/scripts/debug/workflow-timeline.ps1" -PRNumber <n>

# Inspect PR body for bloat and structural issues
& ".agents/skills/sfl/scripts/debug/body-inspect.ps1" -PRNumber <n>

# Audit labels for sprawl and unused entries
& ".agents/skills/sfl/scripts/debug/label-audit.ps1"
```

### Debug Checklist

1. **Run snapshot.ps1** — understand current state before touching anything
2. **Identify the symptom** — what is the user seeing?
3. **Locate the workflow** — which workflow should have acted and didn't?
4. **Check the type** — agentic (.md + .lock.yml) or standard (.yml)?
5. **For agentic**: Check markers, safe-outputs, prompt logic, model config
6. **For standard**: Check YAML conditions, permissions, trigger events
7. **Check labels** — is the state machine in a valid state?
8. **Check the dispatcher** — did it dispatch when it should have?
9. **Determine root cause** — not the first suspicious thing, the ACTUAL cause
10. **Assess architectural impact** — does the fix add or remove complexity?
11. **Report what changed** — never silently fix

---

## Auditing

> Deep reference: [docs/auditing.md](docs/auditing.md)

Exhaustive pass/fail health checks that go beyond green checkmarks.

### Quick Health Check

```powershell
& ".agents/skills/sfl/scripts/health-check.ps1"
```

| Check | What it verifies |
|-------|------------------|
| Workflow count | ≤ 14 files in `.github/workflows/` (ceiling) |
| Label health | ≤ 25 labels, no orphans |
| Issue↔PR harmony | Every `agent:in-progress` issue has a matching PR |
| Marker integrity | All open agent PRs have valid markers for their cycle |
| Model drift | Lock files match `sfl.json` model assignments |
| Workflow states | Expected workflows are enabled/disabled per intent |

### Audit Concerns

Beyond automated checks, manually verify:

- **Oldest open issue** — Why is it still open? If `agent:in-progress`, is
  a PR progressing? (Skip issue #1 — tracking issue by design.)
- **Phantom child issues** — Report issues that claim they created child
  issues. Do those child issues actually exist? Placeholder tokens like
  `#aw_f1` mean the workflow failed to create them.
- **Risk acknowledgment** — Medium/high risk is NOT a reason to mark a
  finding as non-agent-fixable. Risk is surfaced at human-review time
  via `risk:medium`/`risk:high` labels.

### Audit Output Format

```text
## SFL Audit — <date in EST/EDT>

| # | Check | Result | Detail |
|---|-------|--------|--------|
| 1 | <check name> | ✅ or ❌ | One-line summary |
| … | … | … | … |

### Verdict: CLEAN | PROBLEMS FOUND

### Failures (only if any ❌)

#### ❌ <Check name>
- **Severity**: High / Medium / Low
- **Evidence**: <what you found>
- **Impact**: <what breaks if ignored>
- **Suggested Action**: <concrete next step>

### Observations & Takeaways

Capture anything unexpected even if all checks pass:
- Pipeline behaviors that worked but were surprising
- Timing gaps between cron cycles that caused delays
- Verdicts that took multiple Dispatcher cycles to propagate
- Merge conflicts between concurrent PRs touching same files
- Safe-output behaviors (e.g., verdicts in PR body vs labels)
```

Every concern MUST appear as a row. ✅ for pass, ❌ for fail. Include any new
findings directly in the audit/status output.

### Timezone Rule

All timestamps in audit output MUST be in **US Eastern (EST/EDT)**. Never
display raw UTC. Use the `To-Eastern` helper from `status-report.ps1` or
convert inline:

```powershell
$tz = [System.TimeZoneInfo]::FindSystemTimeZoneById("Eastern Standard Time")
$est = [System.TimeZoneInfo]::ConvertTimeFromUtc($utc, $tz)
```

---

## Status

> Deep reference: [docs/status.md](docs/status.md)

Fast, checkpointed pipeline status with clear verdicts.

### Status Scripts

```powershell
# Full status report from last checkpoint
& ".agents/skills/sfl/scripts/status/status-report.ps1"

# Full report with custom checkpoint time
& ".agents/skills/sfl/scripts/status/status-report.ps1" -LastCheckUtc "2026-02-20T18:14:44Z"

# Raw JSON dataset for further analysis
& ".agents/skills/sfl/scripts/status/status-collect.ps1" -AsJson

# Read/write the checkpoint timestamp
& ".agents/skills/sfl/scripts/status/status-checkpoint.ps1"
```

### Rules

- Prefer script outputs over ad-hoc `gh` loops
- **All times in EST/EDT** — never display UTC to the user. Convert all GitHub API timestamps using `[System.TimeZoneInfo]::ConvertTimeFromUtc()` with `"Eastern Standard Time"`. Append `EST` or `EDT` suffix based on DST.
- When reporting times in prose (not scripts), convert inline: e.g., "PR #92 merged at 4:51 PM EST" not "21:51 UTC"
- Treat `missing finish_reason for choice 0` as non-blocking (known transient)
- Keep output concise and decision-oriented: **ALL GOOD** or **ISSUES FOUND**

### Observations & Takeaways

The Status command should always end with an **Observations** section when
reporting to the user. This captures pipeline behaviors that aren't bugs but
are worth noting:

- **Timing gaps**: Cron cycles that caused delays (e.g., "Dispatcher ran 3 min before issue was created — 30-min wait")
- **Concurrent PR conflicts**: Multiple PRs modifying the same file
- **Verdict propagation**: How many Dispatcher cycles before a PR got `human:ready-for-review`
- **Unexpected behaviors**: Safe-output patterns, label transitions that were surprising
- **What worked well**: Pipeline autonomy wins worth calling out

Format:

```text
### Observations
- {emoji} {observation}
```

---

## Simplicity

> Deep reference: [docs/constraints.md](docs/constraints.md)

Architectural watchdog. Questions every addition. Protects the complexity ceiling.

### Principles

> Every workflow file must earn its existence. Every label must earn its existence.
> If the fix for a problem is "add another workflow", stop and ask if an existing
> one can be extended instead.

14 workflow files is the **complexity ceiling**. Additions must be justified
against removal of something else.

**Before adding any new workflow:**

1. Can an existing workflow handle this? (Extend, don't multiply)
2. Is this truly a separate concern, or a step in another workflow?
3. Does this add a new state transition that needs tracking?
4. What is the net workflow count change? (Target: zero or negative)

### Safe-Outputs Discipline

- Use the minimum `max` value that covers real usage
- Always use `title-prefix` on created issues/PRs for traceability
- Always use `draft: true` for created PRs
- Never grant permissions beyond what the prompt needs
- **Prefer granular safe-outputs**: use `add-labels`/`remove-labels` instead of
  `update-issue` labels (which replaces ALL). Use `add-comment` for feedback
  instead of body-append when possible. Use `push-to-pull-request-branch`
  instead of creating new PRs for fix cycles.
- **Verify capabilities before workarounds**: check the official safe-outputs
  reference before building complex workarounds for perceived limitations

### Anti-Patterns

| Anti-Pattern | Why it's harmful |
|--------------|------------------|
| **Label creep** | Adding labels to solve state problems — use comments/markers instead |
| **Workflow sprawl** | Adding workflows when an existing one could be extended |
| **Silent fixes** | Repairing state without documenting what went wrong |
| **Over-engineering** | Adding retry/backoff/circuit-breakers before proving they're needed |
| **Marker format changes** | Changing how markers work without updating ALL consumers |
| **Permission escalation** | Giving workflows more permissions than they need |
| **Code-only capability assessment** | Inferring platform limits from existing code instead of official docs |

### Complexity Assessment

When evaluating a proposed change:

1. Read `VISION.md` and `.github/copilot-instructions.md`
2. Count labels, workflows, state transitions involved
3. Ask: Does this add or remove complexity?
4. If it adds complexity, propose a simpler alternative
5. If no simpler alternative exists, document WHY in the debug or audit output

### Session Start Gate

Before modifying any SFL workflow or adding any logic:

1. Run `ensure-auth.ps1` (see [Preflight](#preflight))
2. Run `health-check.ps1` — it verifies workflow count (≤14), labels (≤25), and more
3. Count lines in any prompt you plan to modify (flag if >150)
4. If ANY metric is at or over ceiling, address that FIRST before new work

---

## Memory

> Deep reference: [docs/lessons.md](docs/lessons.md)

This skill learns and improves over time. Lessons are stored, constraints are
cataloged, and the skill itself evolves.

### After Every Session

When encountering something noteworthy:

1. **Capture the lesson** — What went wrong? What was the root cause?
2. **Check if reusable** — Will this help in future sessions?
3. **Store appropriately**:
   - Pipeline patterns → [docs/lessons.md](docs/lessons.md)
   - Constraint discoveries → [docs/constraints.md](docs/constraints.md)
   - Skill improvements → update this SKILL.md directly

### Reflect Command

When the user says "reflect" or "save what we learned":

1. Summarize the session's key findings
2. Identify patterns that recurred or were discovered
3. Append to `docs/lessons.md` with date and one-line summary
4. If a constraint was discovered, add to `docs/constraints.md`
5. If the skill itself needs updating, propose and apply the edit

### Self-Improvement Triggers

Update this skill when:

- A workflow is added or removed (update the inventory table)
- A new constraint is discovered about agentic workflows
- A debugging procedure proves insufficient
- A new script is created that supports SFL operations
- Guiding principles need refinement from operational experience

---

## All Scripts Reference

### Preflight Scripts

| Script | Purpose |
|--------|---------|
| `scripts/ensure-auth.ps1` | Verify/switch correct gh CLI account for target repo |

### Core

| Script | Purpose |
|--------|---------|
| `scripts/health-check.ps1` | 6-check automated pass/fail report |
| `scripts/workflow-inventory.ps1` | Catalog all workflows with type classification |
| `scripts/loop-state.ps1` | Current pipeline state — what's in the loop right now |
| `scripts/pr-approve.ps1 -PRNumber <n>` | Submit PR approval review by PR number |
| `scripts/create-issue.ps1 -What "..." [-TodoItem "..."]` | Create an `agent:fixable` issue for SFL pickup |

### Debug (`scripts/debug/`)

| Script | Purpose |
|--------|---------|
| `snapshot.ps1` | Full ecosystem state: issues, PRs, labels, recent runs |
| `pr-forensics.ps1` | Deep PR analysis: markers, labels, linked issue, cycle state |
| `label-audit.ps1` | Label usage audit, unused/redundant labels, health score |
| `marker-check.ps1` | Verify idempotency markers on all active PRs |
| `workflow-timeline.ps1` | Chronological timeline of workflow runs for a PR |
| `body-inspect.ps1` | PR body structure and bloat detection |
| `dispatcher-log.ps1` | Extract decision output from dispatcher runs (`-Last 3` for history) |

### Status (`scripts/status/`)

| Script | Purpose |
|--------|---------|
| `status-checkpoint.ps1` | Read/write checkpoint timestamp |
| `status-collect.ps1` | Gather issues, PRs, workflow runs, markers (outputs JSON) |
| `status-report.ps1` | Render concise markdown report in US Eastern time |

### Repo-Level Scripts

| Script | Location | Purpose |
|--------|----------|---------|
| `pause-sfl.ps1` | `scripts/` | Disable all SFL workflows |
| `resume-sfl.ps1` | `scripts/` | Re-enable all SFL workflows |
| `list-workflows.ps1` | `scripts/reports/` | All workflows with state and last run |
| `list-issues.ps1` | `scripts/reports/` | Open issues with labels |
| `list-prs.ps1` | `scripts/reports/` | Open PRs with labels |
| `monitor-actions.ps1` | `scripts/` | Live monitor of workflow runs |
| SFL debug stages | `scripts/sfl-debug/` | 14-step staged enable/disable sequence |
