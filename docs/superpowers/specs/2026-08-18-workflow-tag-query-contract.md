# Workflow 标签查询跨服务契约

- 状态：Node 侧契约已冻结，Java Endpoint 与真实 Adapter 待实现
- 适用节点：ChatAI SOP、WeCom SOP 的标签查询
- Capability：`customer.tag.query`，Contract Version `1`

## 1. 职责

Node 负责：

- 校验匹配方式以及 1 至 5 个标签 ID
- 使用 Run 已确定的 `subjectType + subjectId` 表达目标客户
- 校验 Java 返回的标签属于本次查询且没有重复
- 按配置中的标签顺序生成是否匹配、匹配标签名和匹配标签数量
- 管理 timeout、retry、terminal failure 和节点结果

Java 负责：

- 按 `subjectType + subjectId` 解析客户身份
- 校验标签存在、可用且属于当前租户
- 返回该客户在查询标签中的实际匹配项及当前权威标签名

## 2. 请求

真实 Adapter 必须把 Runtime 的 Query 请求完整传给 Java。逻辑结构如下：

```json
{
  "capabilityKey": "customer.tag.query",
  "contractVersion": 1,
  "uid": 9,
  "subjectType": "chatai_contact",
  "subjectId": "third-external-user-id",
  "deadlineAt": "2026-08-18T10:00:15.000Z",
  "execution": {
    "workflowId": "workflow-id",
    "revision": 2,
    "runId": "run-id",
    "nodeId": "tag-query-node-id",
    "sequence": 3
  },
  "command": {
    "tagIds": [301, 302]
  }
}
```

约束：

- `subjectType` 支持 `chatai_contact` 和 `wecom_contact`
- `chatai_contact` 的 `subjectId` 是 `thirdExternalUserId`
- `wecom_contact` 的 `subjectId` 是 `externalUserId`
- Java 必须按 `subjectType` 解析身份，禁止根据 ID 格式猜测主体域
- `tagIds` 包含 1 至 5 个不重复的正整数 ID
- Query 不产生副作用，不携带 `idempotencyKey`
- `execution` 只用于排障，不参与业务判断
- `matchMode` 只存在于 Node 执行配置，不传给 Java；Java 不判断 `any`、`all` 或 `none`

## 3. 响应与节点输出

Java 成功响应：

```json
{
  "matchedTags": [
    { "id": 301, "name": "重点客户" },
    { "id": 302, "name": "已成交" }
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

- `matchedTags` 必须严格表示「请求 `tagIds` 与客户当前标签的交集」，不能按匹配方式返回缺失标签或自行过滤结果
- `matchedTags` 只能包含请求中的标签 ID，每个 ID 最多出现一次
- Node 按 `tagIds` 的配置顺序生成 `matchedTagNames`，多个名称使用中文顿号 `、` 分隔
- `matchedTagCount` 是实际匹配标签数
- `any` 在至少匹配一个标签时为 `true`
- `all` 仅在全部查询标签均匹配时为 `true`
- `none` 仅在一个查询标签都未匹配时为 `true`
- 空结果在 `any`、`all` 模式下输出 `matched: false`，在 `none` 模式下输出 `matched: true`；匹配标签名均为空字符串，数量为 `0`

## 4. 错误

- 临时不可用、限流和依赖超时返回 retryable
- 参数非法、客户不存在、标签不存在或无权限返回 terminal
- 响应包含请求外标签、重复标签或缺少名称时，Node 按 terminal 输出错误停止流程
- Java 不叠加无上限的长期重试；Workflow Runtime 是重试调度权威

## 5. 当前发布边界

在 Java Endpoint 和真实 Adapter 完成前，标签查询保持 `draft-ready`。生产 Worker 加载类型化 Binding，但 Runtime 发布和执行门禁不会放行该节点。测试使用 Fake Capability Port 验证 Query 命令和结果映射，不引入生产 Mock。
