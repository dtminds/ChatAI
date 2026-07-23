# Insights Worker 日志与全局观测实施计划

This document is the handoff source of truth. Do not assume access to prior chat context.

> 实施人员按任务顺序逐项完成，并使用复选框维护进度。除非本计划明确调整，不得顺手改变会话切片、任务领取、重试、会话关闭或 LLM 输出业务语义。

**Goal:** 重构 Insights Worker 日志架构，在默认日志量可控的前提下保留关键推进证据；增加仅指定 `UID + subUserId` 身份可访问的跨租户只读观测页面，用于在线查看三条 Worker 管线、全局水位、所有已进入链路 UID、会话切片和分析任务的运行状态。

**Architecture:** Worker 继续使用 discovery、sessionization、analysis 三条独立 ticker。正常运行通过每管线每分钟一条结构化汇总日志表达，逐 UID/逐任务成功事件默认降为 DEBUG，异常按是否可恢复分为 WARN/ERROR，并对重复异常节流。Worker 启动时立即、之后每分钟向固定三行的运行状态表 UPSERT 管线心跳；观测 API 从心跳、水位、热任务、归档任务、逻辑会话、分析运行和重刷任务中读取权威状态。全 UID 列表不逐 UID 扫描消息事实表，只有 UID 详情执行精确消息 head/pending probe。

**Tech Stack:** Node.js 24、TypeScript、Fastify 5、Pino、Kysely、MySQL、TypeBox contracts、React 19、Vite 7、Vitest、Testing Library。

**实施状态（2026-07-23）：** 本计划对应的 contracts、Backend、Worker 日志与心跳、跨租户只读 API、Web 页面、测试和数据库文档已在本地实现并完成自审。完整测试通过：contracts 13 项、Backend 1215 项、Web 1770 项；contracts/backend/web builds 与 `git diff --check` 通过，最终 staged diff 已完成权限、敏感字段、SQL/index、状态派生、日志量和业务语义复核。当前环境未配置 `DATABASE_URL`，因此真实表 EXPLAIN、手工创建 runtime state 表、灰度部署及线上日志量观察仍属于发布阶段动作，不在本地实现中伪记为已完成。

**本轮 Review 固定结论：**

- `pending` 任务无论排队多久都不因队龄直接升级为 `blocked`；页面返回 `queueAgeMs`，管线是否停止推进由 runtime state 独立判断。
- `blocked` 只表达有权威证据支持的故障态，例如 running 租约已过期，或超期 open 会话长期没有 active sessionization job；不得把健康积压、正常延迟调度或单纯队龄较长映射为 `blocked`。
- 多实例共享三行 runtime state 时，`possibly_stalled` 只是聚合弱信号，不用于确认具体实例卡死、自动告警、摘除实例或触发业务补偿。
- API 的 heartbeat 新鲜度、租约、排队时长和持续时间统一基于同次请求读取的数据库 `CURRENT_TIMESTAMP(3)`，禁止混用 Node 本地时钟。
- runtime state 使用 `DATETIME(3)` 是有意区别于现有秒级 insight 表的设计，用于区分多实例同秒事件并保持关联字段的单调合并；schema snapshot 和 change-log 必须保留该精度。
- capabilities 与观测 API 复用 Backend 启动时解析的同一份 observer subjects 快照；`uid` 保持 number，`subUserId` 保持 string，通过 `${uid}:${subUserId}` 精确匹配。
- 生产默认 `LOG_LEVEL=info` 时普通批次 DEBUG 不可见属于预期；定向排障优先配置 trace UID，相关配置均在进程启动时读取，不支持热更新。

**编写时基线：**

- Branch: `codex/insights-always-on-sessionization`
- HEAD: `9a89b8b02 fix: fence insight sessionization leases`
- Worktree: clean
- 现有 Worker 默认配置：3 秒 tick、消息 batch 200、每个 sessionization tick 最多领取 10 个 UID、每个 analysis tick 最多领取 3 个任务。

实施前必须重新执行 `git status --short --branch`，保留用户已有或新产生的无关改动。

---

## 1. 固定决策

### 1.1 观测权限

- 观测页面是平台级跨租户只读页面，不是“当前租户只能看自己”的页面。
- 当前项目没有独立管理后台，也没有平台超级管理员角色。本期使用精确的 `UID + subUserId` 身份白名单作为临时超级管理员授权。
- JWT 中的真实字段名是 `subUserId`，类型为 `string`；不得将其默认转换为 number。
- 新环境变量：

```env
INSIGHTS_WORKER_OBSERVER_SUBJECTS=10001:20001,10002:20002
```

- 每个条目格式为 `<positive uid>:<non-empty subUserId>`，以逗号分隔。
- 空配置表示无人可访问。
- 非空配置中存在非法条目时，Backend 启动校验失败，不得静默放宽或部分生效。
- Backend 启动时只解析一次 observer subjects，并将不可变集合注入 capabilities service 和观测路由；请求处理中不得重新读取或解析 `process.env`。配置变更必须重新部署或重启 Backend 后生效，确保前端入口能力与服务端 API 鉴权始终使用同一份启动快照。
- 授权条件是正常登录/session 校验通过，且 `${request.user.uid}:${request.user.subUserId}` 精确命中白名单。
- 不复用 `INSIGHTS_WORKER_UID_ALLOWLIST`；该变量继续只表达 AI 洞察商业准入。
- 不依赖 `insight_enabled`、`insightAvailable` 或当前账号 role。
- 前端隐藏入口只负责交互，所有 API 必须在服务端重新鉴权。
- 观测者可以在 API 中指定目标 UID，但不得获得任何写操作。

### 1.2 页面范围

- 页面路由固定为 `/chat/insights/worker-observability`。
- 作为会话洞察侧栏中的条件导航项展示，名称为“运行观测”。
- 页面包含：全局摘要、全 UID 状态表、单 UID 详情。
- “所有 UID”定义为所有已经进入会话切片或洞察链路的 UID，而不是平台所有注册租户。集合来源为具体 UID cursor、当前 Insight Job、逻辑会话三者的并集。
- 第一版不查询或展示租户名称，不引入额外平台租户表依赖。
- 第一版只读，不提供重试、重置水位、回收租约、强制关闭、暂停 Worker、重新分析等按钮。
- 页面不集成日志检索系统，不展示消息内容、Prompt、模型原始输出、claim token 或完整 provider 响应。

### 1.3 数据表边界

- 新增一张固定低容量的 Worker 管线运行状态表，仅保存 discovery、sessionization、analysis 三行。
- 不新增 UID 进度表。
- 不新增逐批次事件流水表。
- UID 当前推进状态继续以 cursor、job、logical session、analysis run 等权威业务表为准。
- 历史批次明细由结构化日志承担，不复制进数据库。

### 1.4 日志边界

- 默认 INFO 目标：每个 Worker 实例每分钟不超过三条管线汇总，另加低频生命周期、人工重刷和真实异常事件。
- Worker 和 Backend 当前默认 `LOG_LEVEL=info`；普通 DEBUG 批次在生产不可见是预期行为，定向排障优先配置 trace UID。
- 不增加逐消息日志。
- 普通 UID 的批次成功、分析开始/成功、正常跳过默认降为 DEBUG。
- 仅 `INSIGHTS_WORKER_TRACE_UID_ALLOWLIST` 中的 UID 将逐批次诊断事件提升为 INFO。
- 观测权限白名单与日志 trace 白名单必须独立；能查看页面不会自动增加日志量。
- 日志和心跳写入失败不得改变 Worker 业务任务结果，也不得阻断 cursor、job、session 或 snapshot 的正常提交。

---

## 2. 非目标

- 不修改会话切片规则、具体 UID 的 `(msgtime, id)` 复合水位逻辑或全局 ID 水位逻辑。
- 不修改 `sessionize_uid`、`sync_messages`、`analyze_session`、`reanalyze_session` 的领取、互斥、重试和终态业务语义。
- 不修改 `max_attempts = 2` 的现有约定。
- 不增加新的 LLM 分析步骤，不修改 Prompt 和分析输出契约。
- 不建设完整 Prometheus/Grafana 体系；结构化汇总日志应为未来接入低基数指标保留稳定字段。
- 不建设跨租户运维写接口或正式 RBAC 超级管理员体系。
- 不根据理论风险预加消息事实表索引；先使用现有主键和 `idx_sync`，以真实 EXPLAIN/慢查询为准。
- 不处理逻辑会话数据清理或 30 天保留策略。

