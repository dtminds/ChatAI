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
- 鉴权使用 Bearer token；所有环境都必须走正常登录、JWT 和 session 校验，不再提供开发绕过。

## Web Working Agreements

- 新页面优先沿用 `shadcn/ui` 组件，避免混入第二套 UI 体系。
- 交互控件优先使用 `apps/web/src/components/ui` 中已有基础组件，如 `Button`、`Input`、`DropdownMenu`。只有在封装基础组件或现有组件无法表达语义/交互时才使用原生元素，并同步处理可访问性、键盘行为和 `focus-visible`。
- 图标统一使用 Hugeicons，不再引入 Lucide 或其他图标集。
- 用户给 UI 截图时，截图只用于理解布局结构、信息层级、相对关系和状态，不允许根据截图像素尺寸、retina 分辨率或图片显示大小推导字号、间距、圆角、控件高度、弹窗宽高等具体 CSS 数值；尤其禁止因为截图看起来大就把文字、按钮或弹窗做大。具体尺寸优先沿用现有设计系统、shadcn 官方组件源码和项目已有 token。
- 对截图的尺寸理解默认按视觉比例而不是像素值来判断，尤其是 retina 截图不要把显示尺寸当成真实 CSS 尺寸来套用。
- 当前项目不考虑国际化，硬编码中文提示不应作为 PR review 问题提出。
- 中文短提示类微文案：短的中文 UI tips、hints、placeholders、helper text、loading tips 和其它提示式文案，默认不要在末尾加标点；只有较长的段落式解释在确实能提升可读性时才保留末尾标点。
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

## Database Table Boundaries

- `xy_wap_embed_*` 前缀的表中，只有 `apps/backend/src/db/writable-tables.ts` 白名单内的表允许 Node 后端写入。
- 未在白名单中的表（如 `xy_wap_embed_msg_audit_info`、`xy_wap_embed_group_member`、`xy_wap_embed_contact` 等）属于平台层，Node 后端只读不写。
- 需要修改平台层数据时，必须通过对应的 API 接口，禁止直接 INSERT/UPDATE/DELETE。
- 发现平台层数据缺失或异常，应反馈给平台团队修复，不要在应用层做补偿（如轮询修补、重试回写等）。

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

## Pre-PR Verification

- 提交或开 PR 前，必须运行和受影响 CI job 对齐的构建命令；不能只用局部 typecheck 或局部 test 代替 CI build。
- 改动 `apps/web` 下任意业务代码、测试、路由、样式或前端契约消费时，必须运行：`pnpm --filter @chatai/web build`。这个命令包含 `tsc -b` 和 Vite build，会检查 web 端测试 TypeScript，不能用 `pnpm --filter @chatai/web typecheck` 替代。
- 改动 `apps/web` 下可被测试覆盖的逻辑时，必须同时运行相关 Vitest 用例，例如：`pnpm --filter @chatai/web test <test-file>`；但相关测试通过不能替代 web build。
- 改动 `apps/backend` 时，必须运行 backend 对应 build，并运行相关 backend 测试；涉及数据库访问、路由契约或鉴权逻辑时，优先补充/更新对应测试。
- 改动 `packages/contracts` 时，必须运行 contracts build，并运行受影响消费方的 build；同时影响 web 和 backend 时，两侧 build 都要跑。
- 跨 `packages/contracts`、`apps/backend`、`apps/web` 的接口或 DTO 改动，提交前必须至少跑 contracts build、backend build、web build，以及相关契约/适配层测试。
- 如果因环境、依赖或外部服务导致上述命令无法运行，提交或 PR 说明里必须明确写出未运行的命令、失败原因和风险；不能省略。
- 每次提交前必须运行：`git diff --check`。

## Naming and Domain Notes

- 当前业务是账号维度的接管、账号 unread、会话 unread、会话消息和轮询同步。
- `markConversationRead` 和会话级 unread 是当前可接受语义。
- 不要在文档、类型或 mock 中引入不存在的历史接口或已否决概念。
