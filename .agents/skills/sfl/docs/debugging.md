# SFL Debugging Procedures

## Triage Flowchart

```
Symptom reported
  │
  ├─ PR not progressing?
  │    ├─ Run pr-forensics.ps1 -PRNumber <n>
  │    ├─ Check: Are cycle markers present?
  │    │   ├─ No markers → Analyzers haven't run. Check dispatcher logs.
  │    │   ├─ Legacy markers only → Workflows need recompile (gh aw compile)
  │    │   └─ Markers present → Check verdicts (PASS vs BLOCKING)
  │    ├─ Check: Is pr-fixer running?
  │    │   └─ All 3 analyzer markers for current cycle? If not, fixer won't run.
  │    └─ Check: Is pr-promoter skipping?
  │        └─ Any BLOCKING verdict? Promoter only acts on all-PASS.
  │
  ├─ Issue stuck in agent:fixable?
  │    ├─ Is sfl-dispatcher enabled and running?
  │    ├─ Is there already an agent:in-progress issue? (one at a time)
  │    └─ Does the issue have both agent:fixable AND action-item labels?
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

**Symptom**: PR stuck — fixer/promoter say "no work found" despite analyzer
reviews being posted.

**Root cause**: Analyzers writing markers in wrong format. Expected:
`[MARKER:pr-analyzer-a cycle:0]`

**Diagnosis**:

```powershell
& ".agents/skills/sfl/scripts/debug/marker-check.ps1"
```

**Fix**: Verify analyzer `.md` prompts specify the correct marker format.
Recompile with `gh aw compile`.

### 2. Dispatcher Not Dispatching

**Symptom**: `agent:fixable` issues sit untouched. No issue-processor runs.

**Root cause options**:

- Dispatcher is disabled
- Dispatcher's `gh workflow dispatch` is failing (token permissions)
- Model drift guard is failing (sfl.json mismatch)

**Diagnosis**:

```powershell
# Check state
& "scripts/reports/list-workflows.ps1"
# Check recent dispatcher runs
gh run list --workflow sfl-dispatcher.yml --limit 5 --json status,conclusion,createdAt
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

**Fix**: The pr-fixer should summarize previous cycle reviews, not accumulate
them verbatim. Check the pr-fixer prompt.

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

**Symptom**: Dispatcher fails at "Model drift guard" step.

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
5. **View run logs** — look for safe-output errors or model refusals
6. **Test with `workflow_dispatch`** — manual trigger to reproduce

### Debugging Standard Workflows

1. **Read the `.yml`** — standard GitHub Actions debugging
2. **Check conditions** — `if:` guards, environment variables
3. **Check permissions** — `permissions:` block, token scopes
4. **Check triggers** — is the event type correct?
5. **View run logs** — step-by-step output
