---
name: sfl
description: Retired repository SFL commands; explain the central App replacement without running the legacy pipeline.
disable-model-invocation: true
---

# Retired repository SFL skill

Franz retired this repository's SFL deployment on October 9, 2026. The old
create-issue, status, explain and labels commands no longer operate a workflow
pipeline. Their scripts stop before any GitHub command. Do not dispatch, enable,
repair or reinstall the retired auditor, dispatcher, analyzers, fixer or promoter.
Do not read deleted manifest/policy paths or claim that labels start automation.

When explicitly invoked, explain the retirement and link to
[current deployment status](../../../docs/SFL-ORGANIZATION-REVIEW.md) and
[the central App runbook](https://github.com/hemsoft-dev/set-it-free-loop/blob/main/central-reviewer/README.md).
Native Codex and ordinary CI continue. Only hs-buddy qualification on mini is
authorized; this skill does not authorize enabling the central service.

For an ordinary issue requested by the user, use `gh issue create --repo hemsoft-dev/hs-buddy` within
that task's authorization and the repository's AGENTS.md requirements. Existing
labels, intake, overrides and history remain records rather than an active queue.
