# 智能待办升级工单系统实施计划

本文是开发 handoff 的执行依据，不假设实施人员了解此前聊天上下文。产品和领域规则以 [工单系统设计方案](../specs/2026-07-27-ticket-system-design.md) 为准；实现中发现冲突时，先更新 Spec 再调整代码。

> 实施人员按任务顺序逐项完成，并使用复选框维护进度。每个任务只提交本任务涉及的文件，不得顺手重构会话切片、聊天权限、洞察分析或无关 UI。

**Goal:** 将会话洞察中的智能待办升级为独立工单系统，支持聊天窗口人工创建、自动 Final 洞察智能创建、负责人和状态流转、工单中心、聊天侧工单列表、上下文关联、操作记录和处理备注，同时保留洞察详情原有快捷处理体验。

**Architecture:** 第一期继续复用 `xy_wap_embed_session_action_item` 作为工单主表，新增 `xy_wap_embed_ticket_activity`，在代码和公开 API 中建立独立 `tickets` 领域。人工创建由 Tickets Service 解析可选上下文，不触发 Sessionization；AI 创建由正常自动 Final 分析写入同一工单领域。工单可见范围、写权限和聊天上下文权限分层判断。Web 增加独立 `/chat/tickets` 模块，并在单聊窗口接入快捷创建和工单 Tab。

**Tech Stack:** Node.js 24、TypeScript、Fastify 5、Kysely/MySQL、TypeBox、React 19、React Router 7、Tailwind CSS v4、shadcn/ui、Hugeicons、Vitest、Testing Library。

**编写时基线：**

- Branch：`main`
- HEAD：`ad1157cf20f3` (`Guard Insights historical rescans (#498)`)
- Worktree：仅有尚未提交的工单系统 Spec
- 设计文档：`docs/superpowers/specs/2026-07-27-ticket-system-design.md`

实施前必须重新执行 `git status --short --branch`，保留用户已有或新产生的无关改动。不要假设上述 HEAD 仍是当前实现基线。

---

## 1. 固定实现边界

### 1.1 必须保持的产品规则

- 仅单聊聊天窗口可以人工创建工单。
- 工单中心和会话洞察详情不提供创建入口。
- 人工创建默认选择“当前会话”，但工单允许没有 `session_id` 和 `anchor_message_id`。
- 创建工单不得创建、唤醒、等待或修改任何 Sessionization 任务、水位或租约。
- 工单创建后不得修改 `conversation_id`、`session_id`、`anchor_message_id`。
- AI 工单只来自正常自动 Final 分析；Live 和所有人工重刷均不创建工单。
- `todo_enabled` 的产品文案统一为“智能创建工单”。
- 接管关系变化不回写历史工单负责人。
- 工单不允许物理删除，只能取消。
- 逾期由 `due_at` 派生，不写 `expired` 状态。
- 洞察详情不新增领取或创建入口，只增加工单标题的新窗口链接。
- 旧 `/chat/insights/follow-ups` 直接删除，不做跳转。

### 1.2 权限不变量

- 所有读取和写入先按 JWT `uid` 隔离。
- 普通客服只有在“负责人是本人”或“人工创建人是本人”时才能编辑、改状态、改负责人和添加备注。
- 仅因所属账号访问权可见的客服只能读取；未分配时只能领取给自己。
- 管理员和 Owner 可以处理租户全部工单，但负责人候选仍必须具备所属账号访问权。
- `viewer` 沿用现有只读角色语义，不得创建、领取、编辑、评论或成为新负责人候选。
- 工单可见权限不能替代聊天消息权限；无聊天权限时隐藏接待会话和消息内容。

### 1.3 数据不变量

- `conversation_id` 始终非空。
- `session_id` 和 `anchor_message_id` 最多一个非空。
- `status = in_progress` 时 `assignee_sub_user_id` 必须非空。
- 清空处理中工单负责人时必须在同一原子更新中退回 `open`。
- AI 工单必须有 `session_id + snapshot_id`，人工工单 `snapshot_id` 为空。
- `done/canceled` 的当前终态字段写在主表，历次状态变化写在活动表。
- 公开 Tickets ID 统一按现有契约序列化为 `string`，数据库和 Kysely 继续遵循仓库现有 ID 约定。

### 1.4 实现克制

- 不引入消息队列、事件总线、搜索引擎或新缓存层。
- 不为理论竞态增加工单版本状态机；普通字段后写覆盖，状态字段使用 `expectedStatus` 条件更新。
- 不复制一套“有效消息”规则；必须复用 `buildInsightMessageInput()` 的 `meaningfulForBoundary` 语义。
- 不把 Tickets Service 反向接入 UID Worker 调度。
- 不在工单表冗余会随接管关系变化的所属账号或客户名称。
- 默认排序在数据库分页前完成；不得只对单页数据做应用层重排。

---

## 2. 目标文件结构

### 2.1 Contracts

```text
packages/contracts/src/tickets/dto.ts                       新增
packages/contracts/src/index.ts                             修改
packages/contracts/src/insights/dto.ts                      修改
packages/contracts/test/tickets-dto.test.ts                 新增
packages/contracts/test/insights-dto.test.ts                修改
```

### 2.2 Backend

```text
apps/backend/src/modules/tickets/tickets.routes.ts           新增
apps/backend/src/modules/tickets/tickets.service.ts          新增
apps/backend/src/modules/tickets/tickets.repository.ts       新增
apps/backend/src/modules/tickets/tickets.types.ts            按需新增，仅放内部类型
apps/backend/src/app.ts                                      修改
apps/backend/src/db/writable-tables.ts                       修改
apps/backend/src/db/schema.ts                                codegen 更新
apps/backend/src/modules/insights/insights-worker.repository.ts 修改
apps/backend/src/modules/insights/insights.repository.ts     修改
apps/backend/src/modules/insights/insights.routes.ts         修改
apps/backend/src/modules/insights/insights.service.ts        修改
apps/backend/test/modules/tickets/tickets-routes.test.ts     新增
apps/backend/test/modules/tickets/tickets-service.test.ts    新增
apps/backend/test/modules/tickets/tickets-repository.test.ts 新增
apps/backend/test/modules/insights/insights-worker.test.ts   修改
apps/backend/test/modules/insights/insights-repository.test.ts 修改
apps/backend/test/modules/insights/insights-routes.test.ts   修改
apps/backend/test/db/schema-doc.test.ts                      修改
```

