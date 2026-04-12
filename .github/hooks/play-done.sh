#!/bin/bash
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.toolName')
if [ "$TOOL_NAME" = "task_complete" ]; then
    ffplay -nodisp -autoexit -volume 50 .github/hooks/done.mp3 &>/dev/null &
fi
