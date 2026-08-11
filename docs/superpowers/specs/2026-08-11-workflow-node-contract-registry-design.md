# Workflow 节点契约与 UI 开发协议

- 日期：2026-08-11
- 状态：Accepted
- 适用范围：`packages/contracts`、`packages/workflow-engine`、`packages/workflow-runtime`、`apps/workflow-worker`、`apps/backend` 与 `apps/web` 中的 Workflow 节点定义
- 目标：在 Java 业务能力尚未接通时，先冻结节点的持久化结构、执行投影和前端开发职责，使不同节点可以并行实现而不产生跨层契约漂移

## 1. 决策摘要

Workflow 节点采用一套共享的 per-kind 契约注册表。每个节点必须显式声明：

- 当前 Draft Schema Version
- Draft Config Schema
- Execution Config Schema；纯占位节点为 `null`
- Draft 持久化字段白名单
- 节点成熟度
- 节点执行类别

共享注册表位于 `packages/contracts/src/workflow/node-contract.ts`。它是节点数据结构、版本、成熟度和执行类别的权威来源。

Draft 到 Execution 的投影只允许存在于 `packages/workflow-engine/src/node-contract-registry.ts`。Web 不再自行生成 Execution Config，Compiler 也不再维护第二套按 kind 分支的投影逻辑。

## 2. 三种成熟度

| maturity | 含义 | 可保存 Draft | 可生成结构化投影 | 可发布运行 |
| --- | --- | --- | --- | --- |
| `placeholder` | 只有节点入口和基础画布展示，业务配置尚未定义 | 是，仅允许空配置 | 否，DSL 中 `config: null` | 否 |
| `draft-ready` | Draft、Setting UI 和执行形状已定义，但 Runtime 尚未闭环 | 是 | 是 | 否 |
| `runtime-ready` | Schema、Compiler、Executor、输出、错误处理与恢复均已闭环 | 是 | 是 | 是，但仍需满足 Workflow Capability Profile、Deployment Capability 和 Product Entitlement |

当前分类：

- `runtime-ready`：`start`、`wait`、`wait-event`、`branch`、`end`
- `draft-ready`：`message`、`message-query`、`handoff`、`llm`、`ai-intent`
- `placeholder`：`tag`、`coupon`、`agent`、`order-query`、`tag-query`、`customer-update`、`ai-collect`

把节点加入画布节点库不等于加入 Workflow Runtime Support。只有完成端到端执行闭环后，才能把成熟度改为 `runtime-ready`。

## 3. 单一执行类别

每个 Node Kind 必须且只能属于一个执行类别。执行类别决定运行机制和可靠性信封，成熟度决定当前实现进度；两者相互独立。

| executionClass | 执行方式 | 可靠性身份 | 当前节点 |
| --- | --- | --- | --- |
| `core` | Workflow Engine 内部确定性执行，不经过 Capability Port | Runtime 内部 Node Execution Key | `start`、`wait`、`wait-event`、`branch`、`end` |
| `action` | 通过 Capability Port 调用产生外部副作用的业务能力 | 下游必须接收 `idempotencyKey` | `message`、`handoff`、`agent`、`tag`、`customer-update`、`coupon` |
| `query` | 通过 Capability Port 读取外部业务数据 | 不发送额外调用键 | `message-query`、`order-query`、`tag-query` |
| `inference` | 通过 Capability Port 执行非确定性的模型推理 | 不发送额外调用键，使用执行元数据关联调用 | `llm`、`ai-intent` |
| `composite` | 由多个阶段、等待或回调组成，需要独立的持久化子状态 | 由未来 Composite Runner 按阶段生成 | `ai-collect` |

`action`、`query`、`inference` 统称 Capability 节点，共用 `workflow_node_execution` 生命周期、deadline、输出上限、错误分类和 Retry 框架。物理表及历史列名保持兼容；例如 `idempotency_key` 当前承载 Runtime 内部稳定的 Node Execution Key，不代表 Query 或 Inference 对下游提供幂等承诺。

Capability Binding 注册时必须与共享注册表中的执行类别一致。`core` 和 `composite` 不允许注册为 Capability Binding。`ai-collect` 本期继续保持 `placeholder`，不得把多阶段采集过程伪装成一次 Action 或 Inference 调用。

## 4. Draft 与 Execution 的职责

### 4.1 Draft Config

Draft Config 是编辑器可持久化状态，必须满足：

