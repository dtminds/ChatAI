# AGENTS

## Mission

这个仓库用于承载“AI 客服工作台”的前端、Node 后端和共享契约。当前阶段以 `/chat` 聚合聊天工作台为核心入口，优先把工作台状态模型、API 接入点、Node backend 替换边界和后续 MySQL 接入基础搭稳。

## Repository Shape

- `apps/web`: Vite + React 前端应用。
- `apps/backend`: Fastify Node 后端服务，当前暴露 `/api/server/*` 工作台接口。
- `packages/contracts`: 前后端共享 DTO、响应结构和契约类型，包名 `@chatai/contracts`。
- `docs/superpowers/specs`: 设计、架构和接口方案文档。
- `docs/db`: 数据库相关文档。

## Stack

- Monorepo：pnpm workspace
- Runtime：Node.js 24 LTS
- Web：Vite 7、React 19、TypeScript、Tailwind CSS v4、shadcn/ui、Hugeicons、React Router v7、Zustand、Axios
- Backend：Fastify 5、TypeScript、Kysely、mysql2、`@fastify/jwt`、TypeBox
- Contracts：TypeScript、TypeBox
- Tests：Vitest、Testing Library

## Design References

- 工作台设计：[docs/superpowers/specs/2026-04-19-chat-workbench-design.md](docs/superpowers/specs/2026-04-19-chat-workbench-design.md)
- Backend 架构：[docs/superpowers/specs/2026-05-08-backend-architecture-design.md](docs/superpowers/specs/2026-05-08-backend-architecture-design.md)
- 当前目标页面：`/chat`
- 当前公开 API 前缀：`/api/server/*`

## Architecture Agreements

- 浏览器侧 API 默认走同源 `/api`，不要在业务代码里硬编码测试或生产 API 域名。
- 公开业务接口统一使用 `/api/server/*`，不要在 URL 中暴露内部实现命名。
- 前端业务请求统一从 `apps/web/src/lib/request.ts` 出口发起，不直接在页面里裸写 `fetch`。
- 前后端共享 DTO 和响应结构优先放到 `packages/contracts`，不要在 web/backend 两边复制类型。
- 当前 backend 的工作台数据仍是内存服务，后续替换 MySQL 查询时保持路由契约稳定。
- Redis 不是当前阶段必需依赖；除非功能确实需要，不要提前引入 Redis 强依赖。
- 鉴权当前使用 Bearer token 方向；开发环境允许 `AUTH_DEV_BYPASS=true` 绕过，但只应在 `NODE_ENV=development` 下生效。

## Web Working Agreements

- 新页面优先沿用 `shadcn/ui` 组件，避免混入第二套 UI 体系。
- 交互控件优先使用 `apps/web/src/components/ui` 中已有基础组件，如 `Button`、`Input`、`DropdownMenu`。只有在封装基础组件或现有组件无法表达语义/交互时才使用原生元素，并同步处理可访问性、键盘行为和 `focus-visible`。
- 图标统一使用 Hugeicons，不再引入 Lucide 或其他图标集。
- 工作台状态优先收敛到 `apps/web/src/store/workbench-store.ts`，避免页面局部状态失控。
- `apps/web/src/pages/chat/api` 是前端工作台服务适配层；UI 组件不要直接拼后端 URL。
- 组件测试优先覆盖用户可感知行为、可访问语义、状态流转和关键数据契约；不要断言 Tailwind class、字号、间距、宽高、阴影、圆角等易变视觉实现细节，除非这些样式本身就是公开 API 或明确要求锁定的设计 token。

## Backend Working Agreements

- Fastify 路由按模块放在 `apps/backend/src/modules/*`，共享插件放在 `apps/backend/src/plugins`。
- 后端配置从根目录 `.env.*` 加载共享配置，再叠加 `apps/backend/.env.local` 这类本地私密配置。
- 真实密钥、数据库连接串、JWT 私钥不要提交；只维护 `.env.example`。
- MySQL 访问通过 `apps/backend/src/db` 的 Kysely 接入点演进，不在路由里直接散落 SQL。
- 当前理论上不依赖跨表事务；如果未来要引入事务，先明确业务一致性需求和失败补偿策略。
- API 返回结构和 DTO 变更优先更新 `packages/contracts`，再改 web/backend 消费方。

## Environment Files

- 根目录 `.env.development`: 本地前端 -> 本地 backend。
- 根目录 `.env.dev-test-api`: 本地前端 -> 测试环境 API。
- 根目录 `.env.test`: 测试环境配置。
- 根目录 `.env.production`: 生产默认配置。
- 根目录 `.env.example`: 共享配置模板。
- `apps/backend/.env.example`: 后端私密配置模板。
- `apps/backend/.env.local`: 本地私密配置，按需创建，不提交。

## Directory Notes

- `apps/web/src/components/ui`: shadcn/ui 基础组件。
- `apps/web/src/lib`: 通用工具、请求封装、样式工具。
- `apps/web/src/pages/chat`: `/chat` 工作台页面、组件、前端服务适配层。
- `apps/web/src/router`: React Router 路由定义。
- `apps/web/src/store`: Zustand store。
- `apps/web/test`: Web 端 Vitest 和 Testing Library 测试。
- `apps/backend/src/config`: 后端配置和 env 加载。
- `apps/backend/src/db`: MySQL/Kysely 接入点。
- `apps/backend/src/modules/chat`: 工作台 API 路由和当前内存服务。
- `apps/backend/src/modules/auth`: 鉴权 API 预留路由。
- `apps/backend/test`: Backend 测试。
- `packages/contracts/src`: 共享契约源码。
- `packages/contracts/test`: 共享契约测试。

## Dev Commands

- 安装依赖：`pnpm install`
- 启动 web，本地前端 -> 本地 backend：`pnpm dev`
- 启动 web，本地前端 -> 测试环境 API：`pnpm dev:test-api`
- 启动 backend：`pnpm backend:dev`
- 全仓类型检查：`pnpm typecheck`
- 全仓测试：`pnpm test`
- 构建 web：`pnpm build`
- 构建 backend：`pnpm backend:build`
- 构建 contracts：`pnpm contracts:build`
- 按配置生成 Kysely 类型：`pnpm backend:db:codegen`

## Naming and Domain Notes

- 当前业务是账号维度的接管、账号 unread、会话 unread、会话消息和轮询同步。
- `markConversationRead` 和会话级 unread 是当前可接受语义。
- 不要在文档、类型或 mock 中引入不存在的历史接口或已否决概念。
