#!/bin/bash
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.toolName')
if [ "$TOOL_NAME" = "task_complete" ]; then
    SETTINGS=".github/hooks/hooks-settings.json"
    AUDIO_ENABLED=true
    if [ -f "$SETTINGS" ]; then
        AUDIO_ENABLED=$(jq -r '.audioEnabled // true' "$SETTINGS")
    fi
    if [ "$AUDIO_ENABLED" = "true" ]; then
        ffplay -nodisp -autoexit -volume 50 .github/hooks/done.mp3 &>/dev/null &
    fi
fi
