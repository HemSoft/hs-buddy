# SFL Debugging Procedures

## Triage Flowchart

```text
Symptom reported
  │
  ├─ PR not progressing?
  │    ├─ Run pr-forensics.ps1 -PRNumber <n>
  │    ├─ Check: Are cycle markers present?
   │    │   ├─ No markers → Analyzers haven't run. Check the direct A -> B -> C handoff.
  │    │   ├─ Legacy markers only → Workflows need recompile (gh aw compile)
  │    │   └─ Markers present → Check verdicts (PASS vs BLOCKING)
   │    ├─ Check: Is Issue Processor running?
   │    │   └─ Any BLOCKING verdict in the current cycle? If yes, label-actions dispatches issue-processor.
   │    └─ Check: Is label-actions running?
   │        └─ All 3 analyzer markers for current cycle? Label-actions checks for `analyzer:blocked` label to decide fix-cycle vs ready-for-review.
  │
  ├─ Issue stuck in agent:fixable?
   │    ├─ Did the issue open with the `agent:fixable` label already present?
  │    ├─ Is there already an agent:in-progress issue? (one at a time)
   │    └─ Does the issue have the `agent:fixable` label and a valid issue body?
  │
  ├─ Workflow failing?
  │    ├─ Agentic? → Check safe-output limits (max exceeded?)
  │    ├─ Standard? → Check YAML syntax, permissions, token validity
  │    └─ Both → Check concurrency guards (is another run in progress?)
  │
  └─ Labels inconsistent?
       └─ Run health-check.ps1 → look at harmony check results
```

## Common Failure Modes

### 1. Marker Format Mismatch

**Symptom**: PR stuck — the implementer or router says "no work found" despite analyzer
reviews being posted.

**Root cause**: Analyzers writing markers in wrong format. Expected:
`<!-- MARKER:sfl-analyzer-a cycle:0 -->`

**Diagnosis**:

```powershell
& ".agents/skills/sfl/scripts/debug/marker-check.ps1"
```

**Fix**: Verify analyzer `.md` prompts specify the correct marker format.
Recompile with `gh aw compile`.

### 2. Direct Issue Intake Not Starting

**Symptom**: `agent:fixable` issues sit untouched. No issue-processor runs.

**Root cause options**:

- Issue was opened before the `agent:fixable` label was present
- Issue Processor workflow is disabled
- Another Issue Processor run is already active due to concurrency

**Diagnosis**:

```powershell
# Check state
& "scripts/reports/list-workflows.ps1"
# Check recent issue processor runs
gh run list --workflow sfl-issue-processor.lock.yml --limit 5 --json status,conclusion,createdAt
```

### 3. Safe-Output Max Exceeded

**Symptom**: Agentic workflow fails with safe-output limit error.

**Root cause**: The workflow tried to create/update more entities than its
`max` allows.

**Fix**: Either increase `max` in the `.md` frontmatter (carefully) or fix
the prompt to be more conservative. Recompile.

### 4. PR Body Bloat

**Symptom**: PR body grows to 30K+ characters over multiple cycles. Workflows
start failing due to API limits.

**Diagnosis**:

```powershell
& ".agents/skills/sfl/scripts/debug/body-inspect.ps1" -PRNumber <n>
```

**Fix**: The current single-implementer flow keeps follow-up work on the same
draft PR branch instead of creating superseding PRs. This eliminates cumulative
body content from PR chains. If bloat still occurs, check whether analyzer
markers are being appended rather than replaced per cycle.

### 5. Concurrent Run Conflicts

**Symptom**: Two runs of the same workflow step on each other — duplicate PRs,
duplicate labels, conflicting state.

**Root cause**: Missing or misconfigured concurrency guard.

**Check**: Every workflow with a schedule should have:

```yaml
concurrency:
  group: "workflow-name"
```

### 6. Model Drift

**Symptom**: Health checks or targeted workflow dispatches fail at the model drift guard.

**Root cause**: `sfl.json` models don't match `.lock.yml` files.

**Fix**:

1. Update `sfl.json` to match intended models
2. Update `.md` files' `engine.model` fields
3. Run `gh aw compile`
4. Commit all changed files

## Script Quick Reference

### Core (`scripts/`)

| Script | Purpose |
|--------|--------|
| `health-check.ps1` | Automated pass/fail health report |
| `workflow-inventory.ps1` | All workflows with type classification |
| `loop-state.ps1` | What's currently in the pipeline |

### Debug (`scripts/debug/`)

