# Agent 用户记忆实施计划

This document is the handoff source of truth. Do not assume access to prior chat context.

> 实施人员按任务顺序逐项完成，并用复选框维护进度。不得顺手修改会话切片、Insights、Agent 托管或 Java Prompt 语义。

**Goal:** 在 Agent 模块交付简单、可控的用户记忆维护：每日从前一完整自然日的有界候选单聊逻辑会话中选择最多套餐额度个客户，每会话读取最后 50 条消息，由 AI 提出增量，固定规则维护 MySQL 中每客户最多 20 条记忆，并支持人工维护和失败项重试。

**Architecture:** 新增配置、当前记忆、每日运行和客户运行项四张表。Scheduler 每租户每自然日只创建一条运行；Worker 对目标日执行一次有界候选查询，候选上限随客户额度按 `max(200, customer_limit * 2)` 缩放，先排会话再按客户键去重，选中客户后快照会话 ID。没有 pending 队列、发现游标或跨日完整消费。同步推理首期落地，火山 Batch 后续按官方契约接入。Node 只维护 MySQL；Java 直接只读配置表和客户记忆表。

**Source spec:** `docs/specs/user-memory.md`

**Tech Stack:** Node.js 24、TypeScript、Fastify 5、Kysely/MySQL、TypeBox、React 19、React Router v7、Vite 7、Vitest、Testing Library、Volcengine Ark。

## 实施状态（2026-07-24）

- [x] Spec、Contracts、四表 Schema、领域规则、管理 API、同步 Worker、Agent 菜单/Web 页面已分批落地。
- [x] 默认额度 resolver 为 100，候选上限按 `max(200, customer_limit * 2)` 缩放；5 条门槛、每会话最后 50 条、零候选和空可读输入均已实现。
- [x] claim fencing、config → run 统一锁顺序、人工版本屏障、自动日期防回退、最大尝试终止、失败项原 run 重试和 90 天有界清理已实现。
- [x] 运行/客户/run-item cursor 分页、只读权限、人工 CRUD、证据查看、版本冲突刷新、loading/empty/error 恢复已实现。
- [x] Contracts/Backend/Web 全量测试与 build、MySQL 8.4 临时库端到端验证、`git diff --check` 已执行；最终结果以本文末尾验证记录和 PR CI 为准。
- [ ] 共享 Ark 客户端（Task 4）按 Review 决策拆为独立 PR；本 PR 的用户记忆 Provider 不改动 Insights 行为。
- [ ] 火山 Batch（Task 15）等待官方契约确认；本期 runtime 明确拒绝 `volcengine_batch`。
- [ ] 生产量级副本 `EXPLAIN ANALYZE`、DDL 执行、Java 读取联调和灰度观察属于发布门禁，不能由本地开发环境标记完成。

下面的详细复选框保留为验收清单；标记未勾选不等于本期同步链路未实现，其中包含上述独立后续阶段和生产发布门禁。

实施前必须重新执行：

```bash
git status --short --branch
git rev-parse --short=10 HEAD
```

保留用户已有的无关工作区改动。

---

## 1. 固定实施决策

### 1.1 模块边界

- Backend：`apps/backend/src/modules/ai-hosting/user-memory/`。
- Web：`apps/web/src/pages/chat/ai-hosting/user-memory-page.tsx`。
- Web API：`apps/web/src/pages/chat/ai-hosting/api/user-memory-service.ts`。
- Contracts：`packages/contracts/src/ai-hosting/user-memory.ts`。
- 不导入 Insights Worker、Repository、Prompt 或 Job 表。
- 不修改逻辑会话关闭事务，不创建 `extract_user_memory` Job。
- 通用 Ark HTTP/结构化 JSON 能力如需共享，下沉到 `apps/backend/src/shared/ai/`，单独保持 Insights 行为不变。
- Node 不增加 runtime context API，不修改 Java 协议。

### 1.2 每日选择常量

```text
timezone = Asia/Shanghai
schedule = 02:00
target day = previous complete natural day
candidate session limit = max(200, customer quota * 2)
minimum session message_count = 5
per-session input message limit = 50
default customer quota = 100
memory item limit = 20
```

- 客户额度由窄 `UserMemoryCustomerLimitResolver` 返回并快照到 run，本期默认 100，未来可由订阅套餐返回 200/500；只允许产品明确支持的有界额度。
- run 同时快照 `candidate_session_limit = max(200, customer_limit * 2)`；本期仍为 200，未来额度 200/500 时分别为 400/1000。
- 候选基数 200、额度倍数 2、5 条和 50 条先作为模块策略常量，不增加环境变量和页面配置。
- 选择顺序固定为 `message_count DESC, ended_at DESC, id DESC`。
- 必须先取 `candidate_session_limit` 个会话，再按 `platform + third_external_userid` 去重。
- 去重不足额度不补扫。
- 同一客户在候选池中的全部会话进入同一运行项。

