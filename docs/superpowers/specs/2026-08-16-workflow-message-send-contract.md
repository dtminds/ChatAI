# Workflow Message Send 跨服务契约

- 状态：Node 侧契约已冻结，Java Endpoint 与真实 Adapter 待实现
- 适用节点：ChatAI SOP 的 Message
- Capability：`chatai.message.send`，Contract Version `1`

## 1. 职责

Node 负责：

- 将变量和节点输出渲染为最终文本
- 冻结 Run 进入时的托管账号候选集和选择策略
- 生成并重用稳定 `idempotencyKey`
- 管理 timeout、retry、terminal failure 和节点结果

Java 负责：

- 在候选托管账号中解析实际发送账号
- 校验账号、客户关系和消息资源
- 执行消息发送副作用
- 持久化幂等结果，并对同一幂等键返回第一次执行的相同结果

## 2. 请求

真实 Adapter 必须把 Runtime 的 Action 请求完整传给 Java。逻辑结构如下：

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
- `accountSelection.seatIds` 是 Run 创建时冻结的候选托管账号，Java 不读取 Workflow Revision
- 优先使用客户在候选账号中的专属服务官；不存在时按 `earliest-added` 或 `latest-added` 选择
- `source` 是语义枚举 `workflow`；Java 自行映射平台内部数值，不复用工作台来源
- `content` 已完成变量解析，最长 1000 字符；Java 不解析 selector
- `attachments` 最多 5 个，支持 `image`、`file`、`h5`、`weapp`、`sphfeed`
- 文本为空时必须至少有一个附件
- `execution` 只用于排障，不参与业务判断

## 3. 响应

成功响应：

```json
{
  "sentAt": "2026-08-16T10:00:01.000Z"
}
```

`sentAt` 表示本次节点消息全部成功受理的时间，必须是带毫秒的 UTC RFC 3339 时间。Node 将它作为 Message 节点的稳定输出。

## 4. 幂等与错误

- 相同 `idempotencyKey` 和相同请求重复调用，Java 返回第一次执行的同一结果，不重复发送
- 相同 `idempotencyKey` 但主体或命令不同，Java 返回 terminal conflict
- timeout 的执行结果未知，Node 会使用同一个 `idempotencyKey` 重试
- 临时不可用、限流和依赖超时返回 retryable
- 参数非法、账号或客户关系不存在、资源失效和业务拒绝返回 terminal
- Java 不叠加无上限的长期重试；Workflow Runtime 是重试调度权威

## 5. 当前发布边界

在 Java Endpoint 和真实 Adapter 完成前，Message 继续保持 `draft-ready`。生产 Worker 只加载类型化 Binding，Runtime 发布和执行门禁不会放行该节点。
