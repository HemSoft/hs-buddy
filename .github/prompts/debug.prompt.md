---
agent: agent
description: Diagnose ordinary CI or PR review failures from current evidence.
---

# Repository diagnostics

Read AGENTS.md and docs/SFL-ORGANIZATION-REVIEW.md first. Use the HemSoft identity.

The repository SFL auditor, dispatcher, analyzers and autonomous loop are retired.
Do not reinstall, dispatch, repair or diagnose their absence as a failure. Their
labels and historical records remain for reference. Native Codex and ordinary CI
continue. The central App pilot is tracked in
https://github.com/hemsoft-dev/set-it-free-loop/issues/139; a successful pilot is
not established by this preparation change.

Start with a read-only snapshot of the affected PR's current head/base, effective
protections, CI logs and native review threads. Reproduce a concrete failure
before proposing a repair. Diagnose a central App failure through its runbook and
Mini service health, not consumer Actions files. Do not change another agent's
branch, enable retired automation, or infer a missing SFL deployment from labels.
