# Workflow 绑定订单跨服务契约

- 状态：Node 侧契约已冻结，Java Endpoint 与真实 Adapter 待实现
- 适用节点：ChatAI SOP、WeCom SOP 的绑定订单
- Capability：`order.bind`，Contract Version `1`

## 1. 职责

Node 负责：

- 从当前节点可用的文本或数字变量中选择一个订单号
- 使用 Task 执行前准备的 `externalUserId` 表达目标客户
- 将解析后的订单号投影成类型化命令
- 生成并重用稳定 `idempotencyKey`
- 将 Java 绑定结果映射为节点输出 `succeeded`
- 管理 timeout、retry、terminal failure 和节点结果

Java 负责：

- 使用请求中的 `externalUserId` 定位企微客户
- 按订单号把订单关联到该客户画像
- 同一客户重复绑定同一订单视为成功
- 订单不存在或已被其他客户占用时返回明确业务失败，而不是协议错误
- 持久化幂等结果，并对同一幂等键返回第一次执行的相同结果

## 2. 请求

Runtime 交给 Worker Adapter 的逻辑结构如下：

```json
{
  "capabilityKey": "order.bind",
  "contractVersion": 1,
  "uid": 9,
  "subjectType": "chatai_contact",
  "subjectId": "third-external-user-id",
  "identities": {
    "externalUserId": 101
  },
  "idempotencyKey": "9:run-id:order-bind-node-id:3",
  "deadlineAt": "2026-08-21T10:00:15.000Z",
  "execution": {
    "workflowId": "workflow-id",
    "revision": 2,
    "runId": "run-id",
    "nodeId": "order-bind-node-id",
    "sequence": 3
  },
  "command": {
    "orderNumber": "SO20260821001",
    "source": "workflow"
  }
}
```

约束：

- `subjectType` 支持 `chatai_contact` 和 `wecom_contact`
- Worker 必须使用 Prepared Identity 中的 `externalUserId`，不得直接把 Run `subjectId` 当作 Java 客户 ID
- `orderNumber` 为 1 至 64 个字符的非空字符串
- `source` 固定为语义枚举 `workflow`
- `execution` 只用于排障，不参与业务判断

## 3. Java 接口

真实 Endpoint 待 Java 提供。当前节点 maturity 为 `draft-ready`，生产 Worker 不得注册该 Capability。

## 4. 响应与节点输出

Java 成功完成绑定后，Node 输出：

```json
{
  "succeeded": true
}
```

业务失败（订单不存在、已被他人绑定等）时，节点仍然完成，输出：

```json
{
  "succeeded": false
}
```

流程继续走默认出口，由后续条件分支消费 `操作结果`。

系统不可用、超时、非法信封和未知结果不属于 `succeeded: false`：

- 非 HTTP 200、网络异常和超时属于 retryable
- HTTP 200 下的非法 JSON、非法 envelope 属于 terminal
- 参数非法、客户身份不可用属于 terminal

## 5. 幂等与错误

- 相同 `idempotencyKey` 和相同请求重复调用，Java 返回相同结果，不重复绑定
- 相同 `idempotencyKey` 但主体或订单号不同，Java 返回 terminal conflict
- 同一客户重复绑定同一订单视为幂等成功，`succeeded` 为 `true`
- timeout 的执行结果未知，Node 会使用同一个 `idempotencyKey` 重试
- Java 不叠加无上限的长期重试；Workflow Runtime 是重试调度权威

## 6. 当前发布边界

绑定订单为 `draft-ready`。编辑器可添加、保存和回显；提交审核 / 发布会被运行门禁阻止，直到 Java Endpoint、Worker Adapter 和错误契约接通后升为 `runtime-ready`。
