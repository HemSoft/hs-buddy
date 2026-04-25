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

# Ensure ^C stops the entire repeat loop, not just the child
trap 'echo ""; echo "Interrupted. Stopping repeat loop."; exit 130' INT

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
    run_exit=$?
    if (( run_exit != 0 )); then
        echo ""
        echo "===================================="
        echo "== Run $i failed (exit code $run_exit). Stopping."
        echo "===================================="
        exit $run_exit
    fi

    if (( i < times )); then
        echo "Pulling latest main before next run..."
        git checkout main >/dev/null 2>&1
        git fetch origin main >/dev/null 2>&1
        if ! git pull --ff-only >/dev/null 2>&1; then
            echo "Main has diverged from origin. Resetting to origin/main..."
            git reset --hard origin/main >/dev/null 2>&1
        fi

        # Close any orphaned simplisticate PRs from previous runs that were
        # never merged (e.g., ralph-pr handoff failed, PR got merge conflicts).
        # Their work will be redone from fresh main by the next run.
        repo_slug=$(gh repo view --json nameWithOwner -q '.nameWithOwner' 2>/dev/null || true)
        if [[ -n "$repo_slug" ]]; then
            orphan_prs=$(gh pr list --repo "$repo_slug" --state open --json number,headRefName \
                --jq '[.[] | select(.headRefName | startswith("feature/simplisticate-")) | .number] | .[]' 2>/dev/null || true)
            for pr in $orphan_prs; do
                echo "Closing orphaned simplisticate PR #$pr (will be superseded by next run)..."
                gh pr close "$pr" --repo "$repo_slug" --delete-branch \
                    --comment "Auto-closed by repeat runner: orphaned PR from a previous run. Next run creates a fresh PR from updated main." 2>/dev/null || true
            done
        fi
    fi
done

echo ""
echo "===================================="
echo "== All $times simplisticate runs complete!"
echo "===================================="
