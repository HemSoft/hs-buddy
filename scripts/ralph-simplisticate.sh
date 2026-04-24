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

args=(--prompt "Priority: reduce cyclomatic complexity of functions to 10 or below (ESLint 'complexity' rule threshold). Run 'npx eslint . --rule \"complexity: [error, 10]\"' to find violations, then refactor the highest-complexity functions first by extracting helper functions, simplifying conditionals, and reducing nesting. After addressing complexity, also fix any other code smells, code repetition, or unnecessary complexity you find." --branch "feature/simplisticate" --cleanup-worktree --max 10)
$autopilot && args+=(--autopilot)
$no_audio && args+=(--no-audio)
$skip_review && args+=(--skip-review)
[[ -n "$model" ]] && args+=(--model "$model")
[[ -n "$work_until" ]] && args+=(--work-until "$work_until")

"$ralph_script" "${args[@]}"