---

## 3. 当前实现与主要缺口

### 3.1 Worker 入口

- `apps/backend/src/worker.ts` 创建独立 Fastify/Pino 实例并启动 Worker，不监听 HTTP。
- `apps/backend/src/modules/insights/insights-worker-runtime.ts` 启动三条独立 pipeline。
- `apps/backend/src/modules/insights/insights-worker.ts` 承担 ticker、UID 维护、会话关闭和分析任务执行。
- `apps/backend/src/modules/insights/insights-worker.repository.ts` 承担 cursor、job、session、run 和 snapshot 数据访问。

### 3.2 日志缺口

- discovery 已返回 `cursorAuditId/discoveredMessages/discoveredUids/skipped`，runtime 当前直接丢弃结果。
- UID 扫描、Live 调度和会话关闭按批次打印 INFO；分析任务开始与终态分别打印 INFO。
- 会话关闭日志携带完整 `sessionIds`，单条最多接近一个 batch。
- pipeline、归档和 UID 维护失败没有节流；持续故障时可以每 3 秒重复。
- 可重试分析失败和终态失败当前都打印 ERROR，无法用于可靠告警。
- 正常 Live gate skip、消息不足和转写等待逐任务打印 INFO。
- ticker 因 non-overlap 忙碌而跳过时没有计数。
- 租约回收、claim lost、任务完成后 `pending/deleted` 结果没有统一推进事件。
- 洞察关闭导致自动分析跳过时，会先打印“开始”，随后静默返回。
- 默认 multi-step 分析的 summary、QA、classification 以及 Live gate 缺少步骤级耗时、请求次数和重试统计。

### 3.3 页面缺口

- Backend `/healthz` 和 `/readyz` 不代表独立 Worker 存活。
- 全局 cursor 空批时不更新，不能把 cursor `update_time` 当作进程心跳。
- `sessionize_uid` 追平后会删除，不能通过任务历史证明上一批成功。
- 当前没有跨租户观测 API 和页面。

---

## 4. 目标架构

```text
Insights Worker
  ├─ discovery ticker
  ├─ sessionization ticker
  └─ analysis ticker
        │
        ├─ structured event logs
        │    ├─ DEBUG: ordinary batch/job detail
        │    ├─ INFO: 60s pipeline summary, lifecycle, manual rescan
        │    ├─ WARN: recoverable degradation/retry
        │    └─ ERROR: terminal/invariant failure
        │
        └─ startup + 60s UPSERT
             xy_wap_embed_insight_worker_runtime_state
             (exactly one current row per pipeline)

Authenticated Backend
  ├─ exact observer subject guard (uid + subUserId)
  ├─ global summary repository
  ├─ all observed UID aggregate repository
  └─ selected UID exact diagnostic repository
        │
        └─ cursor + job + logical session + analysis run + rescan

Web
  ├─ conditional "运行观测" navigation
  ├─ global summary
  ├─ paged/filterable UID table
  └─ UID detail drawer
```

---

## 5. 结构化日志契约

### 5.1 通用字段

所有 Worker 结构化日志使用稳定英文 `eventCode`，中文 message 仅用于人读。

| 字段 | 规则 |
|---|---|
| `eventCode` | 稳定枚举，不使用自由文本 |
| `component` | 固定 `insights-worker` |
| `pipeline` | `discovery/sessionization/analysis` |
| `uid` | 只有 UID 相关事件携带 |
| `jobId/jobType` | 有任务时携带 |
| `rescanTaskId` | 人工历史重刷事件按需携带 |
| `sessionId/runId` | 有会话或分析运行时携带 |
| `mode/analysisScope` | 分析任务按需携带 |
| `attempt/maxAttempts/willRetry` | 失败、退避和重试事件必须携带 |
| `result` | 稳定结果码，如 `succeeded/skipped/retrying/failed` |
| `durationMs` | 任务或步骤耗时 |
| `errorCode` | 稳定错误码；不得拿完整错误消息做聚合键 |
| `suppressedCount` | 重复错误节流后的合并次数 |

实例身份优先复用 Pino 默认 `pid + hostname`。如需写入 `reported_by`，使用 `${hostname}:${pid}`，不增加复杂实例注册机制。

### 5.2 事件目录

以下 `eventCode` 是本期固定契约；如实现时确需调整命名，必须同步更新集中枚举、测试和本文，不能在调用点各自创造近义事件。

| eventCode | 默认级别 | 触发条件 |
|---|---|---|
| `insights_worker.started` | INFO | Worker 成功启动一次 |
| `insights_worker.stopped` | INFO | 优雅停止一次 |
| `insights_worker.disabled` | INFO | Worker 配置关闭 |
| `insights_worker.pipeline_summary` | INFO | 每管线每 60 秒一条，包括空闲窗口 |
| `insights_worker.discovery_batch` | DEBUG | discovery 单批结果 |
| `insights_worker.sessionization_uid_completed` | DEBUG/trace INFO | UID 单批完成 |
| `insights_worker.sessionization_uid_failed` | WARN | UID 维护异常并重新排队 |
| `insights_worker.sessions_closed` | DEBUG/trace INFO | 会话关闭批次 |
| `insights_worker.live_analysis_scheduled` | DEBUG/trace INFO | UID 的未完结会话已创建 Live 分析任务 |
| `insights_worker.analysis_started` | DEBUG/trace INFO | 分析任务开始 |
| `insights_worker.analysis_completed` | DEBUG/trace INFO | 分析任务成功 |
| `insights_worker.analysis_skipped` | DEBUG/trace INFO | insight disabled、消息不足、正常 gate skip |
| `insights_worker.analysis_retry_scheduled` | WARN | 本次失败但会重试 |
| `insights_worker.analysis_failed` | ERROR | 重试耗尽或非重试终态失败 |
| `insights_worker.live_gate_degraded` | WARN | gate 失败后按策略降级 |
| `insights_worker.llm_request_completed` | DEBUG/trace INFO | 一次真实模型 HTTP 请求结束 |
| `insights_worker.llm_optional_step_failed` | WARN | 可选步骤失败但任务仍发布 partial |
| `insights_worker.llm_response_format_fallback` | WARN | response format 不受支持并执行兼容降级 |
| `insights_worker.claim_lost` | WARN | claim token/lease 已失效 |
| `insights_worker.lease_reclaimed` | WARN | 实际回收数大于 0 |
| `insights_worker.archive_failed` | WARN | 终态任务归档失败但不改变已完成业务结果 |
| `insights_worker.pipeline_tick_failed` | WARN/ERROR | tick 失败；不变量/全局水位缺失为 ERROR |
| `insights_worker.pipeline_recovered` | INFO | 节流中的异常恢复 |
| `insights_worker.error_recovered` | INFO | 明确可恢复的非 pipeline 异常恢复 |
| `insights_worker.observability_flush_failed` | WARN | 汇总日志或心跳落库失败，不影响业务 |
| `insights_worker.rescan_started` | INFO | 人工历史重刷开始 |
| `insights_worker.rescan_completed` | INFO | 人工历史重刷结束 |
| `insights_worker.rescan_failed` | ERROR | `sync_messages` 人工重刷终态失败 |

### 5.3 每分钟汇总

每个实例、每条 pipeline 每 60 秒最多一条 `insights_worker.pipeline_summary`，即默认最多三条 INFO/分钟/实例。

共同字段：

- `windowSeconds`
- `ticksRun`
- `ticksSucceeded`
- `ticksFailed`
- `ticksSkippedBusy`
- `durationTotalMs`
- `durationMaxMs`
- `lastSuccessAt`

discovery 汇总：

- `discoveredMessages`
- `discoveredUids`
- `emptyBatches`
- `lockSkipped`
- `cursorAuditId`

sessionization 汇总：

