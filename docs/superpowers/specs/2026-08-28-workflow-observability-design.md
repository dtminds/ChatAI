# Workflow 运行观测方案

- 状态：已确认首期范围，随独立观测页落地
- 日期：2026-08-28
- 关联：`docs/superpowers/specs/2026-07-10-marketing-workflow-execution-engine-design.md`（§18 可观测性、§19 安全与租户隔离）
- 范围说明：本方案不新增、不修改任何 Workflow 节点，不触及节点运行语义；`docs/agents/workflow-node-development.md` 的 Readiness Gate 对本方案 N/A。实现涉及列表、分页、数据库、Worker 和跨层契约，遵循 `CODING_STANDARDS.md`。

## 1. 背景与目标

全局调度队列改造（`codex/workflow-global-scheduler-queue`）落地后，调度运行时只有结构化日志和 `/healthz`、`/readyz` 进程内探测，没有产品化观测入口。以下问题目前只能在日志平台排查：

- Worker 六角色（scheduler / task-consumer / entry-consumer / inference / outbox / reconciler）是否存活、最近一次迭代成功或失败。
- 全局任务队列是否积压：到期未派发的 Task、滞留在 `dispatched` 的消息、租约过期的 `running` Task。
- 暂停/恢复迁移请求（`workflow_task_transition`）是否卡住；进入 `dead` 即用户操作永远不生效，是最需要暴露的信号。
- Outbox 与异步推理任务的积压。

目标：对齐 insights 运行观测与 user-memory 运行观测的既有模式，为 Workflow 建立同构的观测页。非目标见 §8。

## 2. 既有观测模式（对齐基准）

| 维度 | insights | user-memory | 本方案 |
|---|---|---|---|
| 心跳表 | `xy_wap_embed_insight_worker_runtime_state`（PK=pipeline） | `xy_wap_embed_user_memory_worker_state`（uk=runtime_key） | `xy_wap_embed_workflow_worker_state`（PK=role） |
| 心跳字段 | last_started_at / last_success_at / last_failure_at / last_error_code / last_duration_ms / reported_by / reported_at | 同左 | 同左 |
| 端点 | summary + uid 列表 + uid 详情 | summary + tenants 列表 + runs 历史 | summary + workflow 列表 + workflow 详情 |
| 权限 | observer subjects 白名单 | 复用 insights 的 `canViewInsightsWorkerObservability` | 复用同一份 observer subjects（见 §6） |
| 前端 | insights 布局内独立页 | ai-hosting 页内 Tab | 列表页头部右侧入口，打开 `/chat/workflows/observability` 独立页 |
| 轮询 | `useVisiblePolling` 30s 列表 / 15s 详情 | 15s 统一 | 15s 统一 |
| 失败语义 | stale-while-error + 顶部横幅 | 同左 | 同左 |

健康度推导复用 insights 的 `derivePipelineRuntime` 语义：心跳超时 → `offline`；`last_failure_at > last_success_at` 或疑似停滞 → `degraded`；无记录 → `unknown`；否则 `healthy`。

## 3. 数据层：新增 Worker 角色心跳表

### 3.1 DDL

```sql
CREATE TABLE IF NOT EXISTS xy_wap_embed_workflow_worker_state (
  role VARCHAR(32) NOT NULL COMMENT 'Worker角色：scheduler、task-consumer、entry-consumer、inference、outbox、reconciler',
  last_started_at DATETIME(3) NULL COMMENT '最近一次角色迭代开始时间',
  last_success_at DATETIME(3) NULL COMMENT '最近一次角色迭代成功时间',
  last_failure_at DATETIME(3) NULL COMMENT '最近一次角色迭代失败时间',
  last_error_code VARCHAR(128) NULL COMMENT '最近一次稳定错误码',
  last_duration_ms INT UNSIGNED NULL COMMENT '最近一次已完成迭代耗时，毫秒',
  reported_by VARCHAR(128) NOT NULL COMMENT '最近上报实例，hostname:pid',
  reported_at DATETIME(3) NOT NULL COMMENT '最近心跳时间',
  create_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  update_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (role)
) COMMENT='营销Workflow Worker角色运行状态表';
```

