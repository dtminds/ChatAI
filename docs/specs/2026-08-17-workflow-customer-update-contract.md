# Workflow 修改客户资料跨服务契约

- 状态：Node 与 Java 生产执行链路已接通
- 适用节点：ChatAI SOP、WeCom SOP 的修改客户资料
- Capability：`customer.update`，Contract Version `1`

## 1. 职责

Node 负责：

- 从已启用客户属性中选择最多 10 个不重复字段
- 使用 Task 执行前准备的 `externalUserId` 表达目标客户
- 将固定内容或节点变量解析成字段值
- 对 DATE、AGE 的字符串值做日期转换；转换失败时跳过该字段，不中断流程
- 节点变量解析为空字符串时跳过该字段，不将其作为清空客户属性的请求
- 把本次仍有效的字段合并为一个批量命令；无有效字段时直接按成功空操作完成
- 将 NUMBER 转成不含科学计数法的普通十进制字符串
- 生成并重用稳定 `idempotencyKey`
- 管理 timeout、retry、terminal failure 和节点结果

Java 负责：

- 使用请求中的 `externalUserId` 定位企微客户
- 再次校验字段存在、启用、属于当前租户且类型匹配
- 在一个批量接口中全量成功或全量失败，禁止部分更新
- 持久化幂等结果，并对同一幂等键返回第一次执行的相同结果

## 2. Runtime Command

Runtime 在调用 Worker Port 前生成以下类型化命令：

```json
{
  "capabilityKey": "customer.update",
  "contractVersion": 1,
  "uid": 9,
  "subjectType": "chatai_contact",
  "subjectId": "third-external-user-id",
  "identities": {
    "externalUserId": 101
  },
  "idempotencyKey": "9:run-id:customer-update-node-id:3",
  "deadlineAt": "2026-08-17T10:00:15.000Z",
  "execution": {
    "workflowId": "workflow-id",
    "revision": 2,
    "runId": "run-id",
    "nodeId": "customer-update-node-id",
    "sequence": 3
  },
  "command": {
    "source": "workflow",
    "updates": [
      { "fieldId": 101, "fieldType": 1, "value": "重点客户" },
      { "fieldId": 102, "fieldType": 12, "value": "1995-04-18" },
      { "fieldId": 103, "fieldType": 11, "value": 12.5 }
    ]
  }
}
```

约束：

- ChatAI SOP 和 WeCom SOP 都先通过 Execution Context Prepare 获得数字型 `externalUserId`
- Worker 使用 Prepared Identity 中的 `externalUserId`，不根据 `subjectType` 或 `subjectId` 猜测 Java 客户 ID
- `updates` 最多 10 项，`fieldId` 不重复
- `fieldType` 仅支持 `1 TEXT`、`4 DATE`、`5 PHONE`、`6 EMAIL`、`11 NUMBER`、`12 AGE`
- 字段值必须非空；当前节点不支持清空客户属性
- DATE、AGE 接受完整年月日字符串或 ISO 日期时间，传给 Java 的有效值统一为 `YYYY-MM-DD`；无法转换的字符串不会出现在 `updates` 中
- 所有 DATE、AGE 都无法转换时，`updates` 可以为空；Worker 直接返回成功，不调用 Java
- `source` 固定为语义枚举 `workflow`

## 3. Java HTTP 请求

```text
POST /third-internal/custom-field/update-contact-custom-field?idempotentKey=<stable-key>
```

```json
{
  "externalUserId": 101,
  "fieldValues": [
    { "fieldId": 101, "value": "重点客户" },
    { "fieldId": 102, "value": "1995-04-18" },
    { "fieldId": 103, "value": "12.5" }
  ],
  "uid": 9
}
```

映射：

- `externalUserId` 来自 Prepared Identity，不直接使用 Run `subjectId`
- `fieldValues` 与 Runtime `updates` 一一对应，但不传 `fieldType`
- TEXT、PHONE、EMAIL 保持 Runtime 已校验并归一化的字符串
- DATE、AGE 统一为 `YYYY-MM-DD`
- NUMBER 转为不含科学计数法的普通十进制字符串
- `idempotentKey` 使用 Runtime 稳定 Execution Key，放在 GET query 参数中

## 4. 响应

成功响应：

```json
{
  "data": true,
  "error": 0,
  "errorMsg": "",
  "success": true
}
```

只有 HTTP 200、`success === true` 且 `data === true` 表示成功。Java 的响应字段不进入节点输出，Node Result 保持 `{}`。下游需要引用节点完成时间时，统一使用该节点生命周期的 `exitedAt`。

## 5. 幂等与错误

- 相同 `idempotencyKey` 和相同请求重复调用，Java 返回相同结果，不重复修改客户资料
- 相同 `idempotencyKey` 但请求不同，Java 返回 HTTP 200 + `success: false`
- `updates` 为空视为成功空操作，Worker 不调用 Java
- timeout 的执行结果未知，Node 会使用同一个 `idempotencyKey` 重试整个批次
- 网络异常、超时和任意非 HTTP 200 响应由 Node 分类为 retryable
- HTTP 200 + `success: false` 由 Node 分类为 terminal
- HTTP 200 下非法 JSON、非法 envelope、非法 `success` 或 `data !== true` 是 terminal 契约错误
- Java 不叠加无上限的长期重试；Workflow Runtime 是重试调度权威

## 6. 发布边界

Java Endpoint、真实 Worker Port、生产 Composition 和 Runtime 路径均已接通，修改客户资料为 `runtime-ready`。发布门禁可以放行配置完整且变量引用有效的 Customer Update 节点。
