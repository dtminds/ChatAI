# Agent Turn Mock Backend 规范

- 日期：2026-09-16
- 更新：2026-09-18
- 状态：Draft
- 范围：开发环境 Agent Turn Mock、人工介入和 SSE 事件传输
- 关联前端交互：[`2026-09-15-semi-managed-agent-turn-frontend-protocol.md`](./2026-09-15-semi-managed-agent-turn-frontend-protocol.md)

## 1. 协议来源

Mock 不维护独立的通用 Agent Turn 事件协议：

- 通用事件和请求：`packages/contracts/src/chat/agent-turn.ts`
- Mock 场景和启动请求：`packages/contracts/src/chat/agent-turn-mock.ts`

本文只记录 Mock 路由、场景和运行边界。字段定义以共享 Contract 为准。

Mock 路由只在 `NODE_ENV !== "production"` 时注册，不执行真实知识库、订单、绑定或售后操作。

## 2. 目标

在真实 Agent Orchestrator 接入前，Backend Mock 用可复现的异步事件验证：

- Turn 启动和通用思考状态。
- 自动放行的 Tool Call。
- 等待客服审批的 Tool Call。
- 等待客服澄清并以完整指令恢复的 Tool Call。
- 多轮串行 Tool Call。
- 工具成功、失败和取消结果。
- 通过 `turn.finish` 交付对客回复或无需回复结论。
- SSE 断线后的历史事件重放。
- 会话重新打开后加载最近一次 Turn。

Mock 不模拟模型自由生成文本，也不定义生产环境的持久化、并行调度或资源保留策略。

## 3. 启动 Mock Turn

调试启动使用独立入口，不污染未来正式 Agent Turn 启动契约：

```http
POST /api/server/debug/agent-turn-mock/turns
```

```json
{
  "conversationId": "144",
  "scenario": "after_sales_approval",
  "stepDelayMs": 700,
  "trigger": {
    "type": "customer_message",
    "messageId": "7003"
  }
}
```

规则：

- `scenario` 必填，Mock 不随机选择场景。
- `stepDelayMs` 可选，范围为 0–5000 毫秒，缺省值为 700 毫秒。
- `customer_message` 触发必须提供 `messageId`。
- `agent_request` 可以提供目标 `messageId` 和补充指令。
- 启动前校验登录客服对会话具有可操作权限。
- 同一客服在同一会话启动新 Turn 时，未结束的旧 Turn 先被取消，旧记录随后从 Mock 内存释放。

成功响应只返回稳定的 `turnId`。

## 4. 查询与订阅

### 4.1 最近一次 Turn

```http
GET /api/server/conversations/:conversationId/agent-turns/latest
```

返回当前进程内该客服、该会话最近一次 Mock Turn 的事件快照；没有记录时返回 `null`。

该接口用于会话切换后的 UI 恢复。Mock 数据不持久化，Backend 进程重启后记录消失。

### 4.2 SSE 事件

```http
GET /api/server/agent-turns/:turnId/events
Accept: text/event-stream
```

续传游标支持：

- 查询参数 `after_sequence`。
- SSE 请求头 `Last-Event-ID`。

服务端先发送游标后的历史事件，再订阅实时事件。事件格式：

```text
id: turn-xxx:4
event: agent-turn
data: {"eventId":"turn-xxx:4","turnId":"turn-xxx","sequence":4,...}
```

`sequence` 在单个 Turn 内从 1 严格递增。SSE 每 15 秒发送 keep-alive；收到 `turn.completed`、`turn.cancelled` 或 `turn.failed` 后关闭连接。

SSE 断开不会自动取消 Turn。客户端可以通过游标重新订阅，或通过最近 Turn 接口恢复完整快照。

## 5. 人工审批

需要人工审批的 Tool Call 先产生 `tool_call(approvalMode="human")`，随后产生 `decision.requested`。

提交决策：

```http
POST /api/server/agent-turns/:turnId/decisions/:decisionId
```

支持三种动作：

```json
{ "action": "approve" }
```

```json
{ "action": "reject" }
```

```json
{
  "action": "redirect",
  "instruction": "先核对客户身份再绑定"
}
```

- `approve`：执行原始 Tool Call，随后产生成功 `tool_result`。
- `reject`：取消原始 Tool Call，并让 Mock Agent 继续后续规划。
- `redirect`：取消原始 Tool Call，把完整 instruction 交给 Mock Agent 重新规划。

拒绝和改用其它方式都会产生 `decision.resolved` 以及状态为 `cancelled` 的 `tool_result`。按钮点击本身不代表业务工具成功。

## 6. 客服澄清

`request_kf_clarification` 是自动放行的控制工具。Mock 发出该 `tool_call` 后暂停 Turn，等待客服提交完整处理方向。

提交建议选项：