### 1.3 简化状态边界

本期明确不实现：

- “立即维护”和通用创建 run API。
- `maintenance_pending`、`pending_generation`。
- `pending_after_*`、`pending_through_*`。
- `selection_order_at`、`cooldown_until`。
- 配置或运行发现游标。
- `discovered/deferred` 运行项状态。
- 跨日连续窗口、完整消费和公平轮转。

失败只保留在原运行项中；自动重试和人工“重试失败项”都复用原 run、原客户和原 `session_ids_json`。

### 1.4 一致性

- 客户键：`uid + platform + third_external_userid`。
- 所有 Worker 业务写入在数据库层验证 `run + running + claim_token + lease_until`。
- `waiting` 必须重新领取为 `running` 并换新 token 才能合并。
- 人工写使用 `expectedVersion`，更新 `manual_updated_at`。
- 自动结果验证 base version 和人工时间；冲突后基于原会话快照重新准备。
- 客户 `last_auto_quota_date` 单调前进；旧日期失败项不得覆盖更晚日期。
- 配置关闭或 generation 变化后，旧结果不能写入。
- 模型/提供商调用期间不持有 DB 事务。

### 1.5 环境变量

```env
AGENT_USER_MEMORY_WORKER_ENABLED=false
AGENT_USER_MEMORY_DAILY_TIME=02:00
AGENT_USER_MEMORY_TIMEZONE=Asia/Shanghai
AGENT_USER_MEMORY_EXECUTION_MODE=sync
```

- 默认 Worker disabled、执行模式 sync。
- Batch 适配器完成前拒绝 `volcengine_batch`。
- Ark 密钥、Base URL 和模型复用已有 `VOLCENGINE_ARK_*`。
- 租约、tick、重试和保留期先集中为模块常量，避免无证据扩散环境变量。

---

## 2. 建议提交边界

1. `docs: add agent user memory design`
2. `feat(contracts): add agent user memory contracts`
3. `feat(backend): add user memory schema and domain rules`
4. `refactor(backend): share openai compatible json client`（独立后续 PR，不与本功能绑定）
5. `feat(backend): add user memory management api`
6. `feat(backend): add daily user memory worker`
7. `feat(web): add agent user memory management`
8. `feat(backend): add user memory batch adapter`（官方契约确认后，可独立 PR）

每次提交前运行 `git diff --check`，只 stage 当前任务文件。

---

## Task 1: Contracts

**Files:**

- Create: `packages/contracts/src/ai-hosting/user-memory.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/test/ai-hosting-user-memory.test.ts`

**Contract surface:**

- memory category/source/item/document DTO
- settings/overview DTO
- run status/phase/item status/error code
- run list/detail cursor DTO
- customer list/detail/evidence DTO
- manual create/update/delete request
- retry-failed response

Steps:

- [ ] 先写 TypeBox runtime tests，覆盖六个分类、manual/ai 来源、`additionalProperties: false` 和时间为 epoch 毫秒。
- [ ] 运行状态固定为 `pending/running/waiting/succeeded/partial/failed/canceled`。
- [ ] 运行项状态固定为 `prepared/submitted/succeeded/failed/skipped/canceled`；不得出现 `discovered/deferred`。
- [ ] Overview 返回 schedule/timezone、当前套餐额度、活动运行和最近运行，不返回 pending 积压字段。
- [ ] Run DTO 返回 `quotaDate`、`customerLimit`、`candidateSessionLimit`、候选会话/客户、选中客户和结果计数。
- [ ] 固定 `candidateSessionCount <= candidateSessionLimit`、`selectedCustomerCount <= customerLimit` 的 service/runtime invariant。
- [ ] 客户列表和 run 列表使用 cursor，不增加 `OFFSET` page 契约。
- [ ] 人工写请求校验 `expectedVersion >= 0`、合法分类、内容 `1..200` 和可选过期时间。
- [ ] AI 来源字段只有有会话权限时返回。
- [ ] 错误码包含 `ITEM_SUPERSEDED`、`ITEM_NO_READABLE_MESSAGES`，不包含 pending/未结束会话游标错误。
- [ ] 不定义 create-run request/response schema。
- [ ] 导出 contracts。
- [ ] 运行：

```bash
corepack pnpm --filter @chatai/contracts test test/ai-hosting-user-memory.test.ts
corepack pnpm --filter @chatai/contracts build
```

---

## Task 2: 数据库 Schema 和写表边界

**Files:**

- Modify: `docs/db/schema.sql`
- Modify: `docs/db/change-log.md`
- Modify: `apps/backend/scripts/codegen-db.config.json`
- Modify: `apps/backend/src/db/schema.ts`
- Modify: `apps/backend/src/db/writable-tables.ts`
- Modify: `apps/backend/test/db/schema-doc.test.ts`

