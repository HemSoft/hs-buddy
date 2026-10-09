---
agent: agent
description: Audit ordinary CI and current-head review evidence.
---

# Repository health

Read AGENTS.md and docs/SFL-ORGANIZATION-REVIEW.md first. Use the HemSoft identity.

The repository SFL auditor, dispatcher, analyzers and autonomous loop are retired.
Do not reinstall, dispatch, repair or diagnose their absence as a failure. Their
labels and historical records remain for reference. Native Codex and ordinary CI
continue. The central App pilot is tracked in
[SFL #139](https://github.com/hemsoft-dev/set-it-free-loop/issues/139), which records
qualification evidence and the current pause state. The central service is
installed on mini with hs-buddy as its sole qualification target. Read the
[pilot contract](../../docs/CENTRAL-SFL-PILOT.md).

1. Fetch the default-branch workflow tree and recent runs of the ordinary workflows
   that still exist. Inspect failures using their actual logs and run IDs.
2. Fetch open PRs, current head/base, checks, native Codex reviews and unresolved
   threads. An old approval or thumbs-up does not prove the current head.
3. When an SFL PR Reviewer check exists, verify publisher App ID 4448946 and its
   recorded head/base. Missing pilot checks on existing or excluded PRs are normal.
4. Report verified failures and coverage limits. Distinguish retired automation
   from active CI. Do not change labels, settings, credentials or workflows during
   this audit; fixes follow the owner's authorized task and repository rules.
