# Workflow Tag 跨服务契约

- 状态：已接通现有 Java 客户标签更新接口
- 适用节点：ChatAI SOP、WeCom SOP 的客户打标
- Capability：`customer.tag.update`，Contract Version `1`

## 1. 职责

Node 负责：

- 校验添加或移除操作以及标签 ID 列表
- 使用 Task 执行前准备的 `externalUserId` 表达目标客户
- 生成并重用稳定 `idempotencyKey`
- 管理 timeout、retry、terminal failure 和节点结果

Java 负责：

- 使用请求中的 `externalUserId` 定位企微客户
- 校验标签存在、可用且属于当前租户
- 对目标客户幂等添加或移除全部指定标签
- 持久化幂等结果，并对同一幂等键返回第一次执行的相同结果

## 2. 请求

Runtime 交给 Worker Adapter 的逻辑结构如下：

```json
{
  "capabilityKey": "customer.tag.update",
  "contractVersion": 1,
  "uid": 9,
  "subjectType": "chatai_contact",
  "subjectId": "third-external-user-id",
  "identities": {
    "externalUserId": 101
  },
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
- Runtime 在 Tag 执行前通过客户身份 Prepare 得到数字型 `externalUserId`
- Worker 必须使用 Prepared Identity 中的 `externalUserId`，不得直接把 Run `subjectId` 当作 Java 客户 ID
- `operation` 仅支持 `add` 和 `remove`
- `tagIds` 包含 1 至 5 个不重复的正整数 ID
- `source` 固定为语义枚举 `workflow`
- `execution` 只用于排障，不参与业务判断

## 3. Java 接口

Worker 调用：

```text
POST /third-internal/work-tag/update-wecom-contact-tag?idempotentKey=<key>
```

请求体：

```json
{
  "externalUserId": 101,
  "tagIds": [301, 302],
  "type": 1,
  "uid": 9
}
```

映射约束：

- `idempotentKey` 使用 Runtime Action 的稳定 `idempotencyKey`；重试复用原键
- `operation = add` 映射为 `type = 1`
- `operation = remove` 映射为 `type = 2`
- 一次请求包含节点配置的全部标签；Java 对整个标签集合全量成功或全量失败，不返回部分成功
- 添加客户已有的标签、删除客户没有的标签均视为成功

## 4. 响应

只有 HTTP 200 且 `success === true` 表示成功。Java `data` 不作为 Workflow 输出，成功结果统一映射为：

```json
{}
```

Tag 不提供业务输出。下游如需引用节点完成时间，统一使用该节点生命周期的 `exitedAt`。

HTTP 200 且 `success === false` 表示明确业务拒绝。HTTP 200 下的非法 JSON、非法 envelope 或非法 `success` 属于 terminal 契约错误。非 HTTP 200（包括 201）、网络异常和超时属于 retryable。

## 5. 幂等与错误

- 相同 `idempotencyKey` 和相同请求重复调用，Java 返回相同的成功空对象，不重复修改标签
- 相同 `idempotencyKey` 但主体或命令不同，Java 返回 terminal conflict
- `add` 已存在的标签、`remove` 已不存在的标签都视为幂等成功
- timeout 的执行结果未知，Node 会使用同一个 `idempotencyKey` 重试
- 非 HTTP 200、临时不可用、网络异常和依赖超时返回 retryable
- HTTP 200 且 `success === false` 返回 terminal
- 参数非法、客户不存在、标签不存在或无权限返回 terminal
- Java 不叠加无上限的长期重试；Workflow Runtime 是重试调度权威

## 6. 当前发布边界

Tag 使用现有 Java Endpoint 和真实 Worker Adapter，节点 maturity 为 `runtime-ready`。Worker 启动必须配置 `JAVA_INTERNAL_API_BASE_URL`，并通过生产组合校验。
