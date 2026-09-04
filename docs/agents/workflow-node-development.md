# Workflow Node Development

本文件是 Workflow 节点设计、开发、评审和运行接通的统一规范，供 Human 与 Agent 共同使用。通用工程约定以根目录 `AGENTS.md` 为准；列表、接口、数据库、分页、Worker、跨层契约和 Review 的额外检查以 `CODING_STANDARDS.md` 为准。本文件只补充 Workflow 节点特有的决策和完成标准。

## Readiness Gate

开始实现前，必须从现有 Issue、Spec、代码和产品上下文中确认以下事项。无法确认且不同选择会改变契约、运行语义或用户行为时，先澄清；结论记录在 Issue、Spec 或 PR 描述中。全部有明确答案后才算 Ready。

### 1. 节点语义

- 节点属于 Event、Action、Query、Inference、Wait、Control Flow 中的哪一类。
- 节点完成后使用哪个稳定 Outlet；是否可能改变路由、等待、跳过或结束 Run。
- 用户能观察到的成功结果是什么；节点是产生副作用、读取事实，还是只控制流程。

### 2. 配置契约

- 字段、默认值、最小值、最大值、数量上限、去重规则和互斥关系均已明确。
- 草稿保存允许哪些中间态；提交审核、编译和发布时必须满足哪些完整条件。
- 编辑器首次添加节点时的默认配置、删除到最少项时的行为、保存后回显均已明确。
- 资源选择器的数据源、批量回显、禁用项、失效资源和加载失败行为均已明确。

### 3. 变量与类型

- 每个可引用字段允许固定值、变量或两者；变量类型和必要的转换规则已明确。
- 可选变量只来自统一变量模型：全局变量、确定前序节点的输出、节点属性，以及当前节点当时可用的属性。
- 节点本地配置参数只服务当前节点，不进入变量目录，也不向其他节点暴露。
- 缺失变量、类型不匹配、转换失败分别是发布错误、运行终止、跳过该项，还是节点成功继续，必须显式决定。

### 4. 输出与时间

- 只有下游编排确实需要的业务结果才定义节点输出；不要把 Java 响应字段机械复制成输出。
- “节点进入后”与“节点完成后”的时间统一引用节点属性 `enteredAt` / `exitedAt`。外部业务时间只有在语义确实不同且下游需要时才成为输出。
- Start 不产生 Task 生命周期；触发时间通过全局 Trigger Context 引用，不伪装成 Start 的 `enteredAt` / `exitedAt`。
- Java 进入 Node 的绝对时间使用公共 UTC Instant 契约和归一化函数；Java 可返回标准 `Instant` 字符串，Node 持久化和输出保持统一的毫秒精度 UTC 形式。

### 5. 执行与失败语义

- 成功、无数据、部分无效、业务拒绝、超时、限流、依赖不可用和未知结果分别如何处理已明确。
- 每种失败属于 retry、defer、terminal、skip-and-continue 或 flow-changed 中的哪一种；用户可见原因和诊断信息不能混淆。
- 重试的 deadline、最大次数、退避和最终状态沿用 Runtime 统一机制，不在单节点里另造状态机。

### 6. Java 与数据边界

- Java Endpoint、鉴权、请求/响应 DTO、批量能力、超时和错误分类已确认，或明确标记为尚未就绪。
- 一次节点需要修改多个对象或字段时，Java 提供批量接口；Worker 不按条循环调用同一个业务接口。
- Action 使用 Runtime 提供的稳定幂等键；Java 对同键同请求返回同一结果，对同键不同请求返回冲突。超时重试复用原键。
- Query 不产生副作用，不为形式完整携带 Action 幂等键；查询范围、排序、数量上限和输出大小必须受控。
- 平台表的数据归属已确认。Node 只读平台表；修改平台数据通过 Java API，不直接写平台表。

### 7. 上线与版本语义

- 节点 maturity 已确定：仅占位为 `placeholder`；编辑和保存完整但生产依赖未接通为 `draft-ready`；生产执行链路完整才是 `runtime-ready`。
- Java 或生产 Adapter 未就绪时，使用测试替身完成 Node 子系统测试，节点保持 `draft-ready`；生产代码不放入成功 Fake。
- Live Revision 下，当前 Task 按自身 Revision 完成，下一跳按最新发布图解析。新增或修改的变量引用必须能在旧 Run Context 中检查兼容性，不能缺值后静默执行默认行为。
- Node ID、Outlet ID 和 Node Kind 的身份语义已评估；破坏稳定身份的修改必须按 flow-changed 契约处理。

