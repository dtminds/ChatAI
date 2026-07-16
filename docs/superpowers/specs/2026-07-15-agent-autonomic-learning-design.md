# Agent 自主学习与优化建议联调设计

## 目标

将当前 Agent 管理页 / 优化建议页的 **mock 自主学习态** 与 **mock 候选列表 / 入库忽略操作** 接到真实能力：

1. **自主学习开关**：Node **直接 UPDATE** `xy_wap_embed_agent.auto_learn_enabled`（`0` 关 / `1` 开）。
2. **优化建议条数**：Node **只读 COUNT** `xy_wap_embed_agent_kb_learning_candidate`，条件 `agent_id = 当前 Agent` 且 `status = 0`（待处理）。
3. **入库 / 忽略（单条 + 批量）**：Node **代理** Java `third-internal/wap-embed-agent-learning/*` 接口；**不**直写候选表状态。
4. **候选列表**：Node **只读**候选表分页查询，按 Tab 状态过滤；前端替换 `agent-optimization-suggestions-page.tsx` 内 mock。

本文是 AI 托管 Agent 模块增量 spec，不改变现有 Agent 编辑 / 发布 / 试聊边界（编辑仍为 Node 直写 `xy_wap_embed_agent`）。

## 现状

| 项 | 状态 |
| --- | --- |
| Agent 卡片 UI | 已有卡片布局、自主学习入口、设置弹窗、优化建议跳转 |
| 自主学习数据 | `mockSelfLearningStates`，与 DB / API 无关 |
| 优化建议页 | 路由已通；列表 / 入库 / 忽略均为前端 mock；入库弹窗已接真实 KB / Doc 列表 |
| `xy_wap_embed_agent.auto_learn_enabled` | 平台拟加列；当前 Kysely `schema.ts` **尚未**包含 |
| `xy_wap_embed_agent_kb_learning_candidate` | **DDL 已确认**；codegen **尚未**纳入 |
| Java 写接口 | 已提供 approve / reject / batch-approve / batch-reject |
| 候选列表 Java 接口 | **未提供**；首版由 Node SELECT |

## 命名与模块边界

| 统一术语 | 说明 |
| --- | --- |
| `autoLearn` / `autoLearnEnabled` | Agent 自主学习开关（对应 DB `auto_learn_enabled`） |
| `learningCandidate` / `candidateId` | 学习候选记录（`xy_wap_embed_agent_kb_learning_candidate`） |
| `pendingSuggestionCount` | 待处理优化建议条数（`status = 0`） |
| `approve` / `reject` | 入库 / 忽略 |

| 禁止（新模块） | 改用 |
| --- | --- |
| `suggestion` 作为契约主键字段名 | `candidate` / `candidateId`（UI 文案仍可用「优化建议」） |
| Node 直写候选表 status | 一律走 Java approve / reject |
| 在 URL 暴露 `third-internal` | Node 公开走 `/api/server/ai-hosting/*` |

**路由前缀**

- Node 公开：`/api/server/ai-hosting/agents/*`（扩展开关）、`/api/server/ai-hosting/agents/:agentId/learning-candidates*`（列表与审核）
- Java 内部：`/third-internal/wap-embed-agent-learning/*`

**代码落点**

| 层 | 路径 |
| --- | --- |
| Contracts | `packages/contracts/src/ai-hosting/dto.ts`（列表字段扩展）、新增 `agent-learning.ts`（候选列表与审核 DTO） |
| Backend Agent | `ai-hosting-agent.service.ts`（读 `auto_learn_enabled`、写开关、附带 pending count） |
| Backend Learning | 新增 `agent-learning.service.ts`、`agent-learning.routes.ts`（或挂到现有 `ai-hosting.routes.ts`） |
| Java Client | 新增 `agent-learning-java-client.ts`（或扩 `agent-kb-java-client` 同构独立文件，**不要**塞进 workbench client） |
| DB | `codegen-db.config.json` 纳入候选表；`schema.ts` 重生成后含 `auto_learn_enabled` |
| Web 适配 | `apps/web/src/pages/chat/ai-hosting/api/agent-service.ts`（列表字段）、新增 `agent-learning-service.ts` |
| Web UI | `agent-management-page.tsx`、`agent-optimization-suggestions-page.tsx` |
| Tests | backend agent / learning 路由测试；web `ai-hosting-pages.test.tsx` 行为断言 |

