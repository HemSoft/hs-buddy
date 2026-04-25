#!/usr/bin/env bash
# Runs ralph to reduce complexity and code smells on a dedicated feature branch.
set -eo pipefail

autopilot=false
no_audio=false
skip_review=false
model=""
work_until=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --autopilot)     autopilot=true; shift ;;
        --no-audio)      no_audio=true; shift ;;
        --skip-review)   skip_review=true; shift ;;
        --model|-M)      model="$2"; shift 2 ;;
        --work-until|-w) work_until="$2"; shift 2 ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
done

ralph_cmd=$(command -v ralph 2>/dev/null || true)
if [[ -n "$ralph_cmd" ]]; then
    ralph_script="$ralph_cmd"
else
    ralph_script="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/ralph.sh"
fi
if [[ ! -x "$ralph_script" ]]; then
    echo "Cannot resolve ralph.sh from 'ralph' command" >&2
    exit 1
fi

read -r -d '' simplisticate_prompt << 'PROMPT' || true
Your goal is to reduce CRAP scores across the codebase. CRAP (Change Risk Anti-Patterns) combines cyclomatic complexity with test coverage:

  CRAP(m) = complexity(m)^2 × (1 - coverage(m)/100)^3 + complexity(m)

TARGET: CRAP ≤ 15 for every function. Functions above 15 are high-risk — prioritize the worst scores first. A CRAP of 15 is achievable even for moderately complex code if well-tested.

As a secondary guide, prefer cyclomatic complexity ≤ 7 per function. But CRAP is the primary metric — a complexity-12 function at 95% coverage (CRAP ≈ 12) is acceptable, while a complexity-5 function at 0% coverage (CRAP = 30) is not.

WORKFLOW:
1. Run 'bun run test:coverage' to get per-function coverage data.
2. Run 'npx eslint . --rule "complexity: [warn, 7]"' to find complex functions.
3. For each function, estimate its CRAP score from complexity + coverage. Sort by CRAP descending and work from the top.
4. Two levers reduce CRAP — use both:
   a. REDUCE COMPLEXITY: extract helpers, simplify conditionals, reduce nesting.
   b. INCREASE COVERAGE: add or update tests for every function you touch.
5. After changes, re-run both commands to verify CRAP scores dropped.

CRITICAL: Never split a function without adding tests for the new pieces. Every iteration must move CRAP scores downward. After addressing high-CRAP functions, also fix any other code smells, code repetition, or unnecessary complexity you find.
PROMPT
args=(--prompt "$simplisticate_prompt" --branch "feature/simplisticate" --cleanup-worktree --max 10)
$autopilot && args+=(--autopilot)
$no_audio && args+=(--no-audio)
$skip_review && args+=(--skip-review)
[[ -n "$model" ]] && args+=(--model "$model")
[[ -n "$work_until" ]] && args+=(--work-until "$work_until")

"$ralph_script" "${args[@]}"
