#!/usr/bin/env bash
# Long-running Vite dev server on port 8086 (proxies /api to the local backend).
set -euo pipefail

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
export PATH="$NVM_DIR/versions/node/$(nvm version default)/bin:$PATH"

exec corepack pnpm dev
