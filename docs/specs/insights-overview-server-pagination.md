# 会话洞察总览列表：服务端分页 + 筛选

## 背景

当前总览页的会话列表一次性拉取全量数据，所有筛选（关键词、解决状态、标签、实体、意图、分析状态）都在前端内存完成。数据量大时存在性能瓶颈，需要改为服务端分页 + 筛选。

---

## 一、API 契约变更

### 1.1 请求参数

将 `InsightOverviewQuery` 扩展为：

```typescript
export type InsightOverviewQuery = {
  from?: string;
  to?: string;
  // 分页
  page?: number;       // 默认 1
  pageSize?: number;    // 默认 20，最大 100
  // 筛选（全部可选）
  keyword?: string;               // 模糊搜索问题摘要、诉求
  customerId?: string;            // 精确匹配客户 ID
  agentId?: string;               // 精确匹配客服 ID
  resolutionStatus?: string;      // resolved | unresolved | partially_resolved | no_customer_problem | unknown
  analysisStatus?: string;        // ready | partial | failed | stale
  tagCode?: string;
  entityName?: string;
  intentCode?: string;
  problemScope?: string;          // all | problem | unresolved
};
```

### 1.2 响应结构

将 `InsightsOverviewResponse.sessions` 从数组改为分页结构：

```typescript
// Before
sessions: Type.Array(InsightOverviewSessionItemSchema)

// After
sessions: Type.Object({
  items: Type.Array(InsightOverviewSessionItemSchema),
  total: Type.Number(),   // 满足筛选条件的总条数
  page: Type.Number(),
  pageSize: Type.Number(),
  totalPages: Type.Number(),
})
```

其余字段（totals, trend, analysis 等统计聚合）不变，仍然基于全量数据计算。

---

## 二、后端变更

### 2.1 Repository 层

`listCurrentSessions` 方法签名变更为：

```typescript
async listCurrentSessions(
  scope: InsightsUidScope,
  filters: InsightsOverviewFilters & {
    keyword?: string;
    customerId?: string;
    agentId?: string;
    resolutionStatus?: string;
    analysisStatus?: string;
    tagCode?: string;
    entityName?: string;
    intentCode?: string;
    problemScope?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<{ items: InsightCurrentSessionRow[]; total: number }>
```

实现要点：

1. **COUNT 查询**：先执行一次 `SELECT COUNT(*)` 获取满足条件的总行数（不含 LIMIT/OFFSET）
2. **筛选条件**：将原来前端的筛选逻辑下推到 SQL WHERE 子句
   - `keyword`：模糊匹配 problem_summary, summary_customer_intent
   - `customerId`：精确匹配 logical_session 的 customer_id（需确认字段名）
   - `agentId`：精确匹配 logical_session 的 agent_id（需确认字段名）
   - `resolutionStatus`：精确匹配 problem.resolution_status
   - `analysisStatus`：需要关联 snapshot.status，做映射
   - `tagCode`：JOIN session_insight_tag 表
   - `entityName`：JOIN session_insight_entity 表
   - `intentCode`：JOIN session_insight_intent 表
   - `problemScope`：
     - `problem`：排除 no_customer_problem 和 unknown
     - `unresolved`：仅 unresolved 和 partially_resolved
3. **分页**：`LIMIT pageSize OFFSET (page - 1) * pageSize`
4. **排序**：按 `session.started_at DESC`（最新在前）
5. **水合**：只对当前页的 sessionIds 执行 hydrateCurrentSessionActors 和 hydrateCurrentSessionTopics

### 2.2 Service 层

`getOverview` 方法需要拆分：
- **统计聚合**（totals, trend, analysis 等）保持不变，独立查询
- **会话列表**：接受筛选 + 分页参数，调用新的 `listCurrentSessions`

### 2.3 Controller 层

路由 `GET /server/insights/overview` 的 query schema 更新，接收新增的筛选和分页参数。

---

## 三、前端变更

### 3.1 接口调用

`getInsightOverview` 签名更新：

```typescript
export type InsightOverviewQuery = {
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  keyword?: string;
  customerId?: string;
  agentId?: string;
  resolutionStatus?: string;
  analysisStatus?: string;
  tagCode?: string;
  entityName?: string;
  intentCode?: string;
  problemScope?: string;
};
```

### 3.2 状态管理

将以下筛选状态从本地 `useState` 提升为请求参数：

| 前端状态 | 对应请求参数 |
|---------|------------|
| `keyword` | `keyword` |
| `selectedCustomer` | `customerId` |
| `selectedAgent` | `agentId` |
| `resolutionFilter` | `resolutionStatus` |
| `analysisStatusFilter` | `analysisStatus` |
| `tagFilter` | `tagCode` |
| `entityFilter` | `entityName` |
| `intentFilter` | `intentCode` |
| `problemFilter` | `problemScope` |

新增状态：

```typescript
const [page, setPage] = useState(1);
const pageSize = 20;
```

### 3.3 数据加载

