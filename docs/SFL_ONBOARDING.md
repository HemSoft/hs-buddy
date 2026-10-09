> SFL deployment status, October 9, 2026: the repository workflows are retired. The SFL pipeline instructions below describe the historical deployment. Native Codex and ordinary CI remain. The central organization App service is installed on mini, limited to this repository. Read the [pilot contract](CENTRAL-SFL-PILOT.md); qualification evidence and pause state are tracked in [SFL #139](https://github.com/hemsoft-dev/set-it-free-loop/issues/139). Do not reinstall or run the historical SFL workflows.

# SFL Onboarding - Token Setup

How to configure GitHub Actions credentials for the Set it Free Loop in this repo.

## Current hs-buddy Configuration

`hemsoft-dev/hs-buddy` runs the SFL gh-aw workflows on the Codex engine.

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
# Codex engine secret. Already present for hemsoft-dev/hs-buddy.
gh secret set OPENAI_API_KEY --repo hemsoft-dev/hs-buddy

# Optional GitHub API override, only if GITHUB_TOKEN is insufficient.
gh secret set GH_AW_GITHUB_TOKEN --repo hemsoft-dev/hs-buddy
```

Use interactive paste for secret values to avoid shell escaping issues.

## Verification

```powershell
# Confirm Actions secrets.
gh secret list --repo hemsoft-dev/hs-buddy --app actions

# Confirm gh-aw sees the compiled workflows.
gh aw status --repo hemsoft-dev/hs-buddy

# Confirm SFL metadata and labels.
gh sfl status --repo hemsoft-dev/hs-buddy

# Check recent scheduled SFL runs.
gh run list --repo hemsoft-dev/hs-buddy --workflow daily-repo-status.lock.yml --limit 5
gh run list --repo hemsoft-dev/hs-buddy --workflow repo-audit.lock.yml --limit 5
gh run list --repo hemsoft-dev/hs-buddy --workflow simplisticate.lock.yml --limit 5
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
