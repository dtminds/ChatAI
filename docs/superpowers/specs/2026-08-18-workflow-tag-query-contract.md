# Workflow 标签查询跨服务契约

- 状态：Node 与 Java 真实执行链路已接通
- 适用节点：ChatAI SOP、WeCom SOP 的标签查询
- Capability：`customer.tag.query`，Contract Version `1`

## 1. 职责

Node 负责：

- 校验匹配方式以及 1 至 5 个标签 ID
- 使用本次 Task Prepare 得到的 `externalUserId` 表达目标客户
- 校验 Java 返回的标签属于本次查询且没有重复
- 按配置中的标签顺序生成是否匹配、匹配标签名和匹配标签数量
- 管理 timeout、retry、terminal failure 和节点结果

Java 负责：

- 按 `uid + externalUserId` 查询企微客户标签
- 使用非空 `tagIds` 将结果限制为请求标签与客户当前标签的交集
- 返回实际匹配项及当前权威标签名

## 2. 请求

Worker 调用：

```http
POST /third-internal/work-tag/get-wecom-contact-tags
Authorization: Bearer <JAVA_INTERNAL_API_TOKEN>
Content-Type: application/json
```

请求体：

```json
{
  "uid": 9,
  "externalUserId": 101,
  "tagIds": [301, 302]
}
```

约束：

- ChatAI SOP 和 WeCom SOP 都先通过 Execution Context Prepare 获得 `externalUserId`
- Worker 不把 `subjectType + subjectId` 传给 Java，也不根据 Subject ID 格式猜测身份
- `tagIds` 包含 1 至 5 个不重复的正整数 ID
- Workflow 不调用省略 `tagIds` 的全量查询模式
- Query 不产生副作用，不携带 `idempotencyKey`
- `matchMode` 只存在于 Node 执行配置，不传给 Java；Java 不判断 `any`、`all` 或 `none`

## 3. 响应与节点输出

Java 成功响应 envelope：

```json
{
  "success": true,
  "error": 0,
  "data": [
    {
      "groupAttr": 1,
      "groupId": 30,
      "groupName": "客户阶段",
      "groupSort": 10,
      "id": 301,
      "name": "重点客户",
      "type": 0
    }
  ]
}
```

Node 输出：

```json
{
  "matched": true,
  "matchedTagNames": "重点客户、已成交",
  "matchedTagCount": 2
}
```

输出规则：

- 只有 HTTP 200 且 `success === true` 表示查询成功
- HTTP 200 且 `success === false` 表示 Java 已完成请求并明确拒绝该业务查询，Node 按 terminal 停止流程
- `data` 严格表示「请求 `tagIds` 与客户当前标签的交集」，不是客户的全部标签
- `data: null` 或缺失按空交集处理
- Worker 只投影正整数 `id` 和 1 至 256 字符的非空 `name`；其他 TagTO 字段不进入 Node Result
- `data` 只能包含请求中的标签 ID，每个 ID 最多出现一次
- Node 按 `tagIds` 的配置顺序生成 `matchedTagNames`，多个名称使用中文顿号 `、` 分隔
- `matchedTagCount` 是实际匹配标签数
- `any` 在至少匹配一个标签时为 `true`
- `all` 仅在全部查询标签均匹配时为 `true`
- `none` 仅在一个查询标签都未匹配时为 `true`
- 空结果在 `any`、`all` 模式下输出 `matched: false`，在 `none` 模式下输出 `matched: true`；匹配标签名均为空字符串，数量为 `0`

## 4. 超时与错误

- Runtime 使用统一的 Capability deadline（默认 15 秒，由 `WORKFLOW_CAPABILITY_TIMEOUT_MS` 配置），并通过 AbortSignal 取消 Java 请求
- 网络失败、超时和任意非 HTTP 200 响应返回 retryable
- HTTP 200 下的 `success === false`、非法 JSON、非法 envelope 或非法成功数据返回 terminal
- 响应包含请求外标签、重复标签或缺少名称时，Node 按 terminal 输出错误停止流程
- Java 不叠加无上限的长期重试；Workflow Runtime 是重试调度权威
- Worker 不记录请求身份或原始响应；`success === false` 时仅将 Java `error` 和标准字段 `errorMsg` 写入受控长度的内部诊断日志，不读取兼容字段 `error_msg`，也不将其作为用户可见错误文案

## 5. 发布边界

标签查询为 `runtime-ready`。生产 Worker 注册 `customer.tag.query@1:query` 路由到真实 Java Adapter；Runtime 发布和执行门禁允许该节点。ChatAI SOP 和 WeCom SOP 的节点白名单保持不变。
