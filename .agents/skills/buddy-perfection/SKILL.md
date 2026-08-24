---
name: buddy-perfection
description: "V1.1 - Commands: audit, fix. Audits hs-buddy against its declared quality gates and fixes confirmed failures without weakening policy."
disable-model-invocation: true
hooks:
  PostToolUse:
    - matcher: "Read|Write|Edit"
      hooks:
        - type: prompt
          prompt: |
            If a file was read, written, or edited in the buddy-perfection directory, verify that History/{YYYY-MM-DD}.md contains an entry for this interaction with an exact shell timestamp, action, one-line summary, and retrospective result.
  Stop:
    - matcher: "*"
      hooks:
        - type: prompt
          prompt: |
            Before stopping after buddy-perfection was used, verify that History/{YYYY-MM-DD}.md contains an entry formatted as "## HH:MM - {Action Taken}" with a one-line summary and retrospective result. Get HH:MM from the shell, never an estimate. Block completion if the entry is missing.
---

# Buddy Perfection

Audit hs-buddy against its current repository policy. CI, package scripts,
configuration, and repository instructions are authoritative. Do not impose a
generic target such as 100 percent coverage unless the repository declares it.

`scripts/whats-next.ps1` is the deterministic baseline runner for TypeScript,
ESLint, coverage, CRAP, Knip, Prettier, Markdown, bundle size, e18e, dependency
boundaries, React Doctor, and scorecard. It does not replace live discovery.

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
| --- | --- | --- | --- | --- |

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