Steps:

- [ ] 按 Spec §7 新增配置、客户当前记忆、每日运行、客户运行项四张表。
- [ ] Run 增加 `UNIQUE(uid, quota_date)`、额度和计数快照、claim/lease 索引。
- [ ] Run item 增加客户唯一键、非空 `session_ids_json`、base version、attempt/provider 字段。
- [ ] 客户表只保存 JSON、version、人工时间和单调 `last_auto_quota_date`；不得加入 pending 或扫描水位。
- [ ] 配置表只保存启停代次、enabled_at、next_run_at、active_run_id；不得加入发现游标。
- [ ] 为逻辑会话增加 `idx_logical_session_uid_ended_message (uid, ended_at, message_count, id)`；用户记忆查询不得按 status 过滤。
- [ ] 不增加未结束会话安全屏障索引。
- [ ] 四张新表加入 codegen 和 `WRITABLE_TABLES`；逻辑会话、消息和平台表保持只读。
- [ ] Change log 明确所有租户默认关闭、不做历史回刷、不做水位初始化。
- [ ] Schema tests 保护四表、客户唯一键、run 日唯一键、claim 索引、会话索引，并断言旧 pending/cursor/cooldown 字段不存在。
- [ ] 核实现网 `ended_at` 为 Unix 毫秒 `BIGINT UNSIGNED`；如不一致先迁移，查询不得运行时转换。
- [ ] 有迁移后数据库时运行 `corepack pnpm backend:db:codegen`；否则手工同步 schema.ts 并在 PR 说明。
- [ ] 运行：

```bash
corepack pnpm --filter @chatai/backend test test/db/schema-doc.test.ts
corepack pnpm --filter @chatai/backend build
```

---

## Task 3: 记忆领域规则

**Files:**

- Create: `apps/backend/src/modules/ai-hosting/user-memory/user-memory-domain.ts`
- Create: `apps/backend/test/modules/ai-hosting/user-memory-domain.test.ts`

Steps:

- [ ] 先写纯单元测试，覆盖合法空文档、非法 schemaVersion、重复 ID、错误 nextItemId 和超过 20 条。
- [ ] 实现过期过滤、内容校验和固定分类。
- [ ] 固定 normalize：trim、Unicode 空白压缩、删除末尾连续中英文句读；不做模糊匹配。
- [ ] 实现人工新增、编辑、编辑 AI 转 manual、删除和 expectedVersion 冲突。
- [ ] 实现 AI `remove -> update -> confirm -> add` 原子合并。
- [ ] AI 不得操作 manual；同一 AI ID 不得有多个操作。
- [ ] 证据必须属于运行项来源会话、实际输入消息且角色为 customer。
- [ ] 测试 AI add 与 manual 重复不新增、与 AI 重复转 confirm、update 与 manual 重复删除 AI、AI-AI 重复保留较小 ID。
- [ ] 合并后超过 20 条整体失败，不部分写入或静默截断。
- [ ] `recent_context` 必须有未来且不超过 180 天的 expiresAt。
- [ ] 已存 JSON 非法返回 `AGENT_USER_MEMORY_DATA_INVALID`，不得以空文档覆盖。
- [ ] 运行：

```bash
corepack pnpm --filter @chatai/backend test \
  test/modules/ai-hosting/user-memory-domain.test.ts
```

---

## Task 4: 提取共享 AI 基础设施

**Files:**

- Create: `apps/backend/src/shared/ai/openai-compatible-json-client.ts`
- Create: `apps/backend/src/shared/ai/volcengine-ark-config.ts`
- Modify: `apps/backend/src/modules/insights/llm-provider.ts`
- Create: `apps/backend/test/shared/ai/openai-compatible-json-client.test.ts`
- Modify: `apps/backend/test/modules/insights/llm-provider.test.ts`

Steps:

- [ ] 先用现有 Insights tests 锁定 URL、超时、重试、response format fallback、usage 和错误分类。
- [ ] 只提取 OpenAI-compatible JSON completion 与 Ark 配置，不移动 Insights Prompt/normalizer/观测。
- [ ] 共享客户端返回解析 JSON、模型和 usage；不记录 API key、Prompt 或正文。
- [ ] 让 Insights provider 改用共享客户端，保持行为和测试不变。
- [ ] 本任务可以作为独立 PR 先合并，避免与用户记忆状态机绑定。
- [ ] 运行：

```bash
corepack pnpm --filter @chatai/backend test \
  test/shared/ai/openai-compatible-json-client.test.ts \
  test/modules/insights/llm-provider.test.ts
corepack pnpm --filter @chatai/backend build
```

---

## Task 5: Repository、配置和人工维护 Service

