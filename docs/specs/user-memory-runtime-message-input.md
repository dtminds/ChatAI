# Agent 用户记忆运行时消息取数改造

- 日期：2026-08-04
- 状态：已实现 / 待 Review
- 范围：用户记忆 Worker 的候选客户识别、客户消息取数和消息 Token 裁剪
- 现状代码：`apps/backend/src/modules/ai-hosting/user-memory/user-memory-worker.ts`
- 冲突处理：本文件与 `docs/specs/user-memory.md`、既有实施计划中的候选查询或消息范围描述冲突时，以本文件为准

本文是独立 handoff 文档。Review 和开发不得依赖此前聊天记录补充设计。

## 1. 改造目标

当前 Worker 以逻辑会话作为候选来源，也把模型输入限制在候选逻辑会话内，并按每个会话最多 50 条消息取数。该范围会导致：客户今天只产生少量新消息时，模型只能看到这几条消息，无法结合该客户最近的完整上下文维护已有记忆。

目标行为：

1. 逻辑会话只负责确定本次需要维护记忆的客户。
2. 每个客户只发起一次模型请求，不按逻辑会话分别提炼。
3. 模型输入始终包含该客户当前已有的人工记忆和 AI 记忆。
4. 对话上下文改为候选池中该客户涉及的 `conversation_id` 下最近最多 100 条可供 AI 使用的消息，不再按逻辑会话分别限制 50 条。
5. 100 条是每个客户的上限，不是一个 UID 下全部客户共享的上限。
6. 对话消息部分最多 8000 Token。系统提示词、租户提炼指引和已有记忆不计入该 8000 Token，也不得因此被裁剪。
7. 昨天已经提炼过、今天又产生新逻辑会话的客户，今天仍以“当前已有记忆 + 最近最多 100 条消息”重新维护；不只发送今天新增的几条消息。

## 2. 固定边界

本次实现必须遵守以下边界：

- Worker 每次处理一个已确定的 `uid`，候选查询必须带 `WHERE uid = ?`。
- 候选客户只从 `xy_wap_embed_logical_session` 读取。
- 候选和消息准备阶段禁止任何 SQL `JOIN`。
- 不查询 `xy_wap_embed_conversation`。
- 当前工作台平台直接使用 `CURRENT_WORKBENCH_PLATFORM = 5`，不得为了读取 `platform` 查询会话表。
- 固定 UID 内只按 `third_external_userid` 分组；不得再按 `uid + third_external_userid` 或 `platform + third_external_userid` 分组。
- 候选 SQL 不增加 `third_external_userid != ''`。
- 不新增 `last_extracted_message_time`、消息水位、冷却时间或其它运行时状态字段。
- 不新增表，不新增业务字段；现有 `session_ids_json` 保留。
- 同一客户存在多个 `conversation_id` 时，使用一次 `conversation_id IN (...)` 查询，不拆成逐会话或逐 `conversation_id` 查询。
- 消息正文通过第二次批量查询 `xy_wap_embed_msg_audit_info` 获取，不允许通过 JOIN 获取。
- 已有每日调度、客户额度和运行领取机制保持不变。每个运行项只允许一次模型调用，失败后直接终态；并发修改只通过记忆 `version` 校验，`manual_updated_at` 不参与 Worker 的准备、提交或合并判断，manual 只读保持不变。

本次不修改已经确定的模型操作协议和记忆合并规则。

## 3. 运行频率

沿用当前每日运行机制和目标自然日窗口，不增加额外高频调度：

1. 一个 run 只对应一个 `uid`。
2. 目标自然日内出现合格逻辑会话的客户进入候选。
3. 同一客户在一个 run 中只创建一个运行项、只调用一次模型。
4. 客户昨天已经成功提炼，不影响今天再次成为候选。
5. 不通过提取时间或消息水位判断是否跳过；是否修改记忆由模型根据当前已有记忆和本次消息上下文决定。
6. 模型判断无需修改时返回空操作，服务端不改记忆 JSON 和版本。

