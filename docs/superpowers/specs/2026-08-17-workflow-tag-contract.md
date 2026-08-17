# Workflow Tag 跨服务契约

- 状态：Node 侧契约已冻结，Java Endpoint 与真实 Adapter 待实现
- 适用节点：ChatAI SOP、WeCom SOP 的客户打标
- Capability：`customer.tag.update`，Contract Version `1`

## 1. 职责

Node 负责：

- 校验添加或移除操作以及标签 ID 列表
- 使用 Run 已确定的 `subjectType + subjectId` 表达目标客户
- 生成并重用稳定 `idempotencyKey`
- 管理 timeout、retry、terminal failure 和节点结果

Java 负责：

- 按 `subjectType + subjectId` 解析客户身份
- 校验标签存在、可用且属于当前租户
- 对目标客户幂等添加或移除全部指定标签
- 持久化幂等结果，并对同一幂等键返回第一次执行的相同结果

## 2. 请求

真实 Adapter 必须把 Runtime 的 Action 请求完整传给 Java。逻辑结构如下：

```json
{
  "capabilityKey": "customer.tag.update",
  "contractVersion": 1,
  "uid": 9,
  "subjectType": "chatai_contact",
  "subjectId": "third-external-user-id",
  "idempotencyKey": "9:run-id:tag-node-id:3",
  "deadlineAt": "2026-08-17T10:00:15.000Z",
  "execution": {
    "workflowId": "workflow-id",
    "revision": 2,
    "runId": "run-id",
    "nodeId": "tag-node-id",
    "sequence": 3
  },
  "command": {
    "operation": "add",
    "tagIds": [301, 302],
    "source": "workflow"
  }
}
```

约束：

- `subjectType` 支持 `chatai_contact` 和 `wecom_contact`
- `chatai_contact` 的 `subjectId` 是 `thirdExternalUserId`
- `wecom_contact` 的 `subjectId` 是 `externalUserId`
- Java 必须按 `subjectType` 解析身份，禁止根据 ID 格式猜测主体域
- `operation` 仅支持 `add` 和 `remove`
- `tagIds` 包含 1 至 5 个不重复的正整数 ID
- `source` 固定为语义枚举 `workflow`
- `execution` 只用于排障，不参与业务判断

## 3. 响应

成功响应：

```json
{}
```

Tag 不提供业务输出。下游如需引用节点完成时间，统一使用该节点生命周期的 `exitedAt`。

## 4. 幂等与错误

- 相同 `idempotencyKey` 和相同请求重复调用，Java 返回相同的成功空对象，不重复修改标签
- 相同 `idempotencyKey` 但主体或命令不同，Java 返回 terminal conflict
- `add` 已存在的标签、`remove` 已不存在的标签都视为幂等成功
- timeout 的执行结果未知，Node 会使用同一个 `idempotencyKey` 重试
- 临时不可用、限流和依赖超时返回 retryable
- 参数非法、客户不存在、标签不存在或无权限返回 terminal
- Java 不叠加无上限的长期重试；Workflow Runtime 是重试调度权威

## 5. 当前发布边界

在 Java Endpoint 和真实 Adapter 完成前，Tag 保持 `draft-ready`。生产 Worker 加载类型化 Binding，但 Runtime 发布和执行门禁不会放行该节点。