- `jobsClaimed`
- `jobsDeleted`
- `jobsRequeued`
- `jobsFailed`
- `scannedMessages`
- `sessionizedMessages`
- `closedSessions`
- `liveJobsScheduled`
- `claimLost`
- `leasesReclaimed`

analysis 汇总：

- `jobsClaimed`
- `succeeded`
- `skippedInsightDisabled`
- `skippedInsufficientMessages`
- `postponedTranscription`
- `liveGateSkipped`
- `retried`
- `failed`
- `snapshotsPublished`
- `modelRequests`
- `modelRetries`
- `modelTimeouts`
- `modelFailures`
- `optionalStepFailures`
- `responseFormatFallbacks`
- `archiveFailures`
- `syncSucceeded`
- `syncFailed`

汇总器只保存在 Worker 进程内存中；重启后从新窗口开始，不做历史补偿。

### 5.4 重复错误节流

- key 固定为 `eventCode + pipeline + uid? + errorCode`。
- 共享数据库、Provider、归档、ticker 和大面积 claim 异常的 key 禁止携带 UID；只有已确认由单租户数据触发且隔离于其他租户的异常才加入 UID。
- 首次异常立即输出。
- 同 key 在随后 5 分钟内不重复输出；下一次输出带 `suppressedCount`。
- 只有与错误同作用域的权威成功才清理 key 并输出一次 recovery，禁止用任意空 tick 或其他 UID 成功误报恢复：
  - `pipeline_tick_failed` → 同一 pipeline 下一次完整 tick 成功，输出 `pipeline_recovered`
  - `archive_failed` → 下一次 archive 成功，输出 `error_recovered`
  - `sessionization_uid_failed` → 同 UID 后续维护批次成功，输出 `error_recovered`
  - Provider 公共请求失败 → 后续一次真实模型请求成功，输出 `error_recovered`
- `claim_lost`、terminal `analysis_failed`、optional-step failure、response-format fallback 等一次性事件不产生 recovery。
- 不随机采样 WARN/ERROR。
- key 不得包含 error message、sessionId、jobId 或模型自由文本。
- 内存节流表需要 TTL 清理和数量上限，建议 TTL 30 分钟、最多 5,000 个 key；超过上限优先清理最老条目。

### 5.5 UID trace

新增：

```env
INSIGHTS_WORKER_TRACE_UID_ALLOWLIST=
```

- 格式与现有 UID allowlist 一致，只接受正整数 UID。
- 默认空。
- trace UID 的批次完成、会话关闭、分析开始、分析跳过和分析完成事件提升为 INFO。
- 普通 UID 保持 DEBUG。
- trace 日志中的 session ID 样本最多 10 个，同时保留总数。
- trace 只影响日志级别，不改变领取范围、并发、重试和页面权限。

### 5.6 LLM 步骤观测

稳定步骤码：

- `live_gate`
- `summary`
- `qa`
- `classification`
- `single`

需要记录：

- step
- model profile/name
- request attempt count
- retry count
- duration
- outcome
- HTTP status 或 timeout 标识

规则：

- 单次成功请求不打印 INFO。
- 普通成功仅进入 pipeline summary；trace UID 可打印 DEBUG/INFO 诊断。
- 中间重试后最终成功只累计 retry，不打印 WARN。
- 每一次真实模型 HTTP 请求都进入 `llm_request_completed` 观测计数；默认 DEBUG，只有 trace UID 提升为 INFO。
- response format fallback 产生的额外 HTTP 请求也必须计数，并额外产生一条节流 WARN。
- 最终步骤失败且整个 job 会重试，打印一条 job 级 WARN，并包含 `failedStep`。
- optional step 失败但任务发布 partial，需要打印一条 WARN。
- 任务业务结果已提交但归档失败时打印节流 WARN；人工 `sync_messages` 重刷终态失败时打印 ERROR。
- 禁止记录 Prompt、消息内容、完整 response body、API key、Authorization header 和原始模型输出。
- `LlmRequestError.responseText` 不得直接进入 INFO/WARN/ERROR 日志。
- 本期不新增 token usage/费用账单持久化；先用真实模型请求数、重试数、耗时和失败数判断运行状况。

---

## 6. Worker 管线运行状态表

新增：

```sql
CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_worker_runtime_state (
  pipeline VARCHAR(32) NOT NULL COMMENT 'Worker管线，discovery、sessionization、analysis',
  last_started_at DATETIME(3) NULL COMMENT '最近一次开始实际执行tick的时间',
  last_success_at DATETIME(3) NULL COMMENT '最近一次实际执行成功时间',
  last_failure_at DATETIME(3) NULL COMMENT '最近一次实际执行失败时间',
  last_error_code VARCHAR(128) NULL COMMENT '最近一次稳定错误码',
  last_duration_ms INT UNSIGNED NULL COMMENT '时间最新的一次已完成执行耗时，毫秒',
  reported_by VARCHAR(128) NOT NULL COMMENT '最近状态上报实例，hostname:pid',
  reported_at DATETIME(3) NOT NULL COMMENT '最近一次状态上报时间',
  create_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  update_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (pipeline)
) COMMENT='会话洞察Worker管线运行状态表';
```

语义：

- 表中最多三个业务行。
- Worker 启动时立即为三条 pipeline 各 UPSERT 一次，之后每管线每 60 秒上报一次；不得等满第一个 60 秒窗口才出现心跳。
- `reported_at` 证明至少一个实例仍在上报；`last_started_at` 只在实际开始执行 tick 时推进，non-overlap busy skip 只进入日志汇总。
- `reported_at` 在 UPSERT SQL 中使用数据库 `CURRENT_TIMESTAMP(3)`，不用应用实例本地时钟判断 heartbeat 新鲜度。
- tick 成功推进 `last_success_at`；tick 失败推进 `last_failure_at` 和对应 `last_error_code`。
- `last_duration_ms` 对应 `last_success_at`、`last_failure_at` 二者中时间更新的那一次已完成 tick。
- 表内不存 `status`、`last_tick_outcome` 或 `consecutive_failures`；健康状态由 API 根据时间字段派生，连续失败次数由结构化日志汇总观察。
- 多实例共享同一行时，UPSERT 必须按时间单调合并，而不是由最后完成 SQL 的实例无条件覆盖：
  - `reported_at`、`last_started_at`、`last_success_at`、`last_failure_at` 使用 `GREATEST` 或等价 NULL-safe 比较。
  - `reported_by` 只随更新的 `reported_at` 写入。
  - `last_error_code` 只随更新的 `last_failure_at` 写入。
  - `last_duration_ms` 只随时间更新的最新完成事件写入。
  - 关联字段仅在 incoming timestamp 严格大于 stored timestamp 时替换；时间相等时保留现值。
  - 延迟提交的旧 started/success/failure payload 不得把较新的事件时间及其关联字段覆盖回去；`reported_at` 以该次 SQL 实际执行时间为准并正常推进。
- 本表只证明“至少一个实例仍在上报以及最近观测到的推进时间”，不承担实例清单或租约真相职责。
- 多实例下 `possibly_stalled` 仅是聚合弱信号：它只表示最新观测到的 started 尚未被任何更晚的成功/失败完成覆盖；其他实例的后续成功可能掩盖单个实例卡住。本期不按 `reported_by` 分实例建模，不得据此判断具体实例是否存活。
- API 和页面不得把 `possibly_stalled` 表述为多实例 Worker 整体或某一实例已经卡死；页面需使用“可能长时间运行（聚合判断）”并展示最近上报实例、开始时间和持续时长，具体实例级诊断依赖结构化日志。
- 首轮灰度和验收不把 `possibly_stalled` 作为自动告警或实例下线依据；若后续需要可靠定位多实例卡顿，再单独增加按 `reported_by` 分实例的运行状态模型。
- 状态表写入失败只触发节流 WARN，不得使原 pipeline tick 失败。

页面状态：

