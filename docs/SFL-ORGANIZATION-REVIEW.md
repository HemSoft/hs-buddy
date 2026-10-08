# SFL organization review

This repository retains its full SFL tier and manual-only Auditor and Dispatcher. This branch proposes the reviewer from signed `v2.1.0-rc.29` at source `f07ab8ca3d58a7a5a6bbf88ff1bc8e3a359b6e53`; inspect the default-branch manifest to determine the version actually installed. Existing model policy and repository-scoped App credentials remain in place.

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

After merging the reviewed deployment, verify the new observer on main through a registered review and the required Actions gate. Run installed production fixtures separately from that live execution. A successful upgrade PR executed by the previous observer does not establish execution by the newly proposed version.

The rc29 observer authenticates exact current requests and trusted review context before admitting registry-free marker runs. It retains verified active-run request identity across later edits, deletion or access loss; ordinary marker quotations cannot block another valid result. Publication repair preserves the primary API failure while restoring a blocking gate. Installed and live validation remain separate.

## Review request verification after the organization move

Use `gh sfl review --repo hemsoft-dev/hs-buddy --pr <number>` to register one review for the current head and base. The installed observer verifies the unchanged request, its author access, and the Actions context before admitting it. Wait for that request to finish before requesting another review on the same head.

The proposed package targets signed 2.1.0-rc.29. Before claiming delivery, check the actual main-branch manifest and match the completed Actions execution to that installed revision. The manual Auditor and Dispatcher remain consumer owned.

## Chained retarget and provider recovery

The rc29 invalidator keeps default-branch departures in a separate concurrency group from unsupported nondefault-to-nondefault retargets. A later unsupported retarget cannot cancel that invalidation. Admission still requires a trusted default-branch context.

A native provider error does not establish a reviewed head or a clean gate. Keep the failed request and result as evidence. If the signed CLI refuses a same-head retry, make a substantive branch correction before registering one request on its new head. Editing or deleting a registered request invalidates its evidence and must not be used to manufacture retry eligibility.
