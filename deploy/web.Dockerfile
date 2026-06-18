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

# 构建 web
RUN pnpm build

# 运行阶段
FROM nginx:alpine

WORKDIR /usr/share/nginx/html

# 复制构建产物
COPY --from=builder /app/apps/web/dist .

# 复制 nginx 配置
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口
EXPOSE 80

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]
