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
| 0 | `discussion-processor` | Audit/Doctor/Simplisticate discussion | GitHub Issue | `discussion: labeled` | Adds `agent:fixable` + risk label to new issue | Groups agent-fixable findings from audit discussions into categorized issues |
| 1 | `sfl-issue-processor` | Issue with `agent:fixable` | Draft PR | `issues: opened/reopened` | Reads `agent:fixable`; adds `agent:in-progress` to issue, `agent:pr` + `pr:cycle-0` to PR | Claims the issue, implements the fix, creates a draft PR, dispatches Analyzer A |
| 2 | `sfl-analyzer-a` | Draft PR | PR comment marker | `pull_request: opened` / dispatch | Reads `agent:pr`, `pr:cycle-N` | Claude Sonnet reviews for correctness, security, performance, style. Writes `<!-- MARKER:sfl-analyzer-a -->` + verdict to PR comment. Dispatches Analyzer B |
| 3 | `sfl-analyzer-b` | Analyzer A dispatch | PR comment marker | `workflow_dispatch` | Reads `agent:pr`, `pr:cycle-N` | Claude Opus 4.6 reviews (different model than A). Writes `<!-- MARKER:sfl-analyzer-b -->` + verdict. Dispatches Analyzer C |
| 4 | `sfl-analyzer-c` | Analyzer B dispatch | PR comment marker + label | `workflow_dispatch` | Reads `agent:pr`, `pr:cycle-N`; adds `analyzer:blocked` if BLOCKING | GPT reviews (third model). Writes `<!-- MARKER:sfl-analyzer-c -->` + verdict. Dispatches label-actions |
| 5 | `sfl-pr-label-actions` | Analyzer C dispatch | Ready PR or fix cycle | `workflow_dispatch` | Reads `analyzer:blocked`, `human:ready-for-review` | Deterministic aggregator: if `analyzer:blocked` → removes label, dispatches issue-processor for fix. If all PASS → adds `human:ready-for-review`, flips draft → ready |

**Background:** `sfl-auditor` runs daily (~5:57 AM EDT) to detect and repair state
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