如人工创建和 Worker 确实会重复“创建工单 + 首条活动”的写入代码，可在 `modules/tickets` 下增加一个很薄的共享 writer；不要先创建抽象再寻找使用场景。

### 2.3 Web

```text
apps/web/src/pages/chat/tickets/api/tickets-service.ts             新增
apps/web/src/pages/chat/tickets/tickets-layout.tsx                 新增
apps/web/src/pages/chat/tickets/tickets-page.tsx                   新增
apps/web/src/pages/chat/tickets/ticket-detail-page.tsx             新增
apps/web/src/pages/chat/tickets/ticket-create-dialog.tsx           新增
apps/web/src/pages/chat/tickets/conversation-tickets-panel.tsx     新增
apps/web/src/pages/chat/tickets/ticket-status-actions.tsx          按需新增
apps/web/src/router/index.tsx                                      修改
apps/web/src/pages/chat/components/account-rail.tsx                修改
apps/web/src/pages/chat/components/chat-header.tsx                 修改
apps/web/src/pages/chat/components/chat-panel.tsx                  修改
apps/web/src/pages/chat/components/customer-side-panel.tsx        修改
apps/web/src/pages/chat/chat-workbench-page.tsx                    修改
apps/web/src/pages/chat/insights/insight-detail-panel.tsx          修改
apps/web/src/pages/chat/insights/insights-layout.tsx               修改
apps/web/src/pages/chat/insights/insights-overview-page.tsx        修改
apps/web/src/pages/chat/insights/insights-settings-page.tsx        修改
apps/web/src/pages/chat/insights/api/insights-service.ts           修改
apps/web/src/pages/chat/insights/insights-follow-ups-page.tsx      删除
```

测试文件优先按业务表面拆分，不把所有工单场景堆进一个巨型用例：

```text
apps/web/test/pages/chat/tickets-service.test.ts
apps/web/test/pages/chat/tickets-page.test.tsx
apps/web/test/pages/chat/ticket-detail-page.test.tsx
apps/web/test/pages/chat/ticket-create-dialog.test.tsx
apps/web/test/pages/chat/conversation-tickets-panel.test.tsx
apps/web/test/pages/chat/chat-header.test.tsx                       修改
apps/web/test/pages/chat/chat-workbench-page.test.tsx              修改
apps/web/test/pages/chat/insights-pages.test.tsx                   修改
apps/web/test/pages/chat/insights-service.test.ts                  修改
```

### 2.4 数据库文档

```text
docs/db/schema.sql                                             修改
docs/db/change-log.md                                         修改
```

---

## Task 1：数据库扩展、迁移与代码生成

**Files:**

- Modify: `docs/db/schema.sql`
- Modify: `docs/db/change-log.md`
- Modify: `apps/backend/src/db/writable-tables.ts`
- Modify: `apps/backend/src/db/schema.ts`
- Modify: `apps/backend/test/db/schema-doc.test.ts`

- [x] **Step 1：先写数据库文档测试**

覆盖以下最终结构：

- `xy_wap_embed_session_action_item.session_id` 可空。
- 新增 `anchor_message_id`、`description`、`assignee_sub_user_id`、`due_at`、`canceled_at`、`canceled_by_sub_user_id`。
- 最终 schema 不再包含 `dismissed_at`。
- 新增 `xy_wap_embed_ticket_activity` 及 `uid + ticket_id + id` 时间线索引。
- `xy_wap_embed_ticket_activity` 进入 Node 可写白名单。
- 最近消息反查逻辑会话归属复用现有 `xy_wap_embed_logical_session_message.uk_session_message_source_uid (uid, source_message_id)`；本任务不为该查询新增索引。

- [x] **Step 2：更新最终 schema snapshot**

工单主表最终字段和索引至少满足 Spec 第 15.1 节。活动表字段：

```text
id
uid
ticket_id
activity_type
operator_type
operator_sub_user_id
content
detail_json
create_time
```

不要给 `detail_json` 内字段建立 JSON 索引。工单默认排序中的 `CASE WHEN` 不通过堆叠组合索引解决。

- [x] **Step 3：在 change-log 编写可复制的 expand/contract SQL**

迁移分三段：

1. Expand：增加新列、活动表和工单查询索引；将 `session_id` 改为可空；将历史取消时间先回填到新 `canceled_at`。此阶段保留旧 `dismissed_at` 和旧状态值，确保旧实例仍可运行。
2. Deploy：部署可读取旧 `dismissed/expired`、只写新状态和新取消字段的应用版本。
3. Contract：确认旧实例全部退出后，将 `dismissed/expired` 迁为 `canceled`；迁移取消时间；最后删除 `dismissed_at`。

迁移规则固定：

```text
dismissed -> canceled
expired   -> canceled
canceled_at = COALESCE(dismissed_at, update_time)
canceled_by_sub_user_id = NULL（历史无法可靠还原）
```

change-log 必须同时提供迁移前状态分布查询、迁移后非法组合查询和回滚边界说明。活动表不伪造历史操作流水。

- [x] **Step 4：更新可写白名单并生成 Kysely 类型**

