# 半托管 Agent Turn 前端活动协议与辅助条交互

- 日期：2026-09-15
- 状态：Draft
- 范围：半托管模式 2.0 的前端协议、状态归约、辅助条和过程展开 UI
- 关联产品方案：[`docs/product/2026-09-09-semi-managed-mode-2.md`](../product/2026-09-09-semi-managed-mode-2.md)
- Backend Mock 协议：[`2026-09-16-agent-turn-mock-backend-protocol.md`](./2026-09-16-agent-turn-mock-backend-protocol.md)
- 当前实现入口：`apps/web/src/pages/chat/components/chat-ai-assistant-status-bar.tsx`

本文定义后端接口 ready 前的前端协议和 UI 结构。前端先使用本地事件 Fixture 驱动同一套 Reducer 和视图，后续由后端 Adapter 将真实 Agent 事件转换为本文协议；不因为更换事件来源而重做辅助条交互。

## 1. 背景与目标

单个 Agent Turn 可能连续经历思考、工具调用、工具返回和文本输出。当前辅助条只接收 `status`、`label` 和操作按钮，能够展示当前状态，但不能承载本轮已经发生的完整过程。

本方案的目标是：

1. 辅助条折叠时始终只展示当前活动的一句话摘要。
2. 工具调用有 `summary` 时展示该摘要，没有时在思考态回退为「正在思考」。
3. `tool_call` 和 `tool_result` 通过工具调用 ID 合并为一条活动记录。
4. 展开后可以查看本轮所有活动，以及工具调用参数、返回结果和失败信息。
5. 部分工具可以注册专用详情 UI；没有专用 UI 时使用通用原始信息展示。
6. 不同来源的活动（工具、技能、知识库、SOP 或文本输出）都通过通用活动模型接入，不把它们写死为辅助条顶层状态。
7. 保留当前 `waiting / thinking / confirmation` 视觉模式和状态切换动画。

## 2. 非目标

本方案暂不处理：

- 后端 Agent Loop、模型 Prompt 或真实 SSE/WebSocket 接口实现。
- Intent Group、Action Frame 或其它高层意图分组。
- 工具执行策略的实现；前端只消费活动状态和人工决策事件，不判断工具是否应当自动执行。
- 模型原始思维链展示。摘要和业务化执行详情不等同于 CoT。
- 供客服浏览全部技能、工具或 SOP 的命令市场。

## 3. 核心设计决定

### 3.1 不引入 `frameId`

第一版不做高层分组，Agent Turn 内使用扁平的活动列表：

```text
Agent Turn
├── 查询订单
├── 查询售后记录
├── 申请退款
└── 生成回复建议
```

`summary` 只负责横条展示文案，不负责判断活动是否属于同一组。

串行调用直接按发生顺序追加活动。未来即使出现并行调用，也使用各自的 `toolCallId` 独立记录，不在本方案中新增分组语义。

如果后续产品确实需要将多个活动折叠为高层意图，再增加可选的 `groupId`；该需求不阻塞本方案。

### 3.2 只保留两个稳定标识

```text
turnId       一次完整 Agent Turn
toolCallId   一次具体工具调用
```

`turnId` 用于隔离会话切换、旧 Turn 的迟到事件以及本地状态恢复。`toolCallId` 用于将 `tool_call` 与对应的 `tool_result` 配对。

文本输出、技能或其它非工具活动使用前端或事件源生成的 `activityId`。

### 3.3 summary 属于 Tool Call 描述，不属于工具业务参数

推荐结构：

```json
{
  "id": "call-001",
  "name": "order.query",
  "summary": "核对订单信息",
  "arguments": {
    "orderId": "123456"
  }
}
```

`summary` 位于工具调用描述层，不能放入传给业务工具的 `arguments`，避免污染工具契约。

### 3.4 活动标题的来源

`AgentTurnActivity.label` 是展开列表必须存在的稳定标题，但不要求所有事件源都重复携带它。`tool_call` 的 `label` 为可选字段，前端按以下顺序解析：

```text
event.label → toolLabels[event.name] → event.name
```