- runtime-state repository 必须读取一次数据库 `CURRENT_TIMESTAMP(3)` 作为 `observedAt`；心跳新鲜度、运行时长和疑似卡住时长均基于该 DB 时间派生，禁止使用 `Date.now()`。
- 以下时间比较均为 NULL-safe；缺失的成功/失败完成时间视为尚未发生。
- runtime state 行缺失：health `unknown`、activity `unknown`
- `observedAt - reported_at > 150s`：health `offline`、activity `unknown`
- `reported_at` 新鲜但 `last_failure_at > last_success_at`：`degraded`
- `reported_at` 新鲜且尚无成功或失败记录：`unknown`，通常只出现在刚启动的短暂窗口
- `last_started_at` 晚于最近成功/失败时，另派生 `activity = running` 并返回已运行时长；持续超过 15 分钟时派生 `activity = possibly_stalled` 且 health 为 `degraded`
- 其它新鲜且已完成状态派生 `activity = idle`
- 其它：`healthy`

15 分钟只是第一版保守代码常量，用于识别聚合状态中可能长时间运行的 tick；页面必须同时展示开始时间和持续时长，并明确标为“可能长时间运行（聚合判断）”，不能表述为已确认故障或具体实例卡死。

数据库文档必须同步：

- `docs/db/schema.sql`
- `docs/db/change-log.md`，包含手工建表 SQL
- `apps/backend/src/db/schema.ts`
- `apps/backend/src/db/writable-tables.ts`
- `apps/backend/scripts/codegen-db.config.json`

---

## 7. 跨租户观测 API

### 7.1 Capabilities

扩展 `InsightCapabilitiesResponse`：

```ts
type InsightCapabilitiesResponse = {
  canManageInsights: boolean;
  canViewWorkerObservability: boolean;
  insightAvailable: boolean;
  mode: "basic" | "insight";
};
```

observer subjects 在 Backend 启动/路由注册时严格解析一次，并以 `ReadonlySet<string>` 注入 `InsightsService` 和观测路由。`getCapabilities` 使用最小签名 `getCapabilities(scope, role, subUserId)`：复用 `scope.uid`，route 只额外传入 `request.user.subUserId`，不得重复传第二份 UID，也不得在每次请求中重新读取环境变量。`canViewWorkerObservability` 只由 `${scope.uid}:${subUserId}` 是否精确命中注入的启动快照决定。

### 7.2 路由

```http
GET /api/server/insights/worker-observability/summary
GET /api/server/insights/worker-observability/uids
GET /api/server/insights/worker-observability/uids/:uid
```

所有路由：

1. 路由 scoped `onRequest` 先设置 `Cache-Control: no-store`
2. `app.authenticate`
3. observer subject 精确鉴权
4. 参数校验
5. 执行跨租户只读查询

禁止把目标 UID 用作鉴权身份；目标 UID 只决定被观察租户。

`no-store` hook 必须早于鉴权和 schema 校验执行，确保 200、400、401、403 和 5xx 都带该响应头，避免跨租户运行状态或鉴权结果被浏览器、代理或共享缓存保存。

### 7.3 Summary 响应

至少包含：

- `observedAt`，来自数据库 `CURRENT_TIMESTAMP(3)`，不是 Node 应用时钟
- 三条 pipeline runtime state，包含 health、activity、lastStartedAt、lastSuccessAt、lastFailureAt、lastErrorCode、lastDurationMs、reportedBy、reportedAt
- 全局 cursor audit ID、source head audit ID、位置差、是否存在 backlog
- sessionization job pending/running/retrying/expired lease 数
- analysis job pending/running/retrying/`failedLast24h`/expired lease 数
- open session、overdue open session 数
- observed UID 总数及状态分布

`sourceHeadAuditId - cursorAuditId` 只能命名为位置差，不得展示成“积压消息条数”。

### 7.4 UID 列表

Query：

- `page`，默认 1
- `pageSize`，默认 50，最大 100
- `uid`，可选精确 UID 搜索
- `state`，可选综合状态筛选
- `sessionizationState`，可选
- `analysisState`，可选

单项至少包含：

- UID
- overall state
- cursor `(cursorMsgtime, cursorAuditId, updateTime)`
- current `sessionize_uid` 状态、runAfter、queueAgeMs、attempt/maxAttempts、leaseUntil、errorCode
- open/overdue session 数和最早 nextCloseAt
- analysis pending/running/retrying/`failedLast24h` 数
- 最近错误码和时间

观测 UID 集合：

- `xy_wap_embed_insight_sync_cursor` 中 source 匹配且 `uid > 0`
- 当前 `xy_wap_embed_insight_job.uid`
- `xy_wap_embed_logical_session.uid`

当前 UID 不到 1,000，第一版固定采用以下顺序：

1. 用常数次批量查询取回 observed UID 并集和派生状态所需的聚合数据。
2. 在 service 内按 UID 合并并派生 sessionization、analysis、overall state。
3. 对完整派生结果执行筛选；默认按 overall 优先级 `blocked > error > retrying > processing > queued > idle` 排序，同状态按 UID 升序，第一版不开放自定义排序。
4. 最后计算 `total` 并分页。

禁止先对任一来源分页后再合并或筛选，否则状态筛选和总数会失真；禁止对每个 UID 发起独立 SQL。

UID 列表不得逐 UID 查询 `xy_wap_embed_msg_audit_info`。

### 7.5 UID 详情

只有选中一个 UID 后执行：

- 读取具体 UID cursor。
- 使用 `idx_sync(uid,msgtime,id)` 查询该 UID source head。
- 使用现有复合条件执行 `hasPending` probe。
- 查询当前 hot jobs。
- hot jobs 只读取 `pending/running` 以及最近 24 小时 `failed`，不得把长期保留的成功终态任务整表加载进观测请求。
- 查询最近逻辑会话，默认 20 条。
- 查询 open/overdue 会话和最早 `next_close_at`。
- 先取得有限 job/session ID，再通过 `idx_analysis_run_job` 或 `idx_analysis_run_session` 查询最近 analysis runs。
- 查询最近任务错误，合并 hot job 和 archive，最多 20 条。
- 查询最近 rescan task，最多 10 条。

不得从 `analysis_run` 全表 JOIN logical session 后再按 UID 排序。

### 7.6 状态派生

每次 summary/list/detail 请求都由 repository 读取一次数据库 `CURRENT_TIMESTAMP(3)` 作为本次 `observedAt`。所有 `run_after`、`lease_until`、`reported_at`、`next_close_at` 和持续时长比较都复用该值；状态派生代码禁止混入 `Date.now()`。

Sessionization 状态：

- running 且 lease 已过期：`blocked`
- 最早 open session 的 `next_close_at <= observedAt - 5 分钟` 且仍无 active sessionization job：`blocked`
- running 且 lease 有效：`processing`
- pending 且 `run_after > observedAt` 且有 errorCode：`retrying`
- 其它 pending，包括未来正常调度且无 errorCode：`queued`，同时返回 `runAfter`
- 无 active `sessionize_uid` 任务：`idle`

pending 的 `queueAgeMs = max(0, observedAt - runAfter)`，仅用于显示和诊断，不把长队龄自动升级为 `blocked`。`update_time` 会被重复入队刷新，不得用作队龄起点。健康 Worker 下 pending 等待超过 5 分钟仍然是 `queued`；pipeline offline/degraded 由全局管线状态独立表达。

页面可以把 `queueAgeMs` 与 sessionization pipeline 的 `health/activity` 并列展示，帮助判断“健康积压”或“管线未推进”，但不得在前端根据两者组合自行合成新的 `blocked` 状态。故障状态只使用服务端上述稳定派生规则，避免 Backend、Web 口径分叉。

`idle` 只表示“当前已发现并已入队的 sessionization 工作没有 active job”，不得在 API 或 UI 中表述为“消息源已追平”。是否存在尚未被发现的消息只能结合全局 discovery cursor 与 source head 判断；UID 列表不逐 UID probe，因此不能给单个 UID 作消息源追平承诺。

Analysis 状态：

- running 且 lease 过期：`blocked`
- 最近 24 小时存在 terminal failed：`error`
- running 且 lease 有效：`processing`
- pending 且 `run_after > observedAt` 且有 errorCode：`retrying`
- 其它 pending，包括 Final 的正常 `analysisDelayMinutes` 延迟：`queued`，同时返回 `runAfter`
- 无 active job 且最近 24 小时无 terminal failed：`idle`