- 允许用户保存尚未配置完成的节点，例如开始节点尚未选择来源或触发事件。
- 约束字段类型、未知字段、数组数量、字符串长度和其他资源上限。
- 保留 UI 恢复所需、但执行时不需要的稳定快照字段，例如模型展示名称。
- 不保存回调、选中态、面板状态、React Flow 临时字段或运行时状态。

Draft Schema 只回答“这份编辑状态能否安全持久化”，不回答“这份配置能否发布”。

### 4.2 Execution Config

Execution Config 是不可变 Revision 中的运行参数，必须满足：

- 只包含 Runtime 或 Capability Adapter 需要的字段。
- 不包含标题、摘要、图标、选中态、Setting UI 状态和展示快照。
- 发布时必须完成必填配置、变量可用性、分支出口、图结构和能力门控校验。
- 同一 Draft 在 Web DSL 与 Backend Compiler 中必须通过同一个投影模块得到相同结果。

Draft 允许不完整，不代表 Execution 可以不完整。开始节点的空来源、空触发器和空标签选择可以保存，但 Compiler 必须拒绝发布。

### 4.3 版本与迁移

- 新节点从 `currentDraftSchemaVersion = 1` 开始。
- 改变持久化形状或字段语义时必须提升版本并提供 Web hydration migration。
- 只调整 Node UI、Setting UI、文案或 Execution 内部实现，不提升 Draft Schema Version。
- Web 创建新节点和 hydration 都从共享注册表读取当前版本，节点 Definition 不再自行声明版本。
- Backend 接受旧 Draft 的读取与恢复，但新保存必须符合迁移后的当前版本和字段白名单。

## 5. 模块职责

### 5.1 Contracts 模块

`packages/contracts` 负责小而稳定的节点契约接口：

- per-kind Draft/Execution Schema
- 共享类型、资源上限和封闭枚举
- Draft 字段提取和未知字段检查
- 成熟度与当前 Draft Schema Version
- 每个 Node Kind 唯一且类型可推导的执行类别

Contracts 不依赖 React、画布状态、Java Adapter 或数据库实现。

### 5.2 Workflow Engine 模块

`packages/workflow-engine` 负责：

- Draft 到 Execution 的唯一投影
- 发布所需的图与节点完整性校验
- Capability Requirement 提取
- placeholder fail-closed

投影函数接收 `kind + Draft Config + Workflow Type`，返回纯 JSON Execution Config。它不得读取 Node UI Definition，也不得通过默认 `{}` 掩盖未实现节点。

### 5.3 Backend 模块

Backend 保存 Draft 时负责：

- 校验节点 `schemaVersion` 等于当前版本
- 拒绝未注册字段
- 校验 Draft Config 结构
- 校验 Workflow Capability Profile 中允许的节点与配置

Backend 发布时通过 Engine 完成 Execution 投影和严格校验。Backend 不复制 per-kind 字段列表。

### 5.4 Web 模块

Web 节点 Definition 只负责编辑体验：

- 创建默认 Draft Data
- hydration migration 与 sanitize
- 用户可感知的配置完整性和变量可用性校验
- Node UI 摘要、Handle、输出变量与 Setting UI
- 节点库分组、图标和可插入关系

Web 不定义 Execution Config，不自行维护 Schema Version，也不把 UI 校验当作后端发布校验的替代品。

## 6. Node UI 协议

Node UI 是画布上的扫描摘要，不是 Setting UI 的缩小版。

每个节点应遵守：

1. 头部展示节点图标和当前标题；只有自定义标题与原始类型名称不同时，才补充原始类型名称。
2. AI 节点统一展示 AI 标识，但 AI 标识不改变节点成熟度或运行能力。
3. 主体只展示最有助于扫描流程的 1 到 3 组摘要，例如模型、输入、输出、等待时间或话术摘要。
4. 未配置、引用失效或配置不完整时显示 warning 语义；正常摘要不展示内部错误码。
5. 长文本、参数 Tag 和话术必须在稳定布局内截断或限制行数，不允许内容变化推动节点宽度或造成 Handle 漂移。
6. 动态 Handle ID 必须来自稳定业务 ID，不能来自名称、数组下标或每次 normalize 生成的随机值。
7. Handle 位置随节点实际高度同步；修改主体结构时必须验证所有出口与 Edge 对齐。
8. Node UI 渲染不得修改 Draft，不得触发远程请求，不得生成 Execution Config。
9. 单击负责选中，双击标题可以进入重命名；节点菜单与 Setting 菜单使用同一重命名命令。