**Files:**

- Create: `apps/backend/src/modules/ai-hosting/user-memory/user-memory.repository.ts`
- Create: `apps/backend/src/modules/ai-hosting/user-memory/user-memory.service.ts`
- Create: `apps/backend/src/modules/ai-hosting/user-memory/user-memory-schedule.ts`
- Create: `apps/backend/src/modules/ai-hosting/user-memory/user-memory-customer-limit.ts`
- Create tests under: `apps/backend/test/modules/ai-hosting/`

Steps:

- [ ] 持久化 SQL 限定在独立 `ai-hosting/user-memory` 模块内；本期为减少空壳转发层，Service/Worker 直接使用 Kysely，不建设通用 ORM 或仅代理 Kysely 的 Repository。
- [ ] 不存在配置行时按关闭返回。
- [ ] 开启事务：创建/锁定配置，递增 generation，写 enabled_at，计算下一次本地 02:00，保留历史记忆。
- [ ] 开启后不立即创建运行。
- [ ] 关闭事务：递增 generation，取消活动运行和非终态项，清 active_run_id，不删除记忆。
- [ ] 实现 Asia/Shanghai 自然日和 DST 安全的 IANA timezone 计算；测试凌晨前后、月末/年末和停机追赶。
- [ ] 实现固定 100 的 `UserMemoryCustomerLimitResolver`，接口只接收 UID；不读取环境变量。
- [ ] 人工 CRUD 在客户行短事务中使用 expectedVersion，整体替换 JSON，更新 version/manual_updated_at，不修改 last_auto_quota_date。
- [ ] 客户行不存在时人工新增创建 version 1；编辑/删除返回 item not found。
- [ ] 读取时过滤过期项；条件清理冲突时重新读，不覆盖并发结果。
- [ ] 客户页先由 Workbench 分页，再批量读当前页记忆。
- [ ] 实现 overview、run cursor list 和分页 run item detail；所有 SQL 强制 uid。
- [ ] Overview 不查询 pending 数量，不提供立即维护能力。
- [ ] 测试启停、版本冲突、人工时间更新、批量读取和非法 JSON。
- [ ] 运行 focused tests 和 backend build。

---

## Task 6: 管理 API、客户权限和证据

**Files:**

- Create: `apps/backend/src/modules/ai-hosting/user-memory/user-memory.routes.ts`
- Modify: `apps/backend/src/app.ts`
- Modify minimally: `apps/backend/src/modules/chat/workbench-repository.ts`
- Modify minimally: `apps/backend/src/modules/chat/workbench.service.ts`
- Create: `apps/backend/test/modules/ai-hosting/user-memory.routes.test.ts`
- Modify related Workbench tests

Steps:

- [ ] 复用 Workbench 现有客户 cursor 分页和 seat/sub-user 范围，不复制客户可见 SQL。
- [ ] owner/admin 使用租户平台范围；operator/viewer 使用现有可访问席位范围。
- [ ] 客户详情、人工写入和证据读取先验证客户访问；写操作再验证 owner/admin。
- [ ] 证据先验证 AI item 和来源会话客户归属，再调用 `WorkbenchService.getMessagesBySeqs()`。
- [ ] 注册 overview/settings、run list/detail、retry-failed、customer CRUD/evidence 路由。
- [ ] 明确不注册 `POST /user-memory/runs`。
- [ ] Retry 只允许 owner/admin、功能开启、无其它活动运行且来源 run 为 partial/failed。
- [ ] 路由测试保护 401/403、UID scope、cursor、expectedVersion、无权限证据隐藏和 create-run 404。
- [ ] 运行 focused tests 和 backend build。

---

## Task 7: Scheduler、运行领取和租约骨架

**Files:**

- Create: `apps/backend/src/modules/ai-hosting/user-memory/user-memory-worker.ts`
- Create: `apps/backend/src/modules/ai-hosting/user-memory/user-memory-worker-runtime.ts`
- Create worker/runtime tests

Steps:

- [ ] Scheduler 使用配置行锁，只处理 enabled、next_run_at 到期且 active_run_id 为空的租户。
- [ ] `quota_date` 取调度槽位的前一完整本地自然日。
- [ ] 在同一事务插入或复用 `UNIQUE(uid, quota_date)` run，设置 active_run_id，并把 next_run_at 推进一个本地日历日。
- [ ] 唯一键冲突时：同代次非终态 run 重新挂到 active_run_id；终态或旧代次 run 视为该自然日已关闭，只推进调度槽位，不重新选择会话。
- [ ] 一次只为同租户激活一个日期；停机多日后逐日补建，不并行洪峰。
- [ ] 创建 run 时调用额度 resolver，并快照正整数 customer_limit 及 `candidate_session_limit = max(200, customer_limit * 2)`。
- [ ] 实现 `pending -> running`、过期 `running -> running + new token`、到期 `waiting -> running + new token`。
- [ ] 每次领取写随机 claim_token、locked_by、lease_until；长步骤续租。
- [ ] 所有状态更新验证当前 claim；waiting/终态清 claim 和 lease。
- [ ] 运行终态清 config.active_run_id，允许下一 quota date 调度。
- [ ] 配置关闭或 generation 变化后旧 run 取消且不能写业务数据。
- [ ] 双 Worker 测试：A 失租、B 回收、A 恢复，A 的 item/run/customer 写入都被拒绝。
- [ ] 测试重复 Scheduler 只产生一个 uid+quota_date run。
- [ ] Runtime 默认 disabled，非法 timezone/time/mode 启动失败，不静默替换。