## Implementation Surfaces

节点不一定修改所有层，但必须逐项核对并将不适用项说明为 N/A。新增节点种类时尤其不能只完成画布 UI。

| Surface | Required work |
| --- | --- |
| Contracts | 在 `packages/contracts/src/workflow` 定义 Node Kind、Draft Config、Execution Config、默认值、限制、maturity 和共享 DTO；Draft 与 Execution 校验分开。 |
| Engine | 在 `packages/workflow-engine` 完成 Draft → Execution 投影、编译期完整性、变量可达性和类型校验、明确的无效配置原因，以及 runtime support 派生。 |
| Web | 在 `apps/web/src/pages/chat/workflow` 完成节点定义、默认配置、设置面板、画布摘要、资源加载、变量选择、保存回显和发布前检查；沿用相邻节点与基础组件。 |
| Runtime | 在 `packages/workflow-runtime` 完成类型化命令投影、Context 解析、结果解码、生命周期、稳定 Execution Key、错误分类和 Live Revision 前向路由兼容检查。 |
| Worker | 在 `apps/workflow-worker` 完成真实 Port / Adapter 组合、超时与取消传播、错误策略和生产启动组合校验；只有生产执行链路完整才允许 runtime-ready。 |
| Backend | 仅在编辑器资源、批量回显、发布校验或 Java 代理确有需要时修改 `apps/backend`；遵守数据归属、批量和跨层契约规则。 |
| Documentation | Java 协作节点在 `docs/superpowers/specs` 维护请求、响应、幂等、错误和上线前置条件；变更既有 Runtime 语义时同步对应 Spec / ADR / Context。 |

新增 Node Kind 时，至少搜索并核对共享 Kind 联合、Contract Registry、Compiler、Web Node Registry、默认 Draft、设置面板、输出定义、Runtime Dispatch、Worker Composition、数据页标题映射和测试夹具。以实际引用搜索结果为准，不维护另一份容易过期的文件清单。

## Workflow Rules

### Draft and Execution

- Draft Schema 服务于持续自动保存，允许用户逐步填写形成的合法中间态。
- Execution Schema 服务于提交审核、编译和运行，必须完整且严格。
- 不要把字段间的暂时矛盾提前抬到草稿保存门槛；需要保证落库始终合法时，由 UI 原子提交完整值，或将严格检查留到 Execution Gate。
- 当前仍在开发阶段。没有已承诺的存量兼容需求时，优先清理测试 Workflow 数据并保持单一当前 Schema；不要为未上线数据增加兼容读取、Schema 版本升级或兼容测试。需要兼容时必须由产品或发布计划明确提出。

### Variables

- 变量目录只有两层：全局变量；节点变量。节点变量再分为节点输出和节点属性。
- 节点输出由统一 Output Definition 注册，节点属性由统一生命周期模型提供。节点不得在选择器里私自增加一套局部 Scope。
- 仅暴露当前节点执行时实际可用的属性；当前节点尚未完成时不能引用自己的 `exitedAt`。
- Compiler、Web 变量目录、Runtime 解析和 Live Revision 兼容检查必须使用同一 Selector 语义。新增 Selector 使用点时四处一起核对。

### Outputs and Lifecycle

- Java 返回成功空对象时，节点输出可以是 `{}`；不为了“看起来完整”增加时间、状态或回执字段。
- 下游只需要知道节点完成时间时使用 `exitedAt`，不新增 `sentAt`、`handoffAt` 等近义输出。
- 输出 Schema 必须有稳定类型、大小上限和明确用途。发生截断时，计数、ID 和内容各自表达什么必须保持一致，不能因信封裁切静默改变统计语义。

### Actions, Queries, and Inference

- Action 的 `idempotencyKey` 使用 Runtime 的稳定 Execution Key，通常由 `uid + runId + nodeId + sequence` 构成；重试、超时恢复和滚动发布不得改变该键。
- Action 的副作用由 Java 保证幂等，Node 负责提供稳定键、重试边界和结果分类。
- Query 应使用稳定排序、明确时间边界、数量上限和与查询形状匹配的索引；遵守 `CODING_STANDARDS.md` 的批量、分页和规模检查。
- Inference 使用稳定 `executionKey` 和独立 Job 生命周期，不把 Action 幂等语义套到推理请求。
- 一个节点内的多项修改一次投影成一个批量命令；部分无效项如何处理必须在产品语义和 Java Contract 中统一，不能由 Worker 临时猜测。