解析时忽略空字符串并对最终结果做 trim。这样后端/Adapter 可以提供面向客服的标题；未提供时，前端字典可以覆盖常用工具；仍未命中时使用工具名（例如 `order.query`），保证 Reducer 永远能产出非空 `label`。

`name` 本身必须是非空字符串。`toolLabels` 是前端展示配置，不参与工具选择、参数构造或执行授权。

```ts
type AgentTurnToolLabels = Readonly<Record<string, string>>;

function resolveToolLabel(
  eventLabel: string | undefined,
  toolName: string,
  toolLabels: AgentTurnToolLabels,
): string {
  return eventLabel?.trim() || toolLabels[toolName]?.trim() || toolName;
}
```

## 4. 前端领域模型

### 4.1 活动状态

活动状态是通用生命周期，不按工具、技能或业务类型扩展：

```ts
type AgentTurnActivityStatus =
  | "queued"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancelled";
```

### 4.2 Agent 活动

`kind` 使用开放字符串。首批约定值包括 `tool_call`、`output`、`skill`、`knowledge`、`sop` 和 `custom`，但这些值只是活动来源或展示提示；辅助条和 Reducer 不得依赖它们才能工作。

```ts
type AgentTurnActivity = {
  id: string;
  kind: string;
  label: string;
  summary?: string;
  status: AgentTurnActivityStatus;
  failureSummary?: string;
  tool?: {
    name: string;
    input?: unknown;
    output?: unknown;
    error?: unknown;
    presentationKey?: string;
  };
  content?: {
    text?: string;
  };
  actions?: readonly AgentDecision[];
  detail?: {
    description?: string;
    fields?: readonly { label: string; value: string }[];
  };
};

type AgentDecision = {
  id: string;
  label: string;
  tone?: "primary" | "quiet";
  disabled?: boolean;
};
```

约束：

- 工具活动的 `id` 等于 `toolCallId`。
- `tool` 只保存工具调用和返回所需的结构化数据，不保存 React 回调。
- `actions` 只描述可展示的决策，不包含执行函数；点击后由控制器按 `id` 派发决策事件。
- `summary` 是横条用于概括当前活动的短文案；`detail.description` 是展开面板使用的业务说明，二者含义不同，不得互相替代。
- `failureSummary` 只用于活动失败时的用户可见提示；没有它时由视图投影使用统一 fallback。原始失败原因仍放在 `tool.error` 中供详情展示。
- `detail` 是已经适合 UI 的业务详情；没有专用 Renderer 时才使用 `tool.input`、`tool.output` 和 `tool.error` 的通用展示。

### 4.3 Agent Turn 状态

```ts
type AgentTurnState = {
  turnId: string;
  status:
    | "running"
    | "waiting_for_human"
    | "completed"
    | "failed"
    | "cancelled";
  activities: readonly AgentTurnActivity[];
  draft?: {
    activityId: string;
    text: string;
    status: "streaming" | "ready" | "discarded";
  };
};
```

`AgentTurnState` 是事实状态。辅助条需要的 `waiting / thinking / confirmation` 是从该状态投影出的 UI 状态，不在 Reducer 中重复维护第二份状态。

v1 明确限制：一个 Turn 最多只有一条流式 `output` 活动，因此 `draft` 保持 Turn 级单例字段。`draft.updated.activityId` 必须始终指向这条 `output` 活动；不支持同一 Turn 内先流式输出一段内容、再新建另一条流式输出。若未来需要该能力，应将 `draft` 改为按 `activityId` 索引的集合，并同步调整事件和 UI，不允许在现有单例字段上隐式覆盖。

## 5. 事件协议

第一版使用最小事件集合。后端 Adapter 可以将任意真实传输事件转换为这些事件，UI 不依赖后端的具体消息格式。

