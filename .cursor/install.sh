#!/usr/bin/env bash
# Idempotent dependency refresh for the ChatAI Workbench pnpm workspace.
# Runs after the repository is checked out. Must terminate (no long-running processes).
set -euo pipefail

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"

# The repo pins Node 24 LTS (.nvmrc / package.json engines / CI). Install and pin it.
nvm install 24 >/dev/null
nvm alias default 24 >/dev/null
NODE_BIN="$NVM_DIR/versions/node/$(nvm version default)/bin"
export PATH="$NODE_BIN:$PATH"

# The platform ships its own bundled Node ahead on PATH; make interactive agent
# shells prefer the pinned Node 24 so ad-hoc `node`/`pnpm` commands match CI.
MARKER="# chatai: prefer pinned Node 24"
if ! grep -qF "$MARKER" "$HOME/.bashrc" 2>/dev/null; then
  {
    echo ""
    echo "$MARKER"
    echo 'export NVM_DIR="$HOME/.nvm"'
    echo '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"'
    echo 'export PATH="$NVM_DIR/versions/node/$(nvm version default)/bin:$PATH"'
  } >> "$HOME/.bashrc"
fi

corepack enable
corepack pnpm install --frozen-lockfile

# Prebuild the shared contracts package so web/backend consumers resolve its
# dist output immediately for typecheck, dev and build.
corepack pnpm --filter @chatai/contracts build