| Script | Purpose |
|--------|--------|
| `snapshot.ps1` | Full ecosystem state |
| `pr-forensics.ps1` | Deep-dive a single PR (markers, labels, linked issue) |
| `marker-check.ps1` | Verify idempotency markers on all open PRs |
| `workflow-timeline.ps1` | Chronological timeline of runs for a PR |
| `body-inspect.ps1` | PR body structure and bloat detection |
| `label-audit.ps1` | Label usage, orphans, simplification opportunities |

### Repo-level (`scripts/`)

| Script | Purpose |
|--------|---------|
| `pause-sfl.ps1` | Disable all SFL workflows |
| `resume-sfl.ps1` | Re-enable all SFL workflows |
| `monitor-actions.ps1` | Live monitor of workflow runs |
| `reports/list-workflows.ps1` | Workflow states and last run |
| `reports/list-issues.ps1` | Open issues with labels |
| `reports/list-prs.ps1` | Open PRs with labels |
| `sfl-debug/01-14` | Staged enable/disable sequences |

## Debugging Agentic vs Standard Workflows

### Debugging Agentic Workflows

1. **Read the `.md` prompt** — understand what the AI is being asked to do
2. **Check safe-outputs** — does it have permission to do what it needs?
3. **Check the model** — is it capable enough for the task?
4. **Check markers** — is idempotency preventing re-runs?
5. **Analyze the agent execution** — see [Agent Execution Analysis](#agent-execution-analysis) below
6. **Test with `workflow_dispatch`** — manual trigger to reproduce

#### Agent Execution Analysis

The most important step for debugging agentic workflows is analyzing the
**"Execute GitHub Copilot CLI"** step logs. This is where the agent reasons,
calls tools, and makes decisions. Always focus here first.

Use a subagent or batched terminal command to extract key signals from the run
logs in one pass. **Never** read the full log sequentially — it can be 50K+
lines. Instead, run this batched extraction against run ID `$RUN_ID`:

```powershell
$log = gh run view $RUN_ID --log 2>&1

Write-Output "=== AGENT TOOL CALLS ==="
$log | Select-String "Parse agent logs.*(Γ£ô|✗)" | Select-Object -First 40

Write-Output "`n=== AGENT REASONING ==="
$log | Select-String "Agent:.*(?:PR #|draft|conflict|cannot|can't|failed|error|skip|noop|found|merge)" -CaseSensitive:$false | Select-Object -First 25

Write-Output "`n=== SAFE-INPUT CALLS ==="
$log | Select-String "safeinputs.*Calling handler|safeinputs.*invoke" -CaseSensitive:$false | Select-Object -First 10

Write-Output "`n=== SAFE OUTPUTS ==="
$log | Select-String "Process Safe Outputs.*(Processing message|completed|Failed|Skipped|noop|Summary)" -CaseSensitive:$false | Select-Object -First 15

Write-Output "`n=== TOKENS & STATS ==="
$log | Select-String "Tokens:|Turns:|Total:" | Select-Object -First 5
```

**What to look for:**

| Signal | Meaning |
|--------|---------|
| Agent reasoning about credentials/tokens | Agent is lost — can't push, trying to bypass sandbox |
| `github-pull_request_read` → payload too large | PR body bloat — agent can't read PR via MCP |
| `safeinputs.*Calling handler` lines | Safe-input tool was actually invoked (not just registered) |
| `noop` in safe outputs | Agent decided there was nothing to do |
| High token count (>500K) with `noop` | Agent burned tokens exploring but accomplished nothing |
| `✗` (failed tool calls) | Tool failures — check what failed and why |
| Agent reasoning about `push_to_pull_request_branch` | Agent may be confused about push mechanism |

**Common agent failure patterns:**

1. **Credential exploration spiral** — Agent tries `git fetch`, fails, investigates
   `LD_PRELOAD`, reads lock.yml, tries Python bypass. Root cause: prompt doesn't
   clearly explain the safe-output push mechanism.
2. **PR body too large for MCP** — `github-pull_request_read` returns truncated or
   fails. Fix: use `gh pr list`/`gh api` commands instead of MCP tool.
3. **Safe-input not called** — Tool registered but agent never invokes it. Fix:
   prompt must explicitly instruct "call the X tool" at the relevant step.
4. **Discussion 404** — Agent tries to read a discussion via `github-issue_read`
   (wrong tool) or `web_fetch` (private repo). Fix: agent needs GraphQL or
   `update_discussion` safe-output only.

### Debugging Standard Workflows

1. **Read the `.yml`** — standard GitHub Actions debugging
2. **Check conditions** — `if:` guards, environment variables
3. **Check permissions** — `permissions:` block, token scopes
4. **Check triggers** — is the event type correct?
5. **View run logs** — step-by-step output