```ts
type AgentTurnEvent =
  | {
      type: "turn.started";
      turnId: string;
    }
  | {
      type: "tool_call";
      turnId: string;
      callId: string;
      name: string;
      label?: string;
      summary?: string;
      input?: unknown;
      presentationKey?: string;
    }
  | {
      type: "tool_result";
      turnId: string;
      callId: string;
      status: "succeeded" | "failed";
      output?: unknown;
      error?: unknown;
      failureSummary?: string;
    }
  | {
      type: "activity.upserted";
      turnId: string;
      activity: AgentTurnActivity;
    }
  | {
      type: "decision.requested";
      turnId: string;
      activityId: string;
      actions: readonly AgentDecision[];
    }
  | {
      type: "decision.resolved";
      turnId: string;
      activityId: string;
      actionId: string;
    }
  | {
      type: "draft.updated";
      turnId: string;
      activityId: string;
      text: string;
      status: "streaming" | "ready" | "discarded";
    }
  | {
      type: "turn.ended";
      turnId: string;
      outcome: "completed" | "failed" | "cancelled";
    };
```

### 5.1 tool_call 与 tool_result 的归约

```text
tool_call(call-001)
  → 创建一条 id=call-001 的工具活动，label 按 3.4 解析

tool_result(call-001)
  → 更新 id=call-001 的 output/error/status

tool_call(call-002)
  → 追加第二条工具活动
```

`tool_call` 和 `tool_result` 是针对工具活动的专用归约事件，不等同于通用活动快照：

- 首次收到 `tool_call` 时追加活动；如果同一 `callId` 已经存在，视为重复事件并忽略，不追加第二条，也不重置已有结果或终态。
- `tool_result` 只更新同一 `callId` 的工具活动。收到未知 `callId` 时丢弃并产生诊断，不创建孤立活动。
- 对同一活动重复收到终态结果时保持第一次已接受的终态；相同结果是幂等重放，冲突结果不覆盖已有终态，并产生诊断。
- `tool_result` 成功时不创建新的横条摘要，也不改变当前摘要；只有新的活动成为当前活动时，横条才更新文案。
- `tool_result` 失败时将活动标记为 `failed`。如果此时没有更新的 `running` 或 `waiting` 活动，失败活动暂时作为当前活动，横条展示 `failureSummary` 或「处理遇到问题」，而不是掉回「正在思考」。后续新活动出现后，横条切换到新活动；Turn 结束后按终态规则回到等待态，但失败记录仍保留在展开详情中。

工具调用 ID 在同一个 Turn 内必须唯一。`turnId` 不匹配当前活动 Turn 的事件必须丢弃，防止会话切换后旧结果污染新会话。

Reducer 对重复、未知和旧事件不得抛异常或污染当前状态。诊断通过 Reducer 的返回值暴露，不把 `console.warn` 等副作用写进纯 Reducer：

```ts
type AgentTurnDiagnostic = {
  code:
    | "stale_turn"
    | "duplicate_tool_call"
    | "unknown_tool_result"
    | "conflicting_tool_result"
    | "invalid_draft_target"
    | "duplicate_draft";
  eventType: AgentTurnEvent["type"];
  activityId?: string;
  callId?: string;
};

type AgentTurnReduceResult = {
  state: AgentTurnState;
  diagnostics: readonly AgentTurnDiagnostic[];
};
```

开发环境可以将 `diagnostics` 输出到调试面板；生产环境不因这些可恢复事件向客服展示错误。

### 5.2 summary 展示规则

当前活动为工具调用时：

```ts
const summary =
  activity.status === "failed"
    ? activity.failureSummary?.trim() || "处理遇到问题"
    : activity.summary?.trim() || "正在思考";
```

具体规则：

| 当前活动 | 有 summary | 无 summary |
| --- | --- | --- |
| 工具自动执行 | 展示 summary | 展示「正在思考」 |
| 非工具活动 | 展示 summary | 使用该活动类型的通用 fallback；没有时展示「正在思考」 |
| 等待人工决策 | 展示 summary | 展示「需要你确认」 |
| 工具执行失败且没有更新的当前活动 | 展示 failureSummary | 展示「处理遇到问题」 |

「正在思考」是当前活动缺少摘要时的 UI fallback，不是工具执行事实，也不代表模型正在进行可见的思维链输出。

### 5.3 activity.upserted 的语义

`activity.upserted` 使用完整活动快照，语义是“按 `activity.id` upsert，并对已有活动做整体替换”：

```text
activity.upserted(output-001, full activity snapshot)
  → output-001 不存在：追加活动
  → output-001 已存在：在原位置整体替换该活动
```

规则如下：

