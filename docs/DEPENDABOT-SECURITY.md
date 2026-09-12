# Dependabot security response

GitHub Dependabot alerts and security updates are enabled for this repository.
The weekly version-update jobs remain configured in `.github/dependabot.yml`,
and the required `Security Scanning / npm audit` check blocks high-severity
dependency vulnerabilities on pull requests and `main`.

## Ownership and intake

The `HemSoft` repository owner is responsible for every Dependabot alert. An
authorized maintainer reviews alerts in **Security > Dependabot alerts** or with
the repository alert API:

```bash
gh auth status # Confirm that HemSoft is the active account before continuing.
gh api --paginate --slurp --method GET \
  repos/HemSoft/hs-buddy/dependabot/alerts -f state=open
```

On first review, assign the alert to `HemSoft`. Every high or critical alert
must also have a linked GitHub issue labeled `dependencies` and `risk:high` or
`risk:critical`. The issue records the alert number, GHSA identifier, affected
dependency path, owner, response deadline, and either the remediation plan or a
documented reason for dismissal. Do not copy private exploit details or secrets
into a public issue.

An alert cannot remain silently unowned. If GitHub cannot assign it, the linked
issue must name `HemSoft` as the owner and explain the assignment limitation.

## Response expectations

| Severity | Assign and open tracked work | Fix or documented mitigation |
| -------- | ---------------------------- | ---------------------------- |
| Critical | Same business day            | Within 72 hours              |
| High     | By the next business day     | Within 7 calendar days       |

If no patched version exists, the issue must document the temporary mitigation,
the residual risk, and the next review date within the same deadline. Medium and
low alerts are reviewed during the weekly dependency-maintenance pass.

## Remediation path

1. Confirm the advisory, affected manifest or lockfile path, severity, and
   reachable dependency path.
2. Use the Dependabot security-update pull request when it is correct. Otherwise,
   create a focused branch and pull request linked to the tracking issue.
3. Run `bun install --frozen-lockfile`, `bun audit --audit-level=high`, and the
   repository's required checks without weakening the audit policy.
4. Merge through the protected pull-request path after review and required
   checks pass.
5. Confirm GitHub closes the alert. Dismiss an alert only with a specific reason
   and a linked issue that records the evidence.

## Lockfile repair trust boundary

The `Dependabot Lockfile Fix` workflow uses `pull_request_target` so GitHub
loads its code from the trusted base branch, then separates untrusted dependency
execution from repository writes. Its first job checks out the exact
same-repository Dependabot head without persisted credentials and grants the job
only `contents: read`. That job may run PR-controlled package scripts, but it can
publish only an artifact containing a regular `bun.lock` file after rejecting
all other tracked, staged, or untracked changes.

The write-capable job never checks out or executes the PR tree. It downloads
only the artifact from the same workflow run, checks its digest and shape, then
re-reads the live pull request. The job requires a Dependabot-authored open
same-repository pull request, the expected `dependabot/` branch, and the exact
unchanged head SHA. It creates a Git tree that replaces only `bun.lock` and
updates the branch without force. A stale head makes the update fail. CI is
dispatched only after the pull request reports the newly created commit as its
head.

## Safe tabletop verification

The high-severity `fast-uri` advisory
[GHSA-5jgf-p345-68v8](https://github.com/advisories/GHSA-5jgf-p345-68v8)
is the repository's no-risk tabletop case. [Issue #633](https://github.com/HemSoft/hs-buddy/issues/633)
recorded the advisory, affected dependency range, owner-visible risk, and
verification plan. [Pull request #638](https://github.com/HemSoft/hs-buddy/pull/638)
updated the dependency graph and passed the security gate before merge.

Dependabot alerts were disabled when that advisory was published, so this is a
tabletop of the newly documented intake path rather than a historical Dependabot
notification. It exercises advisory intake, tracked ownership, remediation,
review, and closure without adding a vulnerable dependency to `main`.

## Setting verification

```bash
# Expect HTTP 204.
gh auth status # Confirm that HemSoft is the active account before continuing.
gh api -i --method GET repos/HemSoft/hs-buddy/vulnerability-alerts

# Expect {"enabled":true,"paused":false}.
gh auth status # Confirm that HemSoft is the active account before continuing.
gh api --method GET repos/HemSoft/hs-buddy/automated-security-fixes

# Expect one array containing every page, including an empty page when no
# alerts are open.
gh auth status # Confirm that HemSoft is the active account before continuing.
gh api --paginate --slurp --method GET \
  repos/HemSoft/hs-buddy/dependabot/alerts -f state=open

# Expect no high-severity advisories and exit code 0.
bun audit --audit-level=high
```
