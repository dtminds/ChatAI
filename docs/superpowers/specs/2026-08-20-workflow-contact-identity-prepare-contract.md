# Workflow 客户身份 Prepare 跨服务契约

- 状态：已接通现有 Java 客户身份接口
- 适用范围：Workflow Task 执行前的临时 Execution Context Prepare
- Java Endpoint：`POST /third-internal/wap-embed-contact/get-contact-identity`

## 1. 目标与职责

Workflow Run 只冻结一个 `subjectType + subjectId`，Entry 的受控 Projection 也可能只包含部分身份。节点执行前，Runtime 根据当前节点的实际需求判断是否需要补全客户关联身份。

Node Runtime 负责：

- 从节点直接身份契约和配置中的 `global.*` Selector 推导本次 Task 的身份需求
- 合并 Run Subject 与 `trigger.projection` 中已经存在的身份
- 仅在所需身份仍缺失时调用一次 Java
- 拒绝用 Java 返回值覆盖已知但不同的身份
- 只把结果注入本次 Task 的 Execution Context，不写回 Run Context
- 将查询失败、身份冲突和节点最终缺失身份映射到明确的 Runtime 失败语义

Java 负责：

- 使用请求中的一个具体身份 ID 查询同一租户客户
- 返回该客户当前已经建立的全部关联身份
- 不要求理解 Workflow 的 `subjectType + subjectId`
- 尚未生成的身份使用缺失值表达，不把查询成功误报为请求失败

## 2. 身份需求与调用频率

节点直接身份需求：

| Node Kind | 所需身份 |
| --- | --- |
| Message、Message Query、Handoff | `thirdExternalUserId` |
| Tag、Tag Query、Order Query、Coupon | `externalUserId` |
| Start、Wait、Wait Event、Branch、End | 无 |
| Customer Update | 当前无直接身份声明 |

任意节点配置出现 `global.*` Selector 时，Runtime 动态判定该节点需要完整 Global Context；当前 Global Context Prepare 的前置身份固定为 `externalUserId`。节点不声明具体全局变量清单。

调用规则：

1. 无身份需求的节点不解析或校验客户身份，也不调用 Java。
2. 所需身份已存在于 Run Subject 或 `trigger.projection` 时，不调用 Java。
3. 缺失一个或多个所需身份时，本次 Task 最多调用 Java 一次；一次响应可以补全多个身份。
4. Prepare 结果不持久化。不同 Task、Task 重试或不同 Worker 会重新根据当时 Context 判断，因此成功空结果不会阻止后续再次查询。
5. 单个 Task 内调用次数为 `0` 或 `1`，不会按缺失字段逐项调用。

## 3. Java 请求

Worker 使用现有 `JAVA_INTERNAL_API_BASE_URL` 和可选的 `JAVA_INTERNAL_API_TOKEN`。配置 token 时发送：

```http
Authorization: Bearer <JAVA_INTERNAL_API_TOKEN>
Content-Type: application/json
```

请求必须携带 `uid`、`type` 和一个具体身份 ID，不发送 `subjectType + subjectId` 让 Java 自行解析。

### 3.1 ChatAI 联系人

```json
{
  "uid": 9,
  "type": 1,
  "thirdExternalUserId": "chatai-contact-id"
}
```

### 3.2 企微客户

```json
{
  "uid": 9,
  "type": 2,
  "externalUserId": 101
}
```

### 3.3 小程序会员

```json
{
  "uid": 9,
  "type": 3,
  "mallUserId": 202
}
```

`type` 枚举冻结如下：

| type | 请求身份字段 |
| --- | --- |
| `1` | `thirdExternalUserId` |
| `2` | `externalUserId` |
| `3` | `mallUserId` |

Runtime 按 Run Subject 选择查询锚点：

```text
chatai_contact -> thirdExternalUserId
wecom_contact -> externalUserId
miniapp_member -> mallUserId
```

## 4. Java 响应

成功响应 envelope：

```json
{
  "success": true,
  "error": 0,
  "errorMsg": "",
  "data": {
    "externalUserId": 101,
    "mallUserId": 202,
    "thirdExternalUserId": "chatai-contact-id",
    "xyId": 303
  }
}
```

响应约束：