---

## Task 8: 有界候选选择和运行项快照

**Files:**

- Modify: `user-memory.repository.ts`
- Modify: `user-memory-worker.ts`
- Modify related repository/worker tests

**Required algorithm:**

```text
selectCandidateSessions(run):
  dayRange = quotaDate in configured timezone
  sessions = query logical_session join conversation
    where uid = run.uid
      and ended_at in [dayStart, dayEnd)
      and ended_at > config.enabled_at
      and message_count >= 5
      and conversation.chat_type = 1
      and external customer ownership matches
    order by message_count desc, ended_at desc, id desc
    limit run.candidateSessionLimit

  groups = stable group sessions by (platform, thirdExternalUserId)
  selected = first run.customerLimit groups

  transaction:
    assert run + claim + lease + generation + activeRunId
    insert one prepared item per selected customer
      session_ids_json = every candidate session in that group
                       ordered by ended_at asc, id asc
    update run candidate/selected counts and phase
```

Steps:

- [ ] SQL 不得包含 logical_session.status、insight flag、snapshot 或 final analysis 条件。
- [ ] Join conversation 验证 `uid`、单聊、platform、third_external_userid 一致。
- [ ] 必须先按 `run.candidate_session_limit` LIMIT 再内存去重；测试不得写成按客户聚合 Top N。
- [ ] 去重不足额度时不追加查询。
- [ ] 同一客户所有候选池内会话进入一个非空、有序、无重复 `session_ids_json`。
- [ ] 运行项唯一键拒绝重复客户；选择重试幂等。
- [ ] 不为未入选客户创建 row/item，不写 pending。
- [ ] Candidate query 失败不提前写选择完成计数；短退避重试。
- [ ] 运行项创建后不因源表后来新增迟到会话而扩展 snapshot。
- [ ] Candidate query 返回零行时，在同一围栏事务中把 run 标记为 succeeded、所有计数置零并清 config.active_run_id；不得停留在 running。
- [ ] 测试 4 条消息跳过、5 条命中、群聊跳过、status 任意值一致。
- [ ] 测试默认额度 100 时第 201 个会话不参与，去重不足 100 也不补扫。
- [ ] 测试额度 200/500 时候选上限分别为 400/1000，selected 始终不超过 customer_limit。
- [ ] 测试零候选日直接成功终态并释放 active_run_id。
- [ ] 测试同一客户多会话只产生一个 item 且会话 ID 全部保留。
- [ ] 用生产量级副本 `EXPLAIN ANALYZE` 验证索引限制 uid/day 范围；允许当日有限 filesort，不允许全表扫描。

---

## Task 9: 消息输入、Prompt 和同步推理

**Files:**

- Create: `user-memory-prompt.ts`
- Create: `user-memory-provider.ts`
- Create prompt/provider tests
- Extract shared message parser only if required

Steps:

- [ ] 对运行项每个 session 按 `(source_message_time DESC, source_message_id DESC)` 取 `included_for_ai = 1` 的最后 50 条，再反转为正序。
- [ ] 只读取 `session_ids_json` 指定会话，不按客户或租户无界扫消息。
- [ ] 复验会话仍属于 run/customer、单聊、目标自然日且 message_count >= 5。
- [ ] 排除 `ended_at <= manual_updated_at` 的会话；全部被排除时 item skipped。
- [ ] 过滤后没有任何 `included_for_ai = 1` 的可读对话消息时，item 以 `AGENT_USER_MEMORY_ITEM_NO_READABLE_MESSAGES` 跳过，不构造空 Prompt、不调用模型。
- [ ] 如果 `last_auto_quota_date > run.quota_date`，item skipped/superseded。
- [ ] Prompt 包含当前 manual/ai、固定分类、禁止内容、会话消息和输出 Schema。
- [ ] Prompt 不包含 UID、客户名或 external ID。
- [ ] 客服/机器人消息可作上下文，证据只允许 customer 消息。
- [ ] Parser 只接受 add/confirm/update/remove，最多 40 个 operations；未知字段或完整快照整体拒绝。
- [ ] 围栏事务写 `submitted`、base_memory_version、base_manual_updated_at 后，事务外调用同步模型。
- [ ] submitted 后崩溃由新持有者重新校验并重新调用；允许重复成本，不误判成功。
- [ ] 提供商硬限制/持续非法输出使 item 失败，不静默删除某个会话或消息。
- [ ] 记录 usage/耗时/稳定错误，不记录 Prompt 或正文。
- [ ] 测试每会话恰好最多 50 条、多个会话分别截断、顺序、全空输入不调用模型、证据越界、超时和空 operations。

