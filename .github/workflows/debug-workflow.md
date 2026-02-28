---
description: |
  Temporary debug workflow. Tests whether the agentic model can read
  the mergeable state of pull requests. DELETE AFTER TESTING.

on:
  workflow_dispatch:

permissions:
  contents: read
  pull-requests: read

engine:
  id: copilot
  model: claude-sonnet-4.6

network: defaults

tools:
  github:
    lockdown: false

safe-outputs:
  add-comment:
    target: "*"
    max: 1
---

# Debug — Mergeable State Check

This is a temporary debug workflow. Delete after testing.

## Task

1. List all open pull requests in this repository that have the label
   `human:ready-for-review`.

2. For EACH PR found, retrieve the full PR detail and check:
   - `mergeable` field (MERGEABLE, CONFLICTING, or UNKNOWN)
   - `mergeStateStatus` field (CLEAN, DIRTY, BLOCKED, etc.)

3. Post a single comment on the FIRST PR found with your findings in this
   exact format:

```
## 🔍 Debug — Mergeable State Check

| PR | mergeable | mergeStateStatus |
|----|-----------|-----------------|
| #<number> | <value> | <value> |
| #<number> | <value> | <value> |

**How I retrieved this**: <describe the exact API call or tool you used>
```

If you cannot read the `mergeable` or `mergeStateStatus` fields, say so
explicitly and describe what fields ARE available to you on the PR object.
