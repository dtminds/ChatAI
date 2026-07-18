# AGENTS

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
- 当前公开 API 前缀：`/api/server/*`

## Architecture Agreements

- 浏览器侧 API 默认走同源 `/api`，不要在业务代码里硬编码测试或生产 API 域名。
- 公开业务接口统一使用 `/api/server/*`，不要在 URL 中暴露内部实现命名。
- 前端业务请求统一从 `apps/web/src/lib/request.ts` 出口发起，不直接在页面里裸写 `fetch`。
- 前后端共享 DTO 和响应结构优先放到 `packages/contracts`，不要在 web/backend 两边复制类型。
- 鉴权使用 Bearer token；所有环境都必须走正常登录、JWT 和 session 校验，不再提供开发绕过。
- 本项目所有作为 ID 使用的 MySQL `BIGINT AUTO_INCREMENT` 字段，按业务容量约定不会触及 JavaScript `Number.MAX_SAFE_INTEGER`，代码实现和契约可以使用 `number`。

## Review Working Agreements

- Review 状态一致性或竞态问题时，必须同时评估用户可感知影响、触发概率、异常持续时间、最终恢复机制和修复复杂度。对于低概率、短暂且能由权威数据自动恢复的问题，不应仅为理论完备性要求引入额外状态机、缓存层或跨路径同步机制，也不应默认定为 P2。只有存在明确用户损失、状态长期错误、无法自动恢复或已有实际故障证据时，才建议复杂修复。
- Review 时禁止仅因字段是 MySQL `BIGINT`、移除了字符串转换或统一为 `number`，提出 ID 精度丢失、溢出或安全整数越界问题。
- 不要把“未完整支持无障碍/WCAG”作为 Review 问题提出，除非它同时造成真实交互、语义、测试或组件行为缺陷。
- 当前项目不考虑国际化，硬编码中文提示不应作为 PR Review 问题提出。

## Web Working Agreements

- 新页面优先沿用 `shadcn/ui` 组件，避免混入第二套 UI 体系。
- 本项目登录态页面不要尝试使用浏览器自动化验证改动；优先通过代码路径核对、相关 Vitest 用例和对应 build 命令验证。
- 交互控件优先使用 `apps/web/src/components/ui` 中已有基础组件，如 `Button`、`Input`、`DropdownMenu`。只有在封装基础组件或现有组件无法表达语义/交互时才使用原生元素。
- 做 UI 改动前必须先查同模块相邻页面和 `apps/web/src/components/ui` 的既有实现，优先复用现有组件、状态行、弹窗结构和文案模式；不要在未检索前手写临时 UI。
- 本项目不以完整 WCAG 合规作为当前目标，但前端代码仍需保持基础语义和组件可用性：优先使用原生语义元素和现有 shadcn/ui 组件；图标按钮、无文本交互控件需要有清晰的可访问名称；弹窗、菜单、下拉等交互优先依赖现有基础组件自带的键盘和焦点行为，不额外手写复杂焦点管理；不要为了无障碍目标引入额外产品复杂度、冗余 DOM、重复 aria 或大范围重构。
- 图标统一使用 Hugeicons，不再引入 Lucide 或其他图标集。
- 用户给 UI 截图时，截图只用于理解布局结构、信息层级、相对关系和状态，不允许根据截图像素尺寸、retina 分辨率或图片显示大小推导字号、间距、圆角、控件高度、弹窗宽高等具体 CSS 数值；尤其禁止因为截图看起来大就把文字、按钮或弹窗做大。具体尺寸优先沿用现有设计系统、shadcn 官方组件源码和项目已有 token。
- 根据截图改 UI 时，只提取结构、层级、相对关系、状态和可见文案；必须覆盖截图中明确出现的信息节点，不能只改部分样式而遗漏标题、分组、说明或状态。
- 对截图的尺寸理解默认按视觉比例而不是像素值来判断，尤其是 retina 截图不要把显示尺寸当成真实 CSS 尺寸来套用。
- 中文短提示类微文案：短的中文 UI tips、hints、placeholders、helper text、loading tips 和其它提示式文案，默认不要在末尾加标点；只有较长的段落式解释在确实能提升可读性时才保留末尾标点。UI 微文案默认短句优先，能用 2-4 个字说清就不要拼接业务对象名；加载态默认「正在加载」，空态默认「暂无数据」，按钮和状态文案不要写成说明句。
- 列表、表格、卡片区必须明确区分 loading、empty、error：loading 期间不得显示「暂无数据」；表格 loading 优先保留表头，在表体中用居中的 `role="status"` 加 `Spinner` 和「正在加载」；empty 只在请求完成且数据为空时显示。
- 加载中状态优先使用 `apps/web/src/components/ui/spinner.tsx` 的 `Spinner` 组件，不手写临时 spinner 样式；加载文案保持克制，默认使用「正在加载」，不要拼接页面名、模块名或数据对象名（如“正在加载 Agent 列表”“正在加载托管设置”）。
- 工作台状态优先收敛到 `apps/web/src/store/workbench-store.ts`，避免页面局部状态失控。
- `apps/web/src/pages/chat/api` 是前端工作台服务适配层；UI 组件不要直接拼后端 URL。
- 组件测试优先覆盖用户可感知行为、可访问语义、状态流转和关键数据契约；不要断言 Tailwind class、字号、间距、宽高、阴影、圆角等易变视觉实现细节，除非这些样式本身就是公开 API 或明确要求锁定的设计 token。也不要断言文案，文案是易变的。UI 微调测试只覆盖真实行为、状态切换、可访问名称、数据契约；不要为了颜色、间距、圆角、字号、截图观感、文案补凑数测试。
- 简单样式微调不要求遵循 TDD，例如调整已有元素的间距、颜色、对齐、字号、圆角、hover 视觉或图标尺寸，且不改变 DOM 结构、交互行为、可访问名称、数据渲染或状态流转时，可以直接修改代码，再运行相关现有测试、build 和 `git diff --check` 验证。若样式调整引入新组件结构、新状态、新交互、响应式分支或影响可访问语义，则仍需先补行为测试或更新现有测试。

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
