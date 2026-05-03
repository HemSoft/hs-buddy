#!/bin/bash
# Audio notification for postToolUse hook.
# Plays done.mp3 immediately when the tool is task_complete (turn is over).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEBUG_LOG="$SCRIPT_DIR/../../logs/hook-debug.log"
TS=$(date '+%Y-%m-%d %H:%M:%S.%3N')

# Read stdin for tool metadata
RAW=$(cat 2>/dev/null || echo '')
TOOL_NAME="(unknown)"
if [ -n "$RAW" ] && command -v jq &>/dev/null; then
    TOOL_NAME=$(echo "$RAW" | jq -r '.toolName // .tool // .name // "(unknown)"' 2>/dev/null)
fi

echo "[$TS] postToolUse [$TOOL_NAME] fired" >> "$DEBUG_LOG"

# Only play audio on task_complete
[ "$TOOL_NAME" != "task_complete" ] && exit 0

SETTINGS=".github/hooks/hooks-settings.json"
AUDIO_ENABLED=true
if [ -f "$SETTINGS" ]; then
    AUDIO_ENABLED=$(jq -r '.audioEnabled // true' "$SETTINGS")
fi
if [ "$AUDIO_ENABLED" != "true" ]; then
    echo "[$TS] task_complete but audio disabled - skipping" >> "$DEBUG_LOG"
    exit 0
fi

AUDIO_FILE="$(pwd)/.github/hooks/done.mp3"
echo "[$TS] ── AUDIO PLAYING ── task_complete detected" >> "$DEBUG_LOG"
ffplay -nodisp -autoexit -volume 50 -loglevel quiet "$AUDIO_FILE" &>/dev/null &
