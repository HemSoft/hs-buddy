---
description: |
  This workflow runs a daily code simplification audit to identify unnecessary
  complexity, over-engineering, dead code, and opportunities for targeted
  simplification. It creates one summary report issue and individual
  agent-fixable issues for low-risk simplifications an agent can apply autonomously.

on:
  schedule: "0 6 * * *"   # 1:00 AM EST
  workflow_dispatch:

engine:
  id: codex
  model: gpt-5.5

permissions:
  contents: read
  issues: read
  pull-requests: read

network: defaults

tools:
  github:
    lockdown: false

safe-outputs:
  create-issue:
    title-prefix: "[simplisticate] "
    labels: [report, audit]
    max: 10
  update-issue:
    target: "*"
    max: 5
---

# Daily Simplisticate Audit

> *"Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away."* — Antoine de Saint-Exupéry

Run a high-signal daily code simplification audit. Produce a summary report
issue and individual fixable issues for simplifications an agent can apply
autonomously.

## Step 0 — Close previous simplisticate summary reports

Before creating today's audit, search for all **open** issues whose title
starts with `[simplisticate] Daily Simplisticate Audit` AND that have both
`report` and `audit` labels. For each one found, close it using
`update_issue` with:

- `issue_number`: the issue number
- `status`: `"closed"`

Do NOT close agent-fixable action-item issues — only the dated summary reports.

## Goals

- Identify unnecessary complexity that can be safely reduced
- Surface dead code, unused abstractions, and over-engineering
- Find duplicated logic that can be consolidated
- Recommend small, targeted simplifications with risk assessment

## Complexity Signals to Detect

| Signal | Description |
|--------|-------------|
| Deep nesting | >3 levels of indentation |
| Long methods | Functions >30 lines |
| Too many parameters | 4+ parameters |
| Excessive abstractions | Interfaces with single implementations |
| Duplicated logic | Similar code in multiple places |
| Complex conditionals | Nested if/else, long switch statements |
| Over-engineering | Patterns where simpler solutions exist |
| Dead code | Unused variables, methods, imports, files |
| Tangled dependencies | Circular or convoluted dependency chains |
| Magic values | Hardcoded numbers/strings without explanation |

## Audit Scope

1. **Dead Code & Unused Exports**
   - Unused variables, functions, imports, and type exports
   - Files that are never referenced from any other file
   - Config keys or env vars that appear unused

2. **Over-Engineering**
   - Abstractions with only one implementation
   - Wrapper functions that add no value
   - Unnecessary indirection layers
   - Premature generalization

3. **Duplication**
   - Repeated logic blocks across files
   - Copy-paste patterns that should be consolidated
   - Near-identical utility functions

4. **Excessive Complexity**
   - Deeply nested control flow (>3 levels)
   - Functions with too many responsibilities
   - Complex boolean expressions that could be simplified
   - Long parameter lists

5. **Stale Patterns**
   - Legacy patterns when modern alternatives exist
   - Verbose code that can leverage newer language/framework features
   - Unnecessary defensive coding against impossible scenarios

## Output Requirements

### Summary issue (always)

Create one summary issue with labels `report` and `audit` containing:

- Executive summary (overall code simplicity health)
- Findings table with:
  - Location (file + line range)
  - Complexity signal type
  - Severity (low / medium / high)
  - Risk of simplification (🟢 Low / 🟡 Medium / 🔴 High)
  - Whether the finding is agent-fixable
- A short "No action required" section if everything looks clean

### Per-finding issues (for agent-fixable findings only)

For each finding that meets ALL of the following criteria, create a separate issue:

- The simplification is **scoped to one or two files** — no broad refactors
- The simplification is **deterministic** — there is one clear correct outcome
- Risk is 🟢 Low (`risk:trivial` or `risk:low`)
- No user-facing behavioral change
- The resulting code is strictly simpler (fewer lines, fewer branches, fewer abstractions)

Label each agent-fixable issue with: `action-item`, `agent:fixable`, and the appropriate risk label (`risk:trivial` or `risk:low`).

Issue title format: `[simplisticate] <short description of the specific simplification>`

Before creating a per-finding issue, compute a stable idempotency key:

1. Normalize the source token from the finding file path:
   - resolve to a repo-relative path
   - replace backslashes with forward slashes
   - remove leading `./`, trailing slashes, and non-printable characters
   - lowercase, trim, and collapse whitespace to a single space
   - if the result is longer than 120 characters or contains `-->`, replace it
     with `source-<sha256-hex-lowercase(normalized-source).substring(0, 16)>`,
     where the digest is SHA-256 encoded as lowercase hexadecimal and truncated
     to the first 16 hex characters.
2. Normalize the finding input by concatenating the line range, complexity
   signal, and proposed simplification preview with `|` separators:
   - format the line range as `<start>-<end>` with no spaces or prefixes, for
     example `42-58`; convert variants such as `L42-L58`, `42:58`, or
     `42 - 58` to that canonical format before concatenation
   - use the exact complexity signal string from the Complexity Signals table
   - use the first 100 Unicode code points of the proposed simplification, not
     UTF-8 bytes or grapheme clusters
   - lowercase, trim, collapse whitespace to a single space, and remove
     non-printable characters after concatenation
3. Hash the normalized finding input by computing its SHA-256 digest, encoding
   it as lowercase hexadecimal, then taking the first 16 hex characters:
   `<sha256-hex-lowercase(normalized-finding).substring(0, 16)>`. Do not use
   base64, uppercase hexadecimal, or any other digest encoding.

Include the key in the body:

```md
<!-- agent:idempotency-key: simplisticate:<normalized-source>:<finding-hash> -->
```

Search open issues labeled `action-item` for the exact idempotency key in the
issue body HTML comment. If a matching open issue already exists, update that
issue by replacing the **Finding**, **Complexity Signal**,
**Proposed Simplification**, **Before/After**, **Acceptance Criteria**, and
**Risk** sections with the latest evidence while preserving the original title
and labels. If no key match is found, create a new issue. Do not rely on exact
title matching for deduplication, and do not create duplicate action-item issues
for the same file, finding, and proposed simplification.

Issue body must include:

- **Finding**: What complexity was detected and where (file path, line range)
- **Complexity Signal**: Which signal type from the table above
- **Proposed Simplification**: Exactly what change to make
- **Before/After**: Brief code sketch showing the improvement
- **Acceptance Criteria**: How to verify the simplification is correct
- **Risk**: `risk:trivial` or `risk:low` with justification

Do NOT create agent-fixable issues for:

- Findings requiring architectural decisions
- Findings that touch more than 3 files
- Anything with 🟡 Medium or 🔴 High risk
- Simplifications where multiple valid approaches exist
- Changes that would alter external behavior

Cap total agent-fixable issues at 3 per run to avoid noise.

## Process

1. Inspect repository file structure and identify key source directories
2. Scan source files for complexity signals
3. Cross-reference findings with test coverage and usage patterns
4. Assess risk of each potential simplification
5. Compile findings with severity, risk, and agent-fixability assessment
6. Create summary report issue
7. For each qualifying finding, create a scoped agent-fixable issue
