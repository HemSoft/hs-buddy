# AI review auto-merge

For `HemSoft/hs-buddy`, a maintainer can apply `automerge` to authorize native
GitHub squash auto-merge. The controller enrolls that PR only after Codex has
accepted its current commit and every review thread is resolved. GitHub then
enforces the required checks and branch rules before merging.

This is an opt-in exception to the default human review handoff. An agent may
apply the label when the user authorizes merging that PR or invokes an issue
workflow that already includes merge authority. An ordinary implementation or
review request does not authorize the label. Existing labeled PRs carry that
standing authority, so agents should not ask for it again.

## Required evidence

The `ai-review-accepted` check is written by GitHub App `4448946`, `sfl-app`.
It requires a completed clean signal from `chatgpt-codex-connector[bot]`, REST
actor ID `199175422`. Matching text from any other account is rejected.

Supported receipts are the Codex review summary's completed Code Review row
with a Codex thumbs-up created after that completion, or the explicit clean-review comment with its
`Reviewed commit` field. The commit must uniquely resolve to the current full
head SHA within the complete PR commit list. A running, stale, ambiguous,
unknown, or missing receipt blocks acceptance. A newer Codex review invalidates
an older clean receipt even when its threads have since been resolved.

The evaluator reads every page of comments, reviews, reactions, commits, and
review threads, including outdated unresolved threads. API failures and pagination
limits fail closed. Open PRs sharing a head commit are blocked because GitHub
check contexts belong to commits, not individual PRs.

Drafts, requests for changes, and `automerge:hold` block acceptance. Only
same-repository PRs targeting `main` can enroll. Fork PRs require manual merge
after satisfying the same required review check.

Acceptance and enrollment are separate decisions. A clean, unlabeled PR can
pass the acceptance check for a maintainer's manual merge. The `automerge`
label and master switch authorize the controller to enroll a PR; they do not
revoke a maintainer's GitHub merge permissions. A maintainer can directly enable
native auto-merge on a reviewed PR, and GitHub may complete that explicitly
requested merge before the controller handles the resulting event. The required
review check, CI, and native conversation protections still apply.

## Operation

[The workflow](../.github/workflows/ai-review-automerge.yml) responds to PR
metadata, issue comments, and CI/security completion. A ten-minute scheduled
pass catches formal reviews, reaction changes, resolved threads, and missed
events. GitHub Actions has no `pull_request_review_thread` trigger. Schedules
may be delayed.

Automatic triggers use the base or default branch workflow definition. Review
events are deliberately excluded because their workflow definition comes from
the PR merge ref. Manual dispatch must select `main`. The controller checks out
trusted `main` code and never executes PR code or
downloads PR artifacts. Its installation token is scoped to this repository
and the checks, contents, issues, and pull requests permissions it needs. The
workflow adds no AI calls and no reviewer-trigger comments.

Each run publishes a pending check before reading evidence, rereads that
evidence before enrollment, and uses `expectedHeadOid` when enabling native
auto-merge. It checks the evidence again before publishing success. Failures
publish a failed check and attempt to withdraw enrollment. Workflow runs are
serialized without canceling an active evaluation. Each batch processes at most
four independent PRs concurrently. CI completion targets its associated PR when
GitHub supplies one; the scheduled pass covers the complete open PR set.

The controller also withdraws existing native auto-merge when the PR loses its
opt-in label, becomes ineligible, or the master switch is disabled. At each
reconciliation it also withdraws requests originally enabled by hand when they
do not qualify for controller enrollment. This is eventual reconciliation, not
an atomic restriction on a maintainer's direct GitHub action.

Use `automerge:hold` before beginning a discussion or removing an opt-in.
Label changes and comments are asynchronous events, so they cannot recall a
merge that GitHub has already started. To intervene, apply the hold and disable
native auto-merge on the PR. Disabling alone leaves the opt-in in place, so the
controller can enroll it again. Review threads have native resolution enforcement;
ordinary conversation comments have no resolved state and are not treated as
unresolved review threads. The controller cannot make the last timeline event
an atomic merge condition.

## Installation and rollback

1. Land the workflow and controller with `AI_AUTOMERGE_ENABLED` unset or `false`.
   In this mode it publishes acceptance checks but never enrolls a PR.
2. Run the workflow on an open PR and verify that the check's App ID is `4448946`.
   The existing `SFL_APP_PRIVATE_KEY` installation must permit contents write,
   checks write, pull requests write, and issues read for `hs-buddy`.
3. Preserve the `main` ruleset's existing CI, npm audit, CodeQL, thread
   resolution, deletion, and force-push restrictions. Add `ai-review-accepted`
   as a required status check with integration ID `4448946`. Enable strict
   required checks so branches must be up to date. Do not add bypass actors.
4. Enable the repository's native auto-merge setting. Create `automerge` and
   `automerge:hold` labels. Set `AI_AUTOMERGE_ENABLED=true` last.
5. Verify an authorized PR with real current-head Codex acceptance, green
   required checks, and zero unresolved threads merges through GitHub. Confirm
   the resulting push triggers the normal CI/release workflows. Verify that a
   held or unreviewed PR does not enroll.

The controller independently verifies the App-bound required check, strict
checks, and native thread resolution before enrolling. It does not bypass
branch protection or call an administrative merge endpoint. This personal
repository uses native auto-merge with strict checks; GitHub merge queues are
available to organization-owned repositories under supported plans.

To stop enrollment, set `AI_AUTOMERGE_ENABLED=false` and dispatch the workflow
with a blank PR number. Also disable any still-pending native auto-merge
requests. Keep the required acceptance check in place while investigating.
Removing the check would allow merges without the policy's evidence.

For a read-only local evaluation, supply a token through `GH_TOKEN` and run
`bun scripts/run-ai-review-automerge.ts`. Set `PR_NUMBER` to limit the evaluation.
Only `--apply` permits writes, and only the configured App can publish the
required check. Never paste tokens into commands, logs, or PR descriptions.

## Agent closeout

After enrollment, wait for GitHub to report `MERGED`. Record the approved head,
merge commit, required check results, and remaining threads. Enrollment alone
is not completion. Do not also invoke a second merge path while native
auto-merge is pending.

Local cleanup remains separate. Synchronize the primary checkout and use the
repository cleanup workflow to remove only proven-merged, inactive worktrees
and branches. Preserve dirty or active work. A GitHub merge does not clean the
Home checkout. Send one completion DM only when the invoking workflow already
authorizes it, after reporting the actual cleanup result.

## References

- [GitHub native auto-merge](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/automatically-merging-a-pull-request)
- [Workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [App tokens and workflow triggering](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
- [Protected branch checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Merge queue availability](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