- 事件中的 `activity` 必须包含完整的 `AgentTurnActivity`，包括需要保留的嵌套 `tool`、`detail` 和 `actions` 字段。
- Reducer 不对嵌套对象做隐式 merge；发送方不能只传一个局部 `detail` 期待保留旧字段。
- 已存在的活动整体替换但不改变其在 `activities` 中的顺序；不存在的活动追加到列表末尾。
- 同一个 `activity.id` 重放不会产生重复记录，最后一个被接受的完整快照替换前一个快照。
- `activity.updated` 不是 v1 事件名，Adapter 和 Fixture 统一使用 `activity.upserted`。

### 5.4 文本输出

文本生成使用一条可更新的 `output` 活动：

```text
activity.upserted(output-001, status=running)
draft.updated(output-001, status=streaming)
draft.updated(output-001, status=streaming)
draft.updated(output-001, status=ready)
```

流式增量只更新同一条草稿和活动，不为每个 token 创建活动。`draft.updated` 是对单例草稿的整体更新，事件中的 `text` 是当前完整文本，不是需要 Reducer 自行拼接的 token 增量。完整文本在展开面板或 composer 草稿区域展示，不放入横条单行摘要。

如果 `draft.updated.activityId` 找不到对应的 `output` 活动，Reducer 丢弃该事件并产生诊断；如果它指向另一条活动，或者同一 Turn 同时出现第二个流式 draft，同样丢弃并产生诊断。

## 6. 辅助条视图投影

Reducer 输出 `AgentTurnState`，另由纯函数投影为 UI 视图：

```ts
type AgentTurnView = {
  turnId?: string;
  surfaceMode: "wait" | "on";
  status: "waiting" | "thinking" | "confirmation";
  summary: string;
  currentActivityId?: string;
  activities: readonly AgentTurnActivity[];
  actions: readonly AgentDecision[];
  draft?: AgentTurnState["draft"];
};
```

投影规则：

```text
没有活动 Turn，或 Turn 已结束且没有待处理结果
  → wait / waiting

当前活动正在自动执行
  → on / thinking

当前活动 status=waiting 且包含 actions
  → on / confirmation
```

当前活动优先取最后一条 `running` 或 `waiting` 活动；工具调用完成后，等待下一个活动。如果 Turn 仍在运行、没有 `running` 或 `waiting` 活动，且列表最后一条活动为 `failed`，则将该失败活动作为当前活动；否则横条使用「正在思考」。失败活动的投影仍使用 `on / thinking` 布局，但渲染器依据 `currentActivity.status=failed` 展示失败提示，不显示“正在思考”的 loader。

现有 UI 行为保持不变：

- 活动摘要变化：使用现有 `AnimatedTextSwitch` 进行文字切换。
- `thinking` 与 `confirmation` 之间变化：使用现有横条移出、移入动画。
- 同一工具活动的结果更新：只更新展开详情和状态，不触发横条移入动画。
- `waiting`、`thinking`、`confirmation` 仍然是视觉状态，不扩展为业务类型枚举。

## 7. 展开详情 UI

### 7.1 展示结构

折叠状态只显示当前摘要；展开状态展示当前 Turn 的扁平活动列表：

```text
正在核对订单信息                                  [展开]

展开：

✓ 查询订单
  订单状态：已签收

✓ 查询售后记录
  满足退款条件

! 查询物流信息
  查询失败：暂时无法获取物流状态

! 申请退款
  金额：100 元
  等待客服确认
  [忽略] [批准]

○ 生成回复建议
  回复内容预览...
```

### 7.2 tool_call 和 tool_result 的详情关系

同一次工具调用和返回结果显示为同一条活动，详情内部可以包含：

```text
工具名称
调用参数
返回结果 / 失败原因
```

自定义 Renderer 可以将这些信息转换为业务化卡片，也可以只展示必要字段。Renderer 不改变活动状态、不直接执行工具。

### 7.3 展开面板边界

- 展开面板定位在辅助条上方，不推高 composer。
- 展开面板有最大高度，内容超出后内部滚动。
- 默认滚动到当前活动。
- 展开状态是 UI 本地状态，不进入 Agent Turn 协议。
- 面板关闭、忽略草稿或切换辅助条显示，不删除已经发生的活动记录。

