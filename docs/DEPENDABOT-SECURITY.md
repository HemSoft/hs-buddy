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
gh api --method GET repos/HemSoft/hs-buddy/dependabot/alerts -f state=open
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
gh api -i --method GET repos/HemSoft/hs-buddy/vulnerability-alerts

# Expect {"enabled":true,"paused":false}.
gh api --method GET repos/HemSoft/hs-buddy/automated-security-fixes

# Expect an array, including an empty array when no alerts are open.
gh api --method GET repos/HemSoft/hs-buddy/dependabot/alerts -f state=open

# Expect no high-severity advisories and exit code 0.
bun audit --audit-level=high
```
