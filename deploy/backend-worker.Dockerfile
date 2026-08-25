FROM node:24-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/backend-worker/package.json ./apps/backend-worker/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/database/package.json ./packages/database/
COPY packages/insights/package.json ./packages/insights/
COPY packages/tickets/package.json ./packages/tickets/
COPY packages/user-memory/package.json ./packages/user-memory/

RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY apps/backend-worker ./apps/backend-worker
COPY packages/contracts ./packages/contracts
COPY packages/database ./packages/database
COPY packages/insights ./packages/insights
COPY packages/tickets ./packages/tickets
COPY packages/user-memory ./packages/user-memory

RUN pnpm --filter @chatai/contracts exec tsc -p tsconfig.json \
  && pnpm --filter @chatai/database exec tsc -p tsconfig.json \
  && pnpm --filter @chatai/tickets exec tsc -p tsconfig.json \
  && pnpm --filter @chatai/insights exec tsc -p tsconfig.json \
  && pnpm --filter @chatai/user-memory exec tsc -p tsconfig.json \
  && pnpm --filter @chatai/backend-worker exec tsc -p tsconfig.json

FROM node:24-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/backend-worker/package.json ./apps/backend-worker/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/database/package.json ./packages/database/
COPY packages/insights/package.json ./packages/insights/
COPY packages/tickets/package.json ./packages/tickets/
COPY packages/user-memory/package.json ./packages/user-memory/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/apps/backend-worker/dist ./apps/backend-worker/dist
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/insights/dist ./packages/insights/dist
COPY --from=builder /app/packages/tickets/dist ./packages/tickets/dist
COPY --from=builder /app/packages/user-memory/dist ./packages/user-memory/dist

CMD ["node", "apps/backend-worker/dist/index.js"]
