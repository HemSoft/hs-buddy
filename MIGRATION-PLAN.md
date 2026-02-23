# Migration Plan: HemSoft/hs-buddy → relias-engineering/hs-buddy

> **Created**: February 23, 2026
> **Reason**: Copilot premium request quota on HemSoft (personal) account exhausted ($50 overage cap hit). Moving to `relias-engineering` org so GitHub Actions consume `fhemmerrelias` Copilot Pro+ credits (1,500 req/mo) instead of personal HemSoft credits.
> **Method**: GitHub repo transfer API (preserves issues, PRs, labels, stars, watchers, git history)

---

## Pre-Flight Checklist

| # | Item | Status |
|---|------|--------|
| 1 | `fhemmerrelias` is **admin** of `relias-engineering` | ✅ Confirmed |
| 2 | `HemSoft` account has `delete_repo` scope (required for transfer) | ✅ Confirmed |
| 3 | Repo is **public** — `relias-engineering` blocks public repo creation but transfer of existing public repos may work; if not, repo will become **private** after transfer | ⚠️ Verify |
| 4 | No GitHub Pages deployed | ✅ Confirmed (has_pages: false) |
| 5 | No GitHub Packages published | ✅ N/A |
| 6 | Open issues: **10** — all transfer automatically | ✅ |
| 7 | Open PRs: **3** (all draft, agent-fix branches) — transfer automatically | ✅ |
| 8 | Labels: **36 custom labels** — transfer automatically | ✅ |
| 9 | Secrets to re-create: `COPILOT_GITHUB_TOKEN`, `GH_AW_GITHUB_TOKEN` | 🔲 Manual |
| 10 | Stale remote branches to clean up pre-transfer (6 orphaned) | 🔲 Optional |

---

## Phase 1: Prepare (Before Transfer)

### 1.1 Clean Up Orphaned Remote Branches

These branches have no open PRs and can be deleted to reduce clutter:

```powershell
# Switch to HemSoft account for branch deletion
gh auth switch --user HemSoft

# Delete orphaned branches (no associated open PRs)
$orphans = @(
    "add-workflow-workflows-daily-repo-status.md-9985",
    "agent-fix/issue-24-a61df92a5fd504df",
    "agent-fix/issue-56-d3d25a9219545fb6",
    "agent-fix/issue-61-23eb11dad960670d",
    "agent-fix/issue-62-97b8d1d79531222d",
    "agent-fix/issue-63-30f1462ba6e37a6e",
    "agent-fix/issue-7-767e90ed390419a1",
    "agent-fix/issue-78-26786c3cc220aea2"
)
foreach ($b in $orphans) {
    gh api -X DELETE "/repos/HemSoft/hs-buddy/git/refs/heads/$b" 2>&1
}
```

### 1.2 Disable Cron Workflows