- 只有 HTTP 200 且 `success === true` 表示查询成功；不能使用 `error === 0` 替代该判断。
- HTTP 200 且 `success === false` 表示 Java 已完成请求并明确拒绝该业务查询。
- `error`、`errorMsg` 和兼容字段 `error_msg` 不参与成功判定；`success === false` 时仅将 `error` 和标准字段 `errorMsg` 写入受控长度的 Workflow 内部诊断信息，不读取兼容字段 `error_msg`，也不将其作为用户可见错误文案。
- `data` 可以为 `null`、缺失或只包含部分身份，仍属于成功查询。
- `externalUserId`、`mallUserId`、`xyId` 为非负 JavaScript 安全整数；`0` 表示身份尚未生成。
- `thirdExternalUserId` 为字符串；空字符串表示身份尚未生成。
- `0`、空字符串、`null` 和缺失字段不会注入 Prepared Context。
- 非法字段类型、负数或非安全整数属于非法响应。

## 5. 超时与失败分类

Worker 对 Java 请求设置 3 秒超时，并传播上层取消信号。当前失败分类冻结如下：

| 条件 | Runtime 分类 | 错误码 |
| --- | --- | --- |
| 网络异常、超时、HTTP 状态非 200 | retryable | `WORKFLOW_CONTACT_IDENTITY_LOOKUP_FAILED` |
| HTTP 200 且 `success === false` | terminal | `WORKFLOW_CONTACT_IDENTITY_REJECTED` |
| HTTP 200 下的非法 JSON、非法 envelope、非法 `success` 或非法字段类型 | terminal | `WORKFLOW_CONTACT_IDENTITY_REJECTED` |
| Java 返回身份与 Run Subject 或 Projection 中的已知身份冲突 | terminal | `WORKFLOW_CONTACT_IDENTITY_CONFLICT` |
| Run Subject 无法映射为对应具体身份 ID | terminal | `WORKFLOW_CONTACT_IDENTITY_INVALID` |

查询失败沿用 Workflow Runtime 的 Task 最大次数和指数退避，不在 Adapter 内另建重试。诊断信息不记录原始响应或业务 ID；`success === false` 时可以记录 Java `error` 和标准字段 `errorMsg`，并由 Runtime 统一限制长度。

`success === true` 但节点所需身份仍缺失时，Prepare 本身不统一决定 defer、skip 或 terminal：

- 直接依赖身份的节点在 Command / Port Gate 按自身业务契约失败。
- Global Context 的缺失策略由后续 Global Context Preparer 及节点业务语义决定。
- Prepare 不持久化空结果，也不把“身份尚未生成”转换成统一 defer。

## 6. Execution Context 与持久化边界

Prepared Identity 只进入本次调用中的：

- Core `WorkflowNodeExecutionContext.identities`
- Capability Command Context 和 Worker Capability Request 的 `identities`
- Message Query Command Context 和 Worker Request 的 `identities`

Message 发给 Java 的实际收件人必须使用 Prepared Identity 投影出的
`command.recipient.thirdExternalUserId`。`run.subjectId` 只是带类型的 Workflow Subject，
不得作为 Java `thirdExternalUserid` 的替代来源。Worker 必须校验 Command Recipient 与
Prepared Identity 一致；Workflow Type Policy 是否允许 Message 节点由编译和发布门禁独立控制。

以下位置不得写入补全结果：

- Workflow Run Context
- Node input snapshot
- Capability Ledger 的持久化请求
- Workflow Revision 或 Draft

因此同一 Run 的后续节点可能再次查询 Java；这是延后生成身份和跨 Worker 执行下的预期语义。

## 7. 验收场景

1. 所需身份已知时 Java 调用次数为 `0`。
2. 缺失多个身份时 Java 调用次数为 `1`，并注入所有有效返回身份。
3. `success === true` 且返回 `0`、空字符串或部分字段时，Prepare 成功且不持久化缺失值。
4. Task 重试时，前一次成功空结果不会阻止再次查询。
5. HTTP 状态非 200、网络异常和超时进入 retryable 失败提交；HTTP 200 下的业务拒绝或非法响应进入 terminal 失败提交。
6. 返回身份与已知身份冲突时进入 terminal 失败提交，不静默覆盖。
7. 无身份需求的 Core 节点不会因无关 Subject 或 Projection 身份异常而占用 lease 或触发 Java。
8. Message Query 缺少 Prepared `thirdExternalUserId` 时在查询 MySQL 前 terminal failed。