生产 change-log 使用 expand/contract。Task 1 的运行时 `schema.ts` 先对应 expand 结构，同时包含 `dismissed_at` 和 `canceled_at`，确保旧 Insights 消费方在 Task 11 前仍可构建；`docs/db/schema.sql` 从本任务起描述 contract 后的最终结构。Task 11 切换全部旧消费方后，再生成并提交移除 `dismissed_at` 的最终 Kysely 类型。

执行：

```bash
corepack pnpm --filter @chatai/backend db:codegen
```

确认生成类型中的 `session_id` 为可空，新活动表和取消字段完整，且 expand 阶段暂时保留 `dismissed_at`。如果当前代码生成数据库没有应用 expand SQL，不得用旧库生成结果覆盖目标类型；应在隔离开发库应用 expand SQL 后生成。

- [x] **Step 5：验证数据库文档测试和 Backend build**

```bash
cd apps/backend
./node_modules/.bin/vitest run --config vitest.config.ts test/db/schema-doc.test.ts
corepack pnpm --filter @chatai/backend build
```

- [x] **Step 6：提交**

建议提交：`feat(tickets): add ticket persistence schema`

---

## Task 2：建立 Tickets 共享契约

**Files:**

- Create: `packages/contracts/src/tickets/dto.ts`
- Create: `packages/contracts/test/tickets-dto.test.ts`
- Modify: `packages/contracts/src/index.ts`

- [x] **Step 1：先写 Tickets DTO 失败测试**

覆盖：

- 枚举：`open/in_progress/done/canceled`、`low/medium/high`、`manual/ai`。
- 视图：`assigned_to_me/reception/unassigned/created_by_me/all`。
- 创建上下文 discriminated union：`current`、`session + sessionId`、`none`。
- 创建请求拒绝客户端传 `anchorMessageId`。
- 标题 1-255、描述最多 5000、备注 1-2000。
- `PATCH` 出现 `status` 时必须同时出现 `expectedStatus`。
- 列表、详情、活动、上下文选项、计数和聊天侧列表 DTO。
- 所有公开 ID 使用 `string`。
- `additionalProperties: false`，避免上下文字段从 PATCH 旁路写入。

- [x] **Step 2：实现 Tickets 契约并从根入口导出**

至少包括：

```text
TicketSchema
TicketListQuerySchema / TicketListResponseSchema
TicketDetailResponseSchema
TicketCountsResponseSchema
TicketContextOptionsQuerySchema / ResponseSchema
TicketCreateRequestSchema / ResponseSchema
TicketUpdateRequestSchema / ResponseSchema
TicketClaimResponseSchema
TicketCommentRequestSchema / ResponseSchema
ConversationTicketsQuerySchema / ResponseSchema
```

日期对外使用项目现有毫秒时间戳或 ISO 字符串中的一种统一形式；优先与现有 Insights/Workbench DTO 保持一致，不能同一 DTO 混用两种表示。

`TicketContextOptionsResponse` 同时返回分页的历史接待会话和当前聊天可选负责人；负责人项至少包含 `subUserId/displayName`，并明确默认负责人。创建弹窗和详情编辑均复用该服务端候选，不另建前端账号权限算法。

- [x] **Step 3：运行契约测试和构建**

本任务只新增 Tickets 契约。旧 Follow-ups、Insights 人工创建和洞察详情投影契约及其消费方保持不变，统一在 Task 11 同一提交中收敛，确保 Task 2 至 Task 10 的中间提交可以独立构建。

```bash
cd packages/contracts
./node_modules/.bin/vitest run --config vitest.config.ts test/tickets-dto.test.ts
corepack pnpm --filter @chatai/contracts build
```

- [x] **Step 4：提交**

建议提交：`feat(tickets): define shared ticket contracts`

---

## Task 3：实现工单读取、范围和权限基础

**Files:**

- Create: `apps/backend/src/modules/tickets/tickets.repository.ts`
- Create: `apps/backend/src/modules/tickets/tickets.service.ts`
- Create: `apps/backend/src/modules/tickets/tickets.types.ts`（仅确有需要时）
- Create: `apps/backend/test/modules/tickets/tickets-repository.test.ts`
- Create: `apps/backend/test/modules/tickets/tickets-service.test.ts`

- [x] **Step 1：先写可见范围和权限失败测试**

逐项保护：

- `assigned_to_me`：负责人为 JWT 子账号。
- `reception`：账号当前 `host_sub_id` 为 JWT 子账号，不限制工单负责人。
- `unassigned`：当前子账号有账号访问权的范围内 `assignee IS NULL AND status = open`。
- `created_by_me`：当前子账号人工创建。
- `all`：仅管理员和 Owner；普通客服返回 `TICKET_FORBIDDEN`。
- 普通客服的最终可见集合是本人负责、本人创建、所属账号访问范围三者并集；`reception` 只是其中按当前接管关系组织的固定视图。
- `viewer` 只能读，不能进入任何写权限判断或负责人候选。
- contract SQL 执行前，旧 `dismissed/expired` 行在 API 中统一映射为 `canceled`；新代码不得再写旧状态。
- 所有分支先限制 `uid`，不得跨租户。

- [x] **Step 2：实现统一 actor scope 和权限判定**

Service 接收：

```text
uid
subUserId
role
permissions
```

Repository 负责数据事实；Service 负责“能否查看/修改/领取/分配/评论”的领域判断。不要在每条 route 内复制角色判断。

“接待工单”的查询事实来自账号当前 `host_sub_id`；普通工单可见范围和“待领取”仍来自账号访问关系。两者不得共用一个含义模糊的账号 ID 集合。接管变化只改变后续查询结果，不更新工单行。

- [x] **Step 3：实现列表、筛选、搜索和排序查询**

要求：

