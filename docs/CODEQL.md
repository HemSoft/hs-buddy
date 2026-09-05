# CodeQL scanning

GitHub CodeQL default setup analyzes this repository's JavaScript and
TypeScript. GitHub owns the generated workflow, so there is no checked-in
CodeQL workflow to update or pin.

## Configuration

The repository uses:

- default setup in the `configured` state;
- the `javascript-typescript` language;
- the extended query suite;
- a standard GitHub-hosted runner; and
- GitHub's pull-request, default-branch, and weekly scan schedule.

Default setup scans repository-owned code under `src/`, `electron/`, `convex/`,
`shared/`, `scripts/`, `e2e/`, and `perf/`. No repository-owned path or query is
excluded. CodeQL omits dependency directories such as `node_modules/` by
default. Untracked build, coverage, Aspire SDK, release, and test-result output
is absent from the Git checkout and therefore absent from analysis.

Do not add a path exclusion merely to remove an alert. Exclude a path only when
the repository does not own it or another tracked source deterministically
generates it. Record that reason here in the same pull request.

## Merge protection

The active default-branch ruleset requires CodeQL results for each proposed
change. Its `code_scanning` rule uses these thresholds:

| Result              | Blocking threshold |
| ------------------- | ------------------ |
| Security alerts     | High or higher     |
| Non-security alerts | None               |

The rule also blocks while the required analysis is missing or still running.
The existing `ci-complete` and `npm audit` required checks remain independent
merge gates.

## Ownership and triage

`HemSoft` owns every code-scanning alert. An authorized maintainer reviews the
repository's **Security > Code scanning** view or the paginated alerts API.
Every high or critical alert must have an assignee and linked tracked work by
the next business day. Critical alerts need a fix or documented mitigation
within 72 hours; high alerts need one within seven calendar days.

Dismiss an alert only after checking its current instance and data flow. Use
GitHub's narrowest applicable reason:

- `false positive` when the reported source, sink, or flow cannot occur;
- `used in tests` only when the entire finding is confined to test or benchmark
  code and cannot ship or process sensitive data; or
- `won't fix` only when a linked issue records the accepted risk, owner, and
  review date.

Every dismissal comment must name the relevant trust boundary or test-only
constraint. Never dismiss an alert because a fix is inconvenient, and never
use a path exclusion or query change as a substitute for triage.

The 15 findings from the first analysis are tracked in
[issue #661](https://github.com/HemSoft/hs-buddy/issues/661). Merge protection
was enabled only after that issue recorded every baseline alert.

## Enforcement proof

Pull request
[#662](https://github.com/HemSoft/hs-buddy/pull/662) tested the rule with a
disposable command-injection fixture on its initial head, `73db8108`. CodeQL
analysis `1728778633` reported critical alert `#16`
(`js/command-line-injection`), the ruleset emitted a failing required `CodeQL`
check, and GitHub reported the pull request as blocked. The fixture was then
removed; it is not part of the final change.

## Verification

Before every GitHub CLI operation, confirm that `HemSoft` is the active account.

```bash
gh auth status
gh api repos/HemSoft/hs-buddy/code-scanning/default-setup

gh auth status
gh api --method GET repos/HemSoft/hs-buddy/code-scanning/analyses \
  --jq '.[0] | {ref,commit_sha,tool,error}'

gh auth status
gh api --paginate --slurp --method GET \
  repos/HemSoft/hs-buddy/code-scanning/alerts -f state=open

gh auth status
gh api repos/HemSoft/hs-buddy/rulesets/15947577 \
  --jq '.rules[] | select(.type == "code_scanning")'
```

Expect configured JavaScript and TypeScript default setup, a successful current
default-branch analysis, an alert array, and a CodeQL rule whose security alert
threshold is `high_or_higher`.