## 读写边界

| 数据 | Node 权限 | 说明 |
| --- | --- | --- |
| `xy_wap_embed_agent.auto_learn_enabled` | **UPDATE** | 表已在 `writable-tables.ts`；仅允许改开关 + `last_operator_id` / `update_time` |
| `xy_wap_embed_agent_kb_learning_candidate` | **SELECT only** | **不**加入白名单；状态变更由 Java 负责 |
| Java approve / reject / batch-* | **代理调用** | Node 注入 `uid`、`operatorId`，转发业务字段 |

硬规则（与 AGENTS.md 一致）：

- 平台候选表不是 Node 可写表；发现数据异常反馈平台，不做补偿写回。
- 浏览器只打 `/api/server/*`，不直连 Java。

## 数据模型

### Agent 表增量

```sql
ALTER TABLE xy_wap_embed_agent
  ADD COLUMN auto_learn_enabled tinyint unsigned NOT NULL DEFAULT 0
    COMMENT '自主学习开关: 0关 1开';
```

| DB | Contracts / API | 说明 |
| --- | --- | --- |
| `auto_learn_enabled` `0`/`1` | `autoLearnEnabled: boolean` | 列表与设置弹窗回显 |

### 候选表（只读，DDL 已确认）

表名：`xy_wap_embed_agent_kb_learning_candidate`  
注释：Agent 自主学习候选表。**不**加入 `writable-tables.ts`。

```sql
-- 核心列（完整 DDL 见平台建表脚本；下列为联调相关）
id, uid, agent_id,
customer_question, agent_answer,           -- 原文（列表可不展示）
suggested_question, suggested_answer,      -- AI 建议标准问答（列表 / 入库默认值）
status,                                    -- 0/1/2/3
ai_reason, user_reason,
target_kb_id, target_doc_id, target_entry_id,
reviewer_id, review_time,
create_time, update_time
-- 溯源列（首版 API 可不返回）：session_id, conversation_id,
-- question_msg_id, answer_msg_id, answer_source,
-- dedup_check_detail, llm_raw_response, confidence
```

**索引与查询建议**

| 索引 | 用途 |
| --- | --- |
| `idx_agent_id (agent_id)` | 卡片 pending count / 按 Agent 列表 |
| `idx_uid_status (uid, status)` | 租户 + 状态过滤 |
| `idx_ai_rejected (uid, status, create_time DESC)` | 同 Tab 列表按时间倒序 |

列表查询约定：

| 用途 | WHERE | ORDER |
| --- | --- | --- |
| 优化建议条数 | `uid = ? AND agent_id = ? AND status = 0` | — |
| Tab 列表 | `uid = ? AND agent_id = ? AND status = ?` | `create_time DESC, id DESC` |

**列表 / 入库字段映射（已定稿）**

| DB 列 | Contracts / API | 前端用途 |
| --- | --- | --- |
| `id` | `id: string` | 候选 ID |
| `suggested_question` | `question` | 卡片标题；单条入库弹窗默认值；**允许编辑**后提交 Java `question` |
| `suggested_answer` | `answer` | 卡片正文；单条入库弹窗默认值；**允许编辑**后提交 Java `answer` |
| `status` | `status` 枚举见下表 | Tab 过滤 |
| `ai_reason` | `rationale`（待处理 / 智能过滤优先） | 「理由」「AI过滤理由」 |
| `user_reason` | 忽略态可优先展示；或合并为 `rationale` | 已忽略理由 |
| `create_time` | `createdAt?: number` | 可选；排序依据 |
| `update_time` / `review_time` | `updatedAt?` / `reviewedAt?` | 可选 |
| `target_kb_id` / `target_doc_id` / `target_entry_id` | 已入库态可选回显 | 首版可不展示 |
| `customer_question` / `agent_answer` | 首版不进 list DTO | 需要「对照原文」时再加 |