- 同步登记：`docs/db/schema.sql`、kysely 类型（worker 侧加进 `packages/workflow-runtime/src/db.ts` 的 `WorkflowDatabase`；backend 侧按 `apps/backend/src/db` 现有方式补表类型）。
- 不进 `apps/backend/src/db/writable-tables.ts`：该表只有 workflow-worker 写，backend 只读。
- 不清除 `last_error_code`：健康度由 `last_failure_at` 与 `last_success_at` 的新旧关系推导（与 insights、memory 一致），不需要成功时清错。

### 3.2 上报时机（apps/workflow-worker）

角色循环只改内存，禁止在 1s 热路径里 `await` UPSERT（Worker 连接池只有 10）。独立 timer **15s flush** 最多 6 行 PK 表；失败只打日志，不阻塞 `run()`。

- **循环型角色**（scheduler、outbox、inference、reconciler）：迭代 **start** 写 `last_started_at`（并因此让后续 flush 刷新 `reported_at`，避免长 tick 假 offline）；完成写 `last_success_at` + `last_duration_ms`；失败写 `last_failure_at` + `last_error_code`。
- **推送型角色**（task-consumer、entry-consumer）：由 readiness 代报，与消息量解耦。订阅连接健康时刷 `last_started_at` + `last_success_at`；断连时刷 `last_failure_at` + `subscription_disconnected`。

### 3.3 offline 阈值

`WORKFLOW_HEARTBEAT_OFFLINE_MS = 150_000`（约最慢循环 30s 的 5 倍，覆盖一次抖动 + 一个完整 reconcile 周期），与 insights 的 150s 对齐，env 可覆盖。

## 4. 后端

新增 `apps/backend/src/modules/workflow/` 下三个文件：`workflow-observability.repository.ts`、`workflow-observability.service.ts`、`workflow-observability.routes.ts`；契约放 `packages/contracts/src/workflow/observability.ts`（从 `index.ts` 导出）。

### 4.1 端点

均 `GET`、`app.authenticate` + observer 校验、`Cache-Control: no-store`：

| 端点 | 用途 |
|---|---|
| `/api/server/workflows/observability/summary` | Worker 健康 + 全局队列计数聚合 |
| `/api/server/workflows/observability/workflows` | 按 Workflow 聚合的分页列表 |
| `/api/server/workflows/observability/workflows/:workflowId` | 单 Workflow 详情 |

路由层级在现有 `/:workflowId` 参数路由之下多一层字面量段，无冲突。

### 4.2 Summary 契约（草案）

```ts
WorkflowObservabilitySummaryResponse = {
  observedAt: number                       // DB CURRENT_TIMESTAMP，毫秒
  workers: WorkflowObservabilityWorker[]   // 六角色，固定顺序
  tasks: {
    pending: number                        // status='pending'
    dueBacklog: number                     // pending 且 bucket_time/due_at 对齐 Scheduler
    oldestDueAt?: number
    dispatched: number
    stalledDispatched: number              // dispatched 且超过 5 分钟
    running: number
    expiredLease: number                   // running 且 lease_expires_at <= now（走 idx_workflow_task_lease）
    suspended: number
  }
  transitions: { pending: number; leased: number; dead: number }   // dead > 0 前端标红告警
  outbox: { pending: number; oldestPendingAt?: number }
  inference: { pending: number; retryWait: number; expiredLease: number }
  todayCapacityRejected: number            // workflow_capacity_daily_metric 当日合计
}

WorkflowObservabilityWorker = {
  role, health: 'healthy' | 'degraded' | 'offline' | 'unknown',
  reportedAt, reportedBy?,
  lastStartedAt?, lastSuccessAt?, lastFailureAt?, lastDurationMs?, lastErrorCode?
}
```

时间比较全部在 SQL 内用 DB 当前时间完成（`observedAt` 取 `SELECT CURRENT_TIMESTAMP`），应用层不做时区换算，符合 UTC+8 wall-clock 契约。

