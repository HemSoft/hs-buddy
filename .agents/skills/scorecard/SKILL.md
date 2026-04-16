---
name: scorecard
description: >
  Commands: status, improve. Fetch and report on the org-metrics service maturity
  scorecard for this repository. Use when the user asks about scorecard status,
  score, classification, failing rules, or wants to improve the score.
---

# Scorecard — Service Maturity Skill

## Overview

The org-metrics scorecard measures repository health across Bronze, Silver, and
Gold tiers. Each tier has rules worth points; passing all rules in a tier earns
that classification. The score is the sum of all passed rule points out of 100.

**Scorecard source**: `relias-engineering/org-metrics` repo, file
`reports/scorecard-hs-buddy.html`. The report is static HTML with a JSON blob
in a `<script type="application/json" id="scorecard-data">` tag.

## Commands

### `scorecard status`

Default command when no arguments are provided. Fetches and displays the current
scorecard.

**Steps:**

1. Fetch the scorecard HTML from the org-metrics repo:

   ```bash
   gh api repos/relias-engineering/org-metrics/contents/reports/scorecard-hs-buddy.html --jq '.content'
   ```

2. Base64-decode the content and extract the JSON blob from the
   `<script type="application/json" id="scorecard-data">` tag.

3. **Log the score** to `score-history.log` in this skill's directory
   (`.agents/skills/scorecard/score-history.log`). Append one line per fetch
   using this pipe-delimited format:

   ```text
   <ISO-8601 timestamp> | <score>/<max> | <classification> | Bronze: <pts>/<max> (<passed>/<total>) | Silver: <pts>/<max> (<passed>/<total>) | Gold: <pts>/<max> (<passed>/<total>)
   ```

   Example:

   ```text
   2026-04-15T21:10:18Z | 54/100 | None | Bronze: 25/30 (6/7) | Silver: 11/35 (3/8) | Gold: 18/35 (4/6)
   ```

   Create the file if it does not exist. Always append — never overwrite.
   Only log after a successful fetch and JSON parse. If the fetch or parse
   fails, skip logging (do not write partial or error lines).

4. Present a concise report:

   ```markdown
   ## Scorecard Status — hs-buddy

   **Score**: X / 100 (Classification: None|Bronze|Silver|Gold)

   ### Tier Breakdown
   | Tier   | Passed | Total | Points | Max |
   |--------|--------|-------|--------|-----|
   | Bronze | X      | Y     | X      | 30  |
   | Silver | X      | Y     | X      | 35  |
   | Gold   | X      | Y     | X      | 35  |

   ### Failing Rules
   | Tier | Rule | Points | Detail |
   |------|------|--------|--------|
   | ...  | ...  | ...    | ...    |

   ### Passing Rules
   | Tier | Rule | Points |
   |------|------|--------|
   | ...  | ...  | ...    |

   ### Linting Summary
   | Language | Tool | Errors | Warnings | Files |
   |----------|------|--------|----------|-------|
   | ...      | ...  | ...    | ...      | ...   |

   _Report generated YYYY-MM-DD HH:MM ET_
   ```

### `scorecard improve`

Analyzes failing rules and recommends the single highest-impact improvement.

**Steps:**

1. Fetch and parse the scorecard (same as `status`).

2. Collect all rules where `passed` is `false`.

3. Classify each failing rule as agent-fixable or not:

   **Agent-fixable** (can be fixed by code changes):

   | Rule | Fix Strategy |
   |------|-------------|
   | Linter runs clean on primary language | Fix ESLint errors in source files |
   | Zero lint errors across all analyzed languages | Fix lint errors across all languages |
   | Zero lint warnings and errors (all languages) | Fix lint warnings (PSScriptAnalyzer, ESLint, etc.) |
   | License defined | Add LICENSE file |
   | CODEOWNERS file present | Add CODEOWNERS file |
   | EditorConfig or code-style enforcement | Add .editorconfig or Prettier config |
   | Repository has a README | Improve README.md |
   | Test framework configured | Add test configuration |
   | Coverage reporting in CI | Add coverage step to CI |
   | Code coverage 80% or greater | Add/improve tests |

   **NOT agent-fixable** (require admin/infra actions):

   | Rule | Reason |
   |------|--------|
   | Branch protection enabled | Requires repo admin settings |
   | Security scanning in CI or Dependabot enabled | Requires Dependabot enablement |
   | Has infrastructure-as-code | Requires architectural decision |

4. Select the single highest-impact agent-fixable rule using this priority:
   - Bronze failures first (required for any classification)
   - Highest points among same tier
   - Lowest complexity as tiebreaker

5. Present the recommendation:

   ```markdown
   ## Scorecard Improvement Recommendation

   **Current Score**: X / 100 (Classification: None|Bronze|Silver|Gold)

   ### Recommended Fix

   - **Rule**: <Rule Title>
   - **Tier**: Bronze|Silver|Gold
   - **Points**: X pts
   - **Current Detail**: <detail from scorecard data>
   - **Projected Score**: ~X / 100 after fix

   ### Fix Strategy

   <Specific actionable steps to fix this rule>

   ### Non-Agent-Fixable Failures (informational)

   | Rule | Tier | Points | Why |
   |------|------|--------|-----|
   | ...  | ...  | ...    | Requires admin action |
   ```

6. Ask the user if they want to:
   - Create an SFL issue for the recommended fix (use the `sfl` skill)
   - Implement the fix directly in the current session

## JSON Data Structure Reference

The scorecard JSON blob has this structure:

```json
{
  "classification": {
    "level": "None|Bronze|Silver|Gold",
    "numericScore": 54,
    "maxPoints": 100,
    "bronze": { "passed": 6, "total": 7, "points": 25, "maxPoints": 30, "achieved": false },
    "silver": { "passed": 3, "total": 8, "points": 11, "maxPoints": 35, "achieved": false },
    "gold":   { "passed": 4, "total": 6, "points": 18, "maxPoints": 35, "achieved": false },
    "score":  { "percent": 62.0, "passed": 13, "total": 21 }
  },
  "rules": [
    {
      "level": "Bronze|Silver|Gold",
      "passed": true,
      "points": 5,
      "detail": "descriptive detail",
      "title": "Rule name",
      "source": "GitHub|Quality Tooling|Active Linting"
    }
  ],
  "linting": {
    "totalErrors": 1,
    "totalWarnings": 239,
    "active": true,
    "languages": [
      {
        "language": "TypeScript",
        "tool": "ESLint",
        "errors": 1,
        "warnings": 0,
        "files": 409,
        "duration": "00:00:19.1",
        "details": ["...specific lint findings..."]
      }
    ]
  }
}
```

## Notes

- The scorecard is generated by the `org-metrics` service and updated periodically.
- The `sfl-improve-scorecard` workflow automates creating issues for scorecard
  improvements. This skill provides an interactive alternative.
- When recommending fixes, reference the linting `details` array for specific
  file/line information when available.