将原来的 `useEffect` 改为：筛选条件或日期变化时重置 `page = 1`，然后请求：

```typescript
useEffect(() => {
  getInsightOverview({
    from, to,
    page, pageSize,
    keyword: debouncedKeyword,
    customerId: selectedCustomer?.id,
    agentId: selectedAgent?.id,
    resolutionStatus: resolutionFilter !== "all" ? resolutionFilter : undefined,
    analysisStatus: analysisStatusFilter !== "all" ? analysisStatusFilter : undefined,
    tagCode: tagFilter !== "all" ? tagFilter : undefined,
    entityName: entityFilter !== "all" ? entityFilter : undefined,
    intentCode: intentFilter !== "all" ? intentCode : undefined,
    problemScope: problemFilter !== "all" ? problemFilter : undefined,
  }).then(setOverview);
}, [from, to, page, debouncedKeyword, selectedCustomer, selectedAgent, resolutionFilter, ...]);
```

### 3.4 移除前端筛选逻辑

- 删除 `sessions` 的 `useMemo` 筛选逻辑
- 直接使用 `overview.sessions.items`
- Badge 数字 `rows.length/total` 改为 `overview.sessions.total`

### 3.5 分页组件

在表格下方添加分页控件：

```
显示 {startRow}-{endRow} / 共 {total} 条
[< 上一页]  1  2  3 ... 10  [下一页 >]
```

使用 shadcn 的 `Button` variant="outline" 实现页码按钮，当前页高亮。

### 3.6 关键词防抖

对 `keyword` 做 300ms 防抖，避免每次按键都发请求：

```typescript
const [keyword, setKeyword] = useState("");
const [debouncedKeyword, setDebouncedKeyword] = useState("");
// useDebounce hook，300ms
```

### 3.7 客服/客户搜索选择组件

将现有的客户/客服名文本输入改为**搜索后下拉选中**的组件：

**交互流程**：
1. 用户在输入框中输入关键词（至少 2 个字符）
2. 300ms 防抖后调用搜索接口，返回匹配的客户/客服列表（含 ID、姓名、头像）
3. 用户从下拉列表中选中一项
4. 选中后显示为标签（Badge），可点击 X 清除

**接口**：需要新增一个搜索接口

```
GET /server/insights/search-persons?type=customer|agent&keyword=xxx&limit=10
```

返回：
```typescript
{
  items: Array<{
    id: string;
    name: string;
    avatarUrl?: string;
  }>
}
```

**前端组件**：`PersonSearchSelect`
- Props: `type: "customer" | "agent"`, `value?: { id, name }`, `onChange: (value) => void`
- 内部维护 keyword 状态、debounce、下拉列表状态
- 使用 shadcn 的 `Popover` + `Command` 或自定义下拉实现

**替换位置**：
- 原来的"搜索客户、客服、问题"输入框拆分
- keyword 输入框只搜问题摘要和诉求
- 新增两个 PersonSearchSelect（客户、客服）

### 3.8 筛选器选项

筛选器的选项（标签列表、实体列表等）有两种方案：

**方案 A**：保持现有方式，从 `overview` 响应的统计数据中获取（totals/trend 等聚合不受分页影响，但 entityHotspots/intentDistribution 等仍在响应中）

**方案 B**：筛选器选项单独接口（推荐，如果选项数据量也大）

当前先用方案 A，不影响现有逻辑。

---

## 四、涉及文件

| 文件 | 变更 |
|------|------|
| `packages/contracts/src/insights/dto.ts` | 修改 InsightOverviewQuery 和 InsightsOverviewResponse |
| `apps/backend/src/modules/insights/insights.service.ts` | 拆分 getOverview，列表走分页 |
| `apps/backend/src/modules/insights/insights.repository.ts` | listCurrentSessions 改为支持筛选 + 分页 |
| `apps/backend/src/modules/insights/insights.controller.ts` | 更新路由参数校验，新增 search-persons 路由 |
| `apps/web/src/pages/chat/insights/api/insights-service.ts` | 更新请求参数，新增 searchPersons |
| `apps/web/src/pages/chat/insights/insights-overview-page.tsx` | 移除前端筛选，加分页控件，接入新接口 |
| `apps/web/src/pages/chat/insights/person-search-select.tsx` | 新增客户/客服搜索选择组件 |
| `packages/contracts/test/insights-dto.test.ts` | 更新 schema 测试 |
| `apps/backend/test/modules/insights/insights-repository.test.ts` | 新增分页 + 筛选测试 |

---

## 五、验收标准

1. 列表只返回当前页数据，不再全量拉取
2. 所有筛选条件走服务端
3. 切换筛选条件时自动重置到第 1 页
4. 关键词输入有 300ms 防抖，只搜索问题摘要和诉求
5. 客户和客服通过搜索选择组件按 ID 精确筛选
6. 分页器显示总数、当前页、总页数
7. 统计卡片（totals）和趋势图不受分页影响
8. 业务洞察页的相关会话表格暂不改动（数据量通常较小）
