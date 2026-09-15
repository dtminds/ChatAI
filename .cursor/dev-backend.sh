#!/usr/bin/env bash
# Long-running Fastify backend dev server (tsx watch) on PORT 3001.
set -euo pipefail

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
export PATH="$NVM_DIR/versions/node/$(nvm version default)/bin:$PATH"

# The backend requires DATABASE_URL to boot. Use a real secret when provided;
# otherwise fall back to a local placeholder. The mysql2 pool connects lazily,
# so the API and UI work for development even without a live database (routes
# that hit the DB return an error until a real DATABASE_URL is configured).
export DATABASE_URL="${DATABASE_URL:-mysql://dev:dev@127.0.0.1:3306/chatai_dev}"

exec corepack pnpm backend:dev
