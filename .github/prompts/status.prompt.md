---
agent: agent
description: Report ordinary CI and native review status without changes.
---

# Repository status

Read AGENTS.md and docs/SFL-ORGANIZATION-REVIEW.md first. Use the HemSoft identity.

The repository SFL auditor, dispatcher, analyzers and autonomous loop are retired.
Do not reinstall, dispatch, repair or diagnose their absence as a failure. Their
labels and historical records remain for reference. Native Codex and ordinary CI
continue. The central App pilot is tracked in
[SFL #139](https://github.com/hemsoft-dev/set-it-free-loop/issues/139); a successful pilot is
not established by this preparation change.

Fetch open issues and PRs, each PR's current head/base, current-head CI, native
Codex artifacts and unresolved threads. Fetch recent runs only for ordinary
workflows present on the default branch. Report failures with links and IDs,
pending checks, and missing or stale review proof. Display times in US Eastern.

Keep the report brief and read-only. Do not expect retired pipeline labels to
advance, dispatch anything, or write a checkpoint. Existing PRs may correctly
have no central pilot check.
