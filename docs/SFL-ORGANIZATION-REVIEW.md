# SFL organization review

This repository retains its full SFL tier and manual-only Auditor and Dispatcher. The reviewer comes from the signed `v2.1.0-rc.22` release at source `ef807fc3ac3cb734efa70435a6a3970223680476`. Existing model policy and repository-scoped App credentials remain in place.

## Update and inspect

Use the [organization onboarding guide](https://github.com/hemsoft-dev/set-it-free-loop/blob/main/docs/ORGANIZATION-ONBOARDING.md) and inspect the installed package before requesting review:

```sh
gh sfl status --repo hemsoft-dev/hs-buddy
gh sfl sync --repo hemsoft-dev/hs-buddy --pr
```

The versioned `.sfl/sync-policy.json` preserves the manual Auditor and Dispatcher and the removed issue processor. Review the generated PR before merging an update. Repeating sync at the same signed source must create no new PR or default-branch change; updating existing SFL labels remains an expected API write.

## Register a review

```sh
gh sfl review --repo hemsoft-dev/hs-buddy --pr NUMBER
```

The CLI registers the authorized owner request for the immutable PR head and base. The installed observer verifies the Codex App identity and review result, then publishes the Actions-authored `SFL Reviewer Gate Runner` result. A clean native comment alone does not establish a registered SFL gate.

A changed base, reopened PR or overlapping same-head registered requests requires a new head before requesting a fresh review. Findings or malformed results keep the gate blocked. Preserve the repository's existing CI and CodeQL requirements alongside the strict reviewer gate.

## Manual wider automation

The Auditor and Dispatcher have no schedules. A migration smoke run first checks that there are no eligible agent issues, draft agent PRs or approved promoter candidates. After that check, execute the existing manual workflows at the current default revision and inspect their actual outputs. The smoke proof requires all Auditor summary counts to be zero and all Dispatcher model and promoter steps to be skipped; a configured workflow or old successful run does not prove the current deployment.

## Immediate predecessor recovery

A third request cannot bypass an unresolved second request on the same head. Wait for the immediate predecessor to finish before requesting another review. If requests overlap, publish a new head and register one fresh request instead of adding more comments to the ambiguous head.

This change verifies the rc22 observer installed on the current main branch through a registered review and the required Actions gate. The installed production fixtures test negative cases separately from that live execution.
