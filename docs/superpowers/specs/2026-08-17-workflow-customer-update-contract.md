# Workflow 修改客户资料跨服务契约

- 状态：Node 侧契约已冻结，Java Endpoint 与真实 Adapter 待实现
- 适用节点：ChatAI SOP、WeCom SOP 的修改客户资料
- Capability：`customer.update`，Contract Version `1`

## 1. 职责

Node 负责：

- 从已启用客户属性中选择最多 10 个不重复字段
- 将固定内容或节点变量解析成字段值
- 对 DATE、AGE 的字符串值做日期转换；转换失败时跳过该字段，不中断流程
- 把本次仍有效的字段合并为一个批量命令
- 生成并重用稳定 `idempotencyKey`
- 管理 timeout、retry、terminal failure 和节点结果

Java 负责：

- 按 `subjectType + subjectId` 解析客户身份
- 再次校验字段存在、启用、属于当前租户且类型匹配
- 在一个批量接口中更新全部字段，禁止 Node 按字段逐次调用
- 持久化幂等结果，并对同一幂等键返回第一次执行的相同结果

## 2. 请求

真实 Adapter 必须把 Runtime 的 Action 请求完整传给 Java。逻辑结构如下：

```json
{
  "capabilityKey": "customer.update",
  "contractVersion": 1,
  "uid": 9,
  "subjectType": "chatai_contact",
  "subjectId": "third-external-user-id",
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

- `subjectType` 支持 `chatai_contact` 和 `wecom_contact`
- `chatai_contact` 的 `subjectId` 是 `thirdExternalUserId`
- `wecom_contact` 的 `subjectId` 是 `externalUserId`
- Java 必须按 `subjectType` 解析身份，禁止根据 ID 格式猜测主体域
- `updates` 最多 10 项，`fieldId` 不重复
- `fieldType` 仅支持 `1 TEXT`、`4 DATE`、`5 PHONE`、`6 EMAIL`、`11 NUMBER`、`12 AGE`
- DATE、AGE 接受完整年月日字符串或 ISO 日期时间，传给 Java 的有效值统一为 `YYYY-MM-DD`；无法转换的字符串不会出现在 `updates` 中
- 所有 DATE、AGE 都无法转换时，`updates` 可以为空，Java 应按幂等空操作返回成功
- `source` 固定为语义枚举 `workflow`
- `execution` 只用于排障，不参与业务判断

## 3. 响应

成功响应：

```json
{}
```

修改客户资料不提供业务输出。下游需要引用节点完成时间时，统一使用该节点生命周期的 `exitedAt`。

## 4. 幂等与错误

- 相同 `idempotencyKey` 和相同请求重复调用，Java 返回相同的成功空对象，不重复修改客户资料
- 相同 `idempotencyKey` 但主体或命令不同，Java 返回 terminal conflict
- `updates` 为空视为幂等成功，不调用单字段更新接口
- timeout 的执行结果未知，Node 会使用同一个 `idempotencyKey` 重试整个批次
- 临时不可用、限流和依赖超时返回 retryable
- 客户不存在、字段不存在、字段被停用、字段类型变化或无权限返回 terminal
- Java 不叠加无上限的长期重试；Workflow Runtime 是重试调度权威

## 5. 当前发布边界

在 Java 批量 Endpoint 和真实 Adapter 完成前，修改客户资料保持 `draft-ready`。生产 Worker 加载类型化 Binding，但 Runtime 发布和执行门禁不会放行该节点。测试使用 Fake Capability Port 验证批量命令，不引入生产 Mock。
