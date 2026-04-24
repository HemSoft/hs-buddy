#!/usr/bin/env bash
# Runs ralph to improve the GitHub scorecard score on a dedicated feature branch.
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

args=(--prompt "Improve the scorecard score for this repo. Your report is at this url: https://upgraded-adventure-j192emp.pages.github.io/scorecard-summary.html" --branch "feature/improve-scorecard" --cleanup-worktree --max 10)
$autopilot && args+=(--autopilot)
$no_audio && args+=(--no-audio)
$skip_review && args+=(--skip-review)
[[ -n "$model" ]] && args+=(--model "$model")
[[ -n "$work_until" ]] && args+=(--work-until "$work_until")

"$ralph_script" "${args[@]}"