## 8. Tool Detail Renderer 扩展点

### 8.1 注册表

详情渲染使用前端注册表，不把组件名称放进后端协议：

```ts
type ToolDetailRendererContext = {
  activity: AgentTurnActivity;
};

type ToolDetailRenderer = (
  context: ToolDetailRendererContext,
) => React.ReactNode;

const toolDetailRenderers: Record<string, ToolDetailRenderer> = {
  "order.query": OrderQueryDetail,
  "refund.create": RefundCreateDetail,
};
```

Renderer 选择顺序：

1. 优先使用 `presentationKey` 对应的专用 Renderer。
2. 没有 `presentationKey` 时按工具名称匹配。
3. 没有匹配项时使用通用原始信息 Renderer。

### 8.2 通用原始信息 Renderer

没有专用 Renderer 的工具必须仍然可查看：

```text
工具：some.custom.tool

调用参数
{ ... }

返回结果
{ ... }
```

通用 Renderer 负责结构化展示、折叠和长文本处理，不负责猜测业务含义，也不根据工具名称拼接虚假的成功文案。

真实接口接入后，`input`、`output` 和 `error` 应经过安全转换或脱敏后再展示。前端 Fixture 可以使用原始示例数据，但不能据此约定生产环境直接暴露全部内部参数和响应。

### 8.3 客户自定义工具

客户自定义工具没有前端专用 Renderer 时，自动使用通用 Renderer。后续如需要让客户定义稳定的业务化展示，可增加受控的 `displayModel`，例如键值对、表格或文本，不允许客户配置注入 React 组件或任意 HTML。

## 9. Tool Approval、客服澄清与执行结果

前端不区分 SOP、技能、知识库和普通工具的业务身份，但必须区分客服介入的来源：

- Tool Approval：模型已经发起具体 Tool Call，执行层根据工具策略拦截，通过 `decision.*` 要求客服批准或拒绝原调用。
- 客服澄清：模型主动调用 `request_kf_clarification` 控制工具；该工具自动放行，但会挂起并等待客服返回完整指令。

活动详情和人工决策必须与模型摘要分离：

- 活动是否自动执行以及是否需要客服处理，由执行端产生对应的生命周期事件；模型不能仅凭 summary 声明“无需确认”。
- 需要客服处理的活动由事件源产生 `decision.requested`，状态变为 `waiting`。
- 客服点击操作后，前端发送 `decision.resolved`，不直接把按钮点击视为业务成功。
- 执行结果仍必须通过后续 `tool_result` 回显。
- 工具执行、幂等和结果由执行端负责，前端协议只负责展示活动和派发人工决策。

`request_kf_clarification` 不产生 `decision.requested`。它的 `input` 包含问题和非穷举的建议选项，前端使用专用 Renderer 展示快捷选择和自由指令输入。客服回复后，Backend 将其归一为包含完整 `instruction` 的普通 `tool_result`，Agent Loop 再继续执行。建议 ID 只用于输入来源和审计，不能替代返回给 Agent 的完整指令。

等待客服澄清时，辅助条自身展开为人工介入面板，不在横条上方叠加第二个浮层。建议选项和单行自由指令输入使用一致的宽度与高度；选项只负责选中，客服点击独立操作行中的「继续」后才提交。「终止」取消整个 Turn，不作为澄清 Tool Result 返回模型。

## 10. 纯前端 Fixture

首个 Fixture 使用售后查询和退款流程，验证串行活动、人工确认和回复草稿：

```text
turn.started(t-001)

tool_call(call-001, order.query, label="查询订单", summary="核对订单信息")
tool_result(call-001, succeeded)

tool_call(call-002, after_sales.query, summary="核对售后条件")
tool_result(call-002, succeeded)

tool_call(call-003, refund.create, summary="申请退款")
decision.requested(call-003, [忽略, 批准])

客服批准
decision.resolved(call-003, approve)
tool_result(call-003, succeeded)

activity.upserted(output-001, summary="生成回复建议", status=running)
draft.updated(output-001, status=streaming)
draft.updated(output-001, status=ready)

turn.ended(t-001, completed)
```