状态判断按上述优先级执行；`failedLast24h` 必须同时覆盖 hot job 与 archive，Summary、UID 列表和 `error` 派生统一使用最近 24 小时窗口。详情页仍只展示最近 20 条错误记录，不把该展示条数当统计口径。

Analysis pending 同样不得仅因等待时间或 `update_time` 长时间不变升级为 `blocked`。如需展示排队时长，统一返回 `queueAgeMs = max(0, observedAt - runAfter)`；分析管线是否离线或降级由全局 runtime state 独立表达。

Analysis 页面同样只并列呈现队龄与 analysis pipeline 健康状态，不因管线 `offline/degraded` 自动把每个排队任务批量染成 `blocked`。这样既能暴露全局停止推进，又不会用大量重复 UID 状态淹没真正的租约或会话终结故障。

Overall 优先级：

```text
blocked > error > retrying > processing > queued > idle
```

这些阈值先使用代码常量，不增加新的环境变量。真实上线数据证明不合适后再单独产品化配置。

### 7.7 安全与脱敏

- 不返回消息内容、客户/客服第三方 ID、Prompt、模型原始输出、API key。
- 第一版不读取或返回 job/run 的原始 `error_message`，因为截断不能保证客户内容、Prompt、provider body 或 token 不出现在前缀中。
- 只返回稳定 `errorCode`、时间和状态；如需人读说明，仅允许由本地稳定 errorCode allowlist 映射安全固定文案，未知错误不返回说明并提示查结构化日志。
- 不返回 sessionization claim token、job `locked_by` 或 idempotency key。
- `reported_by` 可以返回给 observer，用于识别最近上报实例。
- 所有 DTO `additionalProperties: false`。
- 所有 ID 遵循仓库现有 MySQL ID 约定，不引入 BigInt/string 全链路重构。

---

## 8. Web 页面

### 8.1 路由与导航

- 新增 lazy route `/chat/insights/worker-observability`。
- `InsightsLayout` 根据 optional capabilities 动态增加“运行观测”导航。
- capability 尚未加载或无权限时不展示入口。
- 该路由不得加入基础模式的 `aiOnlyPaths`；observer 即使当前租户 `mode = basic` 或 `insightAvailable = false` 也可进入，唯一业务授权条件是 `canViewWorkerObservability`。
- 直接进入路由但 capability 为 false 时展示无权限状态且不请求观测数据；Backend 仍是最终权限边界。

### 8.2 全局摘要

卡片至少包含：

- 三条 pipeline：正常、降级、离线、未知
- 全局 discovery：水位已到当前 source head 或仍有位置差；`sourceHeadAuditId - cursorAuditId` 不得称作精确消息条数
- UID 切片任务：排队、运行、重试、阻塞
- 会话终结：open、overdue
- 分析队列：排队、运行、重试、近 24 小时失败

### 8.3 UID 表格

- 支持 UID 搜索、状态筛选、分页。
- 明确区分 loading、empty、error。
- loading 保留表头并使用现有 `Spinner`。
- 状态使用 Badge，不展示内部技术栈错误堆栈。
- queued 行展示 `queueAgeMs` 对应的排队时长；排队较久只做中性诊断信息，不使用 blocked/error 视觉。
- 点击行打开详情抽屉，不切换当前登录租户。

### 8.4 UID 详情

分区：

1. 水位与 source head
2. 当前 sessionization task
3. 会话状态与最近逻辑会话
4. 分析队列和最近 analysis run/snapshot
5. 最近错误和重刷任务

### 8.5 刷新

- summary 和 UID 列表：页面可见时每 30 秒刷新。
- UID 详情打开时：每 15 秒刷新。
- `document.visibilityState !== "visible"` 时暂停。
- 支持手动刷新。
- 不使用 SSE/WebSocket。
- 观测 API 前缀加入 Backend `shouldDisableRequestLogging`，避免轮询生成 Fastify request INFO；显式业务错误日志不关闭。

---

## 9. 查询与性能边界

- 全局消息 source head 使用主键倒序 `ORDER BY id DESC LIMIT 1`。
- 单 UID source head/pending 使用现有 `idx_sync(uid,msgtime,id)`。
- 不执行全局或逐 UID 精确 backlog `COUNT(*)`。
- UID 列表使用批量聚合结果在 service 合并，禁止 N+1。
- UID 状态筛选、稳定排序和 `total` 计算必须在完整的不足 1,000 个派生结果上完成，然后分页；禁止 SQL 分页后再做状态筛选。
- hot job 表当前规模由终态归档控制，第一版不预加 `(uid,job_type,status,update_time)`。
- overdue session 全局查询可使用现有 `(status,next_close_at)`；单 UID 详情使用 `exists/limit`。
- 如果真实 EXPLAIN 或慢查询证明必要，再考虑 `(uid,status,next_close_at,id)`；不得在本计划实现前预判添加。
- UID 列表默认 50、最大 100；最近 session/run/error 都必须有限制。
- 页面查询不得持有 `FOR UPDATE`，不得干扰 Worker 任务领取。

上线前执行并保存 EXPLAIN：

```sql
EXPLAIN SELECT id
FROM xy_wap_embed_msg_audit_info
ORDER BY id DESC
LIMIT 1;

EXPLAIN SELECT id, msgtime
FROM xy_wap_embed_msg_audit_info
WHERE uid = ?
ORDER BY msgtime DESC, id DESC
LIMIT 1;

EXPLAIN SELECT id
FROM xy_wap_embed_msg_audit_info
WHERE uid = ?
  AND (msgtime > ? OR (msgtime = ? AND id > ?))
ORDER BY msgtime, id
LIMIT 1;
```

---

## 10. 分阶段开发任务

依赖顺序：Task 1 与 Task 2 可并行；Task 3 依赖 Task 2；Task 4 依赖 Task 1、Task 3；Task 5 依赖 Task 1、Task 2；Task 6 依赖 Task 1、Task 5；Task 7 在代码形态稳定后收口；Task 8 最后执行。

### Task 1: Contracts、环境变量与 Observer 身份

**Files:**

- Modify: `.env.example`
- Modify: `apps/backend/.env.example`
- Modify: `apps/backend/src/config/env.ts`
- Create: `apps/backend/src/modules/insights/insights-worker-observer-access.ts`
- Modify: `packages/contracts/src/insights/dto.ts`
- Test: `packages/contracts/test/insights-dto.test.ts`
- Modify/Test: `apps/backend/test/env.test.ts`
- Test: `apps/backend/test/modules/insights/insights-worker-runtime.test.ts`
- Create/Test: `apps/backend/test/modules/insights/insights-worker-observer-access.test.ts`

**Interfaces:**

- Produces `INSIGHTS_WORKER_OBSERVER_SUBJECTS`
- Produces `INSIGHTS_WORKER_TRACE_UID_ALLOWLIST`
- Produces pure observer-subject parser and exact matcher
- Extends `InsightCapabilitiesResponse.canViewWorkerObservability`
- Adds summary/list/detail request and response DTOs

**Steps:**

- [x] 先添加 contract 和 parser 失败测试。
- [x] 定义 pipeline state、UID state、summary/list/detail DTO。
- [x] 实现 observer subjects 严格解析：空值允许，非法非空配置启动失败。
- [x] 从 `validateBackendEnv()` 调用 observer subjects 严格 parser，确保注册路由前失败；Worker runtime 启动时严格解析 trace UID allowlist。
- [x] Backend 注册 Insights 路由时解析一次 observer subjects，将不可变集合注入 capabilities service 与观测路由；禁止在请求期间重新解析环境变量。
- [x] 使用 `uid + subUserId` 精确匹配，不加入 role 判断。
- [x] 更新所有 capability fixtures/mocks，避免 object spread 漏字段。
- [x] 运行 contracts 和 access/runtime focused tests。

**Acceptance:**

- 空 observer 配置返回 false。
- 同 UID 不同 subUserId 返回 false。
- 同 subUserId 不同 UID 返回 false。
- 精确 pair 返回 true。
- 非数字/非正数 UID、空 subUserId、缺分隔符均被拒绝。
- 非法 observer subjects 使 `validateBackendEnv()`/`buildApp` 在路由可用前失败；非法 trace allowlist 使 Worker runtime 启动失败。
- 同一 Backend 进程内 capabilities 与观测 API 始终使用相同的 observer subjects 启动快照；修改环境变量但未重启时两者均不热更新。