- 筛选只收窄视图，不扩大权限范围。
- 客户名称搜索必须在分页前生效；可复用现有联系人查询先解析受限 `conversation_id`，不得对分页后的 hydration 结果再过滤。
- 默认排序使用数据库 `CASE WHEN` 表达逾期、今日到期、高优先级，再按 `update_time DESC, id DESC`。
- 列表与 count 共用同一过滤构建器，避免角标和页面口径漂移。
- 客户、所属账号、负责人展示信息按当前页 ID 批量 hydration，不做 N+1。
- 真实 SQL 以最终 `EXPLAIN` 决定索引，不在 mock 测试中推断性能。

- [x] **Step 4：实现客户范围查询**

`scope=customer` 固定由服务端通过当前 `conversation_id` 解析：

```text
uid + platform + third_external_userid
```

只匹配 `chat_type = 1`，再与当前用户可见 `conversation_id` 求交集。客户键缺失时退化为当前聊天。前端传来的第三方客户 ID 一律不参与查询。

- [x] **Step 5：运行聚焦测试**

```bash
cd apps/backend
./node_modules/.bin/vitest run --config vitest.config.ts test/modules/tickets/tickets-repository.test.ts test/modules/tickets/tickets-service.test.ts
```

- [x] **Step 6：提交**

建议提交：`feat(tickets): add ticket queries and authorization`

---

## Task 4：实现人工创建与上下文解析

**Files:**

- Modify: `apps/backend/src/modules/tickets/tickets.repository.ts`
- Modify: `apps/backend/src/modules/tickets/tickets.service.ts`
- Modify: `apps/backend/test/modules/tickets/tickets-repository.test.ts`
- Modify: `apps/backend/test/modules/tickets/tickets-service.test.ts`
- Reuse: `apps/backend/src/modules/insights/insight-message-input-builder.ts`

- [x] **Step 1：先写创建准入和上下文失败测试**

覆盖：

- 群聊返回 `TICKET_SINGLE_CHAT_ONLY`。
- 无聊天访问权返回 `TICKET_FORBIDDEN`。
- `current`：最新有效消息已关联 `open` 接待会话时写 `session_id`。
- `current`：未覆盖最新有效消息时写最新消息 `anchor_message_id`。
- 只有较早消息关联 open 会话时仍锚定最新消息，不错误复用旧归属。
- 没有有效消息时允许两个上下文字段都为空。
- `session`：校验 `uid + conversation_id + session_id`。
- `none`：两个上下文字段均为空。
- 人工创建默认负责人是创建人；显式未分配合法；无账号访问权或 `viewer` 不能成为负责人。
- 人工创建固定写入兼容字段 `action_type = follow_up`。
- 创建过程没有任何 Insight Job、cursor 或 Sessionization 写入。

- [x] **Step 2：实现历史接待会话选项**

- 按 `conversation_id` 和 `uid` 查询。
- 按结束时间/ID 倒序。
- `pageSize` 默认 20、最大 50。
- 返回时间范围和可用摘要，不因摘要为空排除会话。
- 同一响应返回当前聊天的合法负责人候选；排除无账号访问权、已失效和 `viewer` 子账号。

- [x] **Step 3：实现“当前会话”解析**

1. 先读取当前有效单聊的 `uid/platform/third_userid/third_external_userid`。
2. 复用工作台或 Insights 现有的单聊消息查询路径，按聊天窗口对应的账号、客户和平台事实反向分页读取最近消息；不在 Tickets 中另写一套未经验证的消息扫描逻辑。
3. 对消息调用纯函数 `buildInsightMessageInput()`，只保留 `meaningfulForBoundary = true`，取得最近 5 条。
4. 使用现有唯一键 `uk_session_message_source_uid (uid, source_message_id)` 一次查询这 5 条消息的关联，以 `conversation_id` 校验所属聊天，并 join `logical_session.status = open`。
5. 只有最新有效消息被 open 会话覆盖时写 `session_id`，否则写最新消息 ID 为锚点。

这里复用纯消息构建逻辑不代表 Tickets 依赖会话洞察开关，也不得调用 Worker。若后续需要移动该纯函数，只做无行为变化的机械提取并保留原测试。

- [x] **Step 4：实现创建事务和首条活动**

同一事务中写入：

- 工单主表，固定写入 `action_type = follow_up`。
- `created` 活动。

人工活动记录 `operator_type = sub_user` 和当前 `subUserId`。事务任一写入失败时整个创建失败，不留无活动工单。

- [x] **Step 5：运行聚焦测试**

```bash
cd apps/backend
./node_modules/.bin/vitest run --config vitest.config.ts test/modules/tickets/tickets-repository.test.ts test/modules/tickets/tickets-service.test.ts test/modules/insights/insight-message-input-builder.test.ts
```

- [x] **Step 6：提交**

建议提交：`feat(tickets): create tickets from chat context`

---

## Task 5：实现详情、更新、领取和活动时间线

**Files:**

- Modify: `apps/backend/src/modules/tickets/tickets.repository.ts`
- Modify: `apps/backend/src/modules/tickets/tickets.service.ts`
- Modify: `apps/backend/test/modules/tickets/tickets-repository.test.ts`
- Modify: `apps/backend/test/modules/tickets/tickets-service.test.ts`

- [x] **Step 1：先写权限矩阵和状态失败测试**

至少覆盖 Spec §9.2 的每一行：

- 本人负责。
- 本人创建且未分配。
- 本人创建但已分给他人。
- 仅因所属账号访问权可见。
- 管理员/Owner。
- `viewer`。
- 洞察来源 AI 工单没有人工创建人。
- PATCH 将负责人改为无所属账号访问权、已失效或 `viewer` 子账号时返回 `INVALID_TICKET_ASSIGNEE`。

- [x] **Step 2：实现 PATCH 和状态条件更新**

