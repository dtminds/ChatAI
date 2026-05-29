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
COPY packages/contracts/package.json ./packages/contracts/

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源码
COPY apps/web/ ./apps/web/
COPY apps/backend/ ./apps/backend/
COPY packages/contracts/ ./packages/contracts/

# 构建 backend（会先构建 contracts）
RUN pnpm backend:build

# 运行阶段
FROM node:24-alpine

WORKDIR /app

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@10 --activate

# 复制 package.json 和 lockfile
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY package.json ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/contracts/package.json ./packages/contracts/

# 只安装生产依赖
RUN pnpm install --frozen-lockfile --prod

# 复制构建产物
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist

# 设置工作目录
WORKDIR /app

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/healthz || exit 1

# 启动服务
CMD ["node", "apps/backend/dist/server.js"]