Node UI 的状态必须与 Setting 校验使用同一组事实。不能出现节点显示 ready，但发布因同一必填项缺失而失败的情况。

## 7. Setting UI 协议

Setting UI 是节点 Draft Config 的唯一主要编辑界面。

每个 Setting Panel 应遵守：

1. 只读当前节点 Draft，并通过统一的节点更新命令写回 Draft。
2. 复用 `apps/web/src/components/ui` 和 Workflow 已有编辑器、变量选择器、时间选择器及 Setting Workspace，不另建同义控件。
3. 变量引用必须保存 selector/稳定 ID；显示 token 可以使用节点名与变量名，但不得通过解析显示文本恢复引用。
4. 当前拓扑不再满足引用条件时，保留可诊断的失效状态并阻止发布，不静默改绑到同名节点。
5. 删除已被提示词引用的局部输入参数时，按该节点已确认的产品语义降级为纯文本；跨节点 selector 不做自动猜测修复。
6. 需要大面积编辑的字段使用统一 Setting Workspace 展开模式。展开后原 Setting 区对应编辑器只读，避免双写。
7. 远程选项列表通过 Web 的业务适配层加载，不在 Panel 中硬编码 URL 或直接调用 Java 接口。
8. 异步操作失败遵守 Web Working Agreements；字段校验放在字段附近，操作失败在当前弹窗或 toast 中可见。
9. Panel 底部保留稳定留白，内容滚动不改变面板外框；切换已选节点时不重复播放面板入场动画。
10. UI 测试保护状态流转、选择结果、引用失效、可访问名称和 Draft 数据，不锁 Tailwind class、尺寸、阴影或普通说明文案。

## 8. 输出变量与 Capability 调用

节点输出必须在 Definition 中声明稳定 key、类型、用途和语义。后续节点只能选择：

- 图上真实前序节点的输出
- 当前 Workflow Type 允许的系统、Subject 和 Trigger 变量
- 与当前输入用途兼容的类型

Capability 节点调用外部能力时，Execution Config 必须先由 Engine 编译成类型化 Capability Command。Runtime 使用同一稳定 Node Execution Key 管理执行台账；发送给下游时，只有 Action 使用由它派生的 `idempotencyKey`，Query 和 Inference 不携带额外调用键，通过执行元数据关联调用。前端不生成这些键，外部 Adapter 也不解析原始 Draft。

## 9. 新节点完成清单

一个节点从 placeholder 演进时，至少按以下顺序交付：

1. Contracts：Draft Schema、Execution Schema、版本、字段白名单、执行类别、共享类型与资源上限。
2. Web Definition：默认值、sanitize、validate、Node UI 摘要、Handle 和输出变量。
3. Setting UI：完整编辑路径、变量约束、失效状态和必要行为测试。
4. Engine：唯一 Execution 投影、严格校验和 Capability Requirement。
5. Adapter：类型化 Action、Query 或 Inference Command；落实 Action 幂等键以及 Query、Inference 无额外调用键的语义。
6. Runtime：Executor、输出上限、错误分类、Retry/Wait/恢复行为。
7. 发布门控：确认 Workflow Capability Profile、Runtime Support、Deployment Capability 和 Product Entitlement 全部对齐。
8. 验证：Contracts、Engine、Runtime、Backend、Web 的受影响测试与 build，以及 `git diff --check`。

未完成第 4 至第 7 步的节点只能保持 `draft-ready`，不得仅因为前端交互完成而开放发布。

## 10. 并行开发规则

可以按节点拆给不同开发者并行实现，但共享文件需要明确所有权：

- 每位开发者主要修改自己的 Node UI、Setting UI 和 per-kind 测试。
- Contracts 注册表和 Engine 投影由一名集成人维护，或通过独立小提交串行合入。
- 共享变量选择器、Setting Workspace、Handle 布局和输出目录先修改公共模块，再由各节点消费，避免每个节点各做一份。
- Java 接口尚未可用时使用类型化 Fake Adapter 验证命令与错误语义，不在 Web 中临时拼接 Java 请求。
- 合并前必须确认节点成熟度没有被提前提升，placeholder 没有获得伪 Execution Config。

该协议的核心是把节点结构、执行语义和编辑体验放在各自清晰的模块后面。新增节点仍然需要跨层交付，但每一层只维护自己必须知道的事实。
