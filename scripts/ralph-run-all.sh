#!/usr/bin/env bash
# Runs all ralph-*.sh scripts in the current directory sequentially in autopilot mode.
# Between each script, pulls latest main so the next run branches from fresh code.
# Stops on the first failure.
set -eo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
WHITE='\033[1;37m'
MAGENTA='\033[0;35m'
NC='\033[0m'

pick=false
model=""
work_until=""
no_audio=false
skip_review=false
show_help=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --pick)          pick=true; shift ;;
        --model|-M)      model="$2"; shift 2 ;;
        --work-until|-w) work_until="$2"; shift 2 ;;
        --no-audio)      no_audio=true; shift ;;
        --skip-review)   skip_review=true; shift ;;
        --help|-h)       show_help=true; shift ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
done

if $show_help; then
    echo ""
    printf "${CYAN}ralph-run-all.sh - Sequential Autopilot Orchestrator${NC}\n"
    echo "Runs all ralph-*.sh scripts in the scripts/ directory sequentially."
    echo "Each script runs in full autopilot mode — PRs are auto-merged."
    echo ""
    printf "${YELLOW}PARAMETERS${NC}\n"
    echo "  --pick                  Choose which scripts to run (default: run all)"
    echo "  --model <alias>         Model to pass through: sonnet, opus46, opus47, gpt"
    echo "  --work-until <HH:mm>    Stop after this local time (passed to each script)"
    echo "  --no-audio              Suppress audio feedback"
    echo "  --help                  Show this help message"
    echo ""
    printf "${YELLOW}EXAMPLES${NC}\n"
    echo "  ralph-run-all"
    echo "  ralph-run-all --pick"
    echo "  ralph-run-all --model sonnet --work-until 08:00"
    echo "  ralph-run-all --no-audio"
    echo ""
    exit 0
fi

# --- Verify git state ---
repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
    printf "${RED}Not inside a git repository.${NC}\n"
    exit 1
}
current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

# --- Discover scripts from this repo's scripts/ directory ---
scripts_dir="$repo_root/scripts"
my_name=$(basename "${BASH_SOURCE[0]}")

all_scripts=()
while IFS= read -r line; do
    [[ -n "$line" ]] && all_scripts+=("$line")
done < <(find "$scripts_dir" -maxdepth 1 -name "ralph-*.sh" -type f ! -name "$my_name" | sort)

