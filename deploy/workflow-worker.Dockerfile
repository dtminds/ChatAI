# The Pulsar Node client is a native glibc addon, so the Worker uses Debian instead of Alpine.
FROM node:24-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential ca-certificates python3 \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.34.3 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/workflow-worker/package.json ./apps/workflow-worker/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/workflow-engine/package.json ./packages/workflow-engine/
COPY packages/workflow-runtime/package.json ./packages/workflow-runtime/

RUN pnpm install --frozen-lockfile

COPY apps/workflow-worker ./apps/workflow-worker
COPY packages/contracts ./packages/contracts
COPY packages/workflow-engine ./packages/workflow-engine
COPY packages/workflow-runtime ./packages/workflow-runtime

RUN pnpm --filter @chatai/workflow-worker build

FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates libstdc++6 \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.34.3 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/workflow-worker/package.json ./apps/workflow-worker/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/workflow-engine/package.json ./packages/workflow-engine/
COPY packages/workflow-runtime/package.json ./packages/workflow-runtime/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/apps/workflow-worker/dist ./apps/workflow-worker/dist
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/packages/workflow-engine/dist ./packages/workflow-engine/dist
COPY --from=builder /app/packages/workflow-runtime/dist ./packages/workflow-runtime/dist

ENV NODE_ENV=production \
  TZ=Asia/Shanghai
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3002/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "apps/workflow-worker/dist/index.js"]
