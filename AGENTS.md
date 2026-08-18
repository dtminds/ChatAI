# AGENTS

## Shape

- `apps/web` 前端，`apps/backend` 后端，`packages/contracts` 共享契约。设计文档在 `docs/superpowers/specs`，数据库文档在 `docs/db`。
- Node.js 24 LTS + pnpm。Web：Vite、React、TypeScript、Tailwind、shadcn/ui、Hugeicons、React Router、Zustand、Axios。Backend：Fastify、Kysely、mysql2、`@fastify/jwt`、TypeBox。测试：Vitest。

## Architecture

- 浏览器 API 走同源 `/api`，公开业务接口 `/api/server/*`；不要硬编码环境域名，也不要在 URL 中暴露内部实现命名。
- 业务请求从 `apps/web/src/lib/request.ts` 发起；工作台 UI 走 `pages/chat/api`，不要直接拼后端 URL 或裸写 `fetch`。
- DTO 和响应结构放 `packages/contracts`，不要在 web / backend 两侧复制。
- 鉴权一律 Bearer JWT + session，所有环境都走正常登录，不提供开发绕过。
- MySQL 业务 ID 用 `number`；按容量约定不会触及 `Number.MAX_SAFE_INTEGER`。

## Coding Standards

- 编写或修改列表、接口、数据库、分页、Worker 或跨层契约时，读取 `CODING_STANDARDS.md` 并执行 Extra Checks。
- 审查 PR、分支、Commit、未提交改动或复审前同样读取该文件；审查时额外应用其中的 Review 章节。通用审查流程沿用 Review Skill。

## Workflow Node Development

- 设计、开发、修改、评审或接通 Workflow 节点运行能力前，读取 `docs/agents/workflow-node-development.md`；实现前完成其中的 Readiness Gate，测试和验收按该文档执行。

## Web

- 新页面沿用 shadcn/ui 和 `apps/web/src/components/ui`，不要引入第二套 UI 或图标集；图标用 Hugeicons。交互控件优先用已有基础组件，现有组件无法表达语义时才用原生元素。
- 不要覆盖基础组件已有的 `disabled` / `hover` / `focus` / `active` / `loading` 状态，除非用户明确要求或基础组件有缺陷。
- UI 改动限制在用户指出的范围内，先查同模块相邻页面和 `components/ui` 再复用；额外调整先说明并取得确认。
- 异步操作失败用 `toast.error` 或当前弹窗展示，不要写入页面级 `setError`。页面/区块内联错误只用于自身加载失败，并随重载、重试或路由切换清除；字段校验可在字段附近展示。用户触发的异步失败且没有可行动原因时，toast 用「操作失败，请稍后重试」，不要写成「保存工单失败」这类动作名拼接。
- 登录态页面不要用浏览器自动化验证；用代码路径、Vitest 和 build。
- 保持基础语义和可访问名称；不要为无障碍手写复杂焦点管理或引入额外产品复杂度。完整 WCAG 不是当前目标。
- 截图只取结构、层级、相对关系、状态和可见文案，必须覆盖截图中出现的信息节点。不要用截图像素或显示大小推导字号、间距、圆角或控件高度，尤其不要因为截图看起来大就把界面做大；尺寸沿用现有 token 和 shadcn 源码。
- UI 文案只写用户需要知道和可以操作的内容。短中文提示句末不加标点；能用 2–4 个字说清就不要拼接对象名。加载态「正在加载」，空态「暂无数据」。
- 列表/表格/卡片区分 loading、empty、error：loading 期间不显示「暂无数据」；表格 loading 保留表头，表体用 `role="status"` + `Spinner` +「正在加载」；empty 只在请求完成且数据为空时出现。加载用 `apps/web/src/components/ui/spinner.tsx`，不要手写 spinner，也不要拼接页面名。
- 工作台状态收敛到 `apps/web/src/store/workbench-store.ts`。
- 组件测试覆盖可感知行为、语义、状态流转和数据契约，不断言 Tailwind class、视觉细节或文案。简单样式微调（间距、颜色、字号等，且不改结构/行为/语义）不必先补测试，跑现有测试、build 和 `git diff --check` 即可；新结构、新状态或新交互仍要补行为测试。

## Backend

- 路由放 `apps/backend/src/modules/*`，插件放 `apps/backend/src/plugins`。MySQL 走 `apps/backend/src/db` 的 Kysely，不要在路由里散落 SQL。
- 当前不依赖跨表事务；若引入，先明确一致性需求和失败补偿。
- `xy_wap_embed_*` 中 Node 只写 `writable-tables.ts` 白名单；其余为平台表（如 `xy_wap_embed_contact`、`xy_wap_embed_group_member`），只读，改数据走平台 API。平台数据缺失或异常反馈平台团队，不要在应用层补偿写入。
- 全链路 UTC+8，`DATETIME` 是 UTC+8 wall-clock。mysql2 保持 `timezone: "+08:00"`，不要对已返回的 `Date` 再加减 8 小时，也不要为假设性 UTC 部署做局部转换。启动时校验 `CURRENT_TIMESTAMP() - UTC_TIMESTAMP() = 28800`；全链路 UTC 迁移必须单独立项。

## Environment

- 根目录 `.env.development`（本地前端 → 本地 backend）、`.env.dev-test-api`（本地前端 → 测试 API）、`.env.test`、`.env.production`、`.env.example`。
- 后端私密配置：`apps/backend/.env.local`（不提交），模板 `apps/backend/.env.example`。真实密钥、数据库连接串、JWT 私钥不要提交。

## Pre-PR Verification

- 提交或开 PR 前跑与受影响 CI 对齐的 build，不能用局部 typecheck 或单测代替。跑不了的命令写进说明，不能省略。每次提交跑 `git diff --check`。
- `apps/web`：`pnpm --filter @chatai/web build`（含 `tsc -b`，不能用 `typecheck` 替代）；有可测逻辑时再跑相关 Vitest。
- `apps/backend`：对应 build + 相关测试；涉及数据库、路由契约或鉴权时优先补测试。
- `packages/contracts` 或跨层 DTO：contracts build，并跑受影响消费方；同时动到 web 和 backend 时两侧 build 都跑，加上相关契约/适配层测试。

## Agent skills

- Issue tracker：Issues and specs are tracked in GitHub Issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.
- Triage labels：Use the default five-role triage label vocabulary. See `docs/agents/triage-labels.md`.
- Domain docs: Use a single-context layout with root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.
