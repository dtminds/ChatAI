# Workflow 入口身份与 Interest Reader 配套改造计划

- 日期：2026-08-11
- 状态：Implemented；入口筛选持久化部分由 GitHub Issue #595 更新
- 目标：把当前“每条 Entry Event 固定一个 Subject”的内部实现，改造成“单一源事件携带来源身份和候选 Subject，Node 按 Binding 解析 Run Subject”
- Java 契约：[Workflow Interest Reader 与入口事件身份契约](../specs/2026-08-11-workflow-interest-reader-design.md)
- 基线分支：`integration/sop-workflow-v1`

## 1. 已确认且不再讨论的决策

1. 首批事件为 `contact.friend_added`、`contact.tag_added`、`message.received`。
2. 添加好友和打标签都是企微源事件，ChatAI SOP 与 WeCom SOP 不重复投递消息。
3. `(uid, workUserId)` 最多映射一个有效 `seatId`；每个有效 `seatId` 唯一绑定一个 `workUserId`。
4. `wecom_sop` Run 使用 `externalUserId`；`chatai_sop` Run 使用 `thirdExternalUserId`。
5. 企微事件按 `workUserId` 匹配；新消息按 `seatId` 匹配。
6. 一条 Entry Event 可以启动多个 Workflow，但每个 Run 仍只有一个 `subjectType + subjectId`。
7. Java Interest Reader fail-open，Node Entry Consumer 负责最终匹配。
8. 当前没有生产 Java 消费者和需要保留的旧 Entry Event 数据，不实现旧单 Subject 信封兼容。
9. 本期一个 Workflow 只能选择一个 Start Event；Draft 可暂时不选，发布时必须恰好一个。
10. Trigger Binding 按 Revision 和 Event Type 持久化，完整筛选规则保存在 `filter_spec_json`；本期因事件单选，当前 Revision 实际只有一条。

## 2. 当前实现与目标方案的差距

| 当前实现 | 目标 |
| --- | --- |
| Entry Event 顶层强制 `subjectType + subjectId` | Entry Event 保存来源身份和候选 Subject 字段 |
| Partition Key 为 `uid:subjectType:subjectId` | 按源事件稳定客户身份分区 |
| Start 使用通用 `accountIds` | ChatAI SOP 使用 `seatIds`，WeCom SOP 使用 `workUserIds` |
| Trigger Binding Reader 先按 `subjectType` 查询 | 先按 `uid + eventType` 查询，再按来源维度匹配 |
| Java 只能读取粗粒度 Binding | Java 读取当前 Binding 的完整 Filter，并在内存中预匹配 |
| Event Subscription 使用通用 `account_id` | `message.received` 明确使用 `seat_id` |
| Event Catalog 只返回 Trigger Projection | 同时返回受控 Projection 和候选 Subject 引用 |
| Consumer 直接使用事件 Subject 创建 Run | Consumer 按 Binding 的 Subject Type 选择事件中的 Subject ID |

## 3. PR 1：共享契约与持久化

### 3.1 Entry Event

修改：

- `packages/contracts/src/workflow/entry-event.ts`
- `packages/contracts/src/workflow/event-catalog.ts`
- Entry Event JSON Fixture 与 Manifest

工作内容：

- 删除顶层 `subjectType`、`subjectId`。
- 公共信封继续使用 `schemaVersion: 1`，直接替换内部未上线结构。
- 为三个 Event Type 建立事件级 payload Schema。
- 固定公共字段：`workUserId`、`seatId`、`externalUserId`、`thirdExternalUserId`、`tagId`、`messageId`。
- Event Catalog 投影结果增加候选 Subject：

```ts
type WorkflowEventSubjectCandidates = {
  chatai_contact?: {
    seatId: number;
    subjectId: string;
  };
  wecom_contact?: {
    subjectId: string;
  };
};
```

- Trigger Projection 只保留节点允许使用的受控变量，不把完整 payload 写入 Run Context。
- 更新大小、深度、未知版本、非法身份组合和 DLQ 用例。

### 3.2 Start Draft

修改：

- `packages/contracts/src/workflow/trigger.ts`
- `packages/contracts/src/workflow/policy.ts`
- `packages/workflow-engine/src/compiler.ts`

目标 Draft：

```ts
type ChatAiWorkflowStartConfig = {
  entryPolicy: WorkflowEntryPolicy;
  seatIds: number[];
  triggers: [] | [ChatAiWorkflowStartTrigger];
};

type WeComWorkflowStartConfig = {
  entryPolicy: WorkflowEntryPolicy;
  workUserIds: number[];
  triggers: [] | [WeComWorkflowStartTrigger];
};
```

要求：