这使提取频率保持为“活跃客户每日最多一次”，同时避免仅用当天少量消息判断长期记忆。

## 4. 候选客户查询

### 4.1 查询来源

候选查询只读逻辑会话表：

```sql
SELECT
  id,
  conversation_id,
  third_external_userid,
  started_at,
  message_count
FROM xy_wap_embed_logical_session
WHERE uid = :uid
  AND started_at >= :dayStartMs
  AND started_at < :dayEndMs
  AND message_count >= 5
ORDER BY message_count DESC
LIMIT :candidateSessionLimit;
```

候选范围固定为 `quota_date` 对应的完整自然日。`enabled_at` 只记录当前配置代次的开启时间，不参与目标日内的会话裁剪；不回刷历史由 `next_run_at` 只创建应运行的 `quota_date` 保证。

查询明确不得包含：

- `xy_wap_embed_conversation`
- 任何 JOIN
- `third_external_userid != ''`
- `platform` 条件
- `message_count DESC` 之外自行增加的排序字段

`message_count >= 5` 是现有逻辑会话候选门槛。SQL 不增加 `third_external_userid != ''`，但应用层必须在分组和 `customer_limit` 截断之前丢弃 `third_external_userid === ""` 的候选行。空客户 ID 不得创建分组、占用客户额度或写入运行项；它可能占用已执行 SQL 的 `candidate_session_limit`，本次不为此补扫。

候选查询固定按 `message_count DESC` 排序，并受当前 run 的 `candidate_session_limit` 约束。不得自行追加 `started_at`、`id` 等排序字段。目标环境必须执行 `EXPLAIN ANALYZE`，核实该查询的实际索引、扫描行数和排序成本；不能删除上限、使用无序 `LIMIT` 或改成逐客户扫描。

### 4.2 应用内分组

候选结果在当前 UID 的进程内按 `third_external_userid` 分组：

```ts
type CandidateCustomer = {
  thirdExternalUserId: string;
  sessionIds: number[];
  conversationIds: number[];
};
```

分组规则：

1. 分组键只有 `third_external_userid`。
2. 先丢弃 `third_external_userid === ""` 的候选行，再分组，再执行 `customer_limit` 截断。
3. `sessionIds` 去重后按现有运行项格式写入 `session_ids_json`。
4. `conversationIds` 只从排序并 `LIMIT` 后的候选结果中，按同组逻辑会话的 `conversation_id` 去重得到，仅在运行时使用。
5. `platform` 直接取 `CURRENT_WORKBENCH_PLATFORM`。
6. 客户数量额度沿用现有 `customer_limit`；“每客户最多 100 条消息”与客户数量额度是两个独立概念。
7. 不补查该客户未进入候选池的其它历史 `conversation_id`；候选结果中有多少个就使用多少个。

### 4.3 提交前恢复

尚未提交模型请求的 `prepared` 运行项在租约恢复后，不需要新增 `conversation_ids_json`：

1. 从现有 `session_ids_json` 读取逻辑会话 ID。
2. 无 JOIN 查询对应逻辑会话的 `conversation_id`。
3. 在内存中去重得到 `conversationIds`。

```sql
SELECT id, conversation_id
FROM xy_wap_embed_logical_session
WHERE uid = :uid
  AND id IN (:sessionIds);
```

因此不增加表字段。恢复后的 `prepared` 项继续使用原运行项的候选逻辑会话集合和目标自然日 `dayEndMs`；这里固定的是候选集合和时间截止点，不是持久化消息 ID 集合。若平台消息在首次模型调用前延迟写入且 `source_message_time < dayEndMs`，恢复准备输入时可能读取到该迟到消息，这是不新增消息快照字段下接受的语义。运行项进入 `submitted` 或模型调用失败后直接终态，不再恢复输入或调用模型。

