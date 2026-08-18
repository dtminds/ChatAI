# Workflow Message Send 跨服务契约

- 状态：已接通现有 Java 发送接口
- 适用节点：ChatAI SOP 的 Message
- Capability：`chatai.message.send`，Contract Version `1`

## 1. 职责

Node 负责：

- 将变量和节点输出渲染为最终文本
- 冻结 Run 进入时的托管账号候选集和选择策略
- 冻结消息发送时间段，并在时段外把 Task 精确延后到下一个开始时间
- 生成并重用稳定 `idempotencyKey`
- 管理 timeout、retry、terminal failure 和节点结果

Worker 负责：

- 在冻结的候选托管账号中选择实际发送账号
- 将文本与附件按配置顺序映射为现有 Java 发送接口的单条消息请求
- 为每条消息从节点稳定 `idempotencyKey` 派生稳定子键

Java 负责：

- 校验账号、客户关系和消息资源
- 执行消息发送副作用
- 持久化幂等结果，并对同一幂等键返回第一次执行的相同结果

## 2. Runtime 请求

Runtime 交给 Worker Adapter 的逻辑结构如下：

```json
{
  "capabilityKey": "chatai.message.send",
  "contractVersion": 1,
  "uid": 9,
  "subjectType": "chatai_contact",
  "subjectId": "third-external-user-id",
  "idempotencyKey": "9:run-id:message-node-id:3",
  "deadlineAt": "2026-08-16T10:00:15.000Z",
  "execution": {
    "workflowId": "workflow-id",
    "revision": 2,
    "runId": "run-id",
    "nodeId": "message-node-id",
    "sequence": 3
  },
  "command": {
    "accountSelection": {
      "seatIds": [101, 102],
      "strategy": "earliest-added"
    },
    "recipient": {
      "thirdExternalUserId": "third-external-user-id"
    },
    "source": "workflow",
    "content": "已经完成变量渲染的消息文本",
    "attachments": []
  }
}
```

约束：

- `subjectType` 固定为 `chatai_contact`
- `subjectId` 与 `recipient.thirdExternalUserId` 必须一致
- `accountSelection.seatIds` 是 Run 创建时冻结的候选托管账号
- Worker 优先使用客户在候选账号中的有效绑定账号；不存在时按 `earliest-added` 或 `latest-added` 选择有效候选账号
- `source` 是 Runtime 内部语义枚举 `workflow`；Worker 调用 Java 时映射为自动执行来源
- `content` 已完成变量解析，最长 1000 字符；Java 不解析 selector
- `attachments` 最多 5 个，支持 `image`、`file`、`h5`、`weapp`、`sphfeed`
- 文本为空时必须至少有一个附件
- `execution` 只用于排障，不参与业务判断

## 3. Java 接口

Worker 复用现有接口：

```text
POST /third-internal/wap-embed/conversation/send-message?idempotentKey=<key>
```

请求体继续使用现有 `send-message` 契约。单聊固定使用 `sendType = 1`，`thirdExternalUserid` 为 Workflow Subject，`thirdUserId` 为 Worker 选出的托管账号，`source = 3` 表示自动执行来源。

Message 节点的非空文本先发送，随后按配置顺序发送附件。每次调用使用 `${idempotencyKey}:<index>` 作为 query 参数；重试完整节点时各条消息复用原子键，已经成功的消息由 Java 幂等返回，不重复发送。

## 4. 响应

Java 接口成功响应沿用现有 envelope，并必须包含非空 `data.optNo`。Worker 校验发送已受理后丢弃该内部操作号，Message 节点对 Runtime 的成功结果为：

```json
{}
```

Java 仅用空对象表示本次 Action 成功。Message 不提供独立业务时间输出；下游需要引用节点完成时间时，统一使用该节点生命周期的 `exitedAt`。

## 5. 幂等与错误

- 相同消息子键和相同请求重复调用，Java 返回相同的成功结果，不重复发送
- 相同消息子键但主体或消息请求不同，Java 返回 terminal conflict
- timeout 的执行结果未知，Node 会使用同一组消息子键重试
- 临时不可用、限流和依赖超时返回 retryable
- 参数非法、账号或客户关系不存在、资源失效和业务拒绝返回 terminal
- Java 不叠加无上限的长期重试；Workflow Runtime 是重试调度权威

## 6. 当前发布边界

Message 使用现有 Java Endpoint 和真实 Worker Adapter，节点 maturity 为 `runtime-ready`。Worker 启动必须配置 `JAVA_INTERNAL_API_BASE_URL`，并通过生产组合校验。
