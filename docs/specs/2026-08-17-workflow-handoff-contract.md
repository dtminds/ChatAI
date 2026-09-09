# Workflow Handoff 跨服务契约

- 状态：Node 与 Java 生产执行链路已接通
- 适用节点：ChatAI SOP 的 Handoff
- Capability：`chatai.conversation.handoff`，Contract Version `1`

## 1. 职责

Node 负责：

- 将客服提示和可选对客话术中的变量渲染为最终文本
- 使用 Run 进入时冻结的 `trigger.projection.seatId`
- 按 `uid + seatId` 只读 `xy_wap_embed_user_seat`，解析 Java 所需的平台和第三方成员 ID
- 生成并重用稳定 `idempotencyKey`
- 把转人工和可选对客消息视为一个 Action 管理 timeout、retry 和结果提交

Java 负责：

- 校验账号、客户关系、会话状态和托管状态
- 写入客服接管提醒，并按需向客户发送对客话术
- 持久化整个复合 Action 的步骤状态和幂等结果
- 对同一幂等键返回第一次执行的相同结果，不重复提醒或发送消息

## 2. Runtime Command

Runtime 在调用 Worker Port 前生成以下类型化命令：

```json
{
  "capabilityKey": "chatai.conversation.handoff",
  "contractVersion": 1,
  "uid": 9,
  "idempotencyKey": "9:run-id:handoff-node-id:3",
  "execution": {
    "workflowId": "123",
    "revision": 2,
    "runId": "run-id",
    "nodeId": "handoff-node-id",
    "sequence": 3
  },
  "command": {
    "seatId": 101,
    "recipient": {
      "thirdExternalUserId": "third-external-user-id"
    },
    "source": "workflow",
    "operatorMessage": "客户咨询退款，请及时接待",
    "customerMessage": "正在为你转接人工，请稍等"
  }
}
```

约束：

- `seatId` 必须来自 `trigger.projection.seatId`，不从最新 Workflow Revision 重新选择账号
- Prepared `thirdExternalUserId` 必须与 `recipient.thirdExternalUserId` 一致
- Worker 仅查询指定的 `uid + seatId`；账号缺失或字段非法时 terminal，不替换其他账号
- Handoff 表示进入该托管账号对应的接待队列，不在节点中指定某个客服人员
- `operatorMessage` 只保存用户填写并完成变量解析的内容，不含固定前缀；必填且最长 100 字符
- `customerMessage` 可为空，最长 100 字符
- 两段消息已经完成变量解析，Java 不解析 selector
- `source` 是 Runtime 内部语义枚举 `workflow`；Worker 调用 Java 时明确映射为 Workflow 来源 `source = 4`
- `execution.workflowId` 用作 Java 请求的 `sourceId` 和客服提示中的 Workflow 标识；其余 `execution` 字段只用于排障

## 3. Java HTTP 请求

```text
POST /third-internal/wap-embed/conversation/close-full-auto-with-message?idempotentKey=<stable-key>
```

```json
{
  "externalMessage": "正在为你转接人工，请稍等",
  "platform": 5,
  "source": 4,
  "sourceId": "123",
  "systemMessage": "#123 SOP 转人工处理：客户咨询退款，请及时接待",
  "thirdExternalUserid": "third-external-user-id",
  "thirdUserid": "third-user-id",
  "uid": 9
}
```

映射：

- `platform`、`thirdUserid` 来自 `xy_wap_embed_user_seat`
- `thirdExternalUserid` 来自 Prepared Identity
- `source = 4` 表示 Workflow 来源，`sourceId` 为原始 `workflowId`
- `systemMessage` 由 Worker 按 `#{workflowId} SOP 转人工处理：{operatorMessage}` 拼接，必传非空；其中 `operatorMessage` 是 Runtime 已完成变量解析的用户内容
- 只有 `customerMessage` 非空时才传 `externalMessage`；未配置时字段完全省略
- `idempotentKey` 使用 Runtime 稳定 Execution Key，放在 GET query 参数中

## 4. 响应

成功响应：

```json
{
  "data": 9001,
  "error": 0,
  "errorMsg": "",
  "success": true
}
```

只有 HTTP 200 且 `success === true` 表示成功。`data` 不进入节点输出，Node Result 保持 `{}`。Handoff 不提供独立业务时间输出；下游需要引用节点完成时间时，统一使用该节点生命周期的 `exitedAt`。

## 5. 复合 Action 与幂等

- 客服接管提醒和可选对客消息共同属于一个 Handoff Action，不拆成两个 Workflow Task
- Java 必须按 `idempotencyKey` 持久化各步骤状态；发生部分成功时，重试只补齐未完成步骤
- Java 只有在所有必需步骤完成后才返回成功
- 相同 `idempotencyKey` 和相同请求重复调用，返回相同的成功响应
- 相同幂等键但主体或命令不同，由 Java 返回 HTTP 200 + `success: false`
- timeout 的执行结果未知，Node 会使用同一个 `idempotencyKey` 重试
- 网络异常、超时和任意非 HTTP 200 响应由 Node 分类为 retryable
- HTTP 200 + `success: false` 是 Java 明确业务拒绝，由 Node 分类为 terminal
- HTTP 200 下非法 JSON、非法 envelope 或非法 `success` 是 terminal 契约错误
- Java 不叠加无上限的长期重试；Workflow Runtime 是重试调度权威

## 6. 发布边界

Java Endpoint、真实 Worker Port、生产 Composition 和 Runtime 路径均已接通，Handoff 为 `runtime-ready`。发布门禁可以放行配置完整且变量引用有效的 Handoff 节点。
