#!/bin/sh
# Managed by copilot-hooks skill

LOCK_ROOT="${TMPDIR:-${TEMP:-/tmp}}"
LOCK_FILE="$LOCK_ROOT/copilot-session-hook-$(git rev-parse --show-toplevel 2>/dev/null | tr '/:\\' '_' | tr -cd '[:alnum:]_-').lock"

if [ -f "$LOCK_FILE" ]; then
    NOW=$(date +%s 2>/dev/null || echo 0)
    LAST=$(cat "$LOCK_FILE" 2>/dev/null || echo 0)
    if [ "$NOW" -gt 0 ] && [ "$LAST" -gt 0 ] && [ $((NOW - LAST)) -lt 30 ]; then
        echo "Auto-commit skipped (duplicate hook invocation)"
        exit 0
    fi
fi

date +%s 2>/dev/null > "$LOCK_FILE" || true

if [ "$SKIP_AUTO_COMMIT" = "true" ]; then
    echo "Auto-commit skipped (SKIP_AUTO_COMMIT=true)"
    exit 0
fi

export GIT_TERMINAL_PROMPT=0
export GCM_INTERACTIVE=Never

if [ -z "$GIT_ASKPASS" ]; then
    export GIT_ASKPASS=echo
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Not in a git repository"
    exit 0
fi

if [ -z "$(git status --porcelain 2>/dev/null)" ]; then
    echo "No changes to commit"
    exit 0
fi

echo "Auto-committing changes from Copilot session..."

if ! git add -A >/dev/null 2>&1; then
    echo "Staging failed"
    exit 0
fi

TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
if ! git commit -m "auto-commit: $TIMESTAMP" --no-verify >/dev/null 2>&1; then
    echo "Commit failed"
    exit 0
fi

BRANCH=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)
REMOTE=$(git remote | head -n 1)

if [ -z "$REMOTE" ]; then
    echo "No remote configured - changes committed locally"
    exit 0
fi

if [ -z "$BRANCH" ]; then
    echo "Detached HEAD - changes committed locally"
    exit 0
fi

if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    PUSH_CMD="git push"
else
    PUSH_CMD="git push --set-upstream $REMOTE $BRANCH"
fi

if GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o BatchMode=yes -o ConnectTimeout=5}" sh -c "$PUSH_CMD" >/dev/null 2>&1; then
    echo "Changes committed and pushed successfully"
else
    echo "Push failed fast - changes committed locally"
fi

exit 0
