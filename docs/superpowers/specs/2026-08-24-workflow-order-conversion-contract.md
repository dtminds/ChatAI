# Workflow 代客转积分跨服务契约

- 状态：Worker Adapter 已接通；Java 标准信封以 `success` 为成功权威
- 适用节点：ChatAI SOP、WeCom SOP 的代客转积分
- Capability：`mall.order.convert`，Contract Version `1`
- Java：`POST /third-internal/mall-order/transfer-order-point`

## 1. 职责

Node 负责：

- 从当前节点可用的文本或数字变量中选择一个订单号
- 使用 Task 执行前准备的 `mallUserId` 表达目标小店用户
- 将解析后的订单号投影成类型化命令
- 生成并重用稳定 `idempotencyKey`
- Java 操作成功时输出 `result: true`
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
  "capabilityKey": "mall.order.convert",
  "contractVersion": 1,
  "uid": 9,
  "subjectType": "chatai_contact",
  "subjectId": "third-external-user-id",
  "identities": {
    "mallUserId": 202
  },
  "idempotencyKey": "9:run-id:order-conversion-node-id:3",
  "deadlineAt": "2026-08-24T10:00:15.000Z",
  "execution": {
    "workflowId": "workflow-id",
    "revision": 2,
    "runId": "run-id",
    "nodeId": "order-conversion-node-id",
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

节点输出是布尔值 `result`，编辑器展示为「操作结果」：

```json
{
  "result": true
}
```

订单号变量解析为空、空白或超过 64 个字符时，输出：

```json
{
  "result": false
}
```

本地参数失败或 Java 返回 `success === false` 时，节点输出 `result: false` 并继续走默认出口，让后续条件分支处理业务失败。

系统不可用、超时、非法信封和未知结果不属于 `result: false`：

- 非 HTTP 200、网络异常和超时属于 retryable
- HTTP 200 下的非法 JSON、非法 envelope 属于 terminal
- 参数非法、小店用户身份不可用属于 terminal

Java HTTP 200 响应必须使用标准信封：

```json
{
  "data": null,
  "error": 0,
  "errorMsg": "",
  "success": true
}
```

- `success === true` 表示操作成功，不要求也不读取 `error` / `errorMsg`，输出 `result: true`
- `success === false` 表示业务操作未成功，输出 `result: false` 并继续默认出口
- `success` 缺失或类型错误，或失败响应缺少安全整数 `error` / 字符串 `errorMsg` 时，视为非法 envelope 并 terminal
- 该接口不依赖 `data` 返回业务结果

## 4. 幂等与错误

- 相同 `idempotencyKey` 和相同请求重复调用，Java 应返回相同结果，不重复转积分
- 相同 `idempotencyKey` 但主体或订单号不同，Java 应返回 terminal conflict
- timeout 的执行结果未知，Node 会使用同一个 `idempotencyKey` 重试
- Java 不叠加无上限的长期重试；Workflow Runtime 是重试调度权威
- 幂等查询参数沿用现有 Action 惯例 `idempotentKey`

## 5. 当前发布边界

代客转积分为 `runtime-ready`。生产 Worker 注册 `mall.order.convert@1:action`，路由到真实 Java Adapter `POST /third-internal/mall-order/transfer-order-point`。发布门禁可以放行配置完整且订单号变量有效的代客转积分节点。
