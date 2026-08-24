# Workflow 代客转积分跨服务契约

- 状态：Node 侧契约已冻结；Java Endpoint 已确认请求，真实 Adapter、响应信封和幂等仍待联调
- 适用节点：ChatAI SOP、WeCom SOP 的代客转积分
- Capability：`mall.point.transfer`，Contract Version `1`
- Java：`POST /third-internal/mall-order/transfer-order-point`

## 1. 职责

Node 负责：

- 从当前节点可用的文本或数字变量中选择一个订单号
- 使用 Task 执行前准备的 `mallUserId` 表达目标小店用户
- 将解析后的订单号投影成类型化命令
- 生成并重用稳定 `idempotencyKey`
- 将 Java 转积分结果映射为节点输出 `result`
- 管理 timeout、retry、terminal failure 和节点结果

Java 负责：

- 使用请求中的 `mallUserId` 和 `uid` 定位小店用户
- 按订单号为该用户转积分
- 持久化幂等结果，并对同一幂等键返回第一次执行的相同结果

用户在节点上只配置订单号。`mallUserId` 和 `uid` 由 Runtime 上下文提供，不进入编辑器配置。

## 2. 请求

Runtime 交给 Worker Adapter 的逻辑结构如下：

```json
{
  "capabilityKey": "mall.point.transfer",
  "contractVersion": 1,
  "uid": 9,
  "subjectType": "chatai_contact",
  "subjectId": "third-external-user-id",
  "identities": {
    "mallUserId": 202
  },
  "idempotencyKey": "9:run-id:points-transfer-node-id:3",
  "deadlineAt": "2026-08-24T10:00:15.000Z",
  "execution": {
    "workflowId": "workflow-id",
    "revision": 2,
    "runId": "run-id",
    "nodeId": "points-transfer-node-id",
    "sequence": 3
  },
  "command": {
    "orderNumber": "SO20260824001",
    "source": "workflow"
  }
}
```

Java 请求按现有 third-internal 惯例发送扁平 JSON，Swagger 参数名 `reqTO` 对应 `@RequestBody`：

```json
{
  "mallUserId": 202,
  "orderNumber": "SO20260824001",
  "uid": 9
}
```

约束：

- `subjectType` 支持 `chatai_contact` 和 `wecom_contact`
- Worker 必须使用 Prepared Identity 中的 `mallUserId`，不得直接把 Run `subjectId` 当作 Java 小店用户 ID
- `orderNumber` 为 1 至 64 个字符的非空字符串
- `source` 固定为语义枚举 `workflow`
- `execution` 只用于排障，不参与业务判断

## 3. 响应与节点输出

节点输出是字符串 `result`，编辑器展示为「操作结果」：

```json
{
  "result": "success"
}
```

业务失败时节点仍然完成，输出：

```json
{
  "result": "false"
}
```

流程继续走默认出口，由后续条件分支消费 `操作结果`。

系统不可用、超时、非法信封和未知结果不属于 `result: "false"`：

- 非 HTTP 200、网络异常和超时属于 retryable
- HTTP 200 下的非法 JSON、非法 envelope 属于 terminal
- 参数非法、小店用户身份不可用属于 terminal

Java 成功 / 业务失败的精确 envelope 仍待联调确认。当前按产品设计把成功映射为 `"success"`，业务拒绝映射为 `"false"`。

## 4. 幂等与错误

- 相同 `idempotencyKey` 和相同请求重复调用，Java 应返回相同结果，不重复转积分
- 相同 `idempotencyKey` 但主体或订单号不同，Java 应返回 terminal conflict
- timeout 的执行结果未知，Node 会使用同一个 `idempotencyKey` 重试
- Java 不叠加无上限的长期重试；Workflow Runtime 是重试调度权威
- 幂等查询参数沿用现有 Action 惯例 `idempotentKey`

## 5. 当前发布边界

代客转积分为 `draft-ready`。编辑器可添加、保存和回显；提交审核 / 发布会被运行门禁阻止，直到 Worker Adapter、Java 响应信封、错误分类和幂等契约接通后升为 `runtime-ready`。生产 Worker 不得注册该 Capability，也不得放入成功 Fake。
