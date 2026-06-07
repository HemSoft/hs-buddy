# SFL Onboarding - Token Setup

How to configure GitHub Actions credentials for the Set it Free Loop in this repo.

## Current hs-buddy Configuration

`HemSoft/hs-buddy` runs the SFL gh-aw workflows on the Codex engine.

Required Actions secret:

| Secret Name | Purpose | Current state |
|---|---|---|
| `OPENAI_API_KEY` | Authenticates the Codex AI engine | Configured |

Optional Actions secret:

| Secret Name | Purpose | When to add it |
|---|---|---|
| `GH_AW_GITHUB_TOKEN` | Overrides the default `GITHUB_TOKEN` for GitHub API operations | Add only when the built-in token cannot perform a required write operation |

The standard SFL infrastructure workflows (`sfl-dispatcher.yml` and
`sfl-auditor.yml`) use `GH_AW_GITHUB_TOKEN` when present and otherwise fall back
to `github.token`.

## Setting Secrets

```powershell
# Codex engine secret. Already present for HemSoft/hs-buddy.
gh secret set OPENAI_API_KEY --repo HemSoft/hs-buddy

# Optional GitHub API override, only if GITHUB_TOKEN is insufficient.
gh secret set GH_AW_GITHUB_TOKEN --repo HemSoft/hs-buddy
```

Use interactive paste for secret values to avoid shell escaping issues.

## Verification

```powershell
# Confirm Actions secrets.
gh secret list --repo HemSoft/hs-buddy --app actions

# Confirm gh-aw sees the compiled workflows.
gh aw status --repo HemSoft/hs-buddy

# Confirm SFL metadata and labels.
gh sfl status --repo HemSoft/hs-buddy

# Check recent scheduled SFL runs.
gh run list --repo HemSoft/hs-buddy --workflow daily-repo-status.lock.yml --limit 5
gh run list --repo HemSoft/hs-buddy --workflow repo-audit.lock.yml --limit 5
gh run list --repo HemSoft/hs-buddy --workflow simplisticate.lock.yml --limit 5
```

A successful Codex-backed gh-aw run proves the AI engine secret works. A
successful dispatcher or auditor run proves the standard SFL infrastructure can
operate with the available GitHub token.

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `None of the following secrets are set: OPENAI_API_KEY` | Codex engine secret is missing or not accessible to the repo | Set `OPENAI_API_KEY` as a repo or org Actions secret with repo access |
| `None of the following secrets are set: COPILOT_GITHUB_TOKEN` | A workflow was compiled for the Copilot engine instead of Codex | Recompile SFL workflows after setting `engine.id: codex` |
| `Resource not accessible by integration` | The built-in `GITHUB_TOKEN` lacks a required permission | Add a properly scoped `GH_AW_GITHUB_TOKEN` or configure a GitHub App |
| `401 Bad credentials` | Secret value is invalid or expired | Regenerate and re-set the affected secret |
| `OAuth tokens are not supported` | Secret contains a `gho_` token from `gh auth` | Use a fine-grained PAT (`github_pat_...`) for token overrides |
