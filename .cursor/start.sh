#!/usr/bin/env bash
# Per-boot reconciliation. Must be idempotent and return promptly.
set -euo pipefail

# The repo's local dev config binds the Vite dev server host to
# chat-dev.bokr.com.cn and proxies /api to the same host (see .env.development
# and apps/web/vite.config.ts). Map it to loopback so the local frontend talks
# to the local backend, matching how developers wire it up on their machines.
HOST_ENTRY="127.0.0.1 chat-dev.bokr.com.cn"
if ! grep -qE '(^|[[:space:]])chat-dev\.bokr\.com\.cn([[:space:]]|$)' /etc/hosts; then
  echo "$HOST_ENTRY" | sudo tee -a /etc/hosts >/dev/null 2>&1 \
    || echo "$HOST_ENTRY" | tee -a /etc/hosts >/dev/null 2>&1 \
    || echo "warning: could not add chat-dev.bokr.com.cn to /etc/hosts" >&2
fi