开发环境调试入口应播放这条事件序列，而不是直接调用 `setStatus("thinking")`。调试按钮至少覆盖：

- 无 summary 的工具调用
- 有 summary 的工具调用
- 工具成功和失败
- 工具调用显式 label、前端 `toolLabels` 命中和工具名兜底
- 等待确认后批准
- 等待确认后忽略
- 多个串行工具调用
- 文本输出流式更新
- 没有专用 Renderer 的工具
- 重复的 `tool_call` 不产生重复活动
- 未知 `tool_result` 不污染活动列表且产生诊断
- 旧 `turnId` 事件被丢弃

## 11. 前端实施拆分

### 11.1 协议与状态层

建议新增纯逻辑模块：

```text
apps/web/src/pages/chat/lib/agent-turn.ts
apps/web/src/pages/chat/lib/agent-turn-reducer.ts
apps/web/src/pages/chat/lib/agent-turn-fixtures.ts
apps/web/src/pages/chat/lib/agent-turn-tool-labels.ts
```

该层不导入 React，不包含组件回调，不决定颜色、动画和布局。

### 11.2 展示层

在现有辅助条基础上拆出：

```text
apps/web/src/pages/chat/components/agent-turn-timeline.tsx
apps/web/src/pages/chat/components/agent-turn-detail-renderers.tsx
```

`ChatAIAssistantStatusBar` 接收投影后的 `AgentTurnView` 和 `onDecision(actionId)`，继续负责横条视觉状态、文字切换、计时和展开入口。

### 11.3 工作台接入

工作台状态只保存 `AgentTurnState` 或事件归约结果；不同时保存一份可编辑的 `AgentTurnView`。View 通过 selector 派生，避免事实状态和显示状态分叉。

开发环境的事件播放器作为事件源接入，未来真实后端只替换事件源和 Adapter。

### 11.4 当前话术推荐兼容层

在通用 Agent Turn 后端事件 ready 前，现有话术推荐先通过独立的前端投影层接入辅助条：

```text
现有 SmartReplySuggestion / pending 状态
  → resolveSmartReplyAssistantTurn
  → 辅助条状态、操作和共享 Composer 模式
```

兼容层只负责把现有话术推荐状态映射到新交互，不伪造 `turnId`、`toolCallId` 或工具活动。未来接入真实 Agent Turn 后，应替换事件来源和投影 Adapter，而不是把 Smart Reply 的 `generateStatus` 扩展成通用 Agent 协议。

当前映射如下：

| Smart Reply 事实 | 兼容层阶段 | 辅助条/UI |
| --- | --- | --- |
| 自动或手动请求 pending、结果 processing | `thinking` | on 模式，展示「正在生成话术推荐」和耗时 |
| 强制重新生成，且已有旧建议 | `thinking` | on 模式；共享 Composer 保留旧建议但不可编辑、不可发送 |
| 推荐 ready | `confirmation` | on 模式；结果写入共享 Composer，横条操作为「重新生成」「忽略」 |
| 最新客户消息语义不完整且仍在等待窗口内 | `waiting_for_customer` | wait 模式，展示「等待 {客户昵称} 补充消息」 |
| 转人工、明确的信息不足、知识未命中、语义等待超时 | `skipped` | wait 模式保持轻提示并进入等待客户状态，不做定时退出；原因通过 hover Tooltip 展示 |
| 普通生成失败 | `failed` | confirmation 视觉，展示失败原因和「重新生成」「忽略」 |
| 建议已发送或已忽略 | 无活动 Turn | 回到「正在等待 {客户昵称} 的消息」 |

话术推荐阶段不是未来通用 `AgentTurnActivityStatus` 的替代品。`waiting_for_customer` 表示等待客户继续提供信息；需要客服确认某个动作时使用 `confirmation`，不使用 `waiting_for_customer`。

建议 Composer 的交互约束：