- 普通字段后写覆盖。
- 带 `status` 必须有 `expectedStatus`。
- 状态使用 `WHERE id + uid + status = expectedStatus` 条件更新。
- 滚动发布窗口内，客户端 `expectedStatus = canceled` 对数据库旧值 `dismissed/expired` 视为同一领域状态；contract SQL 完成后只剩 `canceled`。
- 条件不匹配返回 `TICKET_STATE_CONFLICT`。
- 进入 `done/canceled` 写对应当前终态字段。
- 重新打开清空对应当前终态字段，但不清负责人。
- 无负责人不能进入 `in_progress`。
- 清空处理中负责人时原子退回 `open`。
- 设置非空负责人前必须按当前所属账号访问关系重新校验候选人有效且不是 `viewer`；不满足时返回 `INVALID_TICKET_ASSIGNEE`，不得只信任创建弹窗或详情接口此前返回的候选列表。
- 每次实际变化只写一组结构化活动，不为未变化字段制造记录。

- [x] **Step 3：实现原子领取**

领取条件固定为：

```text
uid = current uid
AND id = ticket id
AND assignee_sub_user_id IS NULL
AND status = open
```

成功时同一事务写负责人、`in_progress` 和活动；条件不匹配区分不存在/无权限/已领取，已领取返回 `TICKET_ALREADY_CLAIMED`。

- [x] **Step 4：实现评论和活动时间线**

- 评论去除首尾空白后 1-2000 字。
- 评论权限与修改工单权限相同。
- 时间线按 `id ASC` 或 `create_time ASC, id ASC` 稳定排序。
- `detail_json` 只保存必要 before/after；不得记录聊天消息、Prompt 或完整 Ticket 快照。
- AI 创建活动使用 `operator_type = ai`，历史迁移不伪造活动。

- [x] **Step 5：实现上下文读取**

- `session_id`：复用现有逻辑会话消息读取和聊天权限校验。
- `anchor_message_id`：校验锚点属于同一聊天，复用现有聊天消息查询路径读取前后各 10 条并标记锚点；具体索引以 Task 12 的真实 `EXPLAIN` 为准。
- 无上下文：返回明确 kind，不当作错误。
- 工单可见但聊天不可见：详情返回工单数据和 `contextAccess = forbidden`，不返回消息内容。

- [x] **Step 6：运行聚焦测试并提交**

```bash
cd apps/backend
./node_modules/.bin/vitest run --config vitest.config.ts test/modules/tickets/tickets-repository.test.ts test/modules/tickets/tickets-service.test.ts
```

建议提交：`feat(tickets): handle assignment status and activity`

---

## Task 6：暴露 Tickets API

**Files:**

- Create: `apps/backend/src/modules/tickets/tickets.routes.ts`
- Create: `apps/backend/test/modules/tickets/tickets-routes.test.ts`
- Modify: `apps/backend/src/app.ts`

- [x] **Step 1：先写路由失败测试**

覆盖所有接口的鉴权、schema、成功 envelope 和主要错误码：

```text
GET   /api/server/tickets
GET   /api/server/tickets/counts
GET   /api/server/tickets/context-options
GET   /api/server/tickets/by-conversation/:conversationId
GET   /api/server/tickets/:ticketId
POST  /api/server/tickets
PATCH /api/server/tickets/:ticketId
POST  /api/server/tickets/:ticketId/claim
POST  /api/server/tickets/:ticketId/comments
```

- [x] **Step 2：实现统一 scope 解析和路由**

- 所有接口使用正常 `app.authenticate`。
- 从 JWT 读取 `uid/subUserId/roles`，从现有账户权限模型获得 role/permissions。
- Route 只负责 schema、scope 和 API envelope，不写 SQL、不复制权限矩阵。
- Fastify 会优先匹配静态路由；保持路由列表清晰即可，不增加无意义的手写 path 分发。

- [x] **Step 3：注册模块并验证无鉴权绕过**

在 `apps/backend/src/app.ts` 注册 Tickets 路由。不要加入 `shouldDisableRequestLogging`，工单 API 不是高频轮询噪声接口；如后续真实日志量过高再按观测调整。

- [x] **Step 4：运行路由测试和 Backend build**

```bash
cd apps/backend
./node_modules/.bin/vitest run --config vitest.config.ts test/modules/tickets/tickets-routes.test.ts test/modules/tickets/tickets-service.test.ts test/modules/tickets/tickets-repository.test.ts
corepack pnpm --filter @chatai/backend build
```

- [x] **Step 5：提交**

建议提交：`feat(tickets): expose ticket APIs`

---

## Task 7：接入正常自动 Final 的 AI 工单

**Files:**

- Modify: `apps/backend/src/modules/insights/insights-worker.repository.ts`
- Modify: `apps/backend/src/modules/insights/insights-worker.ts`（仅确有编排需要时）
- Modify: `apps/backend/test/modules/insights/insights-worker.test.ts`
- Modify: `apps/backend/test/modules/insights/insights-repository.test.ts`
- Reuse: `apps/backend/src/modules/tickets/tickets.repository.ts` 或已形成的薄 writer

- [x] **Step 1：先锁定 AI 创建边界测试**

覆盖：

- 正常自动 Final 可以写 AI 工单。
- `todo_enabled = 0` 时不请求行动项且不写入 AI 工单。
- Live 不创建。
- 全量人工重刷不创建。
- QA/分类人工重刷不创建。
- AI 工单写入 `conversation_id + session_id + snapshot_id + evidence`。
- 有效 `host_sub_id` 时自动负责人；`host_sub_id = 0` 或无有效接管人时未分配。
- 最近 10 条归一化标题去重继续有效。
- `open + in_progress` 超过 5 条时继续抑制生成。
- AI 工单有 `created` 活动，`operator_type = ai`。

- [x] **Step 2：把 AI 行动项写入统一工单结构**