---

## Task 10: 围栏合并、日期防回退和运行终态

**Files:**

- Modify repository/worker/domain
- Modify related tests

Steps:

- [ ] 合并事务依次锁定 config、run、run item 和 customer row，所有涉及 config/run 的写路径保持同一锁顺序。
- [ ] 只有 running + claim/lease 有效、generation/activeRun 一致、item submitted 时可合并。
- [ ] 比较 base_memory_version 和 base_manual_updated_at；冲突丢弃旧结果并把原 item 退回 prepared。
- [ ] 验证 `last_auto_quota_date IS NULL OR <= run.quota_date`；更晚日期直接 skipped/superseded。
- [ ] 执行领域规则；JSON 改变才递增 version，空操作仍单调推进 last_auto_quota_date。
- [ ] 客户行不存在时用“预期不存在”条件创建合法空行；若并发创建则重读并按版本冲突重准备，禁止无条件 upsert 覆盖。
- [ ] 模型/DB 失败不改变 JSON 或 last_auto_quota_date。
- [ ] 运行项临时错误短退避自动重试，达到上限后 failed。
- [ ] 模型重调、版本冲突重准备和 provider waiting 都有统一的最大尝试/等待时长，不能永久卡在 prepared/submitted/waiting。
- [ ] 所有 item 终态后聚合 run：全部成功/跳过为 succeeded；成功与失败并存为 partial；无成功且有失败为 failed；代次失效为 canceled。
- [ ] 终态 success/failure/skipped 从 item 当前状态重算，避免人工 retry 重复累加；Token 保留所有真实调用的累计成本。
- [ ] 终态事务清 active_run_id；后续日期不因历史 failed item 永久阻塞。
- [ ] 测试重复结果、人工并发、两个 Worker 失租、旧 quota date、空操作、customer 并发创建和 submitted 崩溃。

---

## Task 11: 原运行失败项重试

**Files:**

- Modify service/repository/routes/worker
- Modify contracts and related tests if needed

Steps:

- [ ] `POST /runs/:runId/retry-failed` 不创建新 run。
- [ ] 事务验证功能开启、代次一致、无其它 active run、来源 run 为 partial/failed。
- [ ] 逐项批量比较客户 `last_auto_quota_date`：更晚者改 skipped/superseded，其余 failed 重置 prepared。
- [ ] 保留 quota_date、customer_limit、candidate_session_limit、客户集合和 session_ids_json，不重新执行候选 SQL。
- [ ] 至少一个 item 重置时，把原 run 改 pending、清终态时间/claim、设置 active_run_id。
- [ ] 失败项全部被更晚日期覆盖时改为 skipped 并重聚合原 run；既没有可重置项也没有新 superseded 项时返回 `RUN_NOT_RETRYABLE`。
- [ ] 人工 retry 不突破原 selected_customer_count，不增加自然日额度。
- [ ] 测试旧日失败客户已被新日成功处理、同日重复 retry、活动运行冲突和关闭后拒绝。

---

## Task 12: Worker 入口、环境配置、观测和清理

**Files:**

- Modify: `apps/backend/src/worker.ts`
- Modify: `apps/backend/src/config/env.ts`
- Modify: `.env.example`
- Modify: `apps/backend/.env.example`
- Modify env/runtime tests

Steps:

- [ ] Worker 分别启动 Insights runtime 和 User Memory runtime，独立启停和优雅关闭。
- [ ] 解析四个环境变量；默认 disabled/sync。
- [ ] HTTP overview 与 Worker 使用同一 mode/schedule 解析函数。
- [ ] 关键异常、claim、selection 和终态失败使用结构化日志；运行、运行项及 usage 观测以 MySQL run/item 表和管理页为主，不额外引入指标基础设施。
- [ ] run 释放时按最早非终态 item 的 `next_attempt_at` 设置 `run_after`，不得在退避窗口内热循环 claim/release。
- [ ] 运行表记录 quotaDate、候选上限/实际数、候选客户、选中客户、成功/失败/superseded 和 usage；运行项记录实际消息与尝试次数。
- [ ] 日志不带正文、Prompt、原始模型输出或可识别客户 ID。
- [ ] 运行/运行项保留 90 天；事务锁定终态 run ID，先删 item 再删 run。
- [ ] 清理成功后才进入长周期；失败短退避或下 tick 重试。
- [ ] 清理不触碰配置、活动运行或客户当前记忆。
- [ ] 更新 env examples，不提交真实密钥。

