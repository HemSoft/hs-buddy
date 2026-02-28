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
**Resolution**: Accepted `sfl-dispatcher` as a necessary evil, established the
14-workflow ceiling as a complexity guardrail.  
**Takeaway**: Every new workflow file must be justified against this ceiling.
Ask "can an existing workflow handle this?" before creating a new file.

---

*Add new lessons below this line. Most recent at the bottom.*
