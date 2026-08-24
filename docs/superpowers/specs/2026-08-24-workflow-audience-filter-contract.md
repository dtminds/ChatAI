# Workflow 人群筛选跨服务契约

- 状态：Node 子系统可编辑、保存和编译拦截；生产 Worker Adapter 未接通，节点保持 `draft-ready`
- 适用节点：ChatAI SOP、WeCom SOP 的人群筛选
- Capability：`cdp.group.check-contact`，Contract Version `1`

## 1. 职责

Node 负责：

- 校验用户选择了 1 个人群包快照 `{ id, name }`
- 使用本次 Task Prepare 得到的 `externalUserId` 表达目标客户
- 调用检查接口后只根据 `exist` 选择出口：`matched`（符合）或 `unmatched`（不符合）
- 不把 Java 的 `groupIds`、`error` 投影成节点输出
- 管理 timeout、retry、terminal failure 和节点结果

Java 负责：

- 按 `uid + externalUserId + groupIds` 判断客户是否存在于指定人群包
- 返回权威 `exist`

编辑器人群包下拉另走列表接口，不复用检查接口。

## 2. 检查请求

Worker 调用：

```http
POST /third-internal/cdp-group-operate/check-contact-exist
Authorization: Bearer <JAVA_INTERNAL_API_TOKEN>
Content-Type: application/json
```

运行时发送扁平 JSON，不包裹 `reqTO`：

```json
{
  "uid": 9,
  "externalUserId": 101,
  "groupIds": [301]
}
```

约束：

- ChatAI SOP 和 WeCom SOP 都先通过 Execution Context Prepare 获得 `externalUserId`
- Worker 不把 `subjectType + subjectId` 传给 Java
- 编辑器只允许选择 1 个人群包；Node 把它投影成单元素 `groupIds`
- Query 不产生副作用，不携带 `idempotencyKey`

## 3. 检查响应与路由

Java 成功响应 envelope：

```json
{
  "success": true,
  "error": 0,
  "data": {
    "exist": true,
    "groupIds": [301],
    "error": 0
  }
}
```

路由规则：

- `exist === true` 走 `matched`（符合）
- `exist === false` 走 `unmatched`（不符合）
- 节点输出为 `{}`；下游如需知道节点完成时间，使用 `exitedAt`
- 只有 HTTP 200 且 envelope 成功表示查询成功
- `data.exist` 缺失或无法解码为 boolean 时按 terminal 停止
- `data.groupIds` 和 `data.error` 仅供 Worker 诊断，不进入节点输出

## 4. 超时与错误

- Runtime 使用统一的 Capability deadline（默认 15 秒，由 `WORKFLOW_CAPABILITY_TIMEOUT_MS` 配置），并通过 AbortSignal 取消 Java 请求
- 网络失败、超时和任意非 HTTP 200 响应返回 retryable
- HTTP 200 下的失败 envelope、非法 JSON、非法成功数据返回 terminal
- 缺少 `externalUserId` 或人群包执行配置不完整时，在调用 Java 前 terminal
- Java 不叠加无上限的长期重试；Workflow Runtime 是重试调度权威

## 5. 编辑器人群包列表

公开接口：

```http
GET /api/server/workflow/audience-groups
```

当前 Backend 代理的 Java 路径按协作约定暂定为：

```http
POST /third-internal/cdp-group-operate/list
```

请求体 `{ "uid": 9 }`。该路径和响应字段仍待 Java 确认，确认前不得把节点升为 `runtime-ready`。

Node 映射规则：

- 接受 `data` 为数组，或 `{ groups }` / `{ list }`
- 每项读取 `id` 或 `groupId`，以及 `name` 或 `groupName`
- 跳过无效项和重复 ID，按 Java 返回顺序保留前 200 条
- `200` 是文档化的目录上限，不是对更大结果集的分页页大小
- 列表失败时编辑器 toast「操作失败，请稍后重试」；已选快照仍回显

## 6. 发布边界

人群筛选为 `draft-ready`。生产 Worker 不注册 `cdp.group.check-contact@1:query`。发布和执行门禁保持拦截，直到：

1. Java 确认检查接口的扁平请求体、成功 envelope 和错误分类
2. Java 确认人群包列表路径和响应字段
3. Worker 接入真实 Adapter，且启动组合校验覆盖该 Capability
