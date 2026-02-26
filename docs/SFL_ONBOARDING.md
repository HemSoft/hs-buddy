# SFL Onboarding — Token Setup

> How to configure GitHub Actions secrets for the Set it Free Loop.

---

## Prerequisites

- The repo has SFL workflows deployed (see [README.md](README.md))
- Labels are configured via `setup-labels.ps1`
- The user setting up tokens has **admin** access to the repo
- **GitHub Discussions is enabled** on the repo — required by `daily-repo-status` and `repo-audit`
  workflows, which post reports as Discussions rather than issues.
  Enable it under **Settings → Features → Discussions**. A "General" category must exist
  (created automatically when Discussions is first enabled).

---

## Tokens Required

The SFL needs **two fine-grained Personal Access Tokens** stored as GitHub Actions secrets.
They cannot be combined into one because of GitHub's permission model constraints.

| Secret Name | Purpose | Who Creates It |
|---|---|---|
| `COPILOT_GITHUB_TOKEN` | Authenticates Copilot CLI (AI engine) | Each user individually |
| `GH_AW_GITHUB_TOKEN` | GitHub API operations (issues, PRs, branches) | Repo admin (shared) |

---

## Token 1: `COPILOT_GITHUB_TOKEN`

This token authorizes Copilot inference. Usage counts against the **token owner's**
premium request quota — so each user should create their own.

**Create at:** <https://github.com/settings/personal-access-tokens/new>

| Setting | Value |
|---|---|
| Token name | `sfl-copilot` (or any descriptive name) |
| Resource owner | **Your user account** (not an organization) |
| Expiration | 90 days (recommended) |
| Repository access | **Public repositories** (required — see note below) |

**Account permissions:**

| Permission | Access |
|---|---|
| Copilot Requests | **Read** |

**Repository permissions:** None.

> **Why "Public repositories"?** GitHub only surfaces the Copilot Requests
> account permission when repository access is set to "Public repositories."
> This is a GitHub UI constraint, not a security concern — the token has zero
> repository permissions. See [gh-aw auth docs](https://github.github.com/gh-aw/reference/auth/#copilot_github_token).
>
> **Important:** The token owner must have an active **Copilot Pro+** (or Copilot Business/Enterprise)
> license. Without a Copilot license, inference calls will fail.

---

## Token 2: `GH_AW_GITHUB_TOKEN`

This token authorizes GitHub API operations: listing/creating/updating issues and PRs,
triggering workflows, reading repo contents, and managing branches.

**Create at:** <https://github.com/settings/personal-access-tokens/new>

| Setting | Value |
|---|---|
| Token name | `sfl-github-api` (or any descriptive name) |
| Resource owner | **The organization** that owns the repo (e.g., `relias-engineering`) |
| Expiration | 90 days (recommended) |
| Repository access | **All repositories** or **Only select repositories** → the SFL repo(s) |

**Repository permissions:**

| Permission | Access |
|---|---|
| Actions | **Read & Write** |
| Contents | **Read & Write** |
| Issues | **Read & Write** |
| Metadata | **Read** (auto-granted) |
| Pull requests | **Read & Write** |

**Account / Organization permissions:** None.

> **Scaling note:** This token can be shared across multiple SFL repos if you
> select "All repositories." For tighter security, scope it to specific repos.
> Long-term, consider replacing this with a **GitHub App** for short-lived tokens
> and no PAT rotation — gh-aw supports this natively.

---

## Setting the Secrets

```powershell
# Interactive paste (recommended — avoids shell escaping issues)
gh secret set COPILOT_GITHUB_TOKEN --repo <owner>/<repo>
gh secret set GH_AW_GITHUB_TOKEN  --repo <owner>/<repo>
# Paste each token value when prompted, then press Enter.
```

---

## Verification

```powershell
# Confirm secrets exist
gh secret list --repo <owner>/<repo>

# Trigger the dispatcher
gh workflow run sfl-dispatcher.yml --repo <owner>/<repo>

# Check result after ~30 seconds
gh run list --workflow="sfl-dispatcher.yml" --repo <owner>/<repo> --limit 1
```

A successful dispatcher run confirms `GH_AW_GITHUB_TOKEN` works.
To verify `COPILOT_GITHUB_TOKEN`, check that a downstream workflow
(e.g., `issue-processor` or `pr-analyzer-a`) completes without
`401` or Copilot inference errors.

---

## When Onboarding a New Team Member

If a new developer wants their Copilot quota used instead of yours:

1. They create **Token 1** (`COPILOT_GITHUB_TOKEN`) with their own user account
2. Update the repo secret `COPILOT_GITHUB_TOKEN` with their token value
3. **Token 2** (`GH_AW_GITHUB_TOKEN`) stays the same — it's org-scoped

> **Future:** When multiple users need concurrent SFL access, use per-user
> Copilot tokens via workflow inputs or a GitHub App for API operations.

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `401 Bad credentials` | Token value is invalid or expired | Regenerate and re-set the secret |
| `Could not resolve to a Repository` | `GH_AW_GITHUB_TOKEN` resource owner is wrong (user instead of org) | Recreate with org as resource owner |
| `OAuth tokens are not supported` | Secret contains a `gho_` token from `gh auth` | Create a fine-grained PAT (`github_pat_...`) instead |
| `402 You have no quota` | Copilot premium request limit exceeded | Wait for reset or switch to a user with available quota |
| Copilot Requests permission not visible | Repository access is not "Public repositories" | Change to "Public repositories" in PAT settings |
