# SFL Lessons Learned

Operational lessons captured during SFL development and debugging sessions.
Each entry records what happened, why, and what to do differently.

---

## Format

```markdown
### {YYYY-MM-DD} — {One-line summary}

**Context**: What was happening  
**Problem**: What went wrong  
**Root Cause**: Why it went wrong  
**Resolution**: How it was fixed  
**Takeaway**: What to remember for next time
```

---

### 2026-02 — Initial Architecture Iteration

**Context**: Building the SFL pipeline from scratch in hs-buddy as testing ground.  
**Problem**: Complexity grew quickly as intermediary workflows were added to work
around the agentic-cannot-trigger-agentic constraint.  
**Root Cause**: The safe-outputs system intentionally prevents cascading agentic
triggers for safety, but this forces standard YAML intermediaries.  
**Resolution**: Initially accepted `sfl-dispatcher` as a temporary workaround
and established the 14-workflow ceiling as a complexity guardrail. Later
iterations replaced the polling dispatcher with direct handoffs.  
**Takeaway**: Every new workflow file must be justified against this ceiling.
Ask "can an existing workflow handle this?" before creating a new file.

---

### 2026-02-28 — Complexity spiral from reactive platform constraint discovery

**Context**: PR Fixer workflow needed to push fixes to existing PR branches.
`create_pull_request` safe-output always creates a NEW branch — the agent cannot
push to existing branches. This was assumed to be a hard platform constraint.  
**Problem**: Instead of questioning the design, each workaround added more logic:
supersession model (new PR per fix), cumulative cycle tracking via META tags,
old-PR closing, fix record posting. PR Fixer prompt grew to ~365 lines.  
**Root Cause**: Platform constraints were discovered reactively (after failures)
rather than proactively (reading tool descriptions). Each workaround was treated
as "the fix" without asking whether the overall design should change.  
**Resolution**: Web research on 2026-02-28 revealed `push-to-pull-request-branch`
safe-output existed all along. The entire supersession model was unnecessary —
the fixer CAN push to existing PR branches. Additionally, `add-comment`,
`close-pull-request`, `add-labels`, and `remove-labels` were all available but
never configured. See constraints.md for the full safe-output type inventory.  
**Takeaway**: ALWAYS verify platform constraints against official docs at
`https://github.github.com/gh-aw/reference/safe-outputs/` — never infer
capabilities from existing code alone. The code only shows what was configured,
not what's available.

### 2026-02-28 — Cross-session complexity blindness

**Context**: Over a week of iterations, each session's agent added complexity to
fix the last session's problems. No single session saw the full picture.  
**Problem**: 40 labels (limit: 25), fixer prompt at 365 lines, 4+ state tracking
mechanisms per workflow, every metric at or over its ceiling.  
**Root Cause**: Each agent session starts fresh with no memory of the complexity
trajectory. The "simplicity" guardrails exist in docs but no agent enforced them.  
**Resolution**: Pending — TODO items created for systematic simplification.  
**Takeaway**: At the START of every SFL session, run a complexity check:
count workflows, labels, prompt lines, and state mechanisms. Compare against
ceilings. If anything is at or over the limit, address that BEFORE adding
anything new.

---

*Add new lessons below this line. Most recent at the bottom.*

### 2026-02-28 — Code-only capability assessment misses available features

**Context**: Designing the simplified architecture, I stated that `add-comment`
and `create-pull-request-review-comment` were NOT available as safe-output types.
User challenged: "How exactly are you determining that?"  
**Problem**: I had only inspected existing `.lock.yml` files and configured
safe-outputs to determine what was available. The code showed what WE configured,
not what the PLATFORM offers.  
**Root Cause**: Lazy capability assessment — grepping existing code instead of
consulting the official documentation. This is a form of anchoring bias: existing
code defines the mental model of what's possible.  
**Resolution**: Fetched `https://github.github.com/gh-aw/reference/safe-outputs/`
and discovered 25+ safe-output types, including `push-to-pull-request-branch`,
`add-comment`, `close-pull-request`, `add-labels`, `remove-labels`,
`dispatch-workflow`, and more. The entire supersession model was unnecessary.  
**Takeaway**: When determining platform capabilities, ALWAYS check official docs
first. Existing code shows what was configured, not what's available. This
applies to any platform: GitHub Actions, Convex, Electron — check the docs,
not just the codebase.

### 2026-03-03 — PR approval requires a distinct reviewer identity

**Context**: Added and tested `scripts/pr-approve.ps1` to auto-select the oldest
`human:ready-for-review` PR and approve it when SFL criteria are met.  
**Problem**: Approval failed even with correct auth preflight (`fhemmerrelias`).  
**Root Cause**: GitHub blocks self-approval (`Review Can not approve your own
pull request`). Switching to `fhemmer2-relias` also failed because that account
did not have access to `relias-engineering/hs-buddy`.  
**Resolution**: Keep `pr-approve` criteria gate + auto-selection, but require a
reviewer identity that both (a) is not the PR author and (b) has repo access.
When no such reviewer is available, fallback was an explicit
`gh pr merge --squash --delete-branch --admin` with human instruction.  
**Takeaway**: "Correct auth" means both identity mapping and repository access.
For SFL approval automation, provision a dedicated non-author reviewer account
with org/repo access; otherwise approval will fail by design.
