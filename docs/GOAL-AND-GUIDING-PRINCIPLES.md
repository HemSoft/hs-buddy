# Goal and Guiding Principles for hs-buddy

## The Goal

Deliver a **smooth, deterministic workflow** that takes a GitHub Issue all the
way to a Pull Request ready for human review — with as little left to chance as
possible.

AI models are non-deterministic by nature. Rather than hoping they "do the right
thing," we wrap every AI evaluation in **deterministic GitHub Actions orchestration**
that drives structured, auditable handoffs between pipeline stages. The agentic
workflow (GitHub Actions + gh-aw) owns the control flow; AI agents own the
analysis within each stage.

**In short:** GitHub Actions decides *what happens next*. AI decides *what to say
about the code*. The two concerns never bleed into each other.

### What this looks like in practice

- Every state transition is driven by a **deterministic shell script or workflow
  job** — not by an AI agent choosing what to do next.
- AI agents produce structured output (markers, verdicts, labels) that
  downstream deterministic logic can parse reliably.
- If the pipeline stalls, the cause is always traceable to a specific workflow
  step, never a vague "the model didn't feel like it."
- Human review is the final gate. Everything before it is automated, auditable,
  and repeatable.

---

## Ideal Workflow Process

The happy path from issue to human-ready PR. Every handoff is deterministic.

| # | Workflow Name | Source | Destination | Trigger Mechanism | Label(s) | Description |
|---|---|---|---|---|---|---|
| 0 | `repo-audit` / `simplisticate` | Repository state | GitHub Issue | `workflow_dispatch` | Adds `agent:fixable`, `action-item`, and risk label to new action items | Produces focused, agent-fixable follow-up issues from audit findings |
| 1 | `issue-processor` | Issue with `agent:fixable` + `action-item` | Draft PR | `workflow_dispatch` via `sfl-dispatcher` | Reads `agent:fixable`; adds `agent:in-progress` to issue, `agent:pr` to PR | Claims the issue, implements the fix, and creates a draft PR |
| 2 | `pr-analyzer-a` | Draft PR | PR review/comment marker | `pull_request: opened` / dispatch | Reads `agent:pr`, `pr:cycle-N` | First full-spectrum review pass. Writes `[MARKER:pr-analyzer-a cycle:N]` + verdict and dispatches Analyzer B |
| 3 | `pr-analyzer-b` | Analyzer A dispatch | PR review/comment marker | `workflow_dispatch` | Reads `agent:pr`, `pr:cycle-N` | Second full-spectrum review pass. Writes `[MARKER:pr-analyzer-b cycle:N]` + verdict and dispatches Analyzer C |
| 4 | `pr-analyzer-c` | Analyzer B dispatch | PR review/comment marker | `workflow_dispatch` | Reads `agent:pr`, `pr:cycle-N` | Final review pass. Writes `[MARKER:pr-analyzer-c cycle:N]` + verdict |
| 5 | `pr-fixer` | Draft PR with analyzer findings | Updated draft PR | `workflow_dispatch` via `sfl-dispatcher` | Reads `agent:pr`, `pr:cycle-N`; advances cycle labels when fixes are applied | Applies analyzer feedback on the PR branch and leaves promotion to `pr-promoter` |
| 6 | `pr-promoter` | Draft PR with all analyzer PASS verdicts | Ready PR or merged PR | `workflow_dispatch` via `sfl-dispatcher` | Adds `human:ready-for-review` after promotion; merges approved ready PRs | Converts clean draft PRs to ready-for-review and squash-merges approved ready PRs |

**Background:** `sfl-dispatcher` is the manual orchestration entry point for
the SFL workflow set, and `sfl-auditor` detects and repairs state
discrepancies (orphaned labels, stale in-progress issues, missing PRs, etc.).

---

## Guiding Principles

### 1. Simplicity over Complexity

If you can remove something, that is always better than adding something to fix
it. When a problem arises, the first question is "what can we take away?" — not
"what can we bolt on?" Striving for simplicity in every layer (workflows,
prompts, code) is key.

### 2. Determinism over Discretion

Never leave the next step up to an AI model's judgment. Control flow must be
deterministic: shell scripts, workflow jobs, labels, and structured markers
decide what happens next — not a model interpreting free-form text. Labels are
the primary state mechanism; deterministic YAML workflows read labels to decide
routing. If an agent has to *decide* the next pipeline action, the design is
wrong.

### 3. Ask, Don't Assume

When there is ambiguity or missing information, **ask clarifying questions**
before proceeding. This applies to both humans and agents. Guessing leads to
wasted work, incorrect fixes, and scope creep. A short pause to clarify is
always cheaper than undoing a wrong assumption.