### 4.3 Workflow 列表契约（草案）

SQL 侧按 `state` **换驱动表再分页**（禁止先 definition 分页再筛，完成的迁移行会被 delete）：

- `all`：`workflow_definition`（`biz_status = 1`）分页。
- `backlog`：到期积压 Task join definition。到期条件必须对齐 Scheduler：`status='pending' AND bucket_time <= DATE_FORMAT(CURRENT_TIMESTAMP,'%Y-%m-%d %H:%i:00') AND due_at <= CURRENT_TIMESTAMP`，走 `(status, bucket_time, due_at, id)`。
- `transitioning` / `dead`：`workflow_task_transition` join definition。
- 当前页再按 `(uid, workflow_id)` 集合批量聚合 Task 计数、迁移请求、metric 与活跃 Run。常数条聚合 SQL，无 N+1。
- `dispatched` 滞留只统计超过默认 `dispatchTimeout`（5 分钟）的行，不要把正常在途当故障。
- 支持 `workflowId` 精确搜索、`uid` 过滤、`page` / `pageSize`（≤100）。首期不做 `failing`。

```ts
WorkflowObservabilityWorkflowItem = {
  uid, workflowId, name, runtimeStatus,     // inactive/active/paused/stopped
  activeTaskCount, dueBacklogCount, oldestDueAt?,
  transition?: {                            // 存在迁移请求时返回
    targetStatus: 'pending' | 'suspended',  // resume→pending，pause→suspended
    status: 'pending' | 'leased' | 'dead',
    attempt, nextAttemptAt, lastErrorCode?, updateTime,
  },
  recentFailure?: { errorCode, occurredAt },
  activeRunCount, totalRunCount, lastRunAt?,
}
// 外层：items + page/pageSize/total/totalPages + observedAt
```

### 4.4 Workflow 详情契约（草案）

```ts
WorkflowObservabilityWorkflowDetailResponse = {
  observedAt,
  workflow: { uid, workflowId, name, runtimeStatus, statusReason? },
  taskDistribution: Record<TaskStatus, number>,   // 各状态计数
  dueBacklogCount, oldestDueAt?,
  transition?,                                    // 同列表结构
  recentFailures: Array<{                         // 最近 20 条，last_error_code 非空
    taskId, runId, nodeId, nodeKind, attempt, errorCode, updateTime,
  }>,
  activeRunCount,
}
```

Run 级执行轨迹不重复建设，详情页提供跳转到现有 `/:workflowId/records` 记录页。

## 5. 前端

新增 `apps/web/src/pages/chat/workflow/workflow-observability-page.tsx`。路由 `chat/workflows/observability` 必须写在 `:workflowId` 之前。

### 5.1 页面结构（四段式）

1. **Worker 角色健康卡**：六角色，每卡含健康度 Badge、最近成功 / 失败 / 迭代耗时 / 上报实例；顶部色条按健康度着色（healthy→success、degraded→warning、offline→destructive、unknown→muted）。
2. **队列指标网格**：到期积压（detail 显示最老到期时间）、租约过期、派发滞留、迁移队列（detail 显示 dead 数，>0 标红）、Outbox 积压、推理积压。容量卡后置。
3. **迁移告警条**：存在 `dead` 迁移请求时展示 destructive 横幅，引导到列表筛选 `dead`。
4. **Workflow 状态表**：状态筛选（全部 / 有积压 / 迁移中 / 暂停失败）+ uid / workflowId 搜索 + 服务端分页；点击名称跳转现有 `/:workflowId/data` 执行记录页。趋势图、`failing` 筛选、最近失败列表后置。

### 5.2 数据获取与状态