## 5. 每客户消息查询

### 5.1 查询逻辑会话消息归属

一个客户在候选池中的全部 `conversationIds` 使用一次查询：

```sql
SELECT
  session_id,
  conversation_id,
  source_message_id,
  source_message_time,
  sender_role
FROM xy_wap_embed_logical_session_message
WHERE uid = :uid
  AND conversation_id IN (:conversationIds)
  AND included_for_ai = 1
  AND source_message_time < :dayEndMs
ORDER BY source_message_time DESC, source_message_id DESC
LIMIT 100;
```

消息查询不得使用 `manual_updated_at`、`last_message_at` 或其它人工维护时间作为下界。人工维护发生在目标自然日之后，也不影响本次滚动消息窗口。

语义：

- `LIMIT 100` 对当前客户生效。
- 多个 `conversation_id` 共享同一个最近 100 条窗口。
- 未进入候选池的历史 `conversation_id` 不属于本次消息范围。
- `dayEndMs` 固定来自 run 的目标自然日；首次处理和提交前租约恢复都不得读取该截止点之后的消息。
- 当前 manual 和 AI 记忆与滚动消息窗口共同进入模型；人工更新时间不裁剪消息上下文。
- 每日运行是滚动状态维护，不是消息 exactly-once 消费；相邻运行重复看到部分历史消息是预期行为。
- 不再按 `session_id` 分区，不再执行“每会话 50 条”。
- 不使用窗口函数。
- 不拆成每个 `conversation_id` 一次查询。
- `ORDER BY` 是“最近 100 条”的业务必要条件，但上线前必须通过第 8 节的 `EXPLAIN ANALYZE` 验证执行计划，不得在文档或代码 Review 中未经验证宣称其命中索引。

### 5.2 批量读取消息正文

取到最多 100 个 `source_message_id` 后，单独批量查询平台消息事实表：

```sql
SELECT id, msgtype, content
FROM xy_wap_embed_msg_audit_info
WHERE uid = :uid
  AND id IN (:sourceMessageIds);
```

应用层按 `source_message_id` 建立映射，再恢复第一步查询的消息顺序。禁止 JOIN，禁止逐消息查询。

消息正文缺失、为空或类型不可读时沿用现有解析规则跳过；不为了补满 100 条继续向更早消息翻页。

### 5.3 人工更新时间不参与运行时判断

本文件废除 `docs/specs/user-memory.md` §4.6 的准备期来源会话屏障，也不引入消息级人工时间屏障：

```text
废除：排除 last_message_at <= manual_updated_at 的来源会话
禁止：只读取 source_message_time > manual_updated_at 的消息
```

`manual_updated_at` 仅可作为管理界面的最近人工维护时间元数据，不参与 Worker 运行时逻辑。人工新增、修改和删除记忆都会递增同一记忆行的 `version`；运行项提交时记录 `base_memory_version`，合并前重新比较当前 `version`，已经足以拒绝模型调用期间产生的任何并发记忆修改。不得再记录或比较 `base_manual_updated_at`。

## 6. 8000 Token 消息窗口

### 6.1 预算边界

`8000` 只限制最终发送给模型的对话消息列表精确序列化结果：

```ts
const serializedMessages = JSON.stringify(messages);
countTokens(serializedMessages) <= 8000;
```

以下内容不属于该预算，必须完整保留：

- system prompt
- 租户 `extractionInstruction`
- 当前已有 `manual` 记忆
- 当前已有 `ai` 记忆
- `now` 和输出 Schema 约束

不得通过裁剪系统提示词、租户指引或已有记忆来满足 8000 Token。

### 6.2 裁剪顺序