`rationale` 映射规则：

| Tab | `rationale` 来源 |
| --- | --- |
| 待处理 / 智能过滤 | `ai_reason` |
| 已忽略 | `user_reason` 非空则用其，否则回退 `ai_reason` |
| 已入库 | `ai_reason`（或空串） |

### 候选 `status` 与前端 Tab（已定稿）

DDL：`0=待处理 1=已入库 2=已忽略 3=智能忽略`

| Tab | 前端 `status` | DB `status` | 说明 |
| --- | --- | --- | --- |
| 待处理 | `pending` | `0` | 卡片 `pendingSuggestionCount` **仅**统计此项 |
| 已入库 | `adopted` | `1` | 无批量操作；Java approve 后写入 |
| 已忽略 | `ignored` | `2` | 用户 reject / batch-reject |
| 智能过滤 | `filtered` | `3` | DDL「智能忽略」；UI 文案仍为「智能过滤」；仅支持再入库，不提供忽略 |

「智能过滤」「已忽略」均可再入库（现有 UI）；「已入库」无批量操作。

> **说明**：`target_doc_id` 注释写「FAQ 类型为 0」与 Java 入库必填 `targetDocId` 并存时，以 **Java 联调约定为准**（入库必须传真实 FAQ docId）。若注释指历史/特殊语义，实现前与平台再确认一次。

### Agent 列表卡片展示态

用 `autoLearnEnabled` + `pendingSuggestionCount` 推导，取代 mock：

| 条件 | 卡片文案 |
| --- | --- |
| `pendingSuggestionCount > 0` | 您有 N 条优化建议（链到优化建议页） |
| `pendingSuggestionCount === 0` 且 `autoLearnEnabled === true` | 已开启 |
| `pendingSuggestionCount === 0` 且 `autoLearnEnabled === false` | 未开启 |

说明：**无论开关是否开启**，只要存在 `status = 0` 待处理记录，卡片优先展示「N 条优化建议」。条数仍只统计 pending，与开关无关。

## Node 公开 API

### 1. Agent 列表扩展（已有接口）

`GET /api/server/ai-hosting/agents`

`AiHostingAgentListItem` 增量：

```ts
{
  autoLearnEnabled: boolean;
  pendingSuggestionCount: number; // status = 0
  // ...既有字段
}
```

实现要点：

- `listAgentRows` SELECT 增加 `auto_learn_enabled`。
- 对本页 `agent_id` 批量 `COUNT(*) ... WHERE status = 0 GROUP BY agent_id`，避免 N+1。
- 无候选时 count = `0`。

### 2. 更新自主学习开关

`PATCH /api/server/ai-hosting/agents/:agentId/auto-learn`

请求：

```ts
{ enabled: boolean }
```

行为：

1. 校验 Agent 在租户 scope 内且未删除。
2. `UPDATE xy_wap_embed_agent SET auto_learn_enabled = enabled ? 1 : 0, last_operator_id = ?, update_time = NOW()`。
3. 返回 `{ autoLearnEnabled, pendingSuggestionCount }`（或完整 list item 子集），供弹窗确定后刷新卡片。

权限：与现有 Agent 写操作一致（可管理子账号）；只读角色不可改。

**会话洞察联动（已确认：不做）**

UI 可保留提示文案「开启AI自主学习将同时开启会话洞察功能」，但本需求 **仅** 更新 `auto_learn_enabled`，**不同步** 打开会话洞察配置。洞察由独立流程开启；文案若与行为不一致，由产品后续单独改文案，不阻塞本联调。

### 3. 候选列表

`GET /api/server/ai-hosting/agents/:agentId/learning-candidates`