### Task 2: Runtime State Schema 与 Repository

**Files:**

- Modify: `docs/db/schema.sql`
- Modify: `docs/db/change-log.md`
- Modify: `apps/backend/src/db/schema.ts`
- Modify: `apps/backend/src/db/writable-tables.ts`
- Modify: `apps/backend/scripts/codegen-db.config.json`
- Modify: `apps/backend/src/modules/insights/insights-worker.ts`（repository port）
- Modify: `apps/backend/src/modules/insights/insights-worker.repository.ts`
- Modify/Test: `apps/backend/test/modules/insights/insights-repository.test.ts`

**Interfaces:**

- Produces `xy_wap_embed_insight_worker_runtime_state`
- Produces `upsertWorkerPipelineRuntimeState`

**Steps:**

- [x] 先添加 repository UPSERT 和读取测试。
- [x] 更新 schema snapshot、Kysely 类型和 writable allowlist。
- [x] 更新 DB codegen 配置，使新表进入生成类型范围。
- [x] 在 change-log 记录手工建表 SQL，并明确 `DATETIME(3)` 是为了区分多实例同秒事件及保障关联字段严格单调合并而有意采用，不得抄成秒级 `DATETIME`。
- [x] 实现按 pipeline 主键、按事件时间单调合并的 UPSERT。
- [x] 验证成功、失败、启动上报和较旧多实例上报的字段语义。
- [x] 确保 runtime state 写失败不会影响业务 repository transaction。

**Acceptance:**

- 重复上报同 pipeline 始终只有一行。
- 三条 pipeline 最多三行。
- 较旧实例延迟提交不会覆盖更新的 `lastStartedAt/lastSuccessAt/lastFailureAt` 及其关联字段；`reportedAt` 只按数据库执行时间前进。
- incoming 与 stored 时间相等时保持原关联字段，避免同毫秒上报造成 errorCode/duration 抖动。
- schema snapshot 与 change-log 均保留 `DATETIME(3)` 精度，并记录其与现有秒级 insight 表不同的设计原因。
- runtime state 不持久化派生状态、连续失败数或 busy skip；这些分别由 API 时间比较和日志汇总表达。
- 无业务表写入被心跳事务包裹。

### Task 3: 日志基础设施

**Files:**

- Create: `apps/backend/src/modules/insights/insights-worker-observability.ts`
- Modify: `apps/backend/src/modules/insights/insights-worker-runtime.ts`
- Modify: `apps/backend/src/modules/insights/insights-worker.ts`
- Create/Test: `apps/backend/test/modules/insights/insights-worker-observability.test.ts`
- Modify/Test: `apps/backend/test/modules/insights/insights-worker-runtime.test.ts`

**Interfaces:**

- Produces stable worker event logger
- Produces 60-second per-pipeline accumulator
- Produces duplicate-error throttle/recovery tracker
- Produces trace UID level resolver
- Produces the only startup/60-second runtime-state and summary flush scheduler

**Steps:**

- [x] 先添加 summary、节流、recovery、trace 行为测试。
- [x] 扩展 Worker logger 类型以支持 `debug/warn/info/error`。
- [x] 建立稳定 eventCode 和公共字段。
- [x] 实现每 pipeline 独立窗口计数。
- [x] 实现 5 分钟重复错误节流、30 分钟 TTL、5,000 key 上限。
- [x] 实现 trace UID 的 DEBUG → INFO 提升。
- [x] Worker 启动时立即写入三条 pipeline heartbeat，之后每 60 秒刷新。
- [x] Worker disabled 时只记录 `insights_worker.disabled`，不写新鲜 runtime state。
- [x] 在优雅停止时 flush 当前窗口并记录 stopped。
- [x] 所有 observer 内部错误必须被捕获，不得向业务 pipeline 抛出。

**Acceptance:**

- 空闲运行一分钟仍输出一条 summary/pipeline。
- 同一错误一分钟内只输出首条。
- 五分钟后输出带 suppressedCount 的合并事件。
- 成功后只输出一次 recovery。
- 非 trace UID 普通批次没有 INFO。
- Worker 启动后无需等待 60 秒即可读到三条 runtime state。
- Worker disabled 不会刷新旧 runtime state，页面最终显示 offline。

### Task 4: 三条管线与 LLM 接入

**Files:**

- Modify: `apps/backend/src/modules/insights/insights-worker.ts`
- Modify: `apps/backend/src/modules/insights/insights-worker-runtime.ts`
- Modify: `apps/backend/src/modules/insights/insights-worker.repository.ts`
- Modify: `apps/backend/src/modules/insights/llm-provider.ts`
- Modify/Test: `apps/backend/test/modules/insights/insights-worker.test.ts`
- Modify/Test: `apps/backend/test/modules/insights/insights-repository.test.ts`
- Modify/Test: `apps/backend/test/modules/insights/llm-provider.test.ts`
- Modify/Test: `apps/backend/test/modules/insights/insights-worker-runtime.test.ts`

**Steps:**

- [x] discovery 将 batch 结果计入 summary，不再静默丢弃。
- [x] non-overlap tick 返回 false 时计入 `ticksSkippedBusy`。
- [x] sessionization 记录 claimed/deleted/requeued、消息扫描/切片、关闭、Live 调度、claim lost 和 lease reclaim。
- [x] UID 维护普通异常在重新排队之外，产生节流 WARN 并累计 `jobsFailed`，不得误归为整个 pipeline tick failure。
- [x] 使用 `completeSessionizationUidJob` 的 `pending/deleted` 返回值记录推进结果。
- [x] 会话关闭普通日志删除完整 sessionIds；trace 仅保留最多 10 个样本。
- [x] analysis 开始/成功降 DEBUG；洞察关闭、消息不足、正常 gate skip 使用稳定 skip reason。
- [x] 可重试失败打印 WARN 并带 attempt/maxAttempts/willRetry；终态失败才 ERROR。
- [x] gate 降级改为 WARN，不重复打印一条 ERROR 加一条 INFO。
- [x] 将 summary、QA、classification、live gate、single 的请求/重试/超时/耗时计入观测。
- [x] 覆盖真实 LLM request completed、optional step failed 和 response-format fallback 事件。
- [x] 覆盖任务归档失败和人工 rescan/`sync_messages` 终态失败事件。
- [x] 新增统一的安全错误映射/serializer；Pino error payload 只保留 `name/errorCode/httpStatus/timeout` 等 allowlist 字段，不得直接传入可能枚举出 `LlmRequestError.responseText` 的原始 Error 对象。
- [x] ticker/业务路径只向 Task 3 reporter 上报 started/succeeded/failed 和业务计数；不得新建第二个 heartbeat、summary 或 flush timer。
- [x] 保持现有 Worker 行为测试全部通过。

**Acceptance:**

- 不改变 cursor、session、job、snapshot 的提交顺序和结果。
- 洞察关闭的自动任务有稳定 skipped 结果，不再出现孤立“开始”INFO。
- 分析第一次失败且会重试只产生 WARN。
- 第二次失败终态产生 ERROR。
- 正常 multi-step 分析能统计逻辑步骤和底层请求重试，但不逐请求打印 INFO。
- single、scoped rescan 和 response-format fallback 的实际请求次数均不会漏计。

### Task 5: 跨租户只读 Repository、Service 与 Routes

**Files:**

- Create: `apps/backend/src/modules/insights/insights-worker-observability.repository.ts`
- Create: `apps/backend/src/modules/insights/insights-worker-observability.service.ts`
- Create: `apps/backend/src/modules/insights/insights-worker-observability.routes.ts`
- Modify: `apps/backend/src/app.ts`
- Modify: `apps/backend/src/modules/insights/insights.service.ts`
- Modify: `apps/backend/src/modules/insights/insights.routes.ts`
- Test: `apps/backend/test/modules/insights/insights-service.test.ts`
- Test: `apps/backend/test/modules/insights/insights-routes.test.ts`
- Create/Test: `apps/backend/test/modules/insights/insights-worker-observability-service.test.ts`
- Create/Test: `apps/backend/test/modules/insights/insights-worker-observability-routes.test.ts`
- Create/Test: `apps/backend/test/modules/insights/insights-worker-observability-repository.test.ts`

