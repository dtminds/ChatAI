# Workflow 关联订单跨服务契约

- 状态：Worker Adapter 已接通；Java 成功信封以 `error === 0` 为准
- 适用节点：ChatAI SOP、WeCom SOP 的关联订单
- Capability：`order.bind`，Contract Version `1`
- Java：`POST /third-internal/one-id/order-bind`

## 1. 职责

Node 负责：

- 从当前节点可用的文本或数字变量中选择一个订单号
- 发布时校验该变量可达且类型仍是文本或数字
- 使用 Task 执行前准备的 `externalUserId` 表达目标客户
- 将解析后的订单号投影成类型化命令
- 生成并重用稳定 `idempotencyKey`
- 将 Java 关联结果映射为节点输出 `result`
- 管理 timeout、retry、terminal failure 和节点结果

Java 负责：

- 使用请求中的 `externalUserId` 和 `uid` 定位企微客户
- 按渠道订单号把订单关联到该客户画像
- 同一客户重复关联同一订单视为成功
- 订单不存在或已被其他客户占用时返回明确业务失败，而不是协议错误
- 持久化幂等结果，并对同一幂等键返回第一次执行的相同结果

用户在节点上只配置订单号。`externalUserId` 和 `uid` 由 Runtime 上下文提供，不进入编辑器配置。

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

Java 请求按现有 third-internal 惯例发送扁平 JSON，Swagger 参数名 `reqTO` 对应 `@RequestBody`：

```json
{
  "existAcctSkip": true,
  "externalUserId": 101,
  "orderBind": true,
  "source": 28,
  "tradeNo": "SO20260821001",
  "uid": 9
}
```

约束：

- `subjectType` 支持 `chatai_contact` 和 `wecom_contact`
- Worker 必须使用 Prepared Identity 中的 `externalUserId`，不得直接把 Run `subjectId` 当作 Java 客户 ID
- `tradeNo` 取自命令中的 `orderNumber`，为 1 至 64 个字符的非空字符串
- 命令里的 `source: "workflow"` 只是 Node 语义枚举，不发给 Java
- Java `source` 固定为 `28`（通过 ChatAI SOP 关联）
- `orderBind` 固定为 `true`，`existAcctSkip` 固定为 `true`
- 不传 `limit`，沿用 Java 单渠道默认上限 5
- `execution` 只用于排障，不参与业务判断

## 3. 响应与节点输出

节点输出是布尔值 `result`，编辑器展示为「操作结果」：

```json
{
  "result": true
}
```

业务失败时节点仍然完成，输出：

```json
{
  "result": false
}
```

流程继续走默认出口，由后续条件分支消费 `操作结果`。

订单号变量解析为空或空白时，同样输出 `false` 并继续默认出口，不调用 Java。这让后续条件分支可以处理「未抽到订单号」。

系统不可用、超时、非法信封和未知结果不属于 `result: false`：

- 非 HTTP 200、网络异常和超时属于 retryable
- HTTP 200 下的非法 JSON、非法 envelope 属于 terminal
- 配置非法、客户身份不可用、订单号超过 64 个字符属于 terminal

Java HTTP 200 且 `error` 为安全整数时：

- `error === 0` 映射为 `true`
- 其它整数 `error` 映射为 `false`，节点完成并继续默认出口

不把 `success` 字段当作成功条件。

## 4. 幂等与错误

- 相同 `idempotencyKey` 和相同请求重复调用，Java 应返回相同结果，不重复关联
- 相同 `idempotencyKey` 但主体或订单号不同，Java 应返回 terminal conflict
- 同一客户重复关联同一订单视为幂等成功，`result` 为 `true`
- timeout 的执行结果未知，Node 会使用同一个 `idempotencyKey` 重试
- Java 不叠加无上限的长期重试；Workflow Runtime 是重试调度权威
- 幂等查询参数沿用现有 Action 惯例 `idempotentKey`

## 5. 当前发布边界

关联订单为 `runtime-ready`。生产 Worker 注册 `order.bind@1:action`，路由到真实 Java Adapter `POST /third-internal/one-id/order-bind`。发布门禁可以放行配置完整、订单号变量可达且类型为文本或数字的关联订单节点。
