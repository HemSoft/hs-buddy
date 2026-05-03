#!/bin/bash
# log-prompt.sh - Captures the actual prompt text from UserPromptSubmit stdin JSON
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEBUG_LOG="$SCRIPT_DIR/../../logs/hook-debug.log"

raw=$(cat 2>/dev/null || echo '')
if command -v jq &>/dev/null; then
    prompt=$(echo "$raw" | jq -r '.prompt // .userPrompt // .content // .' 2>/dev/null)
else
    prompt="$raw"
fi
prompt=$(echo "$prompt" | tr '\n' ' ' | cut -c1-300)

TS=$(date '+%Y-%m-%d %H:%M:%S.%3N')

# Log to hook-debug.log (marks the start of a turn)
echo "[$TS] ── TURN START ── userPromptSubmitted: $prompt" >> "$DEBUG_LOG"

# Also log to session log
dir="logs/session"
mkdir -p "$dir"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [UserPrompt] $prompt" >> "$dir/$(date '+%Y-%m-%d').log"