1. 数据库先取当前客户最近最多 100 条消息，顺序为新到旧。
2. 批量补齐正文并过滤不可读消息。
3. 对完整 `messages` 数组执行与 Provider 一致的 `JSON.stringify`，Token 计数必须包含字段名、ID、角色、时间、引号、反斜杠和 Unicode 转义后的实际序列化内容。
4. 从最新消息开始保留消息；超出预算时只裁剪或移除更早的对话消息。
5. 如果最新单条消息本身超过预算，只裁剪该条消息正文到预算内，不裁剪其它 Prompt 组成部分。
6. 最终发送模型前，把保留的消息恢复为旧到新的时间顺序；同一时间使用 `source_message_id` 作为稳定顺序。
7. 每次裁剪后重新执行 `JSON.stringify(messages)` 并重新计数，最终序列化结果必须不超过 8000 Token。

Token 计算必须封装为可测试的模块级能力。首期对精确 `JSON.stringify(messages)` 使用 UTF-8 字节数作为保守 Token 上界：

```ts
Buffer.byteLength(JSON.stringify(messages), "utf8") <= 8000
```

该策略不会把字符数冒充 Token 数；中文、emoji 和 JSON 转义都会按实际 UTF-8 序列占用预算。不得只累计各条消息的 `text`。未来如接入与当前配置模型匹配的官方 tokenizer，可以替换计数器，但不得改变只裁剪 `messages` 的预算边界。

## 7. 模型输入和合并

每次模型请求必须包含：

```json
{
  "now": 0,
  "current": {
    "manual": [],
    "ai": []
  },
  "messages": []
}
```

要求：

- `current` 来自模型调用前读取的当前记忆文档，不得省略。
- `messages` 是第 6 节得到的每客户最近消息窗口。
- 客服和机器人消息可以作为上下文；模型的每个操作必须返回 1 至 3 个客户消息 `evidenceMessageIds`，不得返回 `sourceSessionId`。
- Node 只接受实际送模客户消息中的有效证据 ID，并根据消息归属推导 `sourceSessionId`；任一操作无法匹配客户证据时，本次模型结果无效且不更新记忆。
- `session_ids_json` 只用于固定候选客户和恢复 `conversationIds`，不得作为模型证据的会话白名单。
- 模型调用期间不持有数据库事务。
- 合并前继续校验记忆版本，避免旧结果覆盖并发人工或自动修改。

## 8. 索引与执行计划门禁

### 8.1 候选查询

候选查询优先复用现有索引：

```sql
KEY idx_logical_session_uid_started (uid, started_at)
```

目标 SQL 固定为 `ORDER BY message_count DESC LIMIT :candidateSessionLimit`，但本文件不宣称它已命中索引。必须通过目标环境 `EXPLAIN ANALYZE` 核实；执行计划不通过时，先补充最小索引方案评审再开发，不得自行扩大排序字段。

### 8.2 客户消息查询

当前 `idx_session_message_order (session_id, source_message_time, source_message_id)` 不能直接覆盖按 `conversation_id` 取最近消息的访问方式。拟新增的最小索引只有：

```sql
KEY idx_session_message_conversation_order (
  conversation_id,
  source_message_time,
  source_message_id
)
```

三个字段各自用途：

1. `conversation_id`：定位一个客户本次涉及的会话集合。
2. `source_message_time`：支持最近消息范围和排序。
3. `source_message_id`：相同时间戳下提供稳定顺序。

不得未经执行计划证据继续把 `uid`、`included_for_ai`、`session_id`、`sender_role` 等字段塞入该索引。

DDL 落地前必须在生产量级副本分别验证：

```sql
EXPLAIN ANALYZE
SELECT session_id, conversation_id, source_message_id,
       source_message_time, sender_role
FROM xy_wap_embed_logical_session_message
WHERE uid = :uid
  AND conversation_id IN (:oneConversationId)
  AND included_for_ai = 1
  AND source_message_time < :dayEndMs
ORDER BY source_message_time DESC, source_message_id DESC
LIMIT 100;
```

