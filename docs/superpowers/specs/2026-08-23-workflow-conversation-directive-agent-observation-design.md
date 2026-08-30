# Workflow 会话指引与 AI Collect 运行设计

- 日期：2026-08-23
- 最后更新：2026-08-30
- 状态：Implemented
- 适用范围：ChatAI SOP 托管 Agent 会话；`ai-collect` 是首个使用方

> 文件名保留历史路径兼容。当前契约不包含 Agent Observation；Java 只回调某条指引参与了一轮回复及累计轮次。

## 1. 背景与决策

`ai-collect` 需要在允许客户岔开话题的自然对话中收集结构化资料。托管模式下，Agent 已经是客户消息的持续回复者；若 Workflow 节点同时自行追问，会产生两个独立回复者。

Workflow 因此不持续生成追问，而是向 Java 注册一段可直接注入 Agent 上下文的临时自然语言指引。Agent 自行决定是否追问以及如何沟通。Java 只在该指引实际参与一次回复后，通过可靠 `agent.directive` 事件通知 Workflow。

Java 不提取字段、不保存收集进度、不判断节点完成。Workflow 收到回调后自行查询节点进入以来的客户消息，并通过专用 LLM 完成字段提取。

核心决策：

1. `ai-collect` 是 `runtime-ready + composite` 节点。
2. 关闭智能体辅助时，只从配置输入提取一次；全部字段存在走 `completed`，否则走 `incomplete`。
3. Workflow 先对配置输入执行初次提取；已经收集完成时直接结算，不注册 Agent 指引。
4. 初次提取后仍缺字段且开启智能体辅助时，Workflow 才注册只包含剩余字段的 Agent 指引。
5. 开启智能体辅助并配置开场白时，Workflow 在初次提取确认尚未完成后可靠发送一次；无配置输入时可立即进入该阶段。关闭智能体辅助时不发送开场白。
6. Workflow 不订阅 `message.received` 驱动本节点；`agent.directive` 是智能体辅助提取的常规唤醒信号。
7. Workflow 不要求 Java 返回客户消息 ID、观察信息、候选字段或是否真正提出问题。
8. 每个回调重置该 Task 的 30 秒静默窗口；同一 Task 最多一个在途提取批次。
9. 达到最大辅助轮次或最长等待时，Workflow 仍执行最终客户消息查询，再决定出口。
10. 节点完成、未完成、失败、取消或超时时，Workflow 使对应指引失效；同步失败由后台任务重试。

## 2. 服务边界

| 模块 | 负责 | 不负责 |
| --- | --- | --- |
| Workflow | 生成稳定 `bizId`；渲染指引；发送开场白；排队回调；查询客户消息；调用提取模型；保存字段；判断完成、超时和路由；使指引失效 | 决定 Java 每轮选择几条指引；生成 Agent 客户回复 |
| Java Agent Runtime | 幂等添加和失效指引；回复前选择有效指引；把 `payload` 原样拼入 Agent Prompt；发送唯一客户回复；通过 Outbox 投递参与回调 | 解析 Workflow 指引结构；提取字段；保存 Workflow 进度；判断节点完成 |
| Agent 模型 | 结合会话语境和临时指引自然回复客户 | 保证每轮追问；输出 Workflow 字段状态或进度 |

Java 选择最新一条、按优先级选择多条或采用其它容量策略，属于 Java 的指令注入策略。Workflow 的持久化、幂等、轮次结算和回调处理不依赖该规则，因此本契约不规定也不探测该策略。

## 3. Java 指令接口

### 3.1 添加指令

```http
POST /third-internal/wap-embed-agent-directive/add
```

```ts
type AddWapEmbedAgentDirective = {
  bizId: string;
  bizInfo?: string;
  conversationId: number;
  expiresAt: string;
  limitRound?: number;
  payload: string;
  priority?: number;
  type: "collect-fields";
  uid: number;
};
```

- `bizId = workflow-task:${taskId}`，在 `uid + type + bizId` 下稳定，长度不超过 64。
- Java 添加接口按该唯一键幂等。
- `expiresAt` 使用 UTC+8 wall-clock，格式为 `YYYY-MM-DD HH:mm:ss`。
- `limitRound` 来自节点最大辅助轮次。
- `payload` 是可直接注入 Prompt 的自然语言文本；Java 不解析 JSON、不解释字段结构。
- `priority` V1 固定为 `0`，不向节点配置开放。

