# Copilot Instructions for hs-buddy

> **This file should ideally be empty until the architecture changes.**
> Standing orders and guidelines below exist only because the agentic loop
> needs guardrails. If every workflow is correct and self-documenting,
> nothing else belongs here. Do not add entries that duplicate what the
> workflows already enforce.

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

### 4. Idempotency and Concurrency Are Non-Negotiable

Every workflow runs on a cron schedule. Multiple instances may overlap, events may fire twice.

- **Marker-based idempotency**: Check for marker comments (e.g., `<!-- pr-analyzer-a cycle:0 -->`) before writing.
- **Claim-before-work**: Atomically claim resources (e.g., swap `agent:fixable` → `agent:in-progress`).
- **No duplicate PRs/comments**: Verify before creating.
- **Concurrency groups**: Every `.lock.yml` uses `concurrency: group: "gh-aw-${{ github.workflow }}"`.
- **Stateless design**: All state lives in GitHub (labels, comments, branches, PRs).

### 5. What "Harmony" Means

The pipeline is in harmony when ALL of the following are true:

- Every `agent:in-progress` issue has exactly one open PR with branch `agent-fix/issue-<number>-*`
- No issue has both `agent:in-progress` and `agent:fixable` simultaneously
- No `agent:pause` label exists without an explanatory comment
- No open `agent-fix/` PR exists whose linked issue is closed or lacks `agent:in-progress`
- No `agent:fixable` issue has been waiting more than 2 cron cycles without being claimed

If any are violated, the SFL Auditor should detect and repair it automatically. If it doesn't, that is a bug in the SFL Auditor.

### 6. Workflow-Only State Changes (No Manual Bypass)

- Do **NOT** manually un-draft PRs, relabel loop issues/PRs, or close loop PRs as a normal fix path.
- Fix the workflow prompt/logic so the next run resolves it.
- Emergency manual intervention must be followed by a workflow fix in the same session.
- Human handoff is complete only when both: (1) PR is non-draft, and (2) PR has `human:ready-for-review` label.

### 7. Promoter Auth Requirement

`pr-promoter` depends on authenticated `gh` CLI calls inside the agent runtime. The execution environment MUST receive `GITHUB_TOKEN` (and `GH_TOKEN`) from workflow secrets/context. Any workflow refactor touching `pr-promoter.lock.yml` must preserve token injection.

### 8. Credential Attribution Requirement

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