```http
POST /api/server/agent-turns/:turnId/tool-calls/:callId/responses
```

```json
{
  "type": "suggestion",
  "suggestionId": "REFUND"
}
```

提交其它指令：

```json
{
  "type": "instruction",
  "instruction": "不要退款，先联系物流确认包裹位置"
}
```

Mock 将建议或自由输入统一解析为包含完整 instruction 的成功 `tool_result`，随后恢复 Loop。建议 ID 只表示输入来源，不是 Agent 最终接收的封闭枚举。

终止当前 Turn：

```http
POST /api/server/agent-turns/:turnId/cancel
```

存在挂起澄清时，Backend 先为对应调用产生状态为 `cancelled` 的 `tool_result`，再产生 `turn.cancelled`。终止不会作为客服澄清内容返回 Agent。

## 7. Mock 工具与终态

当前场景使用以下工具：

| 工具 | 分类 | 审批 | 作用 |
| --- | --- | --- | --- |
| `knowledge.search` | `business` | `auto` | 查询模拟知识库 |
| `order.query` | `business` | `auto` | 查询模拟订单 |
| `order.query.mock_failure` | `business` | `auto` | 产生可复现的查询失败 |
| `order.bind` | `business` | `human` | 模拟绑定订单 |
| `after_sales.apply` | `business` | `human` | 模拟提交售后申请 |
| `request_kf_clarification` | `control` | `auto` | 等待客服给出处理指令 |
| `turn.finish` | `control` | `auto` | 明确结束 Agent Loop |

正常场景必须通过 `turn.finish` 结束。它支持：

- `reply`：提供完整 `WorkbenchOutgoingMessageSegment[]`，由前端写入共享 Composer。
- `no_reply`：提供当前无需回复的摘要和原因。

缺少订单号、诉求不完整等需要继续询问客户的情况仍属于 `reply`，应生成引导回复。`no_reply` 只用于当前消息确实不需要再次回复。

`turn.finish` 依次产生：

```text
tool_call(name="turn.finish")
tool_result(status="succeeded")
turn.completed(outcome="reply" | "no_reply")
```

`turn.completed` 只表示 Agent 执行循环结束，不表示回复已经由客服发送。

## 8. 事件行为

事件联合类型以 `AgentTurnEvent` 为准。当前 Mock 实际产生：

```text
turn.started
tool_call
decision.requested
decision.resolved
tool_result
turn.completed
turn.cancelled
turn.failed
```

Contract 还保留可选的 `activity.updated(kind="thinking")`，用于未来接入可展示的 reasoning summary。当前 Mock 不产生该事件，前端不得依赖其存在，也不应在等待下一次 Tool Call 时伪造思考活动。

`tool_call.approvalMode` 是审批策略的权威来源。前端不得根据工具名称、读写类型或参数自行推断是否需要客服确认。

`tool_call.category` 当前区分：

- `business`：业务工具，进入普通过程活动和审批逻辑。
- `control`：控制 Agent Loop，例如澄清和终态交付，可使用专用 UI。

## 9. 固定场景

调试菜单可以启动以下场景：

| 场景 | 覆盖行为 |
| --- | --- |
| `knowledge_reply` | 知识库查询后生成回复 |
| `order_reply` | 订单查询后生成回复 |
| `order_binding_approval` | 绑定订单工具审批 |
| `after_sales_approval` | 查询订单后审批售后申请 |
| `operator_clarification` | Agent 请求客服选择或输入处理方式 |
| `tool_failure` | 工具失败后继续生成回复 |
| `no_reply` | 明确无需回复的终态 |

自动化测试必须明确指定场景和适合测试的 `stepDelayMs`，不等待真实时间。

## 10. 运行边界

- Turn、事件和订阅只保存在单进程 `Map` 中。
- 当前不做容量管理、自动过期、租约或持久化恢复。
- Backend 进程重启后全部 Mock Turn 消失。
- 一个 Turn 同时最多存在一个挂起的审批或客服澄清。
- Turn 所有权绑定启动它的客服；其他客服访问时按不存在处理。
- 同一客服、同一会话的新 Turn 会取消并释放旧 Turn。
- 路由插件关闭时释放所有定时器和订阅。

这些限制只描述开发 Mock，不是生产 Agent Orchestrator 的架构承诺。

## 11. 实现入口

- Contract：`packages/contracts/src/chat/agent-turn.ts`
- Mock Contract：`packages/contracts/src/chat/agent-turn-mock.ts`
- 路由：`apps/backend/src/modules/chat/agent-turn-mock.routes.ts`
- 服务：`apps/backend/src/modules/chat/agent-turn-mock.service.ts`
- Web API：`apps/web/src/pages/chat/api/agent-turn-mock.ts`
- Web 控制器：`apps/web/src/pages/chat/components/use-agent-turn-mock.ts`