### Maturity and Composition

- maturity 是节点是否可发布和运行的唯一节点级开关，不再维护与 Node Kind 一一对应的外部 Capability 白名单。
- `draft-ready` 必须能完成编辑、保存、加载、编译错误提示和 Node 子系统测试，但发布门禁不能放行。
- 升为 `runtime-ready` 前，Worker 生产组合必须存在真实执行路径，Backend 发布门禁、Runtime 执行门禁和 Worker 启动校验必须一致。

## Tests and Acceptance

新增测试只保护真实风险。普通文案、Tailwind class、字号、间距、颜色等不作为测试契约；通用测试和构建要求遵守 `AGENTS.md`。

| Layer | Minimum risk coverage |
| --- | --- |
| Contracts | Draft 中间态可保存；Execution 不完整时拒绝；默认值、上下限、去重、互斥和类型边界。 |
| Web | 新节点默认状态；增删到边界；固定值与变量切换；类型过滤；资源加载/批量回显/失效；保存再加载；用户操作失败可见。 |
| Compiler | 配置不完整、变量不可达、变量类型不符、分支出口不保证、重复资源或字段等发布失败路径。 |
| Runtime | Context → Command 投影；稳定 Execution Key / Idempotency Key；结果 Schema；输出与生命周期；success、retry、terminal、skip/defer；无外部调用前的参数失败。 |
| Live Revision | 旧 Task 完成后按最新图路由；目标节点缺少旧 Context 时在副作用前 flow-changed；Node Kind、Outlet 或后续节点变化符合规范。 |
| Worker / Backend | Java DTO、批量调用次数、租户与 Subject 隔离、查询过滤与排序、错误分类、超时/取消、生产 Composition；涉及列表或数据库时执行 `CODING_STANDARDS.md` Extra Checks。 |

至少完成以下端到端验收路径；不适用项写明原因：

1. 添加节点后默认配置可保存，刷新后配置不丢失。
2. 用户逐项编辑时草稿自动保存不因合法中间态失败。
3. 配置不完整或引用不可用时，提交审核 / 发布被明确阻止。
4. `runtime-ready` 节点可创建 Run、执行、记录生命周期并按预期路由；`draft-ready` 节点不能发布或运行。
5. Action 超时重试复用同一幂等键，不重复产生副作用。
6. Query 的空结果、边界结果、达到上限、超出输出限制和稳定排序行为明确。
7. Terminal、retryable、defer、skip-and-continue 和 flow-changed 不互相误分类。
8. 运行中发布新 Revision 后，旧 Run 的上下文兼容和前向路由符合 Live Revision 语义。

提交前运行受影响测试、与 CI 对齐的 build，以及 `git diff --check`。只改文档时不要求运行 package build 或测试。

## Parallel Development

- 一个节点一个分支 / PR，保持产品语义、Contract、UI、Runtime 和测试在同一可审查范围内。
- 多个节点共用的新抽象先拆成前置 PR；节点 PR 依赖明确的前置 Commit，不在多个分支各自复制一份实现。
- Contract Registry、Kind 联合、Web Registry、Runtime Dispatch 和 Worker Composition 是共享热点。修改保持机械、最小，并在 PR 描述中列出冲突点和合并顺序。
- Java 未就绪的节点可以并行完成 Node 子系统，但保持 `draft-ready`，PR 明确写出真实联调前仍缺少的 Endpoint、Adapter、幂等或错误契约。
- 不因“以后可能复用”提前抽象；第二个真实节点出现相同需求后，再把已验证的共性下沉到共享模块。

## Definition of Done

一个节点只有同时满足以下条件才算完成当前 maturity 对应的交付：

- Readiness Gate 的产品、配置、变量、输出、失败、Java、数据和版本问题均已有明确结论。
- Contract、Engine、Web、Runtime、Worker、Backend 和文档逐层核对完成，不适用项有理由。
- Draft 中间态与 Execution 严格门槛均正确，默认值和边界行为可保存并回显。
- 变量 Selector、输出、生命周期、错误分类、幂等和批量语义在各层一致。
- Live Revision 不会让旧 Run 在缺失上下文时继续产生错误副作用。
- 所有新增测试都对应具体风险，受影响测试、CI build 和 `git diff --check` 已通过或明确记录未执行原因。
- maturity 与真实生产能力一致：`draft-ready` 不发布，`runtime-ready` 有真实生产执行链路和启动校验。
