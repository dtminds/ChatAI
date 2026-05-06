# AGENTS

## Mission

这个仓库用于承载“AI 客服工作台”的前端原型与后续实现，当前阶段以 `/chat` 工作台骨架为核心入口。

## Stack

- Vite + React 19 + TypeScript
- Tailwind CSS v4
- shadcn/ui
- Hugeicons
- React Router v7
- Zustand
- Axios

## Design References

- 设计说明：[docs/superpowers/specs/2026-04-19-chat-workbench-design.md](/Users/lsave/workspace/AI/ChatAI/docs/superpowers/specs/2026-04-19-chat-workbench-design.md)
- 当前目标页面：`/chat`
- 当前阶段优先级：先把工作台框架、状态模型和 API 接入点搭稳，再补真实业务能力

## Working Agreements

- 新页面优先沿用 `shadcn/ui` 组件，避免混入第二套 UI 体系。
- 交互控件优先使用 `src/components/ui` 中已有基础组件（如 `Button`、`Input`、`DropdownMenu`），不要在业务组件里随手裸写原生控件；只有在封装基础组件或现有组件无法表达语义/交互时才使用原生元素，并同步处理可访问性、键盘行为和 `focus-visible`。
- 图标统一使用 Hugeicons，不再引入 Lucide 或其他图标集。
- HTTP 请求统一从 `src/lib/request.ts` 出口发起，不直接在页面里裸写 `fetch`。
- 工作台状态优先收敛到 `src/store/workbench-store.ts`，避免页面局部状态失控。
- 单元测试、组件测试和测试辅助统一放在仓库根目录下的 `test/`，不要混进 `src/` 业务目录。
- 组件测试优先覆盖用户可感知行为、可访问语义、状态流转和关键数据契约；不要断言 Tailwind class、字号、间距、宽高、阴影、圆角等易变视觉实现细节，除非这些样式本身就是公开 API 或明确要求锁定的设计 token。
- `src/pages/chat` 里的 mock 数据和占位结构可以演进，但请尽量保持字段命名与设计说明中的轮询模型一致。
- 未接入真实后端前，允许使用本地假数据验证布局与交互层级。

## Directory Notes

- `src/components/ui`: shadcn/ui 基础组件
- `src/lib`: 通用工具、请求封装、样式工具
- `src/pages/chat`: `/chat` 工作台页面与 mock 数据
- `src/router`: 路由定义
- `src/store`: Zustand store
- `test`: Vitest 用例、Testing Library 组件测试、测试初始化

## Dev Commands

- 安装依赖：`pnpm install`
- 启动开发：`pnpm dev`
- 类型检查：`pnpm typecheck`
- 测试：`pnpm test`
- 生产构建：`pnpm build`
