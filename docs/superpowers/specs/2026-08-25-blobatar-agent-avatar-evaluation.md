# Blobatar Agent 头像替换评估

- 日期：2026-08-25
- 状态：Research
- 范围：评估以 `blobatar` + `@blobatar/react` 替换当前 Agent 专用的 `@oreo-design/avatar/react`；不改产品代码
- 证据快照：Blobatar 已发布版本 `2.5.0`（npm `gitHead` [`8fbeea9`](https://registry.npmjs.org/blobatar/2.5.0)）；仓库核验至 [`9ebabd2`](https://github.com/Alain00/blobatar/tree/9ebabd25b23bae69ba4eb9d4d9e4cd3c87e79bd0)

## 结论

**可行，建议采用「保留项目 `AgentAvatar` 包装层、静态列表 + 单体按需动画」的替换方式；不建议把 Blobatar 当成基础 Avatar 的一对一替代，也不建议立刻接入未满供应链等待期的最新包。**

它符合现有需求：`name` 是唯一必填字段，同一 major 内由相同字符串稳定生成同一头像，因此可继续用不随重命名变化的 `agentId`；React 18+ 已满足本项目 React 19。核心与 React adapter 都没有运行时依赖，均为 ESM，并声明 MIT 许可。[React adapter 包定义](https://github.com/Alain00/blobatar/blob/9ebabd25b23bae69ba4eb9d4d9e4cd3c87e79bd0/packages/react/package.json) [核心包定义](https://github.com/Alain00/blobatar/blob/9ebabd25b23bae69ba4eb9d4d9e4cd3c87e79bd0/packages/blobatar/package.json) [许可](https://github.com/Alain00/blobatar/blob/9ebabd25b23bae69ba4eb9d4d9e4cd3c87e79bd0/LICENSE)

当前 `AgentAvatar` 正是合适的稳定边界：内部改为 `<Blobatar name={agentId} size={size} ...>`，保留现有 `agentId`、`agentName`、`size`、`className` 与无障碍标题契约。它能让列表、设置页、消息预览及以后 Agent 场景共用同一视觉身份，而不让业务页面感知第三方 API。

## 接入与定制能力

- 安装 `blobatar` 和 `@blobatar/react`，使用 `Blobatar`；后者只是 re-export core React 组件。旧 `blobatar/react` 已冻结并计划在 v3 移除，不能采用。[adapter README](https://github.com/Alain00/blobatar/blob/9ebabd25b23bae69ba4eb9d4d9e4cd3c87e79bd0/packages/react/README.md) [re-export 实现](https://github.com/Alain00/blobatar/blob/9ebabd25b23bae69ba4eb9d4d9e4cd3c87e79bd0/packages/react/src/index.tsx)
- 可用 `background`、`hue`、`tone`、`traits`、`palette`、`expression` 控制品牌化与状态；`traits` 可锁定形状等单轴，同时保留 `agentId` 产生的差异。`palette` 会绕过库声明的对比度保证，除非完成可读性验收，不应开放为业务侧任意值。[选项与稳定性说明](https://github.com/Alain00/blobatar/blob/9ebabd25b23bae69ba4eb9d4d9e4cd3c87e79bd0/packages/blobatar/README.md#L94-L219)
- 它不是带 `src` / 图片回退能力的通用 Avatar：静态 Blobatar 渲染为 data-URI `<img>`，动画模式渲染为 inline `<svg>`。官方的图片优先、Blobatar fallback 示例是另一段需拷入项目的 shadcn composition。因此「完整替换」应限定为当前 Agent 生成头像，不应替换有真实用户图片的基础 Avatar。[React 渲染分支](https://github.com/Alain00/blobatar/blob/9ebabd25b23bae69ba4eb9d4d9e4cd3c87e79bd0/packages/blobatar/src/react.tsx#L30-L165) [官方 Avatar composition](https://github.com/Alain00/blobatar/blob/9ebabd25b23bae69ba4eb9d4d9e4cd3c87e79bd0/apps/site/registry/blobatar.tsx#L25-L91)

## 动画与性能边界

动画需额外 `import "blobatar/motion.css"`，再传 `animate="hover"` 或 `animate="always"`。它提供呼吸、漂浮、眨眼和视线；尊重 `prefers-reduced-motion`，且 touch 不触发 hover。

- Agent 管理卡片、任何未来的大列表：保持静态。官方明确静态是单个 `<img>`，动画是约十二个节点的 inline SVG，数百条列表不应默认持续动画。
- 详情页、Agent 配置成功态或预览：才考虑 `animate="always"`；卡片 hover 用 `"hover"`。表达式应只映射可感知状态（例如处理中），不应以轮询/随机值反复切换。

[动画文档](https://github.com/Alain00/blobatar/blob/9ebabd25b23bae69ba4eb9d4d9e4cd3c87e79bd0/packages/blobatar/README.md#L221-L269) [动画组件实现](https://github.com/Alain00/blobatar/blob/9ebabd25b23bae69ba4eb9d4d9e4cd3c87e79bd0/packages/blobatar/src/react.tsx#L68-L165) [reduced-motion 规则](https://github.com/Alain00/blobatar/blob/9ebabd25b23bae69ba4eb9d4d9e4cd3c87e79bd0/packages/blobatar/src/motion.css#L1172-L1186)

## 兼容性、发布与风险

- 当前 Web 是 Vite SPA，ESM `default` export 可直接打包。源码未见顶层 `window` / `document` 访问，静态分支仅由 `useMemo` 生成 SVG data URI，故 SSR 在代码层面看应可渲染；但包没有 SSR/hydration 条件或支持承诺，若未来引入 SSR，先加最小 smoke test。
- 当前版本的供应链成熟度低：仓库创建于 2026-08-15，`2.5.0` 于 2026-08-23 发布，尚无长期维护/兼容性历史。仓库 CI 覆盖 Node smoke、跨 adapter、Chrome/Firefox composition 和 tarball 打包，这是正面信号，但不足以消除新依赖风险。[CI](https://github.com/Alain00/blobatar/blob/9ebabd25b23bae69ba4eb9d4d9e4cd3c87e79bd0/.github/workflows/ci.yml) [npm core](https://registry.npmjs.org/blobatar/2.5.0) [npm React adapter](https://registry.npmjs.org/@blobatar%2Freact/2.5.0)
- 本机 pnpm 的 `minimumReleaseAge=10080` 分钟；截至此评估，最新两个包均未满等待期，安装会被策略拒绝。应等待策略自然放行后再锁定同一 `2.x` 版本并验证，不建议为 UI 头像临时加白名单。
- 库将 major 视为视觉 generation；升级 major 会刻意改变既有 `agentId` 对应头像。上线时锁定 core 与 adapter 的同一 major，升级 major 必须作为视觉变更评审。

## 建议的落地验收

1. 等待包通过供应链等待期后，在 `apps/web` 以相同 `2.x` 版本引入两个包，并移除 `@oreo-design/avatar`。
2. 仅修改 `AgentAvatar` 的内部实现；先以 `agentId` 作为 `name`，保留 title 和尺寸契约，并为 Agent 设定受控的 `traits` / 色彩规则。
3. 首期两个现有列表场景保持静态；仅在单个预览或详情启用动画并一次性引入 motion CSS。
4. 跑 AgentAvatar 行为测试、`corepack pnpm --filter @chatai/web build` 和 `git diff --check`；人工检查浅/深色、缩放、reduced-motion 与列表滚动。
