# Workflow 人群筛选跨服务契约

- 状态：编辑、保存、编译和生产 Worker 已接通，节点为 `runtime-ready`
- 适用节点：ChatAI SOP、WeCom SOP 的人群筛选
- Capability：`cdp.group.check-contact`，Contract Version `1`

## 1. 职责

Node 负责：

- 校验用户选择了 1 到 3 个人群包快照 `{ id, name }`，以及匹配方式 `any` / `all` / `none`
- 使用本次 Task Prepare 得到的 `externalUserId` 表达目标客户
- 一次调用检查接口，把匹配结果投影为节点输出：`matched`、`matchedGroupNames`、`matchedGroupCount`
- 查询完成后走默认出口；是否匹配由下游条件分支读取节点输出决定
- 管理 timeout、retry、terminal failure 和节点结果

Java 负责：

- 按 `uid + externalUserId + groupIds` 判断客户是否存在于指定人群包
- 返回权威 `exist` 和命中的 `groupIds`

编辑器人群包选择另走分页列表接口，不复用检查接口。

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
  "externalUserId": 101,
  "groupIds": [301, 302],
  "uid": 9
}
```

约束：

- ChatAI SOP 和 WeCom SOP 都先通过 Execution Context Prepare 获得 `externalUserId`
- Worker 不把 `subjectType + subjectId` 传给 Java
- 编辑器最多选择 3 个人群包；Node 把快照投影成 `groupIds`
- 匹配方式留在节点配置，不发给 Java
- 每个 Task 只调用一次 Java，不按人群包循环
- Query 不产生副作用，不携带 `idempotencyKey`

## 3. 检查响应、匹配与输出

Java 成功响应 envelope：

```json
{
  "data": {
    "exist": true,
    "groupIds": [301]
  },
  "error": 0,
  "errorMsg": "",
  "error_msg": "",
  "success": true
}
```

解码规则：

- `success === false` 视为业务拒绝，terminal
- `success === true` 或 `error === 0` 视为查询成功
- `data.exist` 必须是 boolean
- `data.groupIds` 与请求 ID 求交集；请求外 ID 忽略，不 terminal
- 节点输出不复制 Java 的 `error` / `error_msg`

匹配规则（membership = `result.groupIds ∩ config.groups[].id`）：

- 若交集为空且 `exist === true`，把本次选中的人群包都视为命中
- `any`：命中数量 > 0
- `all`：命中数量等于选中数量
- `none`：命中数量 = 0
- 查询成功后走默认出口，不按符合 / 不符合分流

节点输出：

- `matched` boolean 是否匹配
- `matchedGroupNames` string 匹配人群包名，多个名称用顿号 `、` 分隔，名称取自节点配置快照
- `matchedGroupCount` number 匹配人群包数量

## 4. 超时与错误

- Runtime 使用统一的 Capability deadline（默认 15 秒，由 `WORKFLOW_CAPABILITY_TIMEOUT_MS` 配置），并通过 AbortSignal 取消 Java 请求
- 网络失败、超时和任意非 HTTP 200 响应返回 retryable
- HTTP 200 下的失败 envelope、非法 JSON、非法成功数据返回 terminal
- 缺少 `externalUserId` 或人群包执行配置不完整时，在调用 Java 前 terminal
- Java 不叠加无上限的长期重试；Workflow Runtime 是重试调度权威

## 5. 编辑器人群包列表

公开接口：

```http
GET /api/server/workflow/audience-groups?page=1&pageSize=20
```

- `page` 从 1 开始，默认 `1`
- `pageSize` 默认 `20`，最大 `50`
- 一次请求只代理 Java 当前页，不跟随 `hasNext` 自动翻页
- 已选快照由节点配置保存，翻页不额外 hydration

Backend 代理的 Java 路径：

```http
POST /third-internal/cdp-group-operate/list-group
```

请求体：

```json
{
  "page": 1,
  "pageSize": 20,
  "uid": 9
}
```

Java 成功响应（字段在顶层，不包裹 `data`）：

```json
{
  "count": 2,
  "error": 0,
  "errorMsg": "",
  "hasNext": false,
  "list": [
    {
      "createType": 1,
      "groupNum": 12,
      "id": 301,
      "name": "高价值客户",
      "peopleCalculateTime": "2026-08-24 10:00:00"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "success": true
}
```

Node 映射规则：

- 只读取顶层 `list`
- 每项只取 `id` 和 `name`；`createType`、`groupNum`、`peopleCalculateTime` 不进入节点配置
- 跳过无效项和重复 ID，按 Java 返回顺序保留当前页
- 公开响应为 `{ groups, pagination: { hasNext, page, pageSize, total } }`，`total` 来自 Java `count`
- `HTTP 200` 且 `success === true` 或 `error === 0` 视为列表成功
- 列表失败时弹窗展示重试；已选快照仍回显

设置面板：

- 弹窗分页选择人群包，最多 3 个
- 匹配方式：满足任一 / 满足全部 / 均不包含
- 节点输出由统一 `NodeOutputsSection` 展示

## 6. 发布边界

人群筛选为 `runtime-ready`。生产 Worker 注册 `cdp.group.check-contact@1:query`。
