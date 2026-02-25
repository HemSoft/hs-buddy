# Migration Handoff: HemSoft → relias-engineering

> **Date**: 2026-02-23
> **Context**: hs-buddy migrated from `HemSoft/hs-buddy` to `relias-engineering/hs-buddy` to consume `fhemmerrelias` Copilot Pro+ credits (1,500 req/mo) instead of personal HemSoft credits (quota exhausted).

## Current State

| Item | Status |
|------|--------|
| Repo created at `relias-engineering/hs-buddy` | ✅ Private repo |
| Code mirrored (main + 3 PR branches) | ✅ |
| 37 labels migrated | ✅ |
| 16 issues migrated (#1–#16) | ✅ |
| 3 draft PRs recreated (#17–#19) | ✅ |
| Git remote → `git@github-work1:relias-engineering/hs-buddy.git` | ✅ |
| 14 files updated (HemSoft → relias-engineering refs) | ✅ |
| 11 workflows disabled on old HemSoft repo | ✅ |
| 11 workflows enabled on new repo | ✅ |
| SFL Dispatcher test run | ✅ Passed |
| Issue Processor test run | ✅ Passed (after PAT) |
| Local folder moved | ✅ Moved to d:\github\Relias\hs-buddy |
| Fine-grained PAT created | ✅ Created |
| Secret updated with PAT | ✅ Both secrets updated |
| Full pipeline verification | ✅ All workflows green |

## Step 1: Create a Fine-Grained PAT

The Issue Processor (and all Copilot-dependent workflows) failed with:

```text
Error: COPILOT_GITHUB_TOKEN is an OAuth token (gho_...)
OAuth tokens are not supported for GitHub Copilot.
Please create a fine-grained PAT (github_pat_...) at:
https://github.com/settings/personal-access-tokens/new
```

### Instructions

1. Go to <https://github.com/settings/personal-access-tokens/new> (logged in as `fhemmerrelias`)
2. **Token name**: `hs-buddy-copilot`
3. **Expiration**: 90 days (or your preference)
4. **Resource owner**: `relias-engineering`
5. **Repository access**: Only select repositories → `relias-engineering/hs-buddy`
6. **Permissions**:
   - **Contents**: Read and write
   - **Issues**: Read and write
   - **Pull requests**: Read and write
   - **Metadata**: Read (auto-selected)
7. Click **Generate token** and copy the `github_pat_...` value

## Step 2: Update the Repository Secret

Run this from any terminal where `gh` is authenticated as `fhemmerrelias`:

```powershell
# Paste the PAT when prompted
gh secret set COPILOT_GITHUB_TOKEN --repo relias-engineering/hs-buddy
```

You may also want to update `GH_AW_GITHUB_TOKEN` if it also needs to be a PAT:

```powershell
gh secret set GH_AW_GITHUB_TOKEN --repo relias-engineering/hs-buddy
```

## Step 3: Move Local Folder

Move the repo folder from the HemSoft directory to the Relias directory:

```powershell
# Close VS Code / any editors first
Move-Item "d:\github\HemSoft\hs-buddy" "d:\github\Relias\hs-buddy"
```

The git remote is already configured correctly — no git changes needed after the move:

```text
origin  git@github-work1:relias-engineering/hs-buddy.git (fetch)
origin  git@github-work1:relias-engineering/hs-buddy.git (push)
```

## Step 4: Reopen in VS Code

```powershell
code-insiders "d:\github\Relias\hs-buddy"
```

## Step 5: Verify Pipeline

Once the PAT secret is set, trigger a full pipeline test:

```powershell
gh workflow run sfl-dispatcher.yml --repo relias-engineering/hs-buddy
```

Then monitor:

```powershell
# Wait ~60 seconds, then check runs
gh run list --repo relias-engineering/hs-buddy --limit 10
```

**Expected sequence**: SFL Dispatcher (success) → Issue Processor (success) → PR Analyzers → PR Fixer → PR Promoter

If Issue Processor now succeeds, the PAT is working and the pipeline is healthy.

## Step 6: Archive Old Repo

Once confirmed working:

```powershell
gh repo archive HemSoft/hs-buddy --yes
```

## Issue Number Mapping

Old issue/PR numbers changed during migration:

| Old (HemSoft) | New (relias-engineering) | Title |
|---------------|-------------------------|-------|
| #19 | #1 | First migrated issue |
| ... | ... | (16 issues total, 3 draft PRs #17-#19) |

PR bodies may reference old issue numbers. These can be updated as encountered.

## Resuming the Conversation

After completing steps 1–4 above, open a new Copilot Chat session from `d:\github\Relias\hs-buddy` and say:

> I completed the migration handoff. I created the fine-grained PAT, updated the COPILOT_GITHUB_TOKEN secret, and moved the repo to `d:\github\Relias\hs-buddy`. Please verify the pipeline is healthy and mark the migration task in TODO.md as complete.

This will pick up where we left off — Phase 6 verification.
