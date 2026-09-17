# Agent Turn Mock Backend 协议

- 日期：2026-09-16
- 状态：Draft
- 范围：开发环境 Agent Turn Mock、Tool Call 循环、人工审批和 SSE 事件传输
- 关联前端协议：[`2026-09-15-semi-managed-agent-turn-frontend-protocol.md`](./2026-09-15-semi-managed-agent-turn-frontend-protocol.md)

## 1. 目标

在真实 Agent Orchestrator 接入前，由 Backend Mock 驱动完整 Agent Turn，使前端能够基于真实的异步事件验证：

- 模型请求期间的通用 thinking 运行状态
- 自动放行的 Tool Call
- 等待客服批准的 Tool Call
- 等待客服澄清并以完整指令恢复的 Tool Call
- 多轮串行 Tool Call
- 工具成功、失败和取消结果
- 通过 `turn.finish` 产出客户回复或无回复结束
- SSE 断线后的事件重放

Mock 只在非生产环境注册，不执行真实知识库、订单或售后操作。

## 2. Agent 输出约束

Agent 不使用自由文本承载业务结果。每一轮必须通过 Tool Call 推进，当前 Mock 注册以下工具：

| 工具 | 分类 | 默认审批 | 作用 |
| --- | --- | --- | --- |
| `knowledge.search` | `business` | `auto` | 查询模拟知识库 |
| `order.query` | `business` | `auto` | 查询模拟订单 |
| `order.bind` | `business` | `human` | 模拟绑定订单 |
| `after_sales.apply` | `business` | `human` | 模拟提交售后申请 |
| `request_kf_clarification` | `control` | `auto` | 向客服请求处理指令并等待 Tool Result |
| `turn.finish` | `control` | `auto` | 明确结束 Agent Loop |

`turn.finish` 是控制类 Tool Call，正常结束路径必须调用一次。客户回复是它的一种 outcome，不再单独定义 `reply.draft` 工具：

```ts
type AgentTurnFinishInput =
  | {
      outcome: "reply";
      summary: string;
      reply: {
        segments: WorkbenchOutgoingMessageSegment[];
      };
    }
  | {
      outcome: "no_reply";
      summary: string;
      reason: string;
    };
```

缺少订单号、诉求不完整等可以通过询问客户补齐的信息，必须使用 `outcome: "reply"` 生成引导回复。`no_reply` 仅表示当前消息确实不需要再次回复。

`turn.finish(outcome="reply")` 只结束 Agent 的执行循环。回复仍需客服发送或忽略，因此前端可以继续停留在确认状态。

## 3. 接口

### 3.1 启动 Turn

```http
POST /api/server/agent-turns
```

```json
{
  "conversationId": "144",
  "trigger": {
    "type": "customer_message",
    "messageId": "7003"
  },
  "mock": {
    "scenario": "after_sales_approval",
    "stepDelayMs": 700
  }
}
```

`trigger.type` 支持：

- `customer_message`：客户消息触发，必须提供 `messageId`
- `agent_request`：客服主动触发，可选目标 `messageId` 和补充指令

启动前必须校验当前客服已经接管该会话。成功后返回稳定的 `turnId`。

### 3.2 订阅事件

```http
GET /api/server/agent-turns/:turnId/events
Accept: text/event-stream
```

支持两种续传游标：

- 查询参数 `after_sequence`
- SSE 自动携带的 `Last-Event-ID`

每条 SSE 使用统一事件名：

```text
id: turn-xxx:4
event: agent-turn
data: {"eventId":"turn-xxx:4","turnId":"turn-xxx","sequence":4,...}
```

服务端先重放游标之后的历史事件，再推送实时事件；收到 `turn.completed` 或 `turn.failed` 后关闭连接。

### 3.3 处理人工决策

```http
POST /api/server/agent-turns/:turnId/decisions/:decisionId
```

```json
{
  "action": "approve"
}
```

人工审批支持三种结果：

- `approve`：按模型原始参数继续执行 Tool Call
- `reject`：将原 Tool Call 标记为 `cancelled`，不附加其它指令
- `redirect`：将原 Tool Call 标记为 `cancelled`，并把客服输入的完整指令返回 Agent 重新规划