---

## Task 13: Web API 适配层

**Files:**

- Create: `apps/web/src/pages/chat/ai-hosting/api/user-memory-service.ts`
- Create: `apps/web/test/pages/chat/ai-hosting/user-memory-service.test.ts`

Steps:

- [ ] API tests 覆盖 overview/settings、run list/detail、retry-failed、customer cursor list/detail、人工 CRUD 和 evidence。
- [ ] 不实现 createRun 方法；测试明确不存在对应请求。
- [ ] 所有请求通过 `apps/web/src/lib/request.ts` 的 `http`，路径使用 `/server/ai-hosting/user-memory/*`。
- [ ] query trim 后发送；cursor/pageSize/platform/status 使用 URLSearchParams。
- [ ] 写 payload 保留 expectedVersion；页面负责错误码映射。
- [ ] Web 不复制后端合并、过期或去重规则。
- [ ] 运行：

```bash
cd apps/web
./node_modules/.bin/vitest run --config vitest.config.ts \
  test/pages/chat/ai-hosting/user-memory-service.test.ts
```

---

## Task 14: Web 页面、导航和权限

**Files:**

- Create: `apps/web/src/pages/chat/ai-hosting/user-memory-page.tsx`
- Create as needed: `apps/web/src/pages/chat/ai-hosting/user-memory/`
- Modify Agent layout/permissions/router
- Create page tests and modify navigation tests

Steps:

- [ ] Lazy-load `/chat/ai-hosting/user-memory` 并在 Agent 导航加入“用户记忆”，使用 Hugeicons。
- [ ] 复用 `AiHostingLayout`、`AiHostingPageHeader`、Tabs、Table、Dialog/Sheet、Switch、Spinner 和 TablePagination。
- [ ] 运行概览展示开关、时区/调度、quotaDate、套餐额度、候选会话上限/实际选择计数、当前/最近运行和错误建议。
- [ ] 页面不显示 pending backlog、公平轮转或跨日追赶指标。
- [ ] 页面和操作中不得出现“立即维护”。
- [ ] owner/admin 可以启停、重试失败项和人工 CRUD；operator/viewer 只读。
- [ ] 活动运行期间低频轮询，终态或离开页面后停止。
- [ ] Run detail 分页加载 items，支持状态过滤。
- [ ] 记忆管理复用 cursor 客户分页，展示 n/20、manual/AI、version 和证据入口。
- [ ] 人工编辑使用 Dialog，删除使用 AlertDialog；请求期间禁用重复提交和关闭路径。
- [ ] 版本冲突重新加载详情并提示基于最新版本重试，不自动重放旧编辑。
- [ ] 功能关闭时保留人工管理，明确自动维护已停止。
- [ ] 区分 loading/empty/error；loading 不显示空态，error 可重试。
- [ ] 测试保护路由、导航、权限、无立即维护、重试、分页、版本冲突、证据和错误恢复；不锁 Tailwind class 或普通说明文案。
- [ ] 运行：

```bash
cd apps/web
./node_modules/.bin/vitest run --config vitest.config.ts \
  test/pages/chat/ai-hosting/user-memory-service.test.ts \
  test/pages/chat/ai-hosting/user-memory-page.test.tsx \
  test/pages/chat/ai-hosting-pages.test.tsx
corepack pnpm --filter @chatai/web build
```

---

## Task 15: 火山 Batch 适配器（后续独立阶段）

**Precondition:** 先核实官方 Batch API，不猜 endpoint、文件字段或状态名。

Steps:

- [ ] 确认模型支持、单批限制、幂等、轮询、结果保留、取消和删除。
- [ ] 用脱敏 fixture 固定官方请求/响应。
- [ ] 与 sync 使用同一业务输入、输出和合并规则。
- [ ] provider key 不含 UID、客户 ID 或姓名。
- [ ] 如需 JSONL，只用临时目录；上传、异常和退出路径都尽力删除。
- [ ] MySQL 只保存 provider ID/key、状态、usage 和稳定错误。
- [ ] 提交后 running -> waiting 并清 claim；轮询前 waiting -> running + 新 claim。
- [ ] 设置最大 provider 等待时长，超时后转为可重试失败，不能永久阻塞后续 quotaDate。
- [ ] 批量失败不降级 sync。
- [ ] 重启后只依赖 MySQL/provider 恢复，不依赖本地文件。
- [ ] 该任务完成前 runtime 拒绝 volcengine_batch。

---

## Task 16: 最终验证和灰度

### 16.1 自动验证