**Steps:**

- [x] 先添加跨租户授权和越权失败测试。
- [x] capabilities 使用 request user 的 uid/subUserId 计算 observer 权限。
- [x] 将启动时解析的 observer subject 集合注入 `InsightsService`，capabilities 调用收敛为 `getCapabilities(scope, role, request.user.subUserId)`，复用 `scope.uid` 做 pair matcher，并更新全部 backend fixtures 与 web mocks。
- [x] 注册三个只读路由。
- [x] 在执行任何目标 UID 查询前完成 observer guard。
- [x] 在 authenticate 和 schema validation 之前通过 scoped hook 设置 `Cache-Control: no-store`。
- [x] repository 为每次请求读取一次 DB `CURRENT_TIMESTAMP(3)` 并作为 `observedAt`；实现 runtime state、全局 cursor/source head 和全局 job/session 聚合。
- [x] `observedAt` 在每个 summary/list/detail repository 调用开始时通过数据库查询取得一次，后续查询和状态派生复用该值；不得分别用 Node 时钟计算 heartbeat、租约和队龄。
- [x] 在 SQL 或同一次 repository 请求上下文中基于该 DB `observedAt` 派生 heartbeat 新鲜度和所有持续时间，不得用 Node `Date.now()` 与数据库时间字段直接比较。
- [x] 新 observability repository 负责 `listWorkerPipelineRuntimeStates` 和全部 API 只读查询；Task 2 的 Worker repository 只负责 heartbeat writer。
- [x] 实现 observed UID 集合批量查询；在 service 内对完整集合派生、筛选、排序并计算 total，最后分页。
- [x] 列表禁止逐 UID 消息表查询。
- [x] 实现单 UID 精确 source head/pending probe。
- [x] analysis run 先通过有限 job/session ID 查询。
- [x] 实现状态派生；错误只返回稳定 errorCode 和 allowlist 固定说明，不查询或转发原始 error_message。
- [x] 所有时间派生复用 DB `observedAt`，禁止使用 `Date.now()`；pending queue age 只基于 `runAfter`。
- [x] 所有返回 DTO 通过 TypeBox response shape 测试。

**Acceptance:**

- 未登录返回 401。
- 未命中 pair 返回 403。
- 命中 pair 可以读取与登录 UID 不同的目标 UID。
- capabilities 对 exact pair 返回 `canViewWorkerObservability = true`；同 UID 不同 subUserId 返回 false，且不受 mode/insightAvailable 影响。
- capabilities 与观测 API 复用同一份启动时 observer subject 集合；运行中修改 `process.env` 不会造成入口可见性与 API 鉴权分裂。
- 修改 query/body 不能绕过 observer guard。
- 所有接口只执行 SELECT。
- UID 列表查询次数为常数级，不随 UID 数线性增长。
- derived-state 筛选后的 `total` 和分页结果来自完整 observed UID 集合，不会遗漏后页 UID。
- pending 超过 5 分钟但租约未过期、pipeline 仍在推进时保持 queued，并返回正确的 queueAgeMs。
- analysis pending 等待超过 5 分钟时同样保持 queued；只有 running lease 过期或近 24 小时 terminal failed 分别进入 blocked/error。
- pipeline offline/degraded 与 UID queueAge 可以同时返回和展示，但不得把所有 queued UID 自动升级为 blocked。
- 响应不包含 job `locked_by`，只有 runtime state 可以包含 `reportedBy`。
- 200、400、401、403 和 handler 5xx 响应均包含 `Cache-Control: no-store`。

### Task 6: Web API、路由与页面

**Files:**

- Modify: `apps/web/src/pages/chat/insights/api/insights-service.ts`
- Create: `apps/web/src/pages/chat/insights/insights-worker-observability-page.tsx`
- Modify: `apps/web/src/pages/chat/insights/insights-capabilities-context.tsx`
- Modify: `apps/web/src/pages/chat/insights/insights-layout.tsx`
- Modify: `apps/web/src/router/index.tsx`
- Modify/Test: `apps/web/test/pages/chat/insights-service.test.ts`
- Modify/Test: `apps/web/test/pages/chat/insights-pages.test.tsx`

**Steps:**

- [x] 先添加 capability 导航和 direct-route 权限测试。
- [x] 增加 summary/list/detail API adapter。
- [x] 增加 lazy route。
- [x] 根据 optional capabilities 条件渲染“运行观测”导航。
- [x] 当前 `InsightsLayout` 在 capabilities 加载/错误状态下也会位于 Provider 外；动态导航必须接收 optional capability、使用 nullable context，或调整 Provider 边界，不得在 Provider 外无条件调用会抛错的 `useInsightsCapabilities()`。
- [x] 实现全局摘要、UID 筛选分页表格和详情抽屉。
- [x] 覆盖 loading、empty、error、success。
- [x] 实现页面可见时 30 秒刷新。
- [x] 实现详情打开时 15 秒刷新。
- [x] 页面隐藏后暂停，恢复可见后立即刷新一次。
- [x] 不增加任何写操作或修复按钮。

**Acceptance:**

- 非 observer 看不到导航。
- 非 observer 直接访问不会渲染跨租户数据。
- observer 可以查看所有 observed UID 并打开其它 UID 详情。
- observer + `mode = basic` + `insightAvailable = false` 仍可直链进入并请求观测 API；非 observer 直链不发起观测数据请求。
- “运行观测”路由不进入 `aiOnlyPaths`；侧栏入口与直链均只受 `canViewWorkerObservability` 控制，不受洞察开关、基础模式或商业 allowlist 阻断。
- 列表 loading 不显示空态。
- 轮询不会叠加并发请求。
- 测试不锁定 Tailwind class 或普通说明文案。

### Task 7: 请求日志、文档和上线准备

**Files:**

- Modify: `apps/backend/src/app.ts`
- Modify/Test: `apps/backend/test/app.test.ts` 或现有 request logging 对应测试
- Modify: `docs/specs/insights-always-on-sessionization-technical-design.md`
- Modify: `.env.example`
- Modify: `apps/backend/.env.example`

**Steps:**

- [x] 观测 API prefix 关闭 Fastify 自动 request INFO。
- [x] 扩展现有 `shouldDisableRequestLogging` 前缀判断，并测试观测 API 根路径、子路径和 query 均返回 true，普通 insights 路由仍返回 false。
- [x] 保留显式 WARN/ERROR。
- [x] 更新 always-on 技术设计的监控章节，记录最终日志和页面架构。
- [x] 记录 observer subjects 和 trace UID 配置示例及默认空行为。
- [x] 运维文档写明默认 `LOG_LEVEL=info`：普通 DEBUG 不可见；日常定向排障优先配置 `INSIGHTS_WORKER_TRACE_UID_ALLOWLIST`，只有确需全局批次细节时才临时改为 debug，完成后恢复。
- [x] 写明 observer、trace 和 LOG_LEVEL 都是启动时读取，修改后必须重新部署或重启 Worker/Backend 才生效，不承诺热更新。
- [x] 写明 `INSIGHTS_WORKER_OBSERVER_SUBJECTS` 的 `uid` 按 number 处理、`subUserId` 按原始 string 处理，匹配时只做 `${uid}:${subUserId}` 精确拼接，不把 subUserId 转为 number。
- [ ] 准备测试环境 observer pair，不把真实线上 UID/subUserId 提交。
- [ ] 完成真实表 EXPLAIN。

**Acceptance:**

- 页面持续打开不会每次轮询产生 request completed INFO。
- 生产默认 info 下，只有 trace UID 的普通推进事件会提升为 INFO；清空 trace 配置并重启后恢复默认日志量。
- 配置示例不包含真实身份或密钥。
- 文档、schema snapshot、change-log 与代码一致。

### Task 8: 全量验证、灰度与回滚

**Steps:**

