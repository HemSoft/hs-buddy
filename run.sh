#!/usr/bin/env bash
# Launch hs-buddy via .NET Aspire (Convex backend + Vite/Electron frontend)
set -euo pipefail

# ── Resolve DOTNET_ROOT from Homebrew if not already set ──────────────────────
if [ -z "${DOTNET_ROOT:-}" ]; then
  if command -v brew &>/dev/null; then
    dotnet_prefix="$(brew --prefix dotnet 2>/dev/null || true)"
    if [ -d "$dotnet_prefix/libexec" ]; then
      export DOTNET_ROOT="$dotnet_prefix/libexec"
    fi
  fi
fi

# ── Ensure common tool paths are on PATH ──────────────────────────────────────
path_dirs=("$HOME/.aspire/bin" "$HOME/.bun/bin" "/opt/homebrew/bin" "/usr/local/bin")
if command -v brew &>/dev/null; then
  brew_bin="$(brew --prefix 2>/dev/null || true)"
  if [ -n "$brew_bin" ] && [ -d "$brew_bin/bin" ]; then
    path_dirs+=("$brew_bin/bin")
  fi
fi
for dir in "${path_dirs[@]}"; do
  [[ ":$PATH:" != *":$dir:"* ]] && [ -d "$dir" ] && export PATH="$dir:$PATH"
done

# ── Pre-flight checks ────────────────────────────────────────────────────────
missing=()
command -v aspire &>/dev/null || missing+=("aspire  → curl -sSL https://aspire.dev/install.sh | bash")
command -v node   &>/dev/null || missing+=("node    → brew install node")
command -v bun    &>/dev/null || missing+=("bun     → curl -fsSL https://bun.sh/install | bash")

if [ ${#missing[@]} -gt 0 ]; then
  echo "❌ Missing required tools:"
  printf '   %s\n' "${missing[@]}"
  exit 1
fi

# ── Launch ────────────────────────────────────────────────────────────────────
cd "$(dirname "$0")"
exec aspire run "$@"