if [[ ${#all_scripts[@]} -eq 0 ]]; then
    printf "${RED}No ralph-*.sh scripts found in %s${NC}\n" "$scripts_dir"
    exit 1
fi

scripts=("${all_scripts[@]}")

# --- Pick mode ---
if $pick; then
    echo ""
    printf "${YELLOW}Available scripts:${NC}\n"
    for i in "${!all_scripts[@]}"; do
        echo "  [$((i + 1))] $(basename "${all_scripts[$i]}")"
    done
    echo ""
    read -rp "Enter numbers to run (comma-separated, e.g. 1,3) or 'all': " selection
    if [[ "$selection" != "all" ]]; then
        IFS=',' read -ra indices <<< "$selection"
        selected=()
        for idx in "${indices[@]}"; do
            idx=$((${idx// /} - 1))
            if (( idx >= 0 && idx < ${#all_scripts[@]} )); then
                selected+=("${all_scripts[$idx]}")
            fi
        done
        if [[ ${#selected[@]} -eq 0 ]]; then
            printf "${YELLOW}No valid selections.${NC}\n"
            exit 1
        fi
        scripts=("${selected[@]}")
    fi
    echo ""
fi

# --- Banner ---
run_start_epoch=$(date +%s)
run_start_str=$(date "+%Y-%m-%d %H:%M:%S")
echo ""
printf "${CYAN}====================================${NC}\n"
printf "${CYAN}  RALPH RUN-ALL${NC}\n"
printf "${CYAN}====================================${NC}\n"
echo "  Started:   $run_start_str"
echo "  Scripts:   ${#scripts[@]}"
for i in "${!scripts[@]}"; do
    printf "${WHITE}    %d. %s${NC}\n" "$((i + 1))" "$(basename "${scripts[$i]}")"
done
echo "  Branch:    $current_branch"
echo "  Repo:      $repo_root"
[[ -n "$model" ]] && echo "  Model:     $model"
[[ -n "$work_until" ]] && echo "  WorkUntil: $work_until"
printf "${CYAN}====================================${NC}\n"
echo ""

# --- Run scripts sequentially ---
declare -a result_scripts result_statuses result_durations result_codes
failed=false

for (( i=0; i<${#scripts[@]}; i++ )); do
    script="${scripts[$i]}"
    script_name=$(basename "$script")
    step_start_epoch=$(date +%s)

    # Check deadline
    if [[ -n "$work_until" ]]; then
        if [[ "$work_until" =~ ^([0-9]{1,2}):([0-9]{2})$ ]]; then
            hour="${BASH_REMATCH[1]}"
            minute="${BASH_REMATCH[2]}"
            today=$(date +%Y-%m-%d)
            if [[ "$(uname)" == "Darwin" ]]; then
                dl_epoch=$(date -j -f "%Y-%m-%d %H:%M:%S" "$today $hour:$minute:00" +%s 2>/dev/null || echo "0")
            else
                dl_epoch=$(date -d "$today $hour:$minute:00" +%s 2>/dev/null || echo "0")
            fi
            if (( dl_epoch <= run_start_epoch )); then
                dl_epoch=$((dl_epoch + 86400))
            fi
            now_epoch=$(date +%s)
            if (( now_epoch >= dl_epoch )); then
                printf "${YELLOW}Deadline reached (%s). Stopping before %s.${NC}\n" "$work_until" "$script_name"
                break
            fi
        fi
    fi

    echo ""
    printf "${MAGENTA}====================================${NC}\n"
    printf "${MAGENTA}== [%d/%d] %s${NC}\n" "$((i + 1))" "${#scripts[@]}" "$script_name"
    printf "${MAGENTA}====================================${NC}\n"
    echo ""

    # Build args — always pass --autopilot
    script_args=(--autopilot)
    $no_audio && script_args+=(--no-audio)
    $skip_review && script_args+=(--skip-review)
    [[ -n "$model" ]] && script_args+=(--model "$model")
    [[ -n "$work_until" ]] && script_args+=(--work-until "$work_until")

    # Invoke the script
    set +e
    "$script" "${script_args[@]}"
    exit_code=$?
    set -e

    step_end_epoch=$(date +%s)
    step_duration=$((step_end_epoch - step_start_epoch))
    step_dur_str=$(printf "%02d:%02d:%02d" $((step_duration / 3600)) $(((step_duration % 3600) / 60)) $((step_duration % 60)))

    if [[ $exit_code -eq 0 ]]; then
        status="OK"
    else
        status="FAILED (exit $exit_code)"
    fi

    result_scripts+=("$script_name")
    result_statuses+=("$status")
    result_durations+=("$step_dur_str")
    result_codes+=("$exit_code")

    if [[ $exit_code -ne 0 ]]; then
        echo ""
        printf "${RED}%s failed with exit code %d. Stopping.${NC}\n" "$script_name" "$exit_code"
        failed=true
        break
    fi

    echo ""
    printf "${GREEN}%s completed successfully (%s).${NC}\n" "$script_name" "$step_dur_str"

    # Pull latest main before next script
    if (( i < ${#scripts[@]} - 1 )); then
        echo ""
        printf "${CYAN}Pulling latest main before next script...${NC}\n"
        git fetch origin main 2>&1 >/dev/null
        git checkout main 2>&1 >/dev/null
        git pull --ff-only 2>&1 >/dev/null
        if [[ $? -ne 0 ]]; then
            printf "${YELLOW}Warning: git pull on main failed. Continuing anyway.${NC}\n"
        else
            printf "${GREEN}Main is up to date.${NC}\n"
        fi
    fi
done

# --- Summary ---
run_end_epoch=$(date +%s)
total_duration=$((run_end_epoch - run_start_epoch))
total_dur_str=$(printf "%02d:%02d:%02d" $((total_duration / 3600)) $(((total_duration % 3600) / 60)) $((total_duration % 60)))
success_count=0
for code in "${result_codes[@]}"; do
    (( code == 0 )) && ((success_count++))
done

echo ""
printf "${CYAN}====================================${NC}\n"
printf "${CYAN}  RALPH RUN-ALL SUMMARY${NC}\n"
printf "${CYAN}====================================${NC}\n"
echo "  Finished:  $(date '+%Y-%m-%d %H:%M:%S')"
echo "  Duration:  $total_dur_str"
echo "  Results:   $success_count/${#result_codes[@]} succeeded"
echo ""
for i in "${!result_scripts[@]}"; do
    if [[ "${result_codes[$i]}" -eq 0 ]]; then
        color="$GREEN"
    else
        color="$RED"
    fi
    printf "${color}    %-20s %s  %s${NC}\n" "${result_statuses[$i]}" "${result_durations[$i]}" "${result_scripts[$i]}"
done
echo ""
printf "${CYAN}====================================${NC}\n"

if $failed; then exit 1; fi