Query：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `status` | `pending` \| `adopted` \| `ignored` \| `filtered` | 是 | Tab |
| `page` | number | 否 | 默认 1 |
| `pageSize` | number | 否 | 默认 10，上限沿用项目分页约定 |

响应：

```ts
{
  candidates: Array<{
    id: string;
    question: string;   // suggested_question
    answer: string;     // suggested_answer（null → ""）
    rationale: string;  // 按上表 Tab 规则映射
    status: "pending" | "adopted" | "ignored" | "filtered";
    createdAt?: number; // create_time ms
  }>;
  pagination: { page: number; pageSize: number; total: number };
}
```

校验：Agent 归属当前 `uid`；候选查询带 `uid` + `agent_id` + 映射后的数字 `status`。  
单条入库弹窗初始 `question`/`answer` 取自列表项（即 `suggested_*`），用户可编辑后再提交。

### 4. 单条入库

`POST /api/server/ai-hosting/agents/:agentId/learning-candidates/:candidateId/approve`

请求：

```ts
{
  targetKbId: string;
  targetDocId: string;
  question: string;
  answer: string;
}
```

Node → Java：

`POST /third-internal/wap-embed-agent-learning/approve`

| Java 字段 | 来源 |
| --- | --- |
| `uid` | JWT / session 租户 |
| `id` | `candidateId` |
| `targetKbId` | 请求 |
| `targetDocId` | 请求 |
| `question` / `answer` | 请求（允许用户在弹窗内编辑） |
| `operatorId` | 当前子账号 |

校验：

- Agent / 候选归属。
- `targetKbId`、`targetDocId` 存在且 doc 属于该 kb（可读校验即可）。
- 建议限制 doc 为 FAQ（`doc_type = 1`），与「标准问答入库」语义一致（**待确认**）。

成功：`{ ok: true }` 或 void 包装为项目标准成功响应。

### 5. 单条忽略

`POST /api/server/ai-hosting/agents/:agentId/learning-candidates/:candidateId/reject`

请求：

```ts
{ userReason?: string }
```

→ Java `.../reject`（`uid` / `id` / `operatorId` / 可选 `userReason`）。

### 6. 批量入库

`POST /api/server/ai-hosting/agents/:agentId/learning-candidates/batch-approve`

请求：

```ts
{
  ids: string[]; // 候选 ID
  targetKbId: string;
  targetDocId: string;
}
```

→ Java `.../batch-approve`。

说明：

- Java 文档中 `targetKbId` / `targetDocId` 标为「否」但注释「入库必填」；Node 对入库请求 **强制必填**，避免半成功语义不清。
- **批量入库不传 Q/A**：由 Java 使用各候选行内 `suggested_question` / `suggested_answer`；与单条可编辑语义差异已接受。

响应映射：

```ts
{
  successCount: number;
  failDetails: Array<{ id: string; error: string }>;
}
```

前端：toast 成功条数；若有失败展示摘要后刷新列表。

### 7. 批量忽略

`POST /api/server/ai-hosting/agents/:agentId/learning-candidates/batch-reject`

请求：

```ts
{
  ids: string[];
  userReason?: string;
}
```

→ Java `.../batch-reject`；响应 `updatedCount: number`（映射 Java `data` 整数）。

## Java Client

新建 `agent-learning-java-client.ts`，风格对齐 `agent-kb-java-client.ts`：

- Base URL / timeout / `ApiResponseTO` 解析复用既有 internal API 工具。
- 方法：`approve` / `reject` / `batchApprove` / `batchReject`。
- 业务失败映射为 `BadGatewayError` / `UpstreamHttpError` 等项目既有错误；前端统一「操作失败，请稍后重试」类用户文案（细节错误可打日志）。

## 前端联调行为

### Agent 管理页

1. 列表渲染真实 `autoLearnEnabled` / `pendingSuggestionCount`。
2. 打开设置弹窗时用当前 Agent 的 `autoLearnEnabled` 初始化 Switch。
3. 「确定」调用 PATCH；成功 toast + 刷新列表；失败保留弹窗或 toast。
4. 「X 条优化建议」链接保持现路由。

