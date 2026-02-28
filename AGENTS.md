# Copilot Instructions for hs-buddy

> **This file should ideally be empty until the architecture changes.**
> Standing orders and guidelines below exist only because the agentic loop
> needs guardrails. If every workflow is correct and self-documenting,
> nothing else belongs here. Do not add entries that duplicate what the
> workflows already enforce.
>
> Please make sure to always consider and prefer to search for documentation using Context7 and the web fetch and web repo tools.

## Agentic Loop — Standing Orders

The agentic loop lives in `.github/workflows/`. Its mission:
**GitHub Actions, GitHub Issues, and GitHub Pull Requests must be in perfect harmony at all times.**

See [.github/workflows/README.md](.github/workflows/README.md) for the workflow schedule and catalog.

### 1. SFL Auditor is First

If the SFL Auditor has failed, is producing incorrect output, or missed a discrepancy — **fix the SFL Auditor before doing anything else.** No other pipeline work takes precedence.

### 2. Teach, Don't Just Fix

When you observe a state discrepancy (e.g., `agent:in-progress` issue with no open PR, conflicting labels, orphaned branches):

1. Fix the immediate symptom if urgent.
2. Identify what SFL Auditor check would have caught this.
3. Propose an improvement to `sfl-auditor.md` that would prevent recurrence.

### 3. Propose Before You Commit (Interactive Sessions)

During interactive sessions, **always propose SFL Auditor improvements explicitly before making changes**. State what you observed, what check is missing, and what the fix would be. Wait for user approval.

### 4. Hands-Off Prime Directive

**Never manually nudge the SFL pipeline.** The system must prove itself autonomously.

- Do **NOT** manually dispatch workflows "to help" the pipeline along.
- Do **NOT** manually un-draft PRs, relabel loop issues/PRs, flip labels, or close loop PRs.
- Do **NOT** manually merge PRs that the pipeline should be merging.
- The only permitted manual actions are:
  - **Configuration changes** (`sfl-config.yml`) — human-only by design.
  - **Enabling/disabling workflows** — during gradual rollout only.
  - **Human code review** — when `auto-merge` is `false`.
- If the pipeline isn't doing what it should, **fix the workflow logic** so the next scheduled run resolves it. Don't work around it.
- Emergency manual intervention must be followed by a workflow fix in the same session.

### 5. Credential Attribution Requirement

Default all CLI and workflow token usage to the **`fhemmerrelias`** identity unless explicitly overridden by a human.

### 9. Risk Acknowledgment for Agent Fixes

Medium or high risk is **not** a reason to mark a finding as non-agent-fixable.
Agents should still attempt the fix. When the resulting PR reaches human review
(via PR Promoter), the risk level and a brief justification must be visible in
the linked issue body so the reviewer knows what to scrutinize.

Workflow prompts must label such issues with the appropriate `risk:medium` or
`risk:high` label and include a **Risk Acknowledgment** line in the issue body.

### 10. Capture Lessons in Skills

When an interactive session produces a new insight, instruction, or correction
that would improve future runs, update the relevant skill file — not just
this document. AGENTS.md is for standing orders; skills carry domain knowledge.

---

## Development Guidelines

### Design Principles

1. **Consistency with hs-conductor**: Mimic the look, feel, and architecture of [hs-conductor/admin](https://github.com/HemSoft/hs-conductor)
2. **No Server Component**: Purely a client-side Electron app (backend is Convex cloud)
3. **Beautiful & Functional**: High-quality UI that's both aesthetically pleasing and highly functional
4. **Extensible**: Built to easily add new views and capabilities

### When Adding Features

1. Check hs-conductor/admin for similar patterns
2. Use the same UI component libraries (React Complex Tree, Allotment, Monaco Editor, VSCode WebView UI Toolkit, lucide-react)
3. Follow the established directory structure
4. Maintain the VSCode-inspired dark theme aesthetic
5. Use TypeScript strictly — maintain type safety
6. Follow ESLint and Prettier code style

### Frameless Window

This app uses `frame: false` — the native menu bar is HIDDEN. ALL menus (File, Edit, View, Help) MUST be in the custom `TitleBar.tsx` component, not in `electron/main.ts`. The Electron menu template only handles keyboard shortcuts.