以及多个 `conversation_id` 的真实规模 `IN (...)` 查询。

Review 必须记录：

- 实际选择的索引。
- 实际扫描行数和返回行数。
- 是否发生 filesort。
- 单个和多个 `conversation_id` 的执行时间。
- 新索引与无新索引的对比结果。

如果多个 `conversation_id` 下执行计划不可接受，必须带着 `EXPLAIN ANALYZE` 结果重新评审；不得擅自改成逐 `conversation_id` N 次查询，也不得宣称 `IN (...)` 本身有问题。

### 8.3 2026-08-04 执行计划验证记录

测试环境 MySQL 8.4 当前数据：

- 候选查询通过 `idx_logical_session_uid_started (uid, started_at)` 范围扫描目标 UID/自然日的 7 行，再按 `message_count DESC` 排序，实际返回 4 行，约 `0.034ms`。
- 消息表尚未部署新索引时，多 `conversation_id` 查询扫描 1318 行并返回最近 100 行，约 `0.782ms`；该结果确认现有 `session_id` 索引不支持新访问路径。

本地 MySQL 8.4 使用 10 万行验证表和拟新增三字段索引：

- 单 `conversation_id`：反向使用 `idx_session_message_conversation_order`，扫描并返回 100 行，无额外排序，约 `0.219ms`。
- 5 个 `conversation_id`：使用同一索引做 5 个范围扫描，扫描 5000 行后合并排序并返回 100 行，约 `4.86ms`。

以上证明目标 SQL 和最小索引在 MySQL 8.4 的单值和 `IN (...)` 形态下均可执行。发布前仍需在生产量级副本使用真实每客户 `conversation_id` 数量和消息分布复核扫描行数及耗时。

## 9. 代码改造范围

实际修改：

- `apps/backend/src/modules/ai-hosting/user-memory/user-memory-worker.ts`
- `apps/backend/src/modules/ai-hosting/user-memory/user-memory-message-window.ts`
- `apps/backend/test/modules/ai-hosting/user-memory/user-memory-worker.test.ts`
- `docs/db/schema.sql`
- `docs/db/change-log.md`
- `apps/backend/test/db/schema-doc.test.ts`

消息 Token 预算、窗口裁剪和证据会话集合计算集中在模块级 helper，并由 Worker 定向测试覆盖。

不应修改：

- 用户记忆页面和管理 API。
- 记忆 JSON 表结构。
- run 和 run item 业务字段。
- `xy_wap_embed_conversation` 查询逻辑。
- Insights 会话切片逻辑。
- 调度频率、套餐额度和运行项单次模型调用协议。

## 10. 必须覆盖的测试

### 10.1 SQL 形状

- 候选 SQL 只有 `xy_wap_embed_logical_session`，包含 `uid` 和时间范围。
- 候选 SQL 不包含 JOIN、`xy_wap_embed_conversation`、`third_external_userid != ''`，并包含 `ORDER BY message_count DESC LIMIT :candidateSessionLimit`。
- 空 `third_external_userid` 在分组和 `customer_limit` 截断前被应用层丢弃，不创建运行项。
- 固定 UID 下按 `third_external_userid` 分组，不按 UID 或 platform 重复分组。
- 同客户多个 `conversation_id` 编译为一次 `conversation_id IN (...)` 查询。
- 消息 SQL 按客户总计 `LIMIT 100`，不包含窗口函数和 per-session 50 条逻辑。
- 消息 SQL 包含固定的 `source_message_time < :dayEndMs`。
- 消息正文查询为一次 `source_message_id IN (...)`，不包含 JOIN。

### 10.2 消息范围