成功信封的 `data` 为非负安全整数指令 ID。

### 3.2 失效指令

```http
POST /third-internal/wap-embed-agent-directive/disable
```

```ts
type DisableWapEmbedAgentDirective = {
  bizId: string;
  reason: string;
  type: "collect-fields";
  uid: number;
};
```

Java 失效接口按 `uid + type + bizId` 幂等，成功信封的 `data` 必须为 `true`。

Java 实际写入 `xy_wap_embed_agent_directive`。Workflow 不直接读写该表。表中的 `status`、`expires_at`、`limit_round`、`total_round`、`priority` 及选择策略由 Java 维护；Workflow 只把回调的 `totalRound` 用作该 Task 已观察到的最大辅助轮次。

## 4. 指引 Payload

`payload` 是不依赖 Java 解释、可直接拼入 Prompt 的自然语言。例如：

```text
当前临时沟通目标：在自然对话中请客户提供以下资料。

- 收货地址

沟通要求：
- 先回答客户当前的问题；若还缺资料，在同一轮回复末尾用一句口语请对方提供最相关的一项，不要把这段指引读给客户。
- 还缺多项时按对话进展分步了解，一轮只跟进一项，不要一次问完。
- 客户已经明确说过的内容不要再问；说得含糊或不完整时，用对方听得懂的方式请补充，不要要求特定格式，也不要念出校验规则。
- 客户明确表示暂时无法提供或拒绝提供时，礼貌理解并继续帮当前的忙，不要反复催要。
```

Java 的通用 Agent 指令扩展只需把文本放入受控 Prompt 区域，不需要知道它来自信息收集节点，也不需要实现业务 Renderer。

## 5. `agent.directive` 回调

Java 在指引实际参与 Agent 回复后，通过现有 Entry Topic 可靠投递：

```json
{
  "eventId": "agent.directive:f6cd2ada-6db7-4d80-af8e-439fcb3a771b",
  "eventType": "agent.directive",
  "occurredAt": "2026-08-27T06:36:27.000Z",
  "payload": {
    "seatId": 4,
    "workUserId": 35971,
    "thirdExternalUserId": "2F1A...",
    "externalUserId": 0,
    "type": "collect-fields",
    "totalRound": 1,
    "bizId": "workflow-task:88",
    "bizInfo": ""
  },
  "payloadVersion": 1,
  "schemaVersion": 1,
  "source": "chatai",
  "uid": 272
}
```

约束：

- `eventId` 全局稳定，Java Outbox 重投不得变化。
- `bizId` 等于添加指令时的业务 ID。
- `totalRound` 是该指令实际参与 Agent 回复的累计轮次；不表示 Agent 一定提出了问题。
- Java 不返回客户消息 ID、候选字段、观察信息或提取完成状态。
- Workflow 验证 `uid + bizId + seatId + thirdExternalUserId` 与活动 Task 一致。
- 重复事件通过 Workflow Inbox 原子去重。
- 过期、已结束或身份不匹配的事件 ACK 为 stale，不唤醒其它 Workflow。
- 该事件在通用 Event Catalog 之前单独分流，不用于 Start 或 Wait Event 匹配。

## 6. 状态与排队

每个 AI Collect Task 在 `xy_wap_embed_workflow_ai_collect_state` 保存：

- 稳定 `bizId`、Run / Task / Workflow 身份
- 席位、客户外部 ID、会话 ID
- 已收集字段对象
- 初次输入和开场白状态
- 指令状态、失效原因、重试次数和租约
- 已观察最大 `totalRound`
- 从节点进入边界开始的客户消息游标
- 待处理回调截止时间和 30 秒静默截止
- 唯一在途推理 Key、批次游标和下一批序号
- 最终 Outlet

消息查询使用稳定 `(msgtime, id)` 游标，只读取当前租户、席位和客户在节点进入之后、批次截止之前发送的未撤回私聊消息。查询按最早消息优先，每批最多 50 条，并受 8 KiB Workflow 值上限约束。超出时减少本批消息数量，不跳过游标；单条超限由共享消息裁剪逻辑处理。

### 6.1 初次执行

