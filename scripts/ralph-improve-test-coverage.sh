#!/usr/bin/env bash
# Runs ralph to increase test coverage on a dedicated feature branch.
set -eo pipefail

# Defaults
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

# Resolve ralph.sh
ralph_cmd=$(command -v ralph 2>/dev/null || true)
if [[ -n "$ralph_cmd" ]]; then
    # If ralph is an alias/function, try to find the actual script
    ralph_script="$ralph_cmd"
else
    # Try relative to this script's directory
    ralph_script="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/ralph.sh"
fi
if [[ ! -x "$ralph_script" ]]; then
    echo "Cannot resolve ralph.sh from 'ralph' command" >&2
    exit 1
fi

args=(--prompt "Increase test coverage to 100%" --branch "feature/increase-coverage" --cleanup-worktree --max 20)
$autopilot && args+=(--autopilot)
$no_audio && args+=(--no-audio)
$skip_review && args+=(--skip-review)
[[ -n "$model" ]] && args+=(--model "$model")
[[ -n "$work_until" ]] && args+=(--work-until "$work_until")

"$ralph_script" "${args[@]}"