- 单个逻辑会话只有 5 条新消息，但同 `conversation_id` 历史有 100 条时，模型最多收到最近 100 条，不只收到 5 条。
- 同客户有两个 `conversation_id` 进入候选池时，两边消息合并后按全局时间取最近 100 条。
- 同客户另有未进入候选池的历史 `conversation_id` 时，本次不读取该会话消息。
- 目标自然日之后的消息不进入本次运行；未提交运行项在租约恢复后仍使用相同 `dayEndMs`。
- `source_message_time < dayEndMs` 的迟到消息可在首次模型调用前的恢复准备阶段进入，测试明确该逻辑截止语义。
- `manual_updated_at >= dayEndMs` 时仍读取 `source_message_time < dayEndMs` 的最近消息，并同时携带当前 manual/AI 记忆。
- 消息 SQL 不得包含基于 `manual_updated_at` 或 `last_message_at` 的准备期下界。
- 两个不同客户各自最多 100 条，不能共享一个 100 条上限。
- 查询结果超过 100 条时只保留全局最新 100 条。
- 同时间戳按 `source_message_id` 稳定排序。
- 消息事实缺失或不可读时跳过，不产生逐条补查。

### 10.3 Token 和 Prompt

- 消息少于 8000 Token 时不裁剪。
- 消息超过 8000 Token 时只删除或裁剪更早消息。
- 最新单条消息超过 8000 Token 时只裁剪该消息正文。
- Token 对象是精确 `JSON.stringify(messages)`，不是所有 `text` 的 Token 之和。
- 截断后重新序列化并复核，最终消息序列化结果不超过 8000 Token。
- 覆盖大量引号、反斜杠、换行、Unicode 和消息元数据的预算测试。
- 系统提示词、租户指引和当前记忆在裁剪前后完全一致。
- 当前已有 manual/ai 记忆始终进入模型输入。

### 10.4 运行语义

- 一个 UID 的同一客户在一个 run 中只调用一次模型。
- 昨天已有记忆、今天新增少量消息时，输入为当前记忆加滚动消息窗口。
- 模型返回空操作时不修改记忆 JSON 和版本。
- 尚未提交模型请求的 `prepared` 项从 `session_ids_json` 恢复 `conversationIds`，不需要新字段；已提交项不得重新准备。
- 候选 `conversation_id` 下未进入 `session_ids_json` 的历史逻辑会话消息可作为证据来源，`sourceSessionId` 由 Node 推导。
- 被 100 条窗口、正文过滤或 8000 Token 裁剪排除的消息不能作为证据；模型引用这些消息后无法形成有效客户证据时，本次结果无效。
- 记忆版本冲突时丢弃旧结果并将运行项置为失败终态，不重新准备输入或再次调用模型。

## 11. 验收命令

```bash
corepack pnpm --filter @chatai/backend test \
  test/modules/ai-hosting/user-memory/user-memory-worker.test.ts \
  test/modules/ai-hosting/user-memory/user-memory-provider.test.ts \
  test/modules/ai-hosting/user-memory/user-memory-domain.test.ts

corepack pnpm --filter @chatai/backend test test/db/schema-doc.test.ts
corepack pnpm --filter @chatai/backend build
git diff --check
```

数据库索引变更还必须附目标环境 `EXPLAIN ANALYZE` 结果；本地编译 SQL 或单元测试不能替代执行计划验证。

## 12. Review 拒绝项

出现以下任一情况应直接拒绝实现：

- 候选或消息查询新增 JOIN。
- 候选阶段查询 `xy_wap_embed_conversation`。
- 使用多 UID 查询后再按 UID 分组。
- 固定 UID 内仍按 `uid + third_external_userid` 分组。
- 为同一客户逐 `conversation_id` 查询消息。
- 把 100 条理解为所有客户共享上限或每逻辑会话上限。
- 8000 Token 裁剪系统提示词、租户指引或已有记忆。
- 模型输入不包含当前已有记忆。
- 新增提取水位、冷却字段、确认状态、表或业务字段。
- 未提供 `EXPLAIN ANALYZE` 就宣称排序或新索引已命中。
- 无执行计划证据继续扩大消息索引字段。