- 工作台始终只挂载一个 Composer 和一个 Lexical Editor 实例，通过 `message` / `suggestion` 模式切换样式、可编辑状态和发送动作，不创建第二份编辑器状态。
- 发起推荐时，如果 Composer 没有文本、附件或引用，直接进入 `thinking`；如果已有内容，辅助条先进入 `draft_confirmation`，展示「当前消息框已有内容，需要我帮你起草回复吗？」以及「忽略」「起草回复」。
- `draft_confirmation` 中点击「忽略」只取消本次推荐，保留客服正在编辑的内容；点击「起草回复」后进入 `thinking`，原内容继续可见但暂时不可编辑、不可发送。
- 推荐 ready 后，在同一 Editor 中用 AI 结果整体替换原 segments；替换必须形成一个独立的 Lexical 历史记录，客服执行一次撤销即可回到替换前内容。
- 推荐生成在覆盖前失败时，不修改原内容，并恢复普通可编辑模式。
- `suggestion` 模式沿用同一 Composer 的引用、表情、快捷回复、收录、素材和文件入口；引用直接进入当前 Composer，素材、文件和收藏表情只插入编辑器，不立即发送。
- `suggestion` 模式右侧保留「添加到FAQ」「违规词检测」「采纳并发送」，隐藏 Enter 发送设置；所有 segments 只通过「采纳并发送」一次发送。
- 违规词检测只由客服手动触发，不读取或继承历史自动检测配置；检测结果展示后不会因编辑内容或 Composer 失焦自动消失，由客服手动关闭，并在忽略建议或成功发送后清除。
- 横条 confirmation 只展示「重新生成」「忽略」，不再提供「长一点」「短一点」或弹窗编辑。
- 重新生成成功后在同一 Editor 中替换旧建议；重新生成失败时保留旧建议并解除编辑锁，同时通过全局错误 Toast 反馈。
- 「采纳并发送」发送共享 Composer 当前的完整 segments 和引用；成功后清空 Composer，将推荐标记为已采纳并回到 waiting。
- 推荐内容已经写入 Composer 后，点击「忽略」会清空 Composer、关闭检测结果、隐藏当前建议并回到 waiting，不通过「忽略」恢复此前原稿；客服可以在处理建议期间使用编辑器撤销回到替换前内容。

触发互斥规则：

- 同一会话最多有一个未处理的话术推荐 Turn。
- 活跃 Turn 存在时，其它消息的「话术推荐」入口保持可识别但不可触发；当前来源消息不重复显示入口。
- 语义不完整进入 `waiting_for_customer` 后，如果客户发送了更新消息，旧等待不阻止新消息触发推荐。
- 活跃 Turn 期间到达的新消息不进入前端推荐队列。客服发送或忽略当前建议后直接回到 waiting，不自动为中途新消息再次生成。
- 客服仍可在目标消息的消息操作菜单中主动发起话术推荐。

旧 `SmartReplyCard` 和消息下方的处理中提示不再进入工作台渲染路径。消息区域只保留话术推荐触发入口，推荐状态、结果和操作统一收纳到辅助条与建议 Composer。

## 12. 验收场景