- [x] Contracts tests/build。
- [x] Backend focused tests/build。
- [x] Web focused tests/build。
- [x] Full regression：

```bash
corepack pnpm --filter @chatai/contracts test
corepack pnpm --filter @chatai/contracts build
corepack pnpm --filter @chatai/backend test
corepack pnpm --filter @chatai/backend build
corepack pnpm --filter @chatai/web test
corepack pnpm --filter @chatai/web build
git diff --check
```

### 16.2 数据库验证

- [ ] 预检查：

```sql
SHOW COLUMNS FROM xy_wap_embed_logical_session LIKE 'ended_at';
SHOW INDEX FROM xy_wap_embed_logical_session
  WHERE Key_name = 'idx_logical_session_uid_ended_message';
```

- [ ] 对目标自然日有界候选 SQL 按默认和最大受支持套餐上限执行生产量级 `EXPLAIN ANALYZE`。
- [ ] 确认 SQL 按 uid/day 限定扫描，不含 status，不跨租户全表扫描。
- [ ] 验证 `UNIQUE(uid, quota_date)` 和 run-item customer 唯一键。
- [ ] 验证四张新表初始为空、配置默认关闭；不执行水位初始化。
- [ ] 验证 schema 中不存在 pending、cursor、selection_order 或 cooldown 字段。

### 16.3 行为和并发验收

- [x] 4 条消息会话跳过，5 条命中。
- [ ] 默认额度 100 时候选排序稳定；第 201 条不参与，即使去重后不足 100。
- [x] 额度 200/500 时分别最多查询 400/1000 条，仍先会话排序再客户去重。
- [x] 同客户多个候选会话合并为一个 item。
- [x] 每个 session 只取最后 50 条，多个 session 分别截断。
- [x] 入选项没有可读消息时 skipped，模型调用数保持不变。
- [x] 零候选日 succeeded、计数全零并清 active_run_id。
- [x] 群聊跳过；logical_session.status 各取值结果一致。
- [ ] 同一 uid+quotaDate 多实例调度只生成一条 run。
- [x] A 失租、B 回收并合并后，A 所有写入被拒绝。
- [ ] waiting 重新领取换 token，旧 token 不能合并。
- [ ] 模型调用期间人工编辑，旧结果不覆盖并按人工时间屏障重准备。
- [ ] 较早 quotaDate 失败项在更晚日期成功后 retry，被 superseded 而非回退。
- [ ] Retry 不重新扫描、不修改 session IDs、不增加 selected count。
- [ ] 功能关闭和 generation 变化拒绝迟到结果。
- [ ] submitted 后崩溃可重新调用，不误判成功。
- [ ] 清理失败短退避，成功后才长间隔。

### 16.4 灰度

1. 执行 DDL 和索引，确认 Schema/EXPLAIN。
2. 部署 Backend、Web 和 Worker，保持全局 Worker disabled。
3. 开启全局 Worker，但所有租户配置仍关闭。
4. 对单个测试 UID 开启 sync；不立即运行，等待下一次每日 02:00。
5. 观察完整自然日：有界候选上限、5 条门槛、客户额度、每会话 50 条、Token、失败和重试。
6. 抽查 MySQL JSON 和 Java 直接读取契约。
7. 扩大 sync 灰度。
8. Batch 官方契约和独立适配器完成后再受控切换。

### 16.5 回滚

- [ ] 关闭 `AGENT_USER_MEMORY_WORKER_ENABLED`。
- [ ] 关闭租户配置并递增 generation，使迟到结果失效。
- [ ] 保留当前记忆和运行历史。
- [ ] 不修改逻辑会话、Insights、Agent 托管或消息事实表。

---

## 3. 完成定义

只有同时满足以下条件才完成：

1. Contracts、四张表、Backend、Worker 和 Web 完成。
2. 同步模式端到端可用；Batch 未完成时不宣称支持。
3. 页面和 API 都没有“立即维护”或 create-run 能力。
4. 每自然日只运行一次有界候选会话选择，候选上限为 `max(200, customer_limit * 2)`，先会话排序再客户去重。
5. `message_count >= 5`，每会话最后最多 50 条消息。
6. 默认去重客户额度 100、候选会话上限 200；未来额度 200/500 时上限同步扩为 400/1000，去重不足不补扫，retry 不增加额度。
7. 不存在 pending、发现游标、公平轮转或跨日完整消费状态。
8. 人工优先、version/manual 时间、last_auto_quota_date 和 Worker claim 有回归测试。
9. 群聊和逻辑会话 status 不影响的边界有测试。
10. Node 不提供 runtime context API；Java 直接只读配置和客户记忆表。
11. 日志、运行和 provider key 不包含正文或可识别客户数据。
12. 生产量级 EXPLAIN、灰度和回滚有实际记录。