- 复用 `useVisiblePolling`（跨模块借用，同 memory 的先例；15s，`refreshKey = ${page}:${state}:${workflowId}:${version}`）。轮询具备启动条件、可见性暂停、防重入、AbortController 终止，满足 Extra Checks 对轮询的要求。
- stale-while-error：刷新失败且有旧数据 → 顶部 warning 横幅「刷新失败，当前展示上次结果」；完全无数据 → 全页错误卡 + 重试。
- 状态→文案/颜色映射表集中在组件内，语义 token（success/warning/destructive/primary/muted），数字 `tabular-nums`，空值「—」。
- 微文案遵循 `AGENTS.md`：loading「正在加载」、空态「暂无数据」、提示短语不加句号。

### 5.3 权限门控

复用 `INSIGHTS_WORKER_OBSERVER_SUBJECTS` / `canViewInsightsWorkerObservability`。owner/admin **不**自动获得。列表 overview 下发 `canViewWorkflowObservability`；无权限时头部入口完全隐藏。进不了工作流列表就看不到入口，不为白名单单独做菜单或直链。API 只认白名单。观测页是跨租户全局视图。

## 6. 权限与安全

- 复用 insights 与 memory 共用的 observer subjects 白名单（`canViewInsightsWorkerObservability` 的同一份配置与判定函数），不新增第二套配置面。平台运维白名单一处管理，三个观测页一致。
- owner / admin 角色本身不自动获得观测权限（与 insights、memory 一致），避免租户侧接触 Task ID、租约等运维概念（执行引擎设计 §19）。
- 观测响应不输出 `subject_id`、`context_json`、消息正文、密钥等敏感内容；错误只到错误码粒度。

## 7. 测试与验收

- 契约：`packages/contracts` build；web、backend 两侧 build + 相关 Vitest（跨层 DTO 变更按 Pre-PR Verification 双侧跑）。
- Backend：repository 聚合 SQL 的 Vitest（含分页边界、筛选组合、`pageSize` 上限、时间阈值推导健康度）；service 推导逻辑单测（offline / degraded / unknown 分支、dead 告警聚合）。
- Worker：心跳上报单测（成功迭代、失败迭代、readiness 代报、上报失败不影响主流程、UPSERT 幂等）。
- 规模证据：说明 summary 在 N 个 Workflow / M 个活跃 Task 下的 SQL 形状（常数条聚合），列表每页常数条 SQL，无全量加载。
- 验收场景：worker 停止后 ≤150s 该角色转 offline；制造一条 `dead` 迁移请求后观测页出现告警并可筛出；暂停大 Workflow 期间 `transitioning` 状态可见。

## 8. 边界与非目标

- 不做告警推送（邮件 / webhook），只做页面可见性；告警后续单独立项。
- 不重复 Run 明细与节点轨迹（现有 records 页已覆盖）。
- 不引入 Prometheus / OpenTelemetry（执行引擎设计 Phase 3 约束：结构化日志 + 健康检查）。
- Pulsar backlog、Event Loop Lag、连接池指标不在本期（属进程 / 中间件层，设计文档 §18 另行覆盖）。
- 不支持对 Task / 迁移请求的任何写操作，观测页只读。

## 9. 已确认决策

| # | 决策 | 结论 |
|---|---|---|
| D1 | 受众与入口 | 列表页 `AiHostingPageHeader` 右侧入口，点击打开独立路由 `/chat/workflows/observability`。无权限完全隐藏。 |
| D2 | Worker 心跳上报 | 新增 `workflow_worker_state`；内存更新 + 15s flush，迭代 start 写 `last_started_at`。 |
| D3 | 首期范围 | Worker 健康、队列计数、dead 迁移告警、全部/有积压/迁移中/dead。详情跳现有执行记录。趋势图、容量卡、failing、最近失败后置。 |
| D4 | 权限配置 | 复用 insights/memory 同一份 observer subjects；owner/admin 不自动获得。 |

已从首期范围拆出、默认后置的两项（成本已评估，随时可并入）：

- **Run 趋势图**：14 天 entered/completed/failed/cancelled 曲线，数据源 `workflow_daily_metric` 现成，成本约一个端点字段 + 一张图。
- **容量水位卡片**：复用现有 `/api/server/workflows/capacity` 做展示化。