1. 创建状态，消息游标初始化为节点进入边界。
2. 有配置输入且内容非空时，创建初次提取 Job；无输入时直接进入未完成判定。
3. 初次提取已满足全部字段时，直接从 `completed` 出口结算，不添加指引也不发送开场白。
4. 仍缺字段且智能体辅助开启时，解析会话并添加仅包含剩余字段的指引。
5. 智能体辅助已开启、有开场白且尚未发送时，使用稳定幂等键发送一次。
6. 智能体辅助开启时，Task 等待回调、轮次上限或绝对超时。

### 6.2 回调批处理

1. 回调事务内校验活动状态并按 `eventId` 去重。
2. `observedRound = max(observedRound, totalRound)`。
3. `pendingCutoffAt` 取最新回调的 `occurredAt`。
4. `quietUntil` 重置为消费时间加 30 秒，但不超过绝对超时。
5. 若 Task 正在等待且没有在途推理，更新 Task 到新的 `quietUntil`；连续回调既可延后也可提前静默截止。
6. 静默截止后，查询上次成功游标到 `pendingCutoffAt` 的客户消息并创建一个提取 Job。
7. 推理期间到达的回调只更新 pending 状态；当前 Job 完成后再决定下一批，任意时刻同一 Task 最多一个在途 Job。

### 6.3 轮次与超时结算

- `observedRound >= maxFollowUpCount` 时进入结算，不等待剩余静默窗口。
- 到达绝对超时时，即使从未收到回调，也查询一次节点进入后的客户消息。
- 结算查询可能分批；必须处理到截止时间且不存在后续消息后，才能走 `incomplete`。
- 任一批补齐全部字段后立即走 `completed`。
- `completed` 只输出按稳定字段 ID 保存的值；`incomplete` 不暴露部分字段。

## 7. 提取模型协议

AI Collect 使用固定平台 Endpoint 和 `low` 推理深度，每次只请求仍缺失的字段。严格 JSON Schema 为每个字段生成两个必填属性：

```json
{
  "F1_present": true,
  "F1_value": "A100",
  "F2_present": false,
  "F2_value": ""
}
```

- `present=false` 时忽略占位值，不写入字段状态。
- `present=true` 时，值必须通过类型及日期、时间格式校验。
- 模型代码 `F1`、`F2`、`F3` 只存在于一次请求；持久化和节点输出使用字段稳定 ID。
- 图片按现有多模态协议发送；视频降级成 `[视频]` 文本。

## 8. 指令失效与故障恢复

- 正常完成或未完成时，Runtime 先同步调用失效接口，再提交节点结果。
- 推理失败、Run 失败、取消、停止或过期时，状态记录失效原因。
- Reconciler 使用 `active/disabling` 状态、租约和指数退避补偿失效调用。
- Java 同时使用 `expiresAt` 硬过滤，避免 Node 长时间不可用时旧指引永久参与回复。
- 添加和失效接口按约定视为幂等，Workflow 可安全重试。
- 指令选择或组合失败不由 Workflow 猜测或补偿；Java 按其 Agent 运行策略处理。

## 9. 非目标

- 不提供 AI Collect 编辑器试运行。
- 不让节点取得会话独占回复权。
- 不要求 Java Agent 输出隐藏结构化观察。
- 不从 Agent 回复正文反推是否追问。
- 不由 Workflow 规定 Java 同轮注入一条还是多条指引。
- 不让 Java 保存 Workflow 字段状态或判断节点完成。
- 不将提取结果视为订单、地址等业务真实性校验；下游仍使用对应 Query / Action 节点。

## 10. 验收标准

1. 配置输入非空时，初次提取 Job 先于会话解析、指引添加和开场白发送。
2. 初次提取完成全部字段时不添加指引、不发送开场白；未完成时指引只包含剩余字段。
3. 未配置输入时不会失败，节点直接进入辅助等待。
4. 连续回调重置 30 秒静默窗口并在同一 Task 内合并。
5. 推理期间的新回调不创建并发 Job。
6. 重复 `agent.directive` 不重复轮次、不重复唤醒。
7. 只查询节点进入后的客户消息，并按稳定游标分批。
8. 达到轮次或超时时执行最终查询后再路由。
9. 完成、未完成、失败、取消和超时最终都会使指令失效。
10. Java 响应信封和 UTC+8 时间格式受测试保护。
11. 生产 Worker 同时注入会话 Port、指令 Port、推理 Adapter、Entry Consumer 和失效补偿 Worker。
