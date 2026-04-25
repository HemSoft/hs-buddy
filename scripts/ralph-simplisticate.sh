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

A CRAP score above 30 means the method is too complex for its test coverage. A perfectly-covered method (100%) has CRAP equal to its complexity. An untested method has CRAP = complexity^2 + complexity.

WORKFLOW:
1. Run 'npx eslint . --rule "complexity: [error, 10]"' to find high-complexity functions.
2. Run 'bun run test:coverage' to get per-function coverage data.
3. For each function, estimate its CRAP score from complexity + coverage. Prioritize the highest CRAP scores first — these are the riskiest functions.
4. Refactor to reduce complexity: extract helper functions, simplify conditionals, reduce nesting. Target complexity ≤ 10 (ESLint threshold).
5. For every function you touch or extract, add or update tests to increase coverage. Both levers reduce CRAP.
6. After changes, re-run both commands to verify: complexity decreased, coverage maintained or improved, CRAP scores dropped.

CRITICAL: Every refactoring iteration must improve BOTH complexity AND coverage. Never split a function without adding tests for the new pieces. After addressing high-CRAP functions, also fix any other code smells, code repetition, or unnecessary complexity you find.
PROMPT
args=(--prompt "$simplisticate_prompt" --branch "feature/simplisticate" --cleanup-worktree --max 10)
$autopilot && args+=(--autopilot)
$no_audio && args+=(--no-audio)
$skip_review && args+=(--skip-review)
[[ -n "$model" ]] && args+=(--model "$model")
[[ -n "$work_until" ]] && args+=(--work-until "$work_until")

"$ralph_script" "${args[@]}"