- 删除通用 `accountIds`。
- 配置 Schema 必须由 Workflow Type 判别，不能允许 WeCom SOP 写入 `seatIds`。
- Draft `triggers` 最多一个；Execution `triggers` 必须恰好一个。
- ChatAI SOP 的 `message.received` 编译为 `seatId` Match。
- `message.received` 必须配置至少一个 `keyword`；正文包含任意关键词时命中。
- ChatAI SOP 的企微事件把 `seatId` 权威解析为 `workUserId` 后编译 Match。
- WeCom SOP 的企微事件直接编译 `workUserId` Match。
- `contact.friend_added` 支持可选 `sourceIds`；空数组表示任意来源，否则按 `sourceId` 精确命中。
- `contact.tag_added` 额外编译 `tagId` Match。
- 发布时生成唯一的结构化 `WorkflowTriggerBindingFilter`；`filter_spec_json` 保存归一化后的 `workUserIds / seatIds / tagIds / sourceIds / keywords`，不直接保存未经编译的 Draft Config。
- Java Interest Reader 与 Node 最终匹配读取同一份 Filter，避免两套规则来源。

### 3.3 数据库

修改：

- `docs/db/schema.sql`
- `docs/db/change-log.md`
- `apps/backend/src/db/schema.ts`
- `packages/workflow-runtime/src/db.ts`
- `apps/backend/src/db/writable-tables.ts`

工作内容：

- 不新增 Trigger Binding Match 派生表；删除开发期已存在的 Match 表。
- Trigger Binding 保留 `(uid, workflow_id, revision, subject_type, event_type)` 唯一键，不限制一个 Workflow 只能有一条 Binding。
- Trigger Binding 增加 `(uid, event_type, status, workflow_id, revision, id)` Interest Reader 索引。
- `xy_wap_embed_workflow_event_subscription.account_id` 改为 `seat_id BIGINT UNSIGNED NULL`。
- 当前无生产历史数据，DDL 不保留 `account_id` 和 `seat_id` 双字段过渡。

### 3.4 Binding 发布事务

修改：

- `apps/backend/src/modules/workflow/workflow-mysql.repository.ts`
- Workflow 发布 Service 与 Repository Contract Test

要求：

- Definition/Revision 与 Binding 数组在同一发布事务中完成。
- 新 Revision 发布时将旧 Binding 标记失效，并批量插入新 Revision 的 Binding；本期数组长度为 1。
- Draft 保存不创建或更新 Binding。
- Pause、Resume、Stop、删除不单独修改 Binding；Interest Reader 通过 JOIN Definition 判断当前有效性。
- 席位不存在、失效或无法解析 `workUserId` 时整次发布失败。
- Backend 必须从权威关系解析 `seatId -> workUserId`，不能信任前端提交映射。

## 4. PR 2：Entry Consumer 与 Runtime 闭环

### 4.1 Binding Reader

修改：

- `packages/workflow-runtime/src/types.ts`
- `packages/workflow-runtime/src/mysql-repository.ts`
- `packages/workflow-runtime/src/memory-repository.ts`

工作内容：

- `listActiveTriggerBindings` 从 `(uid, subjectType, eventType)` 改为 `(uid, eventType)`。
- Repository 返回 Binding 的目标 `subjectType` 和结构化 Filter。
- 同一源事件可以命中多个 Workflow 的当前 Binding；每个 Workflow 自身只有一条 Binding。
- MySQL 与 Memory Contract Test 必须覆盖跨 Subject Type 的候选 Workflow。

### 4.2 Entry Consumer

修改：

- `apps/workflow-worker/src/entry-consumer.ts`
- Worker Entry Consumer 测试与 Fake Broker Fixture

处理顺序：

```text
校验公共信封
  -> Event Catalog 校验 payload
  -> 读取 uid + eventType 的候选 Binding
  -> 按 workUserId / seatId / tagId 完整匹配
  -> 根据 Binding subjectType 选择 Subject Candidate
  -> 为每个命中 Workflow 调用 startRun
  -> 处理动态 Wait Event Subscription
  -> 写 Inbox
  -> ACK
```

Subject 解析：

```text
wecom_contact -> externalUserId
chatai_contact -> thirdExternalUserId，并要求有效 seatId
```

缺少 ChatAI Candidate 时，只跳过 ChatAI SOP Binding，不能影响 WeCom SOP。

### 4.3 Wait Event

修改：

- `packages/workflow-runtime/src/service.ts`
- `packages/workflow-runtime/src/mysql-repository.ts`
- `packages/workflow-runtime/src/memory-repository.ts`
- Wait Event 测试

要求：

- `message.received` 使用 `thirdExternalUserId` 解析 `chatai_contact` Subject。
- Subscription 额外按可选 `seatId` 约束。
- 保持 waiting/triggered/collect window、CAS 和超时语义不变。
- Interest Reader 只是减少投递，Node Subscription 查询仍为权威。

### 4.4 分区与幂等

修改：

- `packages/contracts/src/workflow/entry-event.ts`
- Java/Node 共享 Fixture

规则：

```text
contact.* -> uid:wecom_contact:externalUserId
message.received -> uid:chatai_contact:thirdExternalUserId
```

保持不变：

- Inbox：`uid + eventId`
- Run 入口幂等：`uid + workflowId + entryEventId`
- Entry Guard：`uid + workflowId + subjectType + subjectId`
- Capability Action 幂等：`uid:runId:nodeId:sequence`

