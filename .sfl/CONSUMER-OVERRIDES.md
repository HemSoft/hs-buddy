# Preserved consumer automation

This repository retains its existing full SFL tier and model policy while adding the subscription-backed Codex reviewer. The SFL App credentials stay repository scoped.

[PR #573](https://github.com/hemsoft-dev/hs-buddy/pull/573) removed the Auditor and Dispatcher schedules. Both remain manual-only. [PR #572](https://github.com/hemsoft-dev/hs-buddy/pull/572) removed issue-processor workflows and Dispatcher wiring. Those removals remain intact. The existing Dispatcher App-token action version is preserved.

The reviewer matches the canonical rc18 source. The Auditor adds the source reviewer-prerequisite checks while retaining its manual trigger. The Dispatcher remains byte-for-byte identical to the pre-migration default branch. These are deliberate consumer changes; the rc18 full sync currently tries to restore the removed automation. The versioned `.sfl/sync-policy.json` explicitly keeps these three workflows under consumer ownership. CLI releases before rc19 do not understand this policy and still need manual review for these changes. Use rc19 or newer for repeat full sync once that release is available.

The historical manifest component list still declares issue-processor despite its deliberate removal. It is not a claim that this component is enabled. Wider validation here exercises the configured manual Auditor and Dispatcher without scheduling model-backed work.