- [x] 运行所有 focused tests。
- [x] 运行 contracts、backend、web builds。
- [x] 运行 `git diff --check`。
- [x] Review 全量 diff，确认没有切片/分析业务语义改动。
- [ ] 先在数据库创建 runtime state 表。
- [ ] 先以 observer subjects 为空部署 Backend/Web。
- [ ] 启动单 Worker 实例，确认三条 heartbeat 在 150 秒内为 healthy。
- [ ] 设置测试 observer pair，验证跨租户只读页面。
- [ ] 设置一个 trace UID，验证详细日志只影响该 UID。
- [ ] 观察至少一个空闲窗口和一个活跃窗口的日志量。
- [ ] 验证故障节流和恢复日志。
- [ ] 完成后再配置正式 observer pair。

**Rollback:**

- 清空 `INSIGHTS_WORKER_OBSERVER_SUBJECTS` 并重新部署/重启 Backend 后隐藏入口并禁止 API。
- 清空 `INSIGHTS_WORKER_TRACE_UID_ALLOWLIST` 并重新部署/重启 Worker 后停止 UID 详细 INFO。
- `LOG_LEVEL`、observer subjects 和 trace UID 均不支持热更新；回滚是否生效以对应进程重启完成为准。
- runtime state 心跳失败不影响 Worker，可先回滚 Worker 代码而保留三行状态表。
- 新表不参与业务任务状态和会话切片，回滚时无需删除。
- 不回滚 cursor、logical session、job、analysis run 或 snapshot 数据。

---

## 11. 测试矩阵

### 11.1 日志量

- 空闲 10 分钟：每实例约 30 条 pipeline summary，加生命周期日志；不得出现每 3 秒空 tick INFO。
- 满 batch 普通 UID：无逐消息日志、无逐批 INFO。
- trace UID：有批次 INFO，但 session ID 样本不超过 10。
- 重复数据库错误：首次立即输出，随后节流并累计 suppressedCount。
- 恢复：只输出一次 recovery。

### 11.2 管线状态

- Worker 未启动：runtime state 缺失/超时，页面显示 unknown/offline。
- Worker 启动：立即产生三条 `reportedAt`，不等待首个一分钟窗口。
- Worker 空闲：`reportedAt` 新鲜、lastSuccess 正常。
- 最新失败晚于最新成功：页面显示 degraded。
- 一次成功晚于最新失败：页面恢复 healthy，但保留最后错误时间和错误码用于诊断。
- 两个实例乱序上报：较旧 started/success/failure payload 不能覆盖较新关联字段，`reportedAt` 仍按数据库执行时间前进。
- tick 开始后 reporter 持续上报但尚未结束：先显示 running；超过 15 分钟显示 possibly_stalled/degraded。
- 多实例中一个实例卡住、另一个继续成功：聚合状态允许恢复 healthy，页面和文档不得声称已经检测到具体卡住实例。
- 多实例灰度期间出现 `possibly_stalled`：仅显示弱信号，不触发自动告警、自动摘除实例或业务补偿动作。
- Node 应用时钟与 DB 时钟存在偏差：offline、running duration 和 possibly_stalled 仍只按 DB `observedAt` 正确派生。

### 11.3 UID 状态

- 新消息发现并入队：UID 从 idle 进入 queued/processing。
- 单批未追平：任务回到 pending，页面显示 queued。
- 失败退避：pending + future runAfter + errorCode 显示 retrying。
- pending 的 runAfter 已过 5 分钟且 sessionization pipeline 持续成功：仍显示 queued，queueAgeMs 大于 5 分钟，不误判 blocked。
- pending 队龄较长且 sessionization pipeline offline/degraded：UID 仍显示 queued，同时展示全局管线异常，不在前端批量改写为 blocked。
- 正常 Final 延迟：pending + future runAfter + 无 errorCode 显示 queued 并展示 runAfter，不误判 idle。
- 租约过期：显示 blocked。
- 到期会话：有 sessionization job 并最终关闭。
- 无 active job、无 overdue：显示 idle，文案只表达“当前无切片任务”。
- 全局 discovery 仍有位置差但某 UID 无 active job：UID 不得显示“消息源已追平”。
- state 筛选：先在完整 UID 集合派生和筛选，再分页；页数、total 与过滤结果一致。

### 11.4 Analysis

- insight disabled：无模型调用，任务 skipped。
- Final 首次失败：WARN + retrying。
- Final 第二次失败：ERROR + terminal failed。
- Live gate 无实质变化：DEBUG/summary，不逐任务 INFO。
- Live gate 故障降级：WARN。
- multi-step optional 失败：partial 结果和对应 WARN 均可见。
- single 路径记录 single step。
- response-format fallback 的额外请求被统计，并产生节流 WARN。
- archive 失败为 WARN，人工 `sync_messages` 终态失败为 ERROR。
- Summary、UID item 和 error 状态的 terminal failed 均以 hot + archive 最近 24 小时为统一口径。

### 11.5 权限

- observer UID 正确、subUserId 错误：403。
- observer subUserId 正确、UID 错误：403。
- exact pair：200。
- observer 查询任意目标 UID：200。
- 普通 owner/admin：仍为 403。
- observer role 不是 owner/admin：仍可访问，因为身份 pair 是本期授权源。
- observer allowlist 为空：所有身份均不可访问。
- 所有观测 API 的 200、400、401、403 和 handler 5xx 响应均包含 `Cache-Control: no-store`。
- job DTO 不包含 `lockedBy`，pipeline DTO 可以包含 `reportedBy`。
- DB 中包含客户文本的 `error_message` 不出现在任一 API DTO；未知 errorCode 也不回传原文。

---

## 12. 验证命令

实施过程中按任务运行 focused tests，最终至少运行：

```bash
corepack pnpm --filter @chatai/contracts test test/insights-dto.test.ts
corepack pnpm --filter @chatai/contracts build

corepack pnpm --filter @chatai/backend test \
  test/env.test.ts \
  test/modules/insights/insights-worker-observer-access.test.ts \
  test/modules/insights/insights-worker-observability.test.ts \
  test/modules/insights/insights-worker-observability-repository.test.ts \
  test/modules/insights/insights-worker-observability-service.test.ts \
  test/modules/insights/insights-worker-observability-routes.test.ts \
  test/modules/insights/insights-worker-runtime.test.ts \
  test/modules/insights/insights-worker.test.ts \
  test/modules/insights/insights-repository.test.ts \
  test/modules/insights/llm-provider.test.ts \
  test/modules/insights/insights-service.test.ts \
  test/modules/insights/insights-routes.test.ts
corepack pnpm --filter @chatai/backend build

corepack pnpm --filter @chatai/web test \
  test/pages/chat/insights-service.test.ts \
  test/pages/chat/insights-pages.test.tsx
corepack pnpm --filter @chatai/web build

git diff --check
```

如果某个计划中新建的测试文件被合并进现有测试文件，执行实际文件路径并在提交说明中记录。

Completion requires all applicable commands to pass，或明确记录环境性失败、原因和风险。

---

## 13. 建议提交拆分

1. `feat: add insights worker observability contracts and runtime state`
2. `refactor: structure and aggregate insights worker logs`
3. `feat: add cross-tenant insights worker observability api`
4. `feat: add insights worker observability dashboard`
5. `docs: document insights worker observability rollout`

每个提交前运行对应 focused tests 和 `git diff --check`。最终提交前运行全部构建。

---

## 14. Definition of Done

- 默认 INFO 日志不再按普通 UID 批次或自动分析任务线性增长。
- discovery、sessionization、analysis 每分钟都有可查询的稳定汇总事件。
- 可重试与终态失败的日志级别明确。
- 重复错误被节流，恢复有事件。
- LLM 多步骤、重试和耗时可以定位，但不泄漏输入输出。
- runtime state 表稳定保持三条 pipeline 状态。
- 指定 observer pair 能查看全局及所有 observed UID。
- 其他所有身份看不到入口且 API 返回 403。
- 全 UID 列表无消息表 N+1。
- UID 详情能判断卡在 discovery、sessionization、会话关闭还是 analysis。
- 页面轮询不制造 request INFO 日志。
- 页面和 API 均无写操作。
- schema、change-log、contracts、backend、web、测试和技术设计同步完成。
