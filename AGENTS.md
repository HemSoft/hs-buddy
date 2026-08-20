# Copilot Instructions for hs-buddy

> **Start here → [GOAL-AND-GUIDING-PRINCIPLES.md](docs/GOAL-AND-GUIDING-PRINCIPLES.md)** — the goal and guiding principles
> for this repository. Everything in this file serves that goal.
>
> **This file should ideally be empty until the architecture changes.**
> If every workflow is correct and self-documenting, nothing else belongs here.
> Do not add entries that duplicate what the workflows already enforce.

## Standing Orders

### 1. HemSoft Identity Requirement

All work against **`HemSoft/hs-buddy`** belongs to the **`HemSoft`** identity.
Use `HemSoft` exclusively for GitHub CLI and Git operations. Before any GitHub
CLI operation, run `gh auth status` and verify that `HemSoft` is active. Do not
switch to or attribute repository work to `fhemmerrelias` or any other account.

### 2. Risk Acknowledgment for Agent Fixes

Medium or high risk is **not** a reason to mark a finding as non-agent-fixable.
Agents should still attempt the fix. When the resulting PR reaches human review,
the risk level and a brief justification must be visible in the linked issue
body so the reviewer knows what to scrutinize.

Such issues must have the appropriate `risk:medium` or `risk:high` label and
include a **Risk Acknowledgment** line in the issue body.

### 3. Capture Lessons in Skills

When an interactive session produces a new insight, instruction, or correction
that would improve future runs, update the relevant skill file — not just
this document. AGENTS.md is for standing orders; skills carry domain knowledge.

### 4. Never Edit `.lock.yml` Files Directly

Files matching `.github/workflows/*.lock.yml` are **auto-generated** by the
gh-aw compiler from their corresponding `.md` source files. Any manual edits
will be silently overwritten on the next compile. Always edit the `.md` source
and recompile.

---

## Code Quality Tooling

This project enforces code health with two complementary tools. Both run in
CI and should be run locally before pushing.

### Knip (dead code & unused dependencies)

- **Run**: `bun run knip`
- **Config**: `knip.json` — entry points for Electron, Convex, scripts.
- **Policy**: zero suppressions. Every finding must be fixed (remove the dead
  code, unused export, or unused dependency). Never add `ignoreDependencies`,
  `ignoreBinaries`, or `rules` to knip.json.
- **CI**: runs in the `lint` job and blocks the build on failure.

### e18e (dependency health & migration)

- **Analyze**: `bun run e18e` — reports duplicate transitive dependencies,
  bloated packages, and packaging suggestions.
- **Migrate**: `bun run e18e:migrate` — auto-replaces heavy packages with
  lighter alternatives where possible (e.g. `chalk` → native, `rimraf` →
  `fs.rm`). Run periodically and review the diff.
- **CI**: runs in the `lint` job as an informational step (`continue-on-error:
true`) since most findings are in transitive dependencies we don't control
  directly. Treat direct-dependency findings as actionable.

---

## App Guardrail

For broader product and architecture direction, prefer [VISION.md](VISION.md)
and the codebase itself. Keep AGENTS.md limited to easy-to-miss, always-on
constraints.

### Frameless Window

This app uses `frame: false` — the native menu bar is HIDDEN. ALL menus
(File, Edit, View, Help) MUST be in the custom `TitleBar.tsx` component, not
in `electron/main.ts`. The Electron menu template only handles keyboard
shortcuts.