- `source_type = ai`。
- `action_type = follow_up`。
- `anchor_message_id = NULL`。
- `description` 第一阶段为空，除非模型现有输出已有明确字段；不得从摘要随意拼接。
- 负责人读取生成当时所属账号有效 `host_sub_id`，不注册后续接管回写。
- 证据 `dimension_type` 第一阶段固定沿用 `action_item`，本期不改名。
- 创建工单和 `created` 活动使用共享写入边界，避免 API 与 Worker 各维护一套状态默认值。

- [x] **Step 3：保护失败和重试语义**

- 工单写入失败应使本次分析结果保存按现有失败策略处理，不静默吞掉。
- 重试不得因为已有同标题工单再插入重复行。
- 不新增新的分析任务类型、重刷模式或 Sessionization 交互。

- [x] **Step 4：运行 Worker 聚焦测试**

```bash
cd apps/backend
./node_modules/.bin/vitest run --config vitest.config.ts test/modules/insights/insights-worker.test.ts test/modules/insights/insights-repository.test.ts test/modules/tickets/tickets-repository.test.ts
corepack pnpm --filter @chatai/backend build
```

- [x] **Step 5：提交**

建议提交：`feat(tickets): persist final insight tickets`

---

## Task 8：实现工单中心布局、列表和计数

**Files:**

- Create: `apps/web/src/pages/chat/tickets/api/tickets-service.ts`
- Create: `apps/web/src/pages/chat/tickets/tickets-layout.tsx`
- Create: `apps/web/src/pages/chat/tickets/tickets-page.tsx`
- Create: `apps/web/test/pages/chat/tickets-service.test.ts`
- Create: `apps/web/test/pages/chat/tickets-page.test.tsx`
- Modify: `apps/web/src/router/index.tsx`
- Modify: `apps/web/src/pages/chat/components/account-rail.tsx`
- Modify: relevant AccountRail tests

- [x] **Step 1：先写 API 适配和页面行为测试**

保护：

- `/chat/tickets` 路由可直接进入。
- 五个视图参数正确；普通客服不显示“全部工单”，管理员/Owner 显示。
- loading 保留表头并显示标准 Spinner；empty 和 error 独立。
- 筛选、搜索、分页会重置/保留正确状态。
- 工单中心没有“新建工单”按钮。
- 导航角标只统计“分配给我”中的 `open + in_progress`。
- API 通过 `apps/web/src/lib/request.ts`，不裸写 fetch。

- [x] **Step 2：实现独立 Tickets 布局**

沿用 Insights/AI Hosting 的工作型模块布局：左侧模块导航、返回工作台、账户菜单，主区为紧凑列表。不要做营销 Hero、装饰卡片堆叠或第二套组件体系。

左侧视图固定：

```text
分配给我
接待工单
待领取（带数量）
我创建的
全部工单（仅管理员/Owner）
```

- [x] **Step 3：实现列表与筛选**

- 状态、所属账号、负责人、来源、优先级、截止时间、创建时间。
- 工单编号/标题/客户名称搜索。
- 默认排序由服务端完成，前端不重排当前页。
- 列表操作只提供当前用户有权执行的命令。
- 所有按钮使用现有 shadcn/ui，图标使用 Hugeicons。

- [x] **Step 4：接入一级导航和角标**

在 `AccountRail` 增加“工单”模块入口 `/chat/tickets`。计数请求失败不能阻塞聊天工作台；失败时隐藏角标，不显示错误数字。

- [x] **Step 5：运行 Web 聚焦测试和 build**

```bash
cd apps/web
./node_modules/.bin/vitest run --config vitest.config.ts test/pages/chat/tickets-service.test.ts test/pages/chat/tickets-page.test.tsx test/pages/chat/account-rail.test.tsx
corepack pnpm --filter @chatai/web build
```

- [x] **Step 6：提交**

建议提交：`feat(tickets): add ticket center`

---

## Task 9：实现工单详情和处理时间线

**Files:**

- Create: `apps/web/src/pages/chat/tickets/ticket-detail-page.tsx`
- Create: `apps/web/src/pages/chat/tickets/ticket-status-actions.tsx`（确有复用时）
- Create: `apps/web/test/pages/chat/ticket-detail-page.test.tsx`
- Modify: `apps/web/src/pages/chat/tickets/api/tickets-service.ts`
- Modify: `apps/web/src/router/index.tsx`

- [ ] **Step 1：先写详情行为测试**

覆盖：

- `/chat/tickets/:ticketId` 直接打开。
- 可编辑字段和只读上下文字段分离。
- 无写权限时不显示可操作控件。
- 未分配可领取；领取冲突刷新最新数据。
- 状态 PATCH 携带当前 `expectedStatus`；`TICKET_STATE_CONFLICT` 后刷新。
- 清空处理中负责人后 UI 展示待处理。
- 评论成功追加时间线；失败不乐观伪造。
- `contextAccess = forbidden`、无上下文、接待会话、消息锚点四种展示互不混淆。

- [ ] **Step 2：实现详情编辑**

- 标题、描述、负责人、优先级、截止时间、状态。
- 上下文字段永久只读。
- 负责人列表只使用 API 返回的合法候选，不在前端自行推导账号关系。
- 不提供删除按钮。

- [ ] **Step 3：实现活动时间线和上下文**

- 操作记录与处理备注共用一条时间线，但视觉上区分系统变化和人工备注。
- 消息上下文复用现有消息渲染能力；不要复制一套消息解析器。
- 上下文加载失败只影响上下文区域，不清空工单详情。

- [ ] **Step 4：运行测试和 build**

```bash
cd apps/web
./node_modules/.bin/vitest run --config vitest.config.ts test/pages/chat/ticket-detail-page.test.tsx test/pages/chat/tickets-service.test.ts
corepack pnpm --filter @chatai/web build
```

- [ ] **Step 5：提交**

建议提交：`feat(tickets): add ticket detail workflow`

