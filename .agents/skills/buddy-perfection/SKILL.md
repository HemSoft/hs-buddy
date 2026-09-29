---
name: buddy-perfection
description: 'V1.1 - Commands: audit, fix. Audits hs-buddy against its declared quality gates and fixes confirmed failures without weakening policy.'
disable-model-invocation: true
hooks:
  PostToolUse:
    - matcher: 'Read|Write|Edit'
      hooks:
        - type: prompt
          prompt: |
            If a file was read, written, or edited in the buddy-perfection directory, verify that History/{YYYY-MM-DD}.md contains an entry for this interaction with an exact shell timestamp, action, one-line summary, and retrospective result.
  Stop:
    - matcher: '*'
      hooks:
        - type: prompt
          prompt: |
            Before stopping after buddy-perfection was used, verify that History/{YYYY-MM-DD}.md contains an entry formatted as "## HH:MM - {Action Taken}" with a one-line summary and retrospective result. Get HH:MM from the shell, never an estimate. Block completion if the entry is missing.
---

# Buddy Perfection

Audit hs-buddy against its current repository policy. CI, package scripts,
configuration, and repository instructions are authoritative. Do not impose a
generic target such as 100 percent coverage unless the repository declares it.

[`scripts/whats-next.ps1`](../../../scripts/whats-next.ps1) runs a local baseline
for TypeScript, ESLint, renderer coverage, CRAP, Knip, Prettier, Markdown,
a fresh production build, CSP, bundle size, e18e, dependency boundaries,
quality lint, Electron security, React Doctor, and scorecard. It does not
replace live discovery or the required hosted `ci-complete` check.

The version 2 JSON report names the score `BaselineScore`, sets
`FullQualification` to false, and accounts for all CI jobs in `CIGates`.
Independent jobs have explicit exclusion reasons. Unknown CI jobs are blocked
until their scope is accounted for. `CoveragePolicy` reads the maintained
suite configurations and keeps the renderer's reporting-only 100% goal
separate from enforced thresholds. Dependency warnings remain nonblocking
under the configured architecture policy, but their counts remain visible.

Use `-PlanOnly -Json` to inspect targets and scope without running gates.
Use `-Gates 'Bundle Size' -Json` for a focused check; the runner also executes
the required fresh production build. Existing artifacts never substitute for
a successful build from the current invocation. Use a disposable checkout
for read-only audits because checks create build and report files. The runner
never installs prerequisites or changes credentials.

JSON statuses are `PASS`, `FAIL`, `BLOCKED`, `EXCLUDED`, or `PLANNED`.
Exit 1 means a gate failed, exit 2 means a prerequisite or measurement was
blocked, and exit 0 means no attempted gate failed or was blocked. Excluded
and planned checks are not passes. `-SkipScorecard` explicitly excludes that
external measurement. `-KeepGoingOnMissingTools` remains accepted; missing
prerequisites are always recorded and independent gates continue. Failed native
commands retain their full output in the result's `Output` field for diagnosis.
The contract tests require PowerShell 7 and explicitly skip when it is absent.
Set `PWSH_EXECUTABLE` to its executable path when it is installed outside `PATH`.

## Commands

### `audit`

1. Read the applicable `AGENTS.md` and `docs/GOAL-AND-GUIDING-PRINCIPLES.md`.
2. Inspect the working tree and preserve all existing changes.
3. Discover gates and targets from CI, `package.json`, configuration, and
   repository scripts. Compare them with `scripts/whats-next.ps1`; report drift
   instead of trusting either source silently.
4. Run the baseline without stopping at the first missing tool:

   ```powershell
   .\scripts\whats-next.ps1 -KeepGoingOnMissingTools
   ```

5. Run every independent declared gate absent from the baseline, even after
   another gate fails. Record exact commands, exit codes, targets, and evidence.
6. Mark a gate `blocked` when credentials, services, tools, or runtime prevent a
   valid result. Do not install dependencies, change configuration, or trigger
   remote workflows during a read-only audit.
7. Never estimate coverage, CRAP, scorecard, or other metrics. Check external
   dashboards live or label their results as historical.
8. Inspect for material policy gaps such as ignored failures, warnings, stale
   exclusions, or untested error paths. Remove only known audit artifacts, then
   recheck the working tree.

Report:

| Gate | Command | Target | Result | Evidence |
| ---- | ------- | ------ | ------ | -------- |

Use `pass`, `fail`, or `blocked`, then state the highest-priority finding, any
policy drift, and the final working-tree state.

### `fix`

Run `audit`, then fix confirmed failures only when the user requested changes.

1. Reproduce one failure with its exact command.
2. Make the smallest root-cause fix that follows repository conventions.
3. Do not weaken thresholds, add suppressions, exclude code, or update snapshots
   only to make a gate pass.
4. Run the narrow proof, affected regression tests, and the complete audit.
5. Keep blocked gates visible and review the final diff and working tree.

Do not commit, push, create issues or pull requests, change remote settings, or
dispatch workflows unless the user separately requests that action.

## Repository rules

- Use the pinned Bun and Aspire versions.
- Knip allows no suppressions; fix every finding.
- Treat direct e18e findings as actionable and transitive findings as
  informational.
- Read coverage targets from current configs and CI. A reporting-only perfection
  target is not an enforced threshold.
- A clean audit means every discovered gate passed and no evidence-backed gap
  remains. It does not promise flawless code.

## History

After using this skill, append `## HH:MM - {Action Taken}` and a one-line
summary to `History/{YYYY-MM-DD}.md`. Note whether a retrospective found a
reusable improvement. Get the timestamp from the shell, never an estimate.
