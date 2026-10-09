# Central SFL reviewer pilot

This repository is the only qualification target for the organization-installed
SFL GitHub App. The central service runs on mini; it receives signed GitHub
webhooks and publishes the `SFL PR Reviewer` check as App ID 4448946. Existing
native Codex remains the review engine. No repository SFL workflow, model key or
App key is required to receive this check.

The pilot check is advisory. Existing CI, CodeQL and review-thread protections
continue to determine merge readiness. Autonomous SFL workflows remain retired
and organization `SFL_ENABLED=false` stays in place.

## Read the check

A green result requires authenticated native Codex evidence for the current head
and the unchanged observed base. Pending review is visible in the check. Findings,
missing or edited proof, a draft conversion, retarget or changed base invalidate
success. Returning to the old context does not restore that head's review; push a
substantive new commit before seeking fresh proof.

The service enrolls only new same-repository PRs opened after setup, targeting the
default branch. Existing PRs and forks do not receive pilot checks. Their absence
is expected. A thumbs-up alone is not proof, and the service does not execute PR
code or initiate model API calls.

## Operations and evidence

Use the [central service runbook](https://github.com/hemsoft-dev/set-it-free-loop/blob/main/central-reviewer/README.md)
for Mini service health, queue recovery and the local pause switch. Do not dispatch
retired workflows or reinstall them with `gh sfl init`, `sync` or deployment scripts.

[SFL issue #139](https://github.com/hemsoft-dev/set-it-free-loop/issues/139) records
qualification evidence and remaining work. This document describes the pilot
contract; it does not assert a successful live test before its receipts exist.
Broader repository activation requires a separate owner instruction.
