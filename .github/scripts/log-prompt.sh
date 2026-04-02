#!/bin/bash
# log-prompt.sh - Captures the actual prompt text from UserPromptSubmit stdin JSON
raw=$(cat 2>/dev/null || echo '')
if command -v jq &>/dev/null; then
    prompt=$(echo "$raw" | jq -r '.prompt // .userPrompt // .content // .' 2>/dev/null)
else
    prompt="$raw"
fi
prompt=$(echo "$prompt" | tr '\n' ' ' | cut -c1-300)
dir="logs/session"
mkdir -p "$dir"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [UserPrompt] $prompt" >> "$dir/$(date '+%Y-%m-%d').log"