---

## Task 10：接入聊天窗口快捷创建和工单 Tab

**Files:**

- Create: `apps/web/src/pages/chat/tickets/ticket-create-dialog.tsx`
- Create: `apps/web/src/pages/chat/tickets/conversation-tickets-panel.tsx`
- Create: `apps/web/test/pages/chat/ticket-create-dialog.test.tsx`
- Create: `apps/web/test/pages/chat/conversation-tickets-panel.test.tsx`
- Modify: `apps/web/src/pages/chat/components/chat-header.tsx`
- Modify: `apps/web/src/pages/chat/components/chat-panel.tsx`
- Modify: `apps/web/src/pages/chat/components/customer-side-panel.tsx`
- Modify: `apps/web/src/pages/chat/chat-workbench-page.tsx`
- Modify: related chat tests

- [ ] **Step 1：先写创建入口和弹窗行为测试**

- 单聊在“更多”按钮左侧显示“创建工单”图标按钮。
- 群聊、无活动聊天、无写权限/`viewer` 不显示或不可用。
- 默认上下文是“当前会话”。
- 历史接待会话分页加载。
- “不关联”合法。
- 标题、描述、截止时间和负责人校验正确。
- 提交期间防重复；成功关闭并刷新聊天侧工单；失败保留输入。
- 不提供选择消息交互。

- [ ] **Step 2：实现创建弹窗**

使用现有 `Dialog`、`Input`、`Textarea`、日期时间控件、Select/Popover 等基础组件。负责人默认当前创建人，候选完全来自服务端上下文接口。

前端只提交 `context.type` 和可选 `sessionId`，不得计算或提交 `anchorMessageId`。

- [ ] **Step 3：实现聊天右侧工单 Tab**

- 只在单聊展示。
- 两个范围：“当前聊天”“该客户全部工单”。
- 数量随 Tab 切换。
- 支持打开详情、领取、状态快捷操作。
- 完整编辑和活动记录跳转工单详情。
- 切换客户时使用 conversation scope key 保护异步响应，旧客户的列表、错误和提交结果不得覆盖新客户状态。

- [ ] **Step 4：保持工作台布局稳定**

- 复用 `CustomerSidePanel` 现有 Tab 和折叠逻辑。
- 工单动态内容不得改变聊天主区宽度或让工具栏跳动。
- 图标使用 Hugeicons，不引入 Lucide。
- loading/empty/error 三态明确。

- [ ] **Step 5：运行聊天侧测试和 Web build**

```bash
cd apps/web
./node_modules/.bin/vitest run --config vitest.config.ts test/pages/chat/ticket-create-dialog.test.tsx test/pages/chat/conversation-tickets-panel.test.tsx test/pages/chat/chat-header.test.tsx test/pages/chat/chat-workbench-page.test.tsx
corepack pnpm --filter @chatai/web build
```

- [ ] **Step 6：提交**

建议提交：`feat(tickets): create and view tickets in chat`

---

## Task 11：收敛会话洞察兼容并移除旧待处理页

**Files:**

- Modify: `packages/contracts/src/insights/dto.ts`
- Modify: `packages/contracts/test/insights-dto.test.ts`
- Modify: `apps/backend/src/db/schema.ts`
- Modify: `apps/backend/src/modules/insights/insights.repository.ts`
- Modify: `apps/backend/src/modules/insights/insights.routes.ts`
- Modify: `apps/backend/src/modules/insights/insights.service.ts`
- Modify: Insights backend tests
- Modify: `apps/web/src/pages/chat/insights/insight-detail-panel.tsx`
- Modify: `apps/web/src/pages/chat/insights/use-insight-detail.ts`
- Modify: `apps/web/src/pages/chat/insights/insights-layout.tsx`
- Modify: `apps/web/src/pages/chat/insights/insights-overview-page.tsx`
- Modify: `apps/web/src/pages/chat/insights/insights-settings-page.tsx`
- Modify: `apps/web/src/pages/chat/insights/api/insights-service.ts`
- Delete: `apps/web/src/pages/chat/insights/insights-follow-ups-page.tsx`
- Modify: `apps/web/src/router/index.tsx`
- Modify: Insights web tests

- [ ] **Step 1：先写洞察详情范围测试**

洞察详情只返回：

```text
source_type = ai
AND snapshot_id = 当前详情快照
```

必须证明：同 `session_id` 的人工工单、旧快照 AI 工单不会混入。

同时更新洞察详情投影契约：只保留该区域实际展示的字段，状态使用工单状态集合并提供标题跳转所需的工单 ID；不把完整 Ticket DTO 嵌入 Insights DTO。

- [ ] **Step 2：切换洞察详情写操作**

- 完成/忽略/重新打开调用 Tickets API。
- `open/in_progress` 提供完成和忽略；`done/canceled` 提供重新打开。
- 无 Tickets 写权限时仅展示状态。
- 未分配且仅因所属账号访问权可见的 AI 工单不新增领取入口。
- 点击标题使用 `<a target="_blank" rel="noreferrer">` 打开 `/chat/tickets/:ticketId`。
- 保留详情区域现有布局和快捷操作表现，不改造成完整工单详情。

- [ ] **Step 3：删除旧 Insights 待处理页面、接口和契约**

删除：

```text
GET   /api/server/insights/follow-ups
POST  /api/server/insights/action-items
PATCH /api/server/insights/action-items/:actionItemId/status
```

同时删除 Web API adapter、lazy import、Insights 导航和页面。`/chat/insights/follow-ups` 不添加 `Navigate`，让通配 NotFound 正常处理。

在同一提交中删除只服务旧待处理页的 Follow-ups DTO 和旧 Insights 人工创建请求/响应 DTO，并同步删除所有前后端消费方，避免任何中间提交出现悬空导入。