```json
{
  "action": "redirect",
  "instruction": "先核对客户身份再绑定"
}
```

工具参数在审批界面只读。客服需要修改参数或改变处理方式时，不直接编辑 Tool Call，而是使用 `redirect` 告诉 Agent 如何调整；Agent 后续产生的新 Tool Call 仍按其 `approvalMode` 决定是否再次审批。按钮点击本身不等于工具执行成功。

### 3.4 回复客服澄清 Tool Call

```http
POST /api/server/agent-turns/:turnId/tool-calls/:callId/responses
```

点击模型提供的建议：

```json
{
  "type": "suggestion",
  "suggestionId": "REFUND"
}
```

客服也可以提交任意其它指令：

```json
{
  "type": "instruction",
  "instruction": "不要退款，先联系物流确认包裹位置"
}
```

`suggestions` 只是输入捷径，不是封闭业务枚举。Backend 必须将两种输入统一为包含完整 `instruction` 的 `tool_result` 后再恢复 Agent Loop：

```json
{
  "callId": "call-clarification-1",
  "status": "succeeded",
  "output": {
    "instruction": "不要退款，先联系物流确认包裹位置",
    "provenance": {
      "type": "free_text"
    }
  }
}
```

该链路不是 Tool Call Approval，不产生 `decision.requested`。`request_kf_clarification` 本身自动放行，但其工具执行会挂起，直到客服提交回复。

客服点击「终止」时调用：

```http
POST /api/server/agent-turns/:turnId/cancel
```

Backend 先将挂起的澄清 Tool Call 标记为 `cancelled`，随后发出 `turn.cancelled` 并关闭 SSE。终止不是一条澄清指令，也不会恢复 Agent Loop。

## 4. 事件信封

```ts
type AgentTurnEventEnvelope = {
  eventId: string;
  turnId: string;
  sequence: number;
  occurredAt: string;
  event: AgentTurnEvent;
};
```

`sequence` 在单个 Turn 内从 1 严格递增。前端按 `turnId + sequence` 去重和排序，不根据到达时间猜测事件顺序。

当前事件类型：

```text
turn.started
activity.updated
tool_call
decision.requested
decision.resolved
tool_result
turn.completed
turn.cancelled
turn.failed
```

当前 Mock 不生成 `activity.updated(kind="thinking")`。模型请求尚未返回下一项可观察动作时，前端只展示通用的「思考中」运行状态，不在过程列表中伪造思考摘要。工具结果与下一轮 Tool Call 之间保留异步等待，但该等待不产生 Timeline 活动。

`activity.updated` 仅作为未来模型支持可展示 reasoning summary 时的可选扩展保留；前端不得依赖该事件一定存在。

`tool_call.approvalMode` 明确表示该次调用是自动放行还是需要人工确认。前端不得根据工具名称、读写类型或参数自行推导审批策略。

`tool_call.category` 当前支持：

- `business`：在执行明细中正常展示
- `control`：控制 Agent Loop，可由 UI 使用专用展示或默认隐藏

## 5. Mock 场景

开发环境可指定固定场景，保证 UI 问题可复现：

```text
knowledge_reply
order_reply
order_binding_approval
after_sales_approval
operator_clarification
tool_failure
no_reply
```

不指定场景时 Backend 随机选择。自动化测试必须指定场景和 `stepDelayMs`，不得依赖随机结果或真实等待时间。

## 6. 生命周期与边界

- Turn 和事件暂存在单进程内存中，不用于生产环境。
- 单实例最多保留 100 个 Turn，超过 30 分钟自动过期。
- SSE 连接断开不会取消 Turn；重新连接后通过游标补发事件。
- 一个 Turn 同时只允许一个待处理的 Tool Approval 或客服澄清 Tool Call。
- Turn 所有权绑定启动它的客服，其他客服读取或处理时统一返回不存在。
- 真实 Agent 接入后应替换 Mock Runner，不改变共享事件信封和前端 Reducer 输入。
