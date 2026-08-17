# Workflow Handoff 跨服务契约

- 状态：Node 侧契约已冻结，Java Endpoint 与真实 Adapter 待实现
- 适用节点：ChatAI SOP 的 Handoff
- Capability：`chatai.conversation.handoff`，Contract Version `1`

## 1. 职责

Node 负责：

- 将客服提示和可选对客话术中的变量渲染为最终文本
- 冻结 Run 进入时的托管账号候选集和选择策略
- 生成并重用稳定 `idempotencyKey`
- 把转人工和可选对客消息视为一个 Action 管理 timeout、retry 和结果提交

Java 负责：

- 在候选托管账号中解析客户当前会话对应的实际账号
- 校验账号、客户关系、会话状态和托管状态
- 写入客服接管提醒，并按需向客户发送对客话术
- 持久化整个复合 Action 的步骤状态和幂等结果
- 对同一幂等键返回第一次执行的相同结果，不重复提醒或发送消息

## 2. 请求

真实 Adapter 必须把 Runtime 的 Action 请求完整传给 Java。逻辑结构如下：

```json
{
  "capabilityKey": "chatai.conversation.handoff",
  "contractVersion": 1,
  "uid": 9,
  "subjectType": "chatai_contact",
  "subjectId": "third-external-user-id",
  "idempotencyKey": "9:run-id:handoff-node-id:3",
  "deadlineAt": "2026-08-17T10:00:15.000Z",
  "execution": {
    "workflowId": "workflow-id",
    "revision": 2,
    "runId": "run-id",
    "nodeId": "handoff-node-id",
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
    "operatorMessage": "客户咨询退款，请及时接待",
    "customerMessage": "正在为你转接人工，请稍等"
  }
}
```

约束：

- `subjectType` 固定为 `chatai_contact`
- `subjectId` 与 `recipient.thirdExternalUserId` 必须一致
- `accountSelection.seatIds` 是 Run 创建时冻结的托管账号候选集，Java 不读取 Workflow Revision
- 优先使用客户在候选账号中的专属服务官；不存在时按配置策略选择
- Handoff 表示进入所选托管账号对应的接待队列，不在节点中指定某个客服人员
- `operatorMessage` 必填，`customerMessage` 可为空，二者最长均为 100 字符
- 两段消息已经完成变量解析，Java 不解析 selector
- `source` 是语义枚举 `workflow`，Java 自行映射平台内部来源值
- `execution` 只用于排障，不参与业务判断

## 3. 响应

成功响应：

```json
{}
```

Java 仅用空对象表示整个复合 Action 成功。Handoff 不提供独立业务时间输出；下游需要引用节点完成时间时，统一使用该节点生命周期的 `exitedAt`。

## 4. 复合 Action 与幂等

- 客服接管提醒和可选对客消息共同属于一个 Handoff Action，不拆成两个 Workflow Task
- Java 必须按 `idempotencyKey` 持久化各步骤状态；发生部分成功时，重试只补齐未完成步骤
- Java 只有在所有必需步骤完成后才返回成功
- 相同 `idempotencyKey` 和相同请求重复调用，返回相同的成功空对象
- 相同 `idempotencyKey` 但主体或命令不同，返回 terminal conflict
- timeout 的执行结果未知，Node 会使用同一个 `idempotencyKey` 重试
- 临时不可用、限流和依赖超时返回 retryable
- 参数非法、账号或客户关系不存在、会话不可转接和业务拒绝返回 terminal
- Java 不叠加无上限的长期重试；Workflow Runtime 是重试调度权威

## 5. 当前发布边界

在 Java Endpoint 和真实 Adapter 完成前，Handoff 继续保持 `draft-ready`。生产 Worker 加载类型化 Binding，但 Runtime 发布和执行门禁不会放行该节点。