Prevent workflows from firing during migration (they'll fail anyway due to quota):

```powershell
# Disable all cron-triggered workflows
gh auth switch --user HemSoft
$workflows = gh workflow list --repo HemSoft/hs-buddy --json id,name --jq '.[].id' 2>&1
foreach ($wf in $workflows) {
    gh workflow disable $wf --repo HemSoft/hs-buddy
}
```

---

## Phase 2: Transfer the Repository

### 2.1 Execute Transfer

Transfer must be initiated by the **source owner** (`HemSoft`) to the **target org** (`relias-engineering`):

```powershell
gh auth switch --user HemSoft
gh api -X POST /repos/HemSoft/hs-buddy/transfer `
    -f new_owner="relias-engineering" `
    -f new_name="hs-buddy"
```

**What GitHub transfers automatically:**

- All git history, branches, tags
- All issues (numbers preserved) and their labels
- All pull requests (numbers preserved)
- All labels and milestones
- Stars and watchers
- GitHub automatically creates a redirect from `HemSoft/hs-buddy` → `relias-engineering/hs-buddy`

**What does NOT transfer:**

- Repository secrets ❌
- GitHub Actions workflow run history ❌ (starts fresh)
- Repository-level variables ❌
- Webhooks ❌ (none configured)
- GitHub Pages settings ❌ (none)

### 2.2 Verify Transfer

```powershell
gh auth switch --user fhemmerrelias
gh repo view relias-engineering/hs-buddy --json name,owner,visibility
```

---

## Phase 3: Post-Transfer Configuration

### 3.1 Re-Create Repository Secrets

```powershell
gh auth switch --user fhemmerrelias

# Set secrets (you'll be prompted or pipe in values)
gh secret set COPILOT_GITHUB_TOKEN --repo relias-engineering/hs-buddy
gh secret set GH_AW_GITHUB_TOKEN --repo relias-engineering/hs-buddy
```

> **IMPORTANT**: These tokens should be generated from the `fhemmerrelias` account so Copilot credits are billed against its Pro+ plan (1,500 req/mo).

### 3.2 Enable GitHub Actions

```powershell
# Re-enable all workflows
$workflows = gh workflow list --repo relias-engineering/hs-buddy --json id --jq '.[].id' 2>&1
foreach ($wf in $workflows) {
    gh workflow enable $wf --repo relias-engineering/hs-buddy
}
```

### 3.3 Update Local Git Remote

```powershell
cd D:\github\HemSoft\hs-buddy
git remote set-url origin git@github-work1:relias-engineering/hs-buddy.git
git fetch origin
```

> SSH host alias changes from `github-personal1` → `github-work1` (uses `fhemmerrelias` SSH key).

---

## Phase 4: Update In-Repo References

All hardcoded `HemSoft/hs-buddy` references must be updated to `relias-engineering/hs-buddy`.

### 4.1 Workflow & Prompt Files (6 references)

| File | Line | Current | New |
|------|------|---------|-----|
| `.github/hooks/stop-check-actions.ps1` | 23 | `HemSoft/hs-buddy` | `relias-engineering/hs-buddy` |
| `.github/workflows/README.md` | 49 | `HemSoft/hs-buddy` | `relias-engineering/hs-buddy` |
| `.github/workflows/README.md` | 61 | `-Owner HemSoft -Repo hs-buddy` | `-Owner relias-engineering -Repo hs-buddy` |
| `.github/workflows/pr-promoter.md` | 156 | `HemSoft/hs-buddy` | `relias-engineering/hs-buddy` |
| `.github/workflows/pr-promoter.md` | 290 | `HemSoft/hs-buddy` | `relias-engineering/hs-buddy` |

### 4.2 Skill Scripts (6 references)

| File | Line | Default `$Repo` |
|------|------|-----------------|
| `.agents/skills/debug/scripts/pr-forensics.ps1` | 14 | `HemSoft/hs-buddy` → `relias-engineering/hs-buddy` |
| `.agents/skills/debug/scripts/label-audit.ps1` | 8, 12 | `HemSoft/hs-buddy` → `relias-engineering/hs-buddy` |
| `.agents/skills/debug/scripts/marker-check.ps1` | 8, 12 | `HemSoft/hs-buddy` → `relias-engineering/hs-buddy` |
| `.agents/skills/debug/scripts/body-inspect.ps1` | 14 | `HemSoft/hs-buddy` → `relias-engineering/hs-buddy` |
| `.agents/skills/debug/scripts/snapshot.ps1` | 10 | `HemSoft/hs-buddy` → `relias-engineering/hs-buddy` |
| `.agents/skills/debug/scripts/workflow-timeline.ps1` | 17 | `HemSoft/hs-buddy` → `relias-engineering/hs-buddy` |
| `.agents/skills/status/scripts/status-collect.ps1` | 3 | `HemSoft/hs-buddy` → `relias-engineering/hs-buddy` |
| `.agents/skills/status/scripts/status-report.ps1` | 3 | `HemSoft/hs-buddy` → `relias-engineering/hs-buddy` |

### 4.3 Application & Script Files (2 references)

| File | Line | Reference |
|------|------|-----------|
| `scripts/monitor-actions.ps1` | 12 | `HemSoft/hs-buddy` → `relias-engineering/hs-buddy` |
| `src/components/AboutModal.tsx` | 16 | GitHub URL → `relias-engineering/hs-buddy` |

### 4.4 Documentation (1 reference)

| File | Line | Reference |
|------|------|-----------|
| `README.md` | 47 | Clone URL → `relias-engineering/hs-buddy` |

### 4.5 No Change Needed

These files reference `relias-engineering` already and need no updates:

- `sfl.json` — source is `relias-engineering/set-it-free-loop` ✅
- `VISION.md` — references `relias-engineering/set-it-free-loop` ✅
- `AGENTS.md` — `fhemmerrelias` identity ✅
- `electron-builder.json5` — app ID is `com.hemsoft.buddy` (brand, not org) ✅

---

## Phase 5: Commit & Push Updates

```powershell
cd D:\github\HemSoft\hs-buddy
git add -A
git commit -m "chore: update references after transfer to relias-engineering"
git push origin main
```

---

## Phase 6: Verify Pipeline Health

### 6.1 Trigger Test Run

```powershell
gh workflow run sfl-dispatcher.yml --repo relias-engineering/hs-buddy
```

### 6.2 Watch for Success

```powershell
gh run list --repo relias-engineering/hs-buddy --limit 10
```

### 6.3 Confirm Copilot Quota Billing

After a successful run, check that credits are being consumed against `fhemmerrelias` Pro+ quota at:
`https://github.com/settings/copilot` (logged in as `fhemmerrelias`)

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Public repo may become private in relias-engineering | Low — org blocks public creation but transfer may preserve | Can set visibility after transfer if admin |
| GitHub redirect expires | Low — redirects last indefinitely per GitHub docs | Update all local clones promptly |
| Secrets contain wrong token identity | HIGH — defeats the whole purpose | Generate fresh tokens as fhemmerrelias |
| Open PRs have stale branch refs | Low — branches transfer with repo | Verify PRs are intact post-transfer |
| Copilot CLI still bills personal | Medium — need to verify billing context switches | Check usage after first successful run |

---

## Rollback Plan

If transfer fails or billing doesn't work as expected:

1. Transfer repo back: `gh api -X POST /repos/relias-engineering/hs-buddy/transfer -f new_owner="HemSoft"`
2. Restore remote: `git remote set-url origin git@github-personal1:HemSoft/hs-buddy.git`
3. Revert reference changes: `git revert HEAD`
4. Re-create original secrets

---

## Estimated Impact

- **17 files** need `HemSoft/hs-buddy` → `relias-engineering/hs-buddy` updates
- **2 secrets** need re-creation
- **1 git remote** needs updating
- **0 data loss** — GitHub transfer preserves everything
