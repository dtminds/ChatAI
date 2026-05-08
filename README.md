# ChatAI

AI 客服工作台项目。当前仓库已经调整为 pnpm workspace，用一个仓库同时承载前端应用、Node 后端服务和共享接口契约。

## 当前范围

现阶段优先把聚合聊天客服工作台的骨架、状态模型、API 接入点和后端替换边界搭稳。核心入口仍然是：

- 前端页面：`/chat`
- 浏览器 API 前缀：`/api/server/*`
- 本地后端默认端口：`3001`
- 本地前端默认端口：`8086`

当前 backend 仍以内存数据承载工作台 mock，后续会逐步替换为 MySQL 和必要的外部服务调用。

## 技术栈

- Monorepo：pnpm workspace
- Runtime：Node.js 24 LTS
- Web：Vite 7、React 19、TypeScript、Tailwind CSS v4、shadcn/ui、Hugeicons、React Router v7、Zustand、Axios
- Backend：Fastify 5、TypeScript、Kysely、mysql2、`@fastify/jwt`、TypeBox
- Contracts：TypeScript DTO 和接口契约，包名 `@chatai/contracts`
- Test：Vitest、Testing Library

## 目录结构

```text
.
├── apps/
│   ├── web/                 # 前端应用
│   │   ├── src/
│   │   │   ├── components/  # 业务组件和 shadcn/ui 基础组件
│   │   │   ├── lib/         # request、utils 等通用能力
│   │   │   ├── pages/chat/  # /chat 工作台页面和前端适配层
│   │   │   ├── router/      # React Router 路由定义
│   │   │   ├── store/       # Zustand 状态管理
│   │   │   └── styles/      # Tailwind v4 全局样式
│   │   └── test/            # Web 测试
│   └── backend/             # Node 后端服务
│       ├── src/
│       │   ├── config/      # env 加载和配置解析
│       │   ├── db/          # Kysely / MySQL 接入点
│       │   ├── modules/     # auth、chat 等业务模块
│       │   ├── plugins/     # Fastify 插件
│       │   └── shared/      # 后端共享错误和工具
│       └── test/            # Backend 测试
├── packages/
│   └── contracts/           # 前后端共享 DTO、响应结构和契约类型
├── docs/
│   ├── db/                  # 数据库相关文档
│   └── superpowers/specs/   # 设计和架构文档
├── .env.development         # 本地前端 -> 本地 backend
├── .env.dev-test-api        # 本地前端 -> 测试环境 API
├── .env.test
├── .env.production
├── .env.example
├── pnpm-workspace.yaml
└── package.json
```

## 快速开始

### 1. 安装依赖

需要先使用 Node.js 24 LTS。

```bash
pnpm install
```

### 2. 本地前端连本地 backend

启动 backend：

```bash
pnpm backend:dev
```

另一个终端启动 web：

```bash
pnpm dev
```

访问：

```text
http://chat-dev.bork.com.cn:8086/chat
```

如果本机没有绑定域名，先在 hosts 里加：

```text
127.0.0.1 chat-dev.bork.com.cn
```

### 3. 本地前端连测试环境 API

```bash
pnpm dev:test-api
```

这个模式下，前端仍然请求同源 `/api/server/*`，Vite dev proxy 会把请求转发到 `https://chat-test.bork.com.cn`。

## 常用命令

```bash
pnpm dev                  # 启动 web，本地前端 -> 本地 backend
pnpm dev:test-api         # 启动 web，本地前端 -> 测试环境 API
pnpm backend:dev          # 启动 backend
pnpm backend:db:codegen   # 按 apps/backend/scripts/codegen-db.config.json 生成 Kysely 类型
pnpm typecheck            # 全仓类型检查
pnpm test                 # 全仓测试
pnpm build                # 构建 web
pnpm backend:build        # 构建 backend
pnpm contracts:build      # 构建共享契约包
```

## 环境配置

环境文件统一放在仓库根目录：

```text
.env.development
.env.dev-test-api
.env.test
.env.production
.env.example
```

根目录环境文件放共享配置，例如 web dev server、API proxy、backend port、dev auth bypass。

后端私密配置不要放根目录提交文件里。需要本地连接数据库或配置 JWT 私钥时，新建：

```text
apps/backend/.env.local
```

可参考：

```text
apps/backend/.env.example
```

## 数据库类型生成

Backend 使用 `kysely-codegen` 从 `apps/backend/.env.local` 的 `DATABASE_URL` 连接数据库，并且只生成 `apps/backend/scripts/codegen-db.config.json` 中配置的表：

```json
{
  "tables": [
    "xy_wap_embed_user_relation"
  ]
}
```

生成结果会覆盖：

```text
apps/backend/src/db/schema.ts
```

日常直接运行：

```bash
pnpm backend:db:codegen
```

如果临时验证某张表，也可以用命令行参数覆盖配置：

```bash
pnpm backend:db:codegen -- xy_wap_embed_user_relation
```

## API 约定

前端统一通过 `apps/web/src/lib/request.ts` 发起 HTTP 请求。浏览器侧默认 `VITE_API_BASE_URL=/api`，业务接口使用 `/server/*`，最终形成：

```text
/api/server/me
/api/server/seats
/api/server/conversations
/api/server/conversations/:conversationId/messages
/api/server/conversations/:conversationId/read
/api/server/poll
/api/server/messages/send
/api/server/seats/:seatId/take-over
```

不要在前端页面里直接裸写 `fetch`，也不要把 backend 内部实现名暴露到公开 URL。

## 关键文件

- 工作台设计：[docs/superpowers/specs/2026-04-19-chat-workbench-design.md](docs/superpowers/specs/2026-04-19-chat-workbench-design.md)
- Backend 架构设计：[docs/superpowers/specs/2026-05-08-backend-architecture-design.md](docs/superpowers/specs/2026-05-08-backend-architecture-design.md)
- Web 请求封装：[apps/web/src/lib/request.ts](apps/web/src/lib/request.ts)
- Web 工作台服务：[apps/web/src/pages/chat/api/workbench-service.ts](apps/web/src/pages/chat/api/workbench-service.ts)
- Backend 路由：[apps/backend/src/modules/chat/chat.routes.ts](apps/backend/src/modules/chat/chat.routes.ts)
- Backend env 加载：[apps/backend/src/config/env.ts](apps/backend/src/config/env.ts)
- 共享契约：[packages/contracts/src](packages/contracts/src)
- 协作约定：[AGENTS.md](AGENTS.md)

## 当前实现状态

- Web 已接入 HTTP 服务模式，并保留测试场景下的 mock 服务能力。
- Backend 已提供 `/api/server/*` 工作台接口；配置 `DATABASE_URL` 后从 MySQL 工作台表读取席位、会话和消息，未配置时使用内存服务便于本地开发。
- Auth 路由已预留，登录、刷新、退出仍未实现。
- 会话已读、发送消息、席位接管属于 Java owner 写操作，Node backend 通过 `JAVA_INTERNAL_API_BASE_URL` 配置的内部接口转发。
- 真实增量事件/cursor 表尚未确认，当前 DB 模式的 `/api/server/poll` 只补拉当前会话的新消息。
- Redis 不是当前阶段必需依赖。
