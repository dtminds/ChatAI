FROM node:24-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/database/package.json ./packages/database/
COPY packages/insights/package.json ./packages/insights/
COPY packages/tickets/package.json ./packages/tickets/
COPY packages/user-memory/package.json ./packages/user-memory/
COPY packages/workflow-engine/package.json ./packages/workflow-engine/
COPY packages/workflow-runtime/package.json ./packages/workflow-runtime/

RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY apps/backend ./apps/backend
COPY packages/contracts ./packages/contracts
COPY packages/database ./packages/database
COPY packages/insights ./packages/insights
COPY packages/tickets ./packages/tickets
COPY packages/user-memory ./packages/user-memory
COPY packages/workflow-engine ./packages/workflow-engine
COPY packages/workflow-runtime ./packages/workflow-runtime

RUN pnpm --filter @chatai/contracts exec tsc -p tsconfig.json \
  && pnpm --filter @chatai/database exec tsc -p tsconfig.json \
  && pnpm --filter @chatai/tickets exec tsc -p tsconfig.json \
  && pnpm --filter @chatai/insights exec tsc -p tsconfig.json \
  && pnpm --filter @chatai/user-memory exec tsc -p tsconfig.json \
  && pnpm --filter @chatai/workflow-engine exec tsc -p tsconfig.json \
  && pnpm --filter @chatai/workflow-runtime exec tsc -p tsconfig.json \
  && pnpm --filter @chatai/backend exec tsc -p tsconfig.json

FROM node:24-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/database/package.json ./packages/database/
COPY packages/insights/package.json ./packages/insights/
COPY packages/tickets/package.json ./packages/tickets/
COPY packages/user-memory/package.json ./packages/user-memory/
COPY packages/workflow-engine/package.json ./packages/workflow-engine/
COPY packages/workflow-runtime/package.json ./packages/workflow-runtime/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/insights/dist ./packages/insights/dist
COPY --from=builder /app/packages/tickets/dist ./packages/tickets/dist
COPY --from=builder /app/packages/user-memory/dist ./packages/user-memory/dist
COPY --from=builder /app/packages/workflow-engine/dist ./packages/workflow-engine/dist
COPY --from=builder /app/packages/workflow-runtime/dist ./packages/workflow-runtime/dist

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/healthz || exit 1

CMD ["node", "apps/backend/dist/server.js"]
