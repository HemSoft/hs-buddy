---
agent: agent
description: Draft an ordinary issue; the retired SFL pipeline will not process it.
---

# Draft a repository issue

Read AGENTS.md and docs/SFL-ORGANIZATION-REVIEW.md first. Use the HemSoft identity.

The repository SFL auditor, dispatcher, analyzers and autonomous loop are retired.
Do not reinstall, dispatch, repair or diagnose their absence as a failure. Their
labels and historical records remain for reference. Native Codex and ordinary CI
continue. The central App pilot is tracked in
[SFL #139](https://github.com/hemsoft-dev/set-it-free-loop/issues/139); a successful pilot is
not established by this preparation change.

Gather the concrete problem, affected files, expected behavior, measurable
acceptance criteria and reproducible validation. Record risk and the Risk
Acknowledgment required by AGENTS.md. For an authorized issue, write its body to a temporary file and run
`gh issue create --repo hemsoft-dev/hs-buddy --title "..." --body-file <file>`. Do not claim that creating an issue starts
an autonomous workflow, add pipeline lifecycle labels to dispatch work, or infer
merge authority from a risk label.
