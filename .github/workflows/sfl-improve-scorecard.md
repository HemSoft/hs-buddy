---
description: |
  This workflow runs a daily scorecard improvement audit. It fetches the
  org-metrics service maturity scorecard for this repository, identifies
  the highest-impact failing rule that can be fixed by a code change, and
  creates exactly one agent-fixable issue with detailed fix instructions
  for the SFL pipeline to process.

on:
  schedule: "37 9 * * *"   # ~5:37 AM EDT (offset from :00 to reduce GHA queue delays)
  workflow_dispatch:

permissions:
  contents: read
  issues: read
  pull-requests: read

engine:
  id: copilot
  model: claude-opus-4.6

network: defaults

tools:
  github:
    lockdown: false

safe-outputs:
  create-issue:
    title-prefix: "[scorecard] "
    labels: [agent:fixable]
    max: 1
  update-issue:
    target: "*"
    max: 5
  add-comment:
    target: "*"
    max: 1
---
source: local

# Scorecard Improvement Audit

Run a daily scorecard improvement audit. Fetch the org-metrics service maturity
scorecard for **hs-buddy**, analyze all failing rules, select the single
highest-impact agent-fixable improvement, and produce **exactly one issue**
with step-by-step fix instructions. This issue enters the SFL pipeline and
must give the Issue Processor everything it needs to implement the fix in
one pass.

## Step 0 — Close previous scorecard issues

Before creating today's audit, search for all **open** issues whose title
starts with `[scorecard]`. For each one found, close it using `update_issue`
with:

- `issue_number`: the issue number
- `status`: `"closed"`

## Step 1 — Fetch the scorecard

Fetch the scorecard report from the org-metrics repository. The report is a
static HTML file hosted on GitHub Pages. The scorecard data is embedded as a
JSON blob in a `<script>` tag at the end of the page.

**Report URL**: `https://upgraded-adventure-j192emp.pages.github.io/scorecard-hs-buddy.html`

If the page requires authentication or cannot be fetched, try the raw file
from the repository API as a fallback:

```text
GET https://api.github.com/repos/relias-engineering/org-metrics/contents/reports/scorecard-hs-buddy.html
```

Decode the base64 content and extract the JSON data blob from the HTML.

The JSON data blob has this structure (key fields):

```json
{
  "classification": {
    "level": "None|Bronze|Silver|Gold",
    "numericScore": 46,
    "bronze": { "passed": 6, "total": 7, "points": 25, "maxPoints": 30 },
    "silver": { "passed": 2, "total": 8, "points": 7, "maxPoints": 35 },
    "gold":   { "passed": 3, "total": 6, "points": 14, "maxPoints": 35 },
    "score":  { "percent": 52.0, "passed": 11, "total": 21 }
  },
  "rules": [
    {
      "level": "Bronze|Silver|Gold",
      "passed": true|false,
      "points": 5,
      "detail": "descriptive detail",
      "title": "Rule name",
      "source": "GitHub|Quality Tooling|Active Linting"
    }
  ],
  "linting": {
    "totalErrors": 1,
    "totalWarnings": 683,
    "languages": [...]
  }
}
```

## Step 2 — Analyze failing rules

From the `rules` array, collect all rules where `passed` is `false`. For each
failing rule, determine:

1. **Points available**: The `points` value — higher points = higher impact
2. **Agent fixability**: Whether the SFL Issue Processor can fix this with code
   changes alone (see classification below)
3. **Priority tier**: The rule's `level` (Bronze failures are most urgent since
   Bronze is required for any classification)

### Agent-fixable rules

These failing rules CAN be fixed by the Issue Processor via code changes:

| Rule Title | Fix Strategy |
|------------|-------------|
| **Linter runs clean on primary language** | Fix ESLint errors in TypeScript source files |
| **Zero lint errors across all analyzed languages** | Fix lint errors across all analyzed languages |
| **Zero lint warnings and errors (all languages)** | Fix lint warnings (e.g., PSScriptAnalyzer Write-Host warnings in PowerShell scripts) |
| **License defined** | Add a LICENSE file to the repository root |
| **CODEOWNERS file present** | Add a CODEOWNERS file to the repository root |
| **EditorConfig or code-style enforcement** | Add/update `.editorconfig` or Prettier config |
| **Repository has a README** | Add or improve README.md |
| **Repository has a description** | Update repo description (informational only) |
| **Test framework configured** | Add test configuration if missing |
| **Coverage reporting in CI** | Add coverage reporting step to CI workflow |
| **Code coverage 80% or greater** | Add or improve tests to increase coverage |

### NOT agent-fixable rules (require admin/infra actions)

These rules require repository admin settings or infrastructure changes that
the agent cannot perform. Flag them in the summary as informational but do
NOT create fix issues for them:

| Rule Title | Why Not Fixable |
|------------|----------------|
| **Branch protection enabled** | Requires repo admin settings via GitHub UI/API |
| **Security scanning in CI or Dependabot enabled** | Requires Dependabot enablement in repo settings |
| **Has infrastructure-as-code** | Requires architectural decision about deployment |

## Step 3 — Select the highest-impact improvement