### 优化建议页

1. 按 Tab + 分页拉真实列表；区分 loading / empty / error。
2. 单条入库：弹窗选 KB + Doc，带出 `suggested_*` 作为 question/answer，**允许编辑**后提交 approve。
3. 批量入库：同一目标 KB/Doc，不展示/不传逐条问答；Java 使用候选行内 `suggested_*`。
4. 忽略：确认后 reject；批量忽略走 batch-reject（可暂不收集 `userReason`，与现 UI 一致）。
5. 「添加知识」跳转 KB 详情带 `?addKnowledge=qa:new` 保持不变。
6. 操作成功后刷新当前 Tab 列表，并尽量让返回列表页时 pending 条数更新（依赖列表重载）。

## 测试计划

| 层 | 覆盖 |
| --- | --- |
| Backend | 开关 UPDATE 字段与租户校验；pending count 聚合；list status 过滤；approve/reject 转发参数；batch 部分失败映射 |
| Contracts | schema 构建与导出 |
| Web | 卡片三态（未开启 / 已开启 / N 条建议）；弹窗保存开关；建议页加载态与入库 / 忽略成功后列表刷新（mock API，不断言文案细节） |
| Build | `contracts` + `backend` + `web` build；相关 Vitest |

## 实施计划（建议 PR 切分）

### PR1 — Schema / Contracts / Agent 列表读开关与条数 + 写开关

1. 目标库已有 `auto_learn_enabled` 与候选表后：把 `xy_wap_embed_agent_kb_learning_candidate` 加入 `codegen-db.config.json`，执行 `pnpm backend:db:codegen`（同时刷新 `xy_wap_embed_agent`）。
2. Contracts：扩展 list item；新增 auto-learn PATCH DTO。
3. Backend：`listAgents` 带 `autoLearnEnabled` + `pendingSuggestionCount`；实现 PATCH 直写。
4. Web：Agent 卡片去 mock；设置弹窗调真实开关 API。
5. 测试 + builds。

### PR2 — 候选列表只读 + 审核写代理

1. Contracts：候选 list / approve / reject / batch DTO（字段按上表映射）。
2. Backend：`agent-learning-java-client` + service + routes；候选 SELECT（`uid`+`agent_id`+`status`，`create_time DESC`）。
3. Web：优化建议页接真实 API，去掉 mockSuggestions；单条入库默认填 `suggested_*`。
4. 测试：含 Java client mock；builds。

### PR3（可选）— 体验打磨

1. 批量失败提示、忽略理由输入、FAQ doc 类型强校验、对照 `customer_question`/`agent_answer` 等。
2. 设置弹窗文案与「不耦合洞察」行为对齐（若产品要改提示）。

## 已确认产品决策

| 项 | 结论 |
| --- | --- |
| 候选表 DDL / status | 已定稿（见上文） |
| 单条入库弹窗 | **允许编辑** `suggested_question` / `suggested_answer` 再提交 |
| 未开启时条数 | **仍展示**：`pendingSuggestionCount > 0` 时优先显示「N 条优化建议」，与开关无关 |
| 批量入库 Q/A | **接受**不传；Java 用候选行 `suggested_*` |
| 会话洞察联动 | **不做**：只写 `auto_learn_enabled`，不同步开启洞察 |

## 待确认项

1. **入库目标 doc**：是否必须 FAQ（`doc_type = 1`）；`target_doc_id` 注释「FAQ 类型为 0」与 Java 必填 `targetDocId` 如何对齐。
2. **权限**：只读子账号是否可看建议列表、不可审核。

## 非目标（本 spec 不做）

- 候选记录的生成 / AI 过滤流水线（平台侧）。
- Node 直写候选表。
- 浏览器直调 Java。
- 优化建议页视觉大改（仅替换数据源与提交）。
- Agent 编辑（模型 / prompt）链路变更。
