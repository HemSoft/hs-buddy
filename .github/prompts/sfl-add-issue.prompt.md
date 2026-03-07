---
agent: agent
description: Create a pipeline-ready issue for the Set it Free Loop.
---

# SFL — Add Issue to Pipeline

Interactively help the user create a well-formed issue that the SFL Issue
Processor can pick up immediately when it is created with `agent:fixable`.
The 30-minute cron remains a backstop if the immediate path does not fire.

---

## Step 1 — Understand what the user wants fixed

Ask the user what they want done. They may describe it in one sentence or
paste a code snippet. Gather enough detail to fill in the issue template below.

If the user's description is vague, ask clarifying questions until you can
answer all of these:

1. **What files are affected?** (paths and approximate line numbers)
2. **What is the current behavior / problem?**
3. **What should the fix look like?** (the mechanical change)
4. **Is the fix deterministic?** (one clear correct outcome per file)

---

## Step 2 — Assess risk

Determine the risk class together with the user:

| Risk | Description | Merge requirement |
|------|-------------|-------------------|
| **risk:trivial** | Cosmetic, formatting, typo, dead code removal — no behavioral change possible | Auto-merge (0 reviews) |
| **risk:low** | Mechanical refactor, adding missing attributes, removing unused imports — one clear correct outcome | Auto-merge (0 reviews) |
| **risk:medium** | Changes with limited behavioral impact, multiple valid approaches possible | 1 approved review |
| **risk:high** | Significant behavioral change, cross-cutting concern, or security-adjacent | 1 human review required |

Risk labels are informational for reviewer visibility and governance. They do
not block the Issue Processor from claiming the issue.

---

## Step 3 — Compose the issue

Build the issue using this exact structure. Show it to the user for approval
before creating it.

**Title format**: `[sfl] <short description of the fix>`

**Body**:

```markdown
## Category

<shared finding category, e.g., Dead Code, Accessibility, Configuration Hygiene>

## Pattern

<the common fix pattern, e.g., "remove unused export", "add role attribute to
clickable div">

## Affected files

- [ ] `<file-path>:<line>` — <what to change>
- [ ] `<file-path>:<line>` — <what to change>

## Acceptance criteria

<how to verify the fix is correct — e.g., "no TypeScript errors", "eslint
passes", "export is no longer referenced anywhere">

## Risk

`risk:<trivial|low|medium|high>` — <one-line justification>
```

**Labels**: `agent:fixable`, `enhancement`, `risk:<trivial|low|medium|high>`

---

## Step 4 — User approval

Show the composed title, body, and labels to the user. Ask:

> Does this look good? I'll create the issue and the pipeline should kick off
> immediately.

Wait for confirmation. If the user wants changes, revise and re-show.

---

## Step 5 — Create the issue

Run in the terminal:

```bash
gh issue create --repo "<owner>/<repo>" \
  --title "[sfl] <title>" \
  --body "<body>" \
  --label "agent:fixable" \
  --label "enhancement" \
  --label "risk:<trivial|low|medium|high>"
```

After creation, confirm the issue number and tell the user:

> Issue #N created. The dispatcher should kick off the Issue Processor
> immediately because the issue was created with `agent:fixable`. The 30-minute
> cron is still there as a fallback.

---

## Guardrails

- Never create an issue without user confirmation
- The body MUST contain all five sections (Category, Pattern, Affected files,
  Acceptance criteria, Risk) — the Issue Processor validates this
- Max 15 affected files per issue; if more, split into multiple issues
- Do not add `agent:in-progress` — that is the Issue Processor's job
- Risk labels are metadata only; do not imply that `risk:medium` or
  `risk:high` will be blocked automatically