From the agent-fixable failing rules, select **exactly one** to fix. Use this
priority order:

1. **Bronze failures first** — Bronze is the minimum classification level. Any
   Bronze failure prevents achieving even basic classification.
2. **Highest points** — Among rules at the same level, pick the one worth the
   most points.
3. **Lowest complexity** — If two rules have equal points, pick the one that
   requires fewer file changes.

If ALL agent-fixable rules are already passing, do NOT create an issue. Skip
to the activity log entry and report `0 agent-fixable improvements found`.

## Step 4 — Create the issue

Create **exactly one issue** using `create_issue`. The safe-output config
automatically adds the `[scorecard]` title prefix and `agent:fixable` label.

### Title

`Improve <Rule Title> — YYYY-MM-DD`

(The `[scorecard]` prefix is added automatically.)

### Risk in body

Scorecard improvement fixes are low-risk by nature (adding files, fixing lint).
Do NOT apply risk labels. If a fix involves modifying existing logic (e.g.,
refactoring to fix lint warnings), include a **Risk Acknowledgment** line.

### Issue body structure

```markdown
## Scorecard Context

- **Current Score**: X / 100 (Classification: None|Bronze|Silver|Gold)
- **Target Rule**: <Rule Title>
- **Rule Level**: Bronze|Silver|Gold
- **Points Available**: X pts
- **Current Detail**: <detail from scorecard>
- **Impact**: Passing this rule would raise the score to approximately X / 100

## Summary

<What needs to change and why — reference the specific scorecard rule>

## Findings

### Finding 1: <specific issue>

- **File(s)**: `<file path>` (lines X–Y)
- **Category**: Scorecard — <Rule Title>
- **Severity**: <low / medium / high>
- **Risk**: 🟢 low — <one-line justification>

**Problem**: <What is failing the scorecard rule>

**Fix**: <Precise instructions>

<Repeat for additional findings under the same rule>

## Implementation Order

1. <file:line — brief description>
2. <file:line — brief description>
...

## Acceptance Criteria

- [ ] The targeted scorecard rule would pass after these changes
- [ ] No TypeScript errors: `bun run typecheck`
- [ ] All tests pass: `bun run test`
- [ ] <Additional criteria specific to the fix>
```

Formatting requirements for the issue body:

- Leave a blank line after every heading.
- Leave a blank line before and after every list.
- Leave a blank line before and after every fenced code block.
- Do NOT collapse headings, paragraphs, and lists onto the same line.
- Prefer plain Markdown over decorative formatting.

### Writing effective fix instructions

The Issue Processor is an AI agent that will read this issue and implement
every fix in a single PR. To maximize its success:

- **Be exact**: Specify file paths, line numbers, function names.
- **Show code**: For non-trivial changes, include before/after code snippets.
- **Order matters**: List an implementation order that avoids merge conflicts.
- **One direction**: Don't offer alternatives. State the single correct change.
- **Scope guard**: Every finding must be scoped to 1–3 files. When the
  selected rule involves lint remediation, findings may collectively touch
  at most 5 files to keep PRs reviewable. If more files need fixing,
  prioritize by error count and note remaining files as future work.

### What to exclude

Do NOT include findings that:

- Require repository admin permissions
- Would alter external/user-facing behavior
- Require infrastructure or deployment changes
- Need human judgment to resolve (flag these in the summary as informational)

### Lint-specific guidance

When fixing lint warnings/errors:

- **PSScriptAnalyzer Write-Host warnings**: Replace `Write-Host` with
  `Write-Information` using the `-InformationAction Continue` parameter or
  `$InformationPreference = 'Continue'` at script scope. For colored output,
  use `Write-Information` with ANSI escape codes.
- **ESLint errors**: Read the specific error details from the scorecard
  `linting.languages[].details` array to identify exact files and rules.

## Process

1. Fetch the scorecard report (Step 1)
2. Parse the JSON data and collect failing rules (Step 2)
3. Select the highest-impact agent-fixable rule (Step 3)
4. Inspect the repository to gather specific file/line details for the fix
5. Close any previous open `[scorecard]` issues (Step 0)
6. Create the single issue with detailed fix instructions (Step 4)
7. Rely on the new issue's `issues: opened` event to start `sfl-issue-processor`.
   Do NOT dispatch the Issue Processor explicitly from this workflow.
8. Post activity log entry to **Discussion #95** using `add_comment` with
   `issue_number`: `95` and `body`:
   `YYYY-MM-DD h:mm AM/PM EDT | Scorecard | Audit | ✅ <Rule Title> (X pts) — score X/100`
   or `⏭️ 0 agent-fixable improvements found — score X/100`;
   use `EST` instead of `EDT` only when standard time is actually in effect

Timestamp rule for Discussion #95 entries:

- Convert the current workflow time to `America/New_York` before writing the log line.
- Use the converted local **date and time**, not the UTC date.
- Use `EDT` when daylight saving time is in effect and `EST` otherwise.
- Valid: `2026-03-08 10:56 PM EDT | ...`
- Invalid: `2026-03-09 2:56 AM EST | ...` when the workflow ran at `2026-03-09T02:56:00Z`