所有旧取消字段消费方删除后，使用已执行 contract SQL 的隔离开发库重新生成 `apps/backend/src/db/schema.ts`，确认最终类型不再包含 `dismissed_at`。

- [ ] **Step 4：修正原入口和文案**

- “待跟进事项”跳到 Tickets 的 AI + active 筛选。
- 高风险会话跳到洞察明细风险筛选，不伪装为工单。
- 洞察配置和摘要中的“智能创建待办”统一改为“智能创建工单”。
- 不修改其它洞察配置、LLM 编排和重刷功能。

- [ ] **Step 5：运行前后端回归测试**

```bash
cd packages/contracts
./node_modules/.bin/vitest run --config vitest.config.ts test/tickets-dto.test.ts test/insights-dto.test.ts
corepack pnpm --filter @chatai/contracts build
```

```bash
cd apps/backend
./node_modules/.bin/vitest run --config vitest.config.ts test/modules/insights/insights-routes.test.ts test/modules/insights/insights-service.test.ts test/modules/insights/insights-repository.test.ts test/modules/tickets/tickets-routes.test.ts
corepack pnpm --filter @chatai/backend build
```

```bash
cd apps/web
./node_modules/.bin/vitest run --config vitest.config.ts test/pages/chat/insights-pages.test.tsx test/pages/chat/insights-service.test.ts test/pages/chat/ticket-detail-page.test.tsx
corepack pnpm --filter @chatai/web build
```

- [ ] **Step 6：提交**

建议提交：`refactor(insights): move action items to tickets`

---

## Task 12：性能核查、端到端验收与发布准备

**Files:**

- Modify tests/docs only if verification exposes a real issue
- Do not add production code merely to satisfy a theoretical concern

- [ ] **Step 1：执行真实 SQL EXPLAIN**

至少覆盖：

- 五个视图的列表和 count。
- 默认 `CASE WHEN` 排序。
- 负责人/状态/来源/截止时间组合筛选。
- 当前聊天最近消息和锚点前后消息复用路径的真实 SQL；记录平台消息表实际选中的索引，不把仓库外索引名写成实现前提。
- 最近 5 条消息关联确认使用现有 `uk_session_message_source_uid (uid, source_message_id)`。
- 当前客户全部工单的 conversation scope 查询。

验收标准：不出现无租户边界的消息表/工单表全扫；表达式排序可接受 filesort，但必须先用权限和筛选显著缩小结果集。若真实执行计划未使用可接受索引，再基于实际 SQL 单独评估索引，不提前增加猜测性索引。

- [ ] **Step 2：执行 Backend 完整测试与构建**

```bash
corepack pnpm --filter @chatai/contracts test
corepack pnpm --filter @chatai/contracts build
corepack pnpm --filter @chatai/backend test
corepack pnpm --filter @chatai/backend build
```

- [ ] **Step 3：执行 Web 完整测试与构建**

```bash
corepack pnpm --filter @chatai/web test
corepack pnpm --filter @chatai/web build
```

- [ ] **Step 4：人工验收关键路径**

1. 单聊分别以当前会话已追平、切片延迟、无消息、不关联、历史接待会话创建。
2. 群聊确认无入口，直接 API 创建被拒绝。
3. 普通客服逐项验证负责人、创建人、仅因所属账号访问权可见时的只读和领取权限。
4. 管理员同时验证“接待工单”和“全部工单”范围不同。
5. 将一个账号从客服 A 接管给客服 B，确认该账号工单动态移出 A、进入 B 的“接待工单”，但既有负责人不变。
6. 未分配工单领取；并发两次领取只有一次成功。
7. 清空处理中负责人后回到待处理。
8. 工单可见但聊天权限丢失时不泄露消息上下文。
9. 聊天侧切换当前聊天/客户全部工单，数量和列表同步变化。
10. 正常自动 Final 创建 AI 工单；Live 和人工重刷不创建。
11. 洞察详情只显示当前快照 AI 工单，快捷状态操作和新窗口标题链接正常。
12. 旧 `/chat/insights/follow-ups` 显示 NotFound，不跳转。

- [ ] **Step 5：检查迁移和滚动发布顺序**

```text
1. 执行 expand SQL
2. 部署 Contracts/Backend/Worker/Web
3. 确认旧实例退出
4. 执行状态数据迁移和 contract SQL
5. 执行迁移后校验与 ANALYZE TABLE
```

任何阶段校验不满足 change-log 的 stop condition 时停止后续 SQL，不用应用代码补偿平台层数据。

- [ ] **Step 6：最终静态检查**

```bash
git diff --check
git status --short
```

确认：

- 无旧 Follow-ups 路由、页面和写接口残留。
- 无 `dismissed/expired` 新写入。
- 无人工创建触发 Sessionization 的调用。
- 无人工重刷创建工单的路径。
- 无 Tickets 页面裸写 `fetch`。
- 无 Lucide 或第二套 UI 依赖。
- schema、change-log、Kysely 类型一致。

- [ ] **Step 7：提交发布前收尾**

建议提交：`test(tickets): verify ticket workflows`

---

## 3. 完成定义

只有同时满足以下条件才算完成：

- Contracts、Backend、Worker、Web 和数据库文档全部按本计划接入。
- Spec §18 的所有验收项有自动测试或明确人工验收记录。
- Tickets 权限在 Backend 权威执行，不能通过 URL 或请求参数扩大范围。
- 人工创建不依赖逻辑会话及时生成，也不产生任何切片任务。
- AI 工单证据链和洞察详情兼容路径可用。
- 旧待处理页面与旧写接口已删除且无跳转。
- 相关聚焦测试、三个 package build、全量测试和 `git diff --check` 通过；无法执行的项必须在 PR 中写明原因和风险。
- 数据库 change-log 包含可复制 SQL、前后校验和停止条件，最终 schema snapshot 与运行代码一致。
