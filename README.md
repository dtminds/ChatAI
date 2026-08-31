## License

This repository is publicly visible for review purposes only and is not open source.

Copyright (c) 2026 dtminds. All rights reserved.

See [LICENSE](LICENSE) for the full terms.

## 当前范围

- 前端页面：`/chat`
- 浏览器 API 前缀：`/api/server/*`
- 本地后端默认端口：`3001`
- 本地前端默认端口：`8086`

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
│   ├── backend/             # HTTP API 服务
│   │   ├── src/
│   │   │   ├── config/      # env 加载和配置解析
│   │   │   ├── db/          # Kysely / MySQL 接入点
│   │   │   ├── modules/     # auth、chat 等业务模块
│   │   │   ├── plugins/     # Fastify 插件
│   │   │   └── shared/      # 后端共享错误和工具
│   │   └── test/            # Backend 测试
│   ├── backend-worker/      # Insights 和 User Memory 异步任务
│   └── workflow-worker/     # Marketing Workflow 执行进程
├── packages/
│   ├── contracts/           # 跨层 DTO、响应结构和契约类型
│   ├── database/            # 共享 MySQL 连接和 Kysely schema
│   ├── insights/            # Insights Worker 运行逻辑
│   ├── tickets/             # 工单持久化能力
│   ├── user-memory/         # User Memory Worker 运行逻辑
│   ├── workflow-engine/     # Workflow 编译和纯执行逻辑
│   └── workflow-runtime/    # Workflow 运行时和持久化接口
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
http://localhost:8086/chat
```

### 3. 本地前端连测试环境 API

```bash
pnpm dev:test-api
```

这个模式下，前端仍然请求同源 `/api/server/*`，Vite dev proxy 会把请求转发到 `测试环境`。

## 常用命令

```bash
pnpm dev                  # 启动 web，本地前端 -> 本地 backend
pnpm dev:test-api         # 启动 web，本地前端 -> 测试环境 API
pnpm backend:dev          # 启动 backend
pnpm backend-worker:dev   # 启动 backend worker
pnpm database:codegen     # 按 packages/database/scripts/codegen-db.config.json 生成 Kysely 类型
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

本地运行 Backend Worker 时，新建 `apps/backend-worker/.env.local`，并参考
`apps/backend-worker/.env.example` 配置数据库、Insights 和 User Memory Worker。

## 数据库类型生成

Database package 使用 `kysely-codegen` 从 `packages/database/.env.local` 的 `DATABASE_URL` 连接数据库；迁移期间仍兼容读取 `apps/backend/.env.local`。只生成 `packages/database/scripts/codegen-db.config.json` 中配置的表：

```json
{
  "tables": [
    "..."
  ]
}
```

生成结果会覆盖：

```text
apps/backend/src/db/schema.ts
```

日常直接运行：

```bash
pnpm database:codegen
```

如果临时验证某张表，也可以用命令行参数覆盖配置：

```bash
pnpm database:codegen -- table_name
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

### 侧栏嵌入页（自定义 iframe）查询参数

打开设置里配置的自定义侧栏 iframe 时，前端会在 `src` 上追加查询参数（实现见 [`apps/web/src/pages/chat/lib/sidebar-iframe-url.ts`](apps/web/src/pages/chat/lib/sidebar-iframe-url.ts)）：

- **`tos`**：`0` 表示当前子账号尚未接管该席位，`1` 表示已由当前登录子账号接管。
- **`qd`**：仅在当前会话为**群聊**且后端返回了三方群 ID（`thirdGroupId`）时追加，供嵌入页识别群会话。
- **`rd` / `fsw` / `ts` / `mid`**：在配置了涂色密钥时，由后端 `POST /api/server/sidebar-iframe-params` 按当前席位与会话（服务端查库）签发并拼入 URL；**切换会话或侧栏 Tab 时会重新请求**，从而刷新 `ts`。前端不持有 `secret` / `iv`。仅用于 URL 脱敏与既有嵌入页协议，**不是**对嵌入页的身份防伪边界。

### 营销画布嵌入页查询参数

SMP 打开 `/embed/workflows` 时会拼接加密的 `id`、`uid`。ChatAI 用这两个参数换登录态，再展示画布列表：

- 浏览器只请求 `POST /api/auth/embed-sso`，不直接调用内部解密接口。
- 后端分别解密 `id`、`uid`，确认账号存在且属于该租户后签发正常登录。
- SMP 嵌在跨站 iframe 里时，ChatAI 的登录 cookie 带不过去；换票后的接口用请求头带登录，不依赖 iframe cookie。
- 嵌在 SMP 里时，点「新建」或进入 `/embed/workflows/编号` 会通知外层全屏；返回列表时退出全屏。登录凭证只放在通知的 `token` 字段里，**不要**写进 iframe 的 `src`。外层用 `path` 打开地址后，再把 `token` 用同样的 channel 回传给 iframe。
- 没有换票参数且也没有可用登录凭证时回到登录页；只有换票被明确拒绝时才提示账号不可用。连不上服务时会重试，不会误显示账号不可用。

## 关键文件

- 腾讯云容器部署指南：[docs/deployment/tencent-cloud-containers.md](docs/deployment/tencent-cloud-containers.md)
- Web 请求封装：[apps/web/src/lib/request.ts](apps/web/src/lib/request.ts)
- Web 工作台服务：[apps/web/src/pages/chat/api/workbench-service.ts](apps/web/src/pages/chat/api/workbench-service.ts)
- Backend 路由：[apps/backend/src/modules/chat/chat.routes.ts](apps/backend/src/modules/chat/chat.routes.ts)
- Backend env 加载：[apps/backend/src/config/env.ts](apps/backend/src/config/env.ts)
- 共享契约：[packages/contracts/src](packages/contracts/src)
- 协作约定：[AGENTS.md](AGENTS.md)
