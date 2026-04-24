#!/usr/bin/env bash
# Runs ralph-simplisticate.sh repeatedly N times in autopilot mode.
# Between each run, pulls latest main so the next run branches from fresh code.
set -eo pipefail

times=3
no_audio=false
skip_review=false
model=""
work_until=""
show_help=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --times|-n)      times="$2"; shift 2 ;;
        --no-audio)      no_audio=true; shift ;;
        --skip-review)   skip_review=true; shift ;;
        --model|-M)      model="$2"; shift 2 ;;
        --work-until|-w) work_until="$2"; shift 2 ;;
        --help|-h)       show_help=true; shift ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
done

if $show_help; then
    echo ""
    echo "ralph-simplisticate-repeat.sh - Repeated Simplisticate Runner"
    echo "Runs ralph-simplisticate.sh N times in autopilot mode."
    echo "Between each run, pulls latest main so the next run branches from fresh code."
    echo ""
    echo "PARAMETERS"
    echo "  --times, -n <int>      Number of times to run (default: 3)"
    echo "  --model, -M <alias>    Model to pass through: sonnet, opus46, opus47, gpt"
    echo "  --work-until, -w <HH:mm>  Stop after this local time (passed to each run)"
    echo "  --no-audio             Suppress audio feedback"
    echo "  --skip-review          Skip Copilot PR review requests"
    echo "  --help, -h             Show this help message"
    echo ""
    echo "EXAMPLES"
    echo "  ralph-simplisticate-repeat.sh"
    echo "  ralph-simplisticate-repeat.sh --times 5"
    echo "  ralph-simplisticate-repeat.sh --times 10 --model sonnet --work-until 08:00"
    echo ""
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
simplisticate="$SCRIPT_DIR/ralph-simplisticate.sh"
if [[ ! -x "$simplisticate" ]]; then
    echo "ERROR: ralph-simplisticate.sh not found at: $simplisticate" >&2
    exit 1
fi

for (( i=1; i<=times; i++ )); do
    echo ""
    echo "===================================="
    echo "== Simplisticate run $i of $times"
    echo "===================================="

    args=(--autopilot)
    $no_audio && args+=(--no-audio)
    $skip_review && args+=(--skip-review)
    [[ -n "$model" ]] && args+=(--model "$model")
    [[ -n "$work_until" ]] && args+=(--work-until "$work_until")

    "$simplisticate" "${args[@]}"

    if (( i < times )); then
        echo "Pulling latest main before next run..."
        git checkout main >/dev/null 2>&1
        git pull --ff-only >/dev/null 2>&1
    fi
done

echo ""
echo "===================================="
echo "== All $times simplisticate runs complete!"
echo "===================================="
