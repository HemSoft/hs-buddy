# SFL State Tracker

This document is the standing source of truth for SFL incidents, degraded live state, and recovery order. It exists to stop the pattern of scattered fixes, optimistic status messages, and lost context between sessions.

## Current Status

- Date: 2026-03-07
- Repo: `relias-engineering/hs-buddy`
- Overall state: degraded
- Determinism: broken
- Simplicity: compromised by fallback paths and misleading diagnostics

## Active Incident

### Live artifacts

- Issue `#128` — `Add SFL Loop monitoring to Organizations tree`
- PR `#129` — original draft PR for issue 128
- PR `#131` — superseding draft PR created after the implementer failed to continue PR 129

### What is wrong right now

1. One issue currently has two open draft agent PRs.
2. The implementer explicitly fell back to creating PR `#131` because it could not push to the existing PR branch for PR `#129` in CI.
3. The analyzer chain on PR `#131` stalled after Analyzer A in practical terms, even though Analyzer B had a successful run.
4. Diagnostic scripts were masking the problem:
   - `snapshot.ps1` treated one issue mapped to two PRs as healthy harmony.
   - `workflow-timeline.ps1` mixed runs from different branches and used wildcard matching that broke on marker text.
   - `pr-forensics.ps1` reported the issue-to-PR link as healthy even when duplicate PRs existed.
5. The repo's generated status narratives are not reliable enough to be used as truth during an incident.

### Evidence

- `snapshot.ps1` at 2026-03-07 18:27 local showed one open in-progress issue and two open draft PRs for the same issue.
- Issue `#128` comment history includes this explicit statement from the implementer:
  - `Opened a new draft PR to supersede #129`
  - `A new PR was created because push_to_pull_request_branch failed due to git authentication not being available in the CI environment.`
- PR `#131` body includes:
  - `Supersedes #129 (push to existing PR branch failed due to git auth limitation in CI)`
- PR `#131` has Analyzer A marker for cycle 0, but no Analyzer B, Analyzer C, Issue Processor, or Router marker for cycle 0.
- PR `#131` has Auditor comments warning about analyzer starvation and missing markers.
- Discussion `#116` (`[repo-status] Repo Status — March 7, 2026`) still reported `Open PRs | 1` and generally optimistic pipeline health language, which did not reflect the live degraded state later in the day.
- Discussion `#115` (`[repo-audit] Repo Audit — 2026-03-07`) said the repository was in good overall health and did not detect the live hot-path determinism failures.
- Discussion `#95` (`SFL Activity Log`) contains workflow-by-workflow breadcrumbs, but those breadcrumbs have not been used consistently as a first-class debugging source.

## Root Causes

### 1. Duplicate-PR fallback still exists

The hot path is not actually single-path yet. When `push_to_pull_request_branch` fails, the implementer can still fork the live state into a new PR. That reintroduces the exact branch/PR ambiguity the simplified model was supposed to remove.

### 2. Targeted handoff is not invariant enough

Analyzer sequencing must be tied to one explicit PR number and one explicit branch throughout a cycle. Recent live evidence showed the chain could still drift, leaving the newest PR partially analyzed while older PR state remained in play.

### 3. Diagnostics were validating the wrong thing

If the scripts say duplicate PRs are healthy, the operator gets bad feedback and the pipeline can keep marching in the wrong direction. Before workflow logic can be trusted, the debugging and auditing layer has to stop normalizing broken state.

### 4. Status discussions are too optimistic

The generated status and audit discussions are useful inputs, but they are not trustworthy enough to substitute for PR markers, issue comments, branch-level workflow timelines, and explicit harmony checks.

## Desired Deterministic Flow

The intended flow is still the correct one:

1. One `agent:in-progress` issue.
2. One draft PR for that issue.
3. Sequential analyzer chain `A -> B -> C` on that exact PR.
4. Router runs after Analyzer C on that exact PR.
5. If blockers exist, the implementer updates that exact PR branch.
6. If all analyzers pass, the router moves the PR to the human-review path.

Any state where one issue maps to multiple open agent PRs should be treated as a hard failure.

## Recovery Order

### Phase 1: Fix the observer

1. Make all debug scripts fail loudly on duplicate PR state.
2. Make timeline analysis branch-accurate.
3. Stop using optimistic status discussions as authoritative incident state.

### Phase 2: Fix the hot path

1. Remove or hard-fail the implementer fallback that creates a superseding PR when updating an existing PR branch fails.
2. Make targeted analyzer dispatch impossible to run with an empty or ambiguous PR number.
3. Enforce `one issue -> one open agent PR` as an invariant in the live pipeline.

### Phase 3: Clean the live incident

1. Decide which PR is authoritative only after the workflow logic is fixed.
2. Clean up the stale PR once the system can continue on a single path.
3. Re-run the cycle and require the system to prove the flow autonomously.

## Operating Rules For Future Sessions

When resuming SFL debugging:

1. Start with `ensure-auth.ps1`.
2. Run `snapshot.ps1`, `marker-check.ps1`, and `workflow-timeline.ps1` on each live PR.
3. Read the linked issue comments and the relevant PR comments before proposing a fix.
4. Check GitHub Discussions for the latest `repo-status`, `repo-audit`, and `SFL Activity Log` entries, but treat them as secondary evidence.
5. Update this document before and after major workflow changes.

## Current Decision Log

- 2026-03-07: The live state is officially considered split-brain because Issue `#128` has both PR `#129` and PR `#131` open.
- 2026-03-07: The duplicate-PR fallback is now treated as a first-class bug, not an acceptable recovery path.
- 2026-03-07: Script-level truthfulness is part of the fix. If the diagnostics lie, the operator cannot make sound decisions.

## Accountability Log

- 2026-03-07 18:28 local: Added this tracker and corrected snapshot, timeline, and PR forensics so duplicate PR state is surfaced as failure.
- 2026-03-07 18:31 local: Confirmed `health-check.ps1` still reported issue/PR harmony as clean even during the split-brain incident.
- 2026-03-07 18:32 local: Began hardening targeted handoff rules so blank PR inputs and one-issue-two-PR state are treated as explicit workflow failures.