## 5. PR 3：Web Start 配置与变量

修改范围：

- `apps/web/src/pages/chat/workflow/nodes/start`
- Workflow Type 创建与 Start 配置测试
- 触发变量目录

工作内容：

- ChatAI SOP 选择席位，保存 `seatIds`。
- WeCom SOP 选择企微成员，保存 `workUserIds`。
- 不展示通用“托管账号”数据结构。
- ChatAI SOP 可配置三类首批事件；WeCom SOP 只能配置两类企微事件。
- Trigger Variables 使用产品中文名，但底层字段保持：

```text
workUserId
seatId
externalUserId
thirdExternalUserId
tagId
messageId
```

- 前端不提交或缓存 `seatId -> workUserId` 作为权威映射。
- 草稿保存允许保留尚未配置完成的来源；发布检查、首次启用和后续再发布均通过 Backend 权威关系识别已删除或失效的席位引用。

## 6. Java 可并行推进的工作

Java 不需要等待 PR 2、PR 3 完成。PR 1 冻结 DDL、JSON Fixture 和 SQL 后即可并行：

1. 实现只读 `WorkflowInterestReader` DAO：按 `uid + eventType` 查询 Binding JOIN Definition，最多返回 50 条。
2. 实现 `observe / enforce` 与 fail-open。
3. 解析 `filter_spec_json`，在内存中执行成员、席位、标签、来源和关键词预匹配。
4. 接入 `contact.friend_added`、`contact.tag_added`、`message.received` Mapper。
5. 为每类事件生成稳定 `eventId`。
6. 复用或实现 Transactional Outbox。
7. 按共享 Fixture 做 Java 序列化兼容测试。

Java 详细 SQL、权限、指标和验收场景见配套 Interest Reader 文档。

## 7. 并行关系

```text
PR 1：共享契约与持久化
  ├─> PR 2：Node Entry Consumer 与 Runtime
  ├─> PR 3：Web Start 配置
  └─> Java：Interest Reader + Mapper + Outbox

PR 2 + Java
  -> 联调 observe
  -> 小流量 enforce
```

PR 2、PR 3 和 Java 工作可以在 PR 1 合并后并行，不要求继续全部串行。

## 8. 明确不做

- 不建设统一跨域客户 ID。
- 不把一个 Run 改成多 Subject。
- 不为 ChatAI SOP 和 WeCom SOP 重复投递同一企微事件。
- 不让 Java 读取 Draft、Revision JSON 或 Execution Spec。
- 不让 Java 返回 Workflow ID 并创建 Run。
- 不为旧单 Subject Entry Event 写迁移或双读兼容。
- 不在本轮开放 `member_sop`。
- 不允许同一 Workflow 同时选择多个 Start Event。
- 不建立通用 Filter DSL；Java 只实现本文冻结的三类事件 Filter。
- 不在 SQL 中展开 JSON 条件或维护派生 Match 行；最多 50 条候选 Filter 在 Java 内存中匹配。
- 不添加 Java 本地负缓存。

## 9. 合并前验收

### PR 1

- Contracts build/test。
- Backend build + Workflow 发布/Repository 测试。
- Workflow Engine build/test。
- DDL 与 Kysely Schema 一致。
- Fixture 中不存在顶层 `subjectType`、`subjectId`。
- `git diff --check`。

### PR 2

- Workflow Runtime build/test。
- Workflow Worker build/test。
- 一条企微事件创建两个不同 Subject Type 的 Run。
- 重投同一事件不重复创建 Run。
- Wait Event 仍通过 CAS 处理消息到达和超时竞争。
- `git diff --check`。

### PR 3

- Web 相关 Vitest。
- `corepack pnpm --filter @chatai/web build`。
- ChatAI SOP 与 WeCom SOP 的 Start 配置无法互相写入错误来源类型。
- `git diff --check`。

### Java 联调

- 无兴趣事件在 `observe` 中仍投递，在 `enforce` 中被过滤。
- SQL 超时在两种模式下都投递。
- 打标签精确匹配 `workUserId + tagId`。
- 添加好友按 `workUserId` 和可选 `sourceIds` 匹配。
- 新消息按 `seatId` 和可选 `keywords` 匹配。
- Java 只生成一条企微 Outbox 记录。
- Java 与 Node 对同一 Fixture 的序列化结果一致。

## 10. 完成定义

以下条件全部满足后，入口事件与 Interest Reader 改造才算完成：

1. Node 不再生产或接受旧单 Subject Entry Event。
2. 三类首批事件均有共享 Schema 和 Java/Node Fixture。
3. 单 Start Event、单当前 Binding、完整 Filter Schema、索引和 Java 只读权限完成。
4. Java Interest Reader 在 `observe` 环境稳定运行并完成结果对账。
5. Node 能从一条企微事件正确创建 ChatAI SOP 与 WeCom SOP Run。
6. Wait Event 的新消息唤醒没有行为回退。
7. Java Event Outbox 和 Pulsar 重投由 Node 幂等吸收。
8. `enforce` 灰度期间没有可验证的漏事件。