| 场景 | 预期结果 |
| --- | --- |
| 工具调用有 summary | 横条展示该 summary |
| 工具调用无 summary | thinking 状态展示「正在思考」 |
| tool_result 返回 | 更新同一活动的结果，不新增重复活动 |
| 工具调用有 label | 展开列表使用事件 label |
| 工具调用无 label 但字典命中 | 展开列表使用 `toolLabels[name]` |
| 工具调用无 label 且字典未命中 | 展开列表使用工具名，不出现空标题 |
| 工具执行失败 | 横条展示 failureSummary 或「处理遇到问题」，展开详情保留失败原因 |
| 连续两个工具调用 | 展开列表按顺序显示两条活动，横条显示当前活动 |
| 写工具等待确认 | 横条进入 confirmation，展示具体操作和人工按钮 |
| 批准写工具 | 当前活动继续执行，结果由 tool_result 决定 |
| 忽略写工具 | 当前 Turn 按取消或终止语义处理，不能假设业务已执行 |
| Agent 请求客服澄清 | 展示建议选项和自由指令输入，不产生 Tool Approval 事件 |
| 客服选择澄清建议 | Backend 将建议解析成完整 instruction，并以 tool_result 恢复 Loop |
| 客服输入其它指令 | 完整文本进入 tool_result，不能限制为模型给出的建议枚举 |
| 客服终止澄清 | 取消挂起 Tool Call 和当前 Turn，辅助条收起并回到默认状态 |
| 文本流式输出 | 只更新一条回复建议活动和草稿 |
| 有专用详情 Renderer | 展示业务化工具详情 |
| 无专用详情 Renderer | 展示工具名、调用参数和返回结果 |
| 切换会话后收到旧结果 | 丢弃旧 Turn 事件，不污染新会话 |
| Turn 完成 | 结束耗时和活动执行态，辅助条回到 waiting；未处理草稿按产品规则保留 |
| 重复 tool_call | 不追加第二条活动，Reducer 不抛异常 |
| 未知 tool_result | 丢弃事件，不污染当前摘要，Reducer 不抛异常 |
| 旧 Turn 事件 | 丢弃事件，不污染当前 Turn |
| 现有话术推荐生成中 | 辅助条进入 thinking，消息下方不出现处理中提示 |
| Composer 为空时发起话术推荐 | 直接进入 thinking，不增加前置确认 |
| Composer 已有内容时发起话术推荐 | 辅助条进入 draft_confirmation，原内容保持可编辑且不被覆盖 |
| 客服在 draft_confirmation 点击忽略 | 取消本次推荐并保留当前 Composer 内容 |
| 客服在 draft_confirmation 点击起草回复 | 进入 thinking，原内容保持可见但不可编辑、不可发送 |
| 现有话术推荐 ready | AI 结果覆盖同一个 Composer，页面始终只有一个 Editor 实例 |
| 覆盖建议后执行一次撤销 | 恢复覆盖前的人工内容 |
| 客服忽略已生成建议 | 清空共享 Composer 和检测结果，辅助条回 waiting |
| 客服采纳并发送 | 发送共享 Composer 当前 segments 和引用，清空后回 waiting |
| 推荐期间收到新客户消息 | 不排队、不覆盖当前推荐或 Composer 内容 |
| 覆盖前生成失败 | 保留原内容并恢复可编辑，通过全局 Toast 提示失败 |
| 强制重新生成失败 | 保留旧建议并解除锁定，通过全局 Toast 提示失败 |
| 建议模式选择素材、文件或收藏表情 | 插入共享 Composer，不立即发送 |
| 手动违规词检测命中 | 阻止采纳发送；编辑内容不自动清除结果，客服手动关闭后恢复其它操作 |

## 13. 与后端对齐要求

后端接口 ready 时至少需要提供或由 Adapter 可靠推导：

1. 稳定的 `turnId`。
2. 工具调用稳定的 `toolCallId`，且 `tool_result` 携带对应 ID。
3. `summary` 位于工具调用描述层，不进入业务工具参数。
4. 工具调用、工具结果、人工决策等待和文本输出的生命周期事件。
5. 可供客服展示的安全参数和结果，或明确由前端 Adapter 完成脱敏。
6. 旧 Turn 事件的隔离语义。v1 已通过 `turnId`、`callId` 和活动 ID 防御重复及未知关联，但不能仅凭到达顺序重建任意乱序事件；如果真实链路不能保证顺序，还需要 Adapter 缓冲排序，或提供 `eventId` / 单调序列号。
7. `activity.upserted` 每次携带完整活动快照，以及一个 Turn 最多一条流式 `output` draft 的约束。

后端不需要实现 `frameId`，也不需要为了辅助条额外输出外层 Intent Group。

## 14. 待确认项

以下事项不阻塞当前话术推荐兼容层，但接入真实 Agent Turn 链路前必须收敛：

- 通用 Agent Turn 的回复草稿 ready 后，Turn 是否结束，还是以“待客服处理结果”继续占用当前辅助条。当前话术推荐兼容层已确定为继续占用，直到客服发送或忽略。
- 草稿操作是“填入编辑器 / 忽略”，还是允许直接“发送”。
- 工具原始参数和结果的脱敏责任由后端、Adapter 还是工具自身承担。
- 多个并行工具调用出现后，横条当前摘要采用最后一个活动、聚合摘要还是固定 Turn 摘要。
- Turn 完成后的活动记录保留多久，以及会话重新打开时是否展示上一次完整过程。
