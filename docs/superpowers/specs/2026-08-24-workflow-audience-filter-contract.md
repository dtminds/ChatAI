# Workflow 人群筛选跨服务契约

- 状态：编辑、保存、编译和生产 Worker 已接通，节点为 `runtime-ready`
- 适用节点：ChatAI SOP、WeCom SOP 的人群筛选
- Capability：`cdp.group.check-contact`，Contract Version `1`

## 1. 职责

Node 负责：

- 校验用户选择了 1 到 3 个 ID 不重复的人群包快照 `{ id, name }`，以及匹配方式 `any` / `all` / `none`
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
  "success": true
}
```

解码规则：

- `success === false` 视为业务拒绝，terminal
- 只有 `success === true` 视为查询成功；`error` 只用于失败诊断
- `data.exist` 必须是 boolean
- `data.groupIds` 与请求 ID 求交集；请求外 ID 忽略，不 terminal
- `groupIds` 中的非法项（非正整数）和重复命中 ID 视为返回结果异常，terminal
- 节点输出不复制 Java 的 `error` / `errorMsg`

匹配规则（membership = `result.groupIds ∩ config.groups[].id`）：

- 交集是匹配权威；`exist` 不参与 `any` / `all` / `none` 判定
- 交集为空时按空集计算，不把 `exist === true` 视为全部命中
- `any`：命中数量 > 0
- `all`：命中数量等于已选唯一人群包数量
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
GET /api/server/workflow/audience-groups?page=1&pageSize=20&name=
```

- `page` 从 1 开始，默认 `1`
- `pageSize` 默认 `20`，最大 `50`
- `name` 可选，按人群包名称搜索，空值不传给 Java
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
  "uid": 9,
  "userType": 1,
  "name": "高价值客户"
}
```

- `userType` 固定为 `1`（企微客户人群包），由 Backend 写入，不接受前端选择
- `name` 仅在公开查询提供非空名称时转发

Java 成功响应（业务字段统一放在 `data`）：

```json
{
  "data": {
    "count": 2,
    "hasNext": false,
    "list": [
      {
        "conditions": "近30天消费大于1000",
        "createType": 1,
        "groupNum": 12,
        "id": 301,
        "name": "高价值客户",
        "peopleCalculateTime": "2026-08-24 10:00:00"
      }
    ],
    "page": 1,
    "pageSize": 20
  },
  "error": 0,
  "errorMsg": "",
  "success": true
}
```

Node 映射规则：

- 只读取 `data.list`；顶层业务字段不兼容读取
- 列表项读取 `id`、`name`，以及展示字段 `conditions`、`createType`、`groupNum`、`peopleCalculateTime`
- `conditions` 为规则展示条目，字符串按换行拆成数组，字符串数组逐条截断，最多 20 条；不进入节点配置
- `createType` 仅接受 `1`（规则配置）和 `2`（数据导入）；`groupNum` 为不少于 0 的整数；计算时间按 Java 原文回传，不做时区换算
- 节点配置快照仍只保存 `id` 和 `name`
- `id` 接受 JSON number 或数字字符串，映射为正整数；无效项和重复 ID 跳过，按 Java 返回顺序保留当前页
- 公开响应为 `{ groups, pagination: { hasNext, page, pageSize, total } }`，`total` 来自 Java `count`
- `HTTP 200` 且 `success === true` 视为列表成功；`error` 只用于失败诊断
- 列表失败时弹窗展示重试；已选快照仍回显

设置面板：

- 弹窗用分页表格选择人群包，最多 3 个；表格展示名称、规则、总人数、上一次计算完成时间
- 规则列：`createType === 2` 展示「导入创建」标签，其余按 `conditions` 逐条展示灰底文案
- 弹窗提示「当前仅支持选择企微客户人群包」，表格按 `name` 搜索，防抖后回第一页
- 左下角展示已选择数量和清空
- 匹配方式：满足任一 / 满足全部 / 均不包含
- 节点输出由统一 `NodeOutputsSection` 展示

## 6. 发布边界

人群筛选为 `runtime-ready`。生产 Worker 注册 `cdp.group.check-contact@1:query`。
