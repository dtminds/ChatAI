# 构建阶段
FROM node:24-alpine AS builder

WORKDIR /app

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@10 --activate

# 复制 workspace 配置和根 package.json
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY package.json ./

# 复制所有包的 package.json（用于依赖安装）
COPY apps/web/package.json ./apps/web/
COPY apps/backend/package.json ./apps/backend/
COPY apps/voice-service/package.json ./apps/voice-service/
COPY packages/contracts/package.json ./packages/contracts/

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源码
COPY apps/web/ ./apps/web/
COPY apps/backend/ ./apps/backend/
COPY apps/voice-service/ ./apps/voice-service/
COPY packages/contracts/ ./packages/contracts/

# 构建 backend（会先构建 contracts 与 voice-service）
RUN pnpm backend:build

# 运行阶段：复用 builder 已解析的 workspace 依赖树，避免二次 install 丢失 @chatai/voice-service 链接
FROM node:24-alpine AS runner

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/package.json ./apps/backend/
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder /app/apps/voice-service/package.json ./apps/voice-service/
COPY --from=builder /app/apps/voice-service/dist ./apps/voice-service/dist
COPY --from=builder /app/apps/voice-service/node_modules ./apps/voice-service/node_modules
COPY --from=builder /app/packages/contracts/package.json ./packages/contracts/
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/healthz || exit 1

# 启动服务
CMD ["node", "apps/backend/dist/server.js"]
