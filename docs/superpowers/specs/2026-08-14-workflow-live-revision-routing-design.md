# Workflow 在途 Run 前向 Revision 路由设计

- 日期：2026-08-14
- 状态：Accepted
- 适用范围：`packages/workflow-runtime`、`packages/workflow-engine`、`apps/workflow-worker`、`apps/backend`、`apps/web` 与 Workflow 数据库表
- 目标：让频繁发布的营销 Workflow 对尚未到达后续节点的在途客户生效，同时保留不可变发布快照、当前节点幂等和完整执行历史
- 决策优先级：本文替代旧文档中“Workflow Run 从进入到结束始终固定使用同一 Revision”的执行语义；不可变 Revision、Trigger Binding 和新 Run 使用当前发布 Revision 的规则继续保留

## 1. 决策摘要

Workflow 采用以下运行模型：

1. 每次执行语义变化仍发布一个不可变 Workflow Revision。
2. Workflow Run 不再终身固定在进入时的 Revision；`run.revision` 表示当前权威 Task 使用的 Revision。
3. Task 创建即表示 Run 已到达该节点。Task 在节点完成前固定使用自己的 Revision、Node ID、Node Kind 和节点配置。
4. 当前节点的重试、Wait、Wait Event、Inference 和 Capability 调用不受后续发布影响。
5. 当前节点成功完成后，Runtime 在提交节点结果的同一数据库事务中读取最新 `published_revision`，并按最新版 Execution Spec 解析下一跳。
6. 下一 Task 使用解析下一跳时的最新 Revision；`run.revision` 与下一 Task 的 Revision 在同一事务中同步更新。
7. 已完成节点不重新执行，不补偿，不回溯。
8. 当前节点在最新版中不存在、Node Kind 已变化、执行出口已删除，或新版节点依赖当前 Run 不具备的数据时，Run 以明确的 `flow_changed` 原因退出，不作为系统故障。
9. 发布不扫描并改写全部在途 Run。普通改图通过节点完成时的惰性前向路由生效。
10. 如果发布删除了 Wait 或 Wait Event 节点，发布事务同时写入耐久清退请求；实际清退按 Workflow 和删除 Node ID 异步、分批执行，不阻塞发布请求。Node ID 在后续 Revision 中重新出现时，旧清退请求立即失效。
11. 数据页默认展示当前发布图，人数按当前图的稳定 Node ID 跨 Revision 聚合；顶栏使用长期累计 Metric，不再默认按 Revision 切换画布。

该模型称为 **Workflow Live Revision Routing**。它保留发布快照，但把执行冻结范围从整个 Run 缩小为当前节点。

## 2. 为什么保留 Revision

Revision 继续承担以下职责：

- 保存发布时经过后端校验和 Compiler 编译的不可变 Execution Spec。
- 保存节点配置、Workflow Type 和 Subject Type 的发布快照。
- 为 Task、Wait Event Subscription、Inference 和 Capability 调用提供可恢复的执行依据。
- 为单人运行路径还原当时的节点标题、配置和契约。
- 支持恢复历史版本到 Draft 后重新发布为新 Revision。
- 支持判断旧 Runtime Handler 和 Capability Contract Version 是否仍被可继续运行的当前发布 Revision、活动 Task 或 Job 引用。

不采用“覆盖当前 JSON、每次执行都裸读最新版”的模型。该模型会导致同一次节点执行在重试期间改变配置，并破坏 Action 幂等、Inference 结果解释、Wait Event Subscription 和历史排查。

## 3. 术语与权威状态

### 3.1 Workflow Revision

一次正式发布产生的不可变执行快照。Revision 只追加，不原地修改。

### 3.2 Authoritative Task

活动 Run 当前唯一有效、且 `sequence === run.sequence` 的 Task。一个活动 Run 同一时刻只能有一个 Authoritative Task。

### 3.3 Node Arrival

为某个节点创建 Authoritative Task 的时刻。Node Arrival 是节点配置冻结边界，不以 Worker 实际领取或外部调用开始为边界。

### 3.4 Current Revision

Authoritative Task 固定使用的 Revision。活动 Run 的 `run.revision` 是 Current Revision 的冗余权威投影，用于一致性校验、调度查询和当前运行数据读取。Run 进入终态后保留最后一个 Authoritative Task 的 Revision、Node ID 和 Sequence。

### 3.5 Forward Routing

当前节点完成后，根据最新发布 Revision 中的 `currentNodeId + sourceOutletId` 解析下一节点，并创建使用最新 Revision 的下一 Task。

### 3.6 Flow Changed Exit

Run 因发布后的图或数据契约已无法提供合法下一跳而退出。数据库状态使用 `cancelled`，`terminal_reason` 保存稳定的流程变更原因。它不是节点业务失败，也不是 Runtime 500 错误。

## 4. 核心不变量

所有 Repository 实现和 Reconciler 必须对活动 Run 维护：

```text
authoritativeTask.runId == run.id
authoritativeTask.sequence == run.sequence
authoritativeTask.revision == run.revision
authoritativeTask.nodeId == run.currentNodeId
authoritativeTask.uid == run.uid
authoritativeTask.workflowId == run.workflowId
authoritativeTask.shardId == run.shardId
```

这些约束对 `queued`、`running` 和 `waiting` Run 一致成立。新 Wait 模型不再允许 waiting Run 的 Task 指向提前创建的下游节点。

Task 还必须满足：

```text
task.nodeId exists in task.revision
task.nodeKind == revisionNode.kind
```

Node Execution Key 继续使用：

```text
uid + runId + nodeId + sequence
```

Revision 不进入 Node Execution Key。一次 Node Arrival 的重试必须复用相同执行键。

终态 Run 不再要求存在有效 Authoritative Task，但 `run.revision`、`run.current_node_id` 和 `run.sequence` 必须保留最后一次 Node Arrival，供数据页和历史排查使用。

## 5. 发布语义

### 5.1 不可变发布

发布继续执行完整 Compiler、Runtime 节点支持、Event Catalog 事件支持、Product Entitlement 和资源校验。执行语义发生变化时：

1. 插入新 Revision。
2. 失效旧 Trigger Binding。
3. 插入新 Revision 的 Trigger Binding。
4. 更新 Definition 的 `published_revision`。
5. 如果删除了可能承载被动等待 Run 的 Node ID，在同一事务中写入耐久、可重试的定向清退请求。

上述操作继续在同一事务中完成。

### 5.2 Start 事件允许修改

已启用 Workflow 可以修改 Start Event Type 和对应过滤条件。

- 新 Trigger Binding 只影响新进入客户。
- 已有 Run 保留进入时的 Workflow Trigger Projection，不重新匹配 Start，也不重建 Run。
- 旧 Run 后续仍可按本文规则进入最新版节点。
- 如果最新版节点引用旧 Run 不具备的 Trigger 字段，Runtime 必须在调用任何 Capability 前识别为上下文不兼容，并以 `flow_changed_context_incompatible` 退出。
- 不允许把缺少的 Trigger 字段静默替换为 `null`、空字符串或其他默认值后继续产生外部副作用。

### 5.3 发布不迁移全部 Run

普通配置、节点和连线变化不在发布事务中扫描 Run。发布只写控制面状态；在途 Run 在下一次节点完成时惰性读取最新 Revision。

### 5.4 删除当前等待节点

Backend 比较旧 Revision 和新 Revision 的 Node ID 集合，得到删除节点。

如果某个删除节点在旧 Revision 中属于以下被动等待类型：

- Fixed Wait
- Wait Event

发布事务必须为该 Node ID 原子写入耐久的定向清退请求。发布路径不查询是否实际存在停留 Run；没有匹配 Run 的请求由 Worker 幂等完成。随后 Worker 按 `uid + workflow_id + current_node_id` 分批处理：

1. 将 Run 改为 `cancelled`。
2. 写入 `terminal_reason = flow_changed_current_node_deleted`。
3. 取消 Authoritative Task。
4. 取消对应 Event Subscription。
5. 修正当前人数 Metric。

清退请求与新 Revision、Binding 和 `published_revision` 在同一事务中提交；实际 Run 清退不加入发布事务，也不要求发布请求等待全部 Run 清理完成。不得使用进程内 fire-and-forget 任务，否则 Backend 在发布提交后退出会永久漏清理。

本期使用专用的 `xy_wap_embed_workflow_revision_cleanup` 持久化清退请求，不泛化当前只支持 `workflow.task.ready` 的 Workflow Outbox，也不为该请求增加 Pulsar 投递。具体字段和索引见第 11.6 节。

每个请求以 `uid + workflow_id + revision + node_id` 幂等，其中 `revision` 表示删除该 Node ID 的发布 Revision。Worker 每批处理时必须：

1. 锁定候选 Run 和 Authoritative Task，并确认 Run 仍停留在该 Node，Task 的 Node Kind 仍为 Fixed Wait 或 Wait Event。Task 可以尚处于首次执行的 `execute` 阶段，也可以已经进入 `wait` / `wait-event` 阶段。
2. 按第 7 节锁序对 Definition 加 `FOR SHARE`，读取当前 `published_revision` 并加载其 Execution Spec。
3. 如果当前发布图已经重新出现该 `node_id`，不得取消任何候选 Run；将清退请求标记为 `obsolete` 并结束处理。扫描不到候选 Run、准备标记 `done` 前也必须执行同一检查。
4. 只有当前发布图仍不存在该 Node ID 时，才取消仍满足条件的 Run。已经唤醒、前移或终止的 Run 直接跳过。

不能用 `task.revision < cleanup.revision` 判断是否应清退。恢复历史 Revision 会原样恢复稳定 Node ID；节点重新出现后，无论旧 Run 还是新 Revision 下到达的 Run，都必须免受旧清退请求影响。清退批次失败后必须可以从数据库权威状态重试。

数据页在短暂处理窗口内可以继续显示这些 Run，清退完成后进入“未完成”。

正在执行或等待重试的 Action、Query、Inference 和 Composite 节点不立即取消。它们继续使用原 Task Revision 完成当前节点，然后按最新版路由；如果最新版已删除当前节点，则完成后以 `flow_changed_current_node_deleted` 退出。

需要立即阻止所有业务执行时，用户必须先暂停或停止 Workflow；删除节点不是全流程紧急停止机制。

## 6. 当前节点执行语义

### 6.1 加载节点

Runtime 执行 Task 时必须通过 `task.revision` 加载 Revision，并通过 `task.nodeId` 查找节点。不得通过最新 Revision 热替换当前节点配置。

### 6.2 重试

Capability Retry、Inference Retry、Lease Recovery 和 MQ 重投继续使用：

- 相同 Task
- 相同 Task Revision
- 相同 Node Execution Key
- 相同节点配置
- Action 使用相同下游 `idempotencyKey`

发布新 Revision 不重置 Task Attempt，不生成新的 Node Execution，也不改变已持久化 Inference Payload。

### 6.3 执行依赖暂不可用

Product Entitlement、业务资源或下游服务暂不可用时，继续使用对应节点已有的 fail-closed、retry 和 defer 语义。

执行依赖暂不可用不是 `flow_changed`：

- Backend 原则上已经拒绝发布 Runtime 或 Event Catalog 不支持的 Revision。
- Worker 运行时发现权益、资源或下游服务不可用，通常表示暂时故障。
- Runtime 应保持 Task Pending 并延后调度，不永久丢弃客户。

## 7. 事务内前向路由

最新 Revision 的读取和下一 Task 创建必须在 `commitNodeResult` 的同一事务中完成。当前节点执行（含 Capability 调用）仍在事务外完成；Service 只把已确定的 `sourceOutletId` 和节点结果交给提交事务，不得在事务外解析下一跳。

所有同时锁定既有 Run/Task 和 Definition 的 Runtime 事务统一遵循以下行锁顺序：

```text
Workflow Run (FOR UPDATE)
-> Authoritative Task (FOR UPDATE)
-> Task 所属节点状态（Node Execution / Event Subscription，如需要）
-> Workflow Definition (FOR SHARE)
-> Inference Job / Revision Cleanup Request（同一事务需要更新时）
```

最新 Workflow Revision 是不可变记录，在锁定 Definition 并取得 `published_revision` 后加载，不需要把 Revision 行加入可变状态锁序。Cleanup Request 的候选领取和租约更新使用独立短事务；实际清退批次若需要再次更新请求行，仍按上述顺序在 Definition 之后锁定。

控制面事务可以先锁 Definition，但同一事务不得随后再锁既有 Run 或 Task；停止、删除和权益清退对 Run 的批量取消必须继续使用独立事务。首次创建 Run 时先锁 Definition、随后插入新的 Run/Task 不属于既有行反向加锁。

当前实现中 `claimTask`、`beginEventWait`、`triggerEventSubscription` 和 Reconciler 已使用 Run/Task 先于 Definition；`beginInference`、`recoverInferenceJobs`、`finishInference` 仍是 Definition 先于 Run/Task，实施时必须调整。`prepareCapabilityExecution`、`cancelWorkflowBatch` 等不读取 Definition 的事务也要纳入审计，确认没有新增反向锁序。批量锁定同一类记录时按主键升序，降低多 Run 批次互相死锁的概率。

如果 `commitNodeResult` 先锁 Definition 再锁 Run，会与现有 Run 优先路径、发布事务和 InnoDB 等待队列形成死锁窗口。发布事务继续对 Definition 使用 `FOR UPDATE`，且不锁既有 Run；推进事务在读取 `published_revision` 前对同一行加 `FOR SHARE`，因此发布与 Forward Routing 仍有明确先后顺序，同时允许同一 Workflow 的多个节点提交并发进行。

推荐事务步骤：

1. 锁定 Run 和 Authoritative Task。
2. 校验 Run Lock Version、Task Version 和第 4 节不变量。
3. 使用 Task Revision 完成当前 Node Execution。
4. 如果当前节点返回 terminal complete，结束 Run，不解析下一跳。
5. 对 Definition 加 `FOR SHARE`，读取 `published_revision`、`runtime_status` 和 `biz_status`。
6. 加载该 `published_revision` 对应的 Revision。
7. 在最新版中查找与当前 Task 相同 Node ID 的节点。
8. 校验最新版节点的 Node Kind 与 Task Node Kind 相同。
9. 使用当前执行结果的 `sourceOutletId` 查找最新版出边。
10. 校验目标节点存在、Execution Config 完整，且目标节点 Execution Config 实际引用的变量路径能从当前 Run Context 解析。
11. 创建使用最新 Revision 的下一 Task；若 Workflow 已暂停，下一 Task 必须保持 `pending`，不得立即 dispatch。
12. 在同一事务更新 `run.revision`、`run.current_node_id`、`run.sequence`、状态和下次执行时间。
13. 写 Inbox、Outbox 和 Metric Event 后提交。离开当前节点的 Metric 使用当前 Task Revision，进入下一节点的 Metric 使用下一 Task Revision，不得再用单一 `runRevision` 同时盖住两端。

不允许先在事务外读取 Revision 再提交下一跳。

Revision 内容不可变，Runtime 可以按 `uid + workflow_id + revision` 在进程内缓存已解析的 Execution Spec。缓存只优化不可变 Revision 内容；Definition 的 `published_revision` 指针仍必须在提交事务中读取并锁定，不能用缓存替代事务内的发布顺序判定。

## 8. 前向路由判定

### 8.1 正常继续

满足以下条件时创建下一 Task：

- 最新 Revision 存在。
- 当前 Node ID 在最新版中存在。
- 最新版中的 Node Kind 与当前 Task Node Kind 相同。
- 当前 `sourceOutletId` 在最新版中仍有合法出边。
- 出边目标节点存在。
- 目标节点 Execution Config 实际引用的变量路径存在于当前 Run Context。缺失路径不得填 `null`、空字符串或其他默认值；已执行节点产出的空值仍视为可用。

### 8.2 流程变更退出

以下情况不创建下一 Task，Run 改为 `cancelled`：

| terminal reason | 条件 |
| --- | --- |
| `flow_changed_current_node_deleted` | 最新版不存在当前 Node ID |
| `flow_changed_node_kind_changed` | 相同 Node ID 的 Node Kind 与当前 Task 不同 |
| `flow_changed_outlet_deleted` | 最新版不存在当前执行结果对应的 Source Outlet 或出边 |
| `flow_changed_context_incompatible` | 目标节点需要的 Trigger 或前序输出在当前 Run Context 中不可用 |

这些结果必须：

- 完成当前节点已经确定的 Node Execution 记录。
- 不调用无法安全构造命令的下一 Capability。
- 不进入普通业务 Retry。
- 不作为 Runtime consistency failure。
- 在数据页归入“未完成”，并在单人路径中展示可理解的退出原因。

## 9. Wait 节点模型

### 9.1 Fixed Wait

Fixed Wait 不再提前创建下游节点 Task。

第一次执行 Wait：

1. 使用 Task Revision 计算截止时间。
2. Authoritative Task 保持同一 Node ID、Node Kind、Revision 和 Sequence。
3. Task 改为 `pending + task_type=wait`，`due_at` 保存截止时间。
4. Run 改为 `waiting`，`current_node_id` 仍是 Wait Node ID。

到期恢复：

1. 领取同一个 Wait Task。
2. 使用原 Task Revision 完成 Wait Node Execution。
3. 在提交事务中按最新 Revision 解析 Wait 的 `default` 出口。

因此，客户等待期间插入、删除或修改后续节点，会在等待结束后生效；修改当前 Wait 的等待时长不会影响已经进入该 Wait 的客户。

### 9.2 Wait Event

Wait Event Subscription 继续保存创建它的 Task Revision、Node ID 和事件契约。

- 已创建 Subscription 不因发布改变事件类型、超时时间或触发后固定延迟。
- 触发或超时后，使用原 Task Revision 完成 Wait Event。
- 完成时根据最新 Revision 的 `triggered` 或 `timeout` 出口解析下一跳。
- 删除当前 Wait Event 节点时，按第 5.4 节定向取消 Subscription 和 Run。

### 9.3 Reconciler

新模型下，waiting Run 也必须满足：

```text
authoritativeTask.nodeId == run.currentNodeId
authoritativeTask.revision == run.revision
```

旧模型中为“提前创建下游 Wait Task”保留的 Node ID 不一致特例必须删除。

## 10. Node 与 Outlet 身份

### 10.1 Node ID

Node ID 是跨 Revision 的运行身份，不是展示字段。

- 修改标题、配置、坐标或连线不改变 Node ID。
- Node Kind 不允许原地修改。
- 删除节点后重新拖入同类节点必须生成新 Node ID。
- Runtime 遇到相同 Node ID、不同 Node Kind 时按节点不存在处理并退出。

### 10.2 Source Outlet ID

Source Outlet ID 与 Node ID 一样必须稳定。

- 修改 Branch 条件、逻辑、顺序或展示名称不改变 Branch Path ID。
- 删除 Branch Path 后重新添加必须生成新 Path ID。
- AI Intent 的意图出口使用稳定意图 ID，不使用名称或数组下标。
- Wait Event 的 `triggered`、`timeout` 和普通节点的 `default` 是固定出口 ID。
- Normalize 和 Hydration 不得在已有稳定 ID 时重新生成 ID。

如果当前节点按旧配置产生的 Outlet ID 在最新版中已删除，Run 按 `flow_changed_outlet_deleted` 退出。

## 11. 持久化模型

### 11.1 Workflow Run

`xy_wap_embed_workflow_run.revision` 改为：

```text
当前 Authoritative Task 使用的 Revision
```

不新增 `started_revision` 或 `current_revision`。进入 Revision 由第一条 Node Execution 的 Revision 还原。

### 11.2 Workflow Task

`xy_wap_embed_workflow_task.revision` 表示：

```text
该 Node Arrival 固定使用的 Revision
```

Task 从创建到终态不得原地切换 Revision。

### 11.3 Node Execution

`xy_wap_embed_workflow_node_execution` 新增：

```sql
revision INT UNSIGNED NOT NULL COMMENT '本次节点执行使用的Revision'
```

Node Execution 必须保存实际 Task Revision。只保存标题不足以还原节点配置、节点契约和变量契约。

### 11.4 Event Subscription

`workflow_event_subscription.revision` 继续表示创建 Subscription 的 Wait Event Task Revision，不随 `run.revision` 后续变化。

### 11.5 Inference Job

Inference Job 继续通过 Task、Node ID、Sequence、Execution Key 和已持久化 Payload 固定当前节点调用。Capability Metadata 中的 Revision 使用 Task Revision，不使用可能已前移的 Run Revision。

### 11.6 Revision Cleanup Request

新增 `xy_wap_embed_workflow_revision_cleanup`，每个被新 Revision 删除的 Fixed Wait 或 Wait Event Node ID 写一行。该表是低频控制面任务，不保存 Run 明细，也不展开为每个客户一行。

最小持久化字段包括：

- `uid`、`workflow_id`、`revision`、`node_id`、`node_kind`
- `status`：`pending`、`leased`、`done`、`obsolete`、`dead`
- `after_run_id`：已完成批次的单调游标
- `attempt`、`next_attempt_at`、`lease_owner`、`lease_expires_at`、`last_error_code`
- `create_time`、`update_time`

必须提供：

```text
UNIQUE (uid, workflow_id, revision, node_id)
INDEX (status, next_attempt_at, lease_expires_at, id)
```

Worker 使用有限批次和数据库租约处理请求。每批成功后推进 `after_run_id`；扫描完成后标记 `done`。如果当前发布图重新出现目标 Node ID，则标记 `obsolete`，且不得继续推进游标或取消 Run。租约过期或进程退出后由其他 Worker 从持久化游标继续。达到最大尝试次数后标记 `dead` 并产生运维告警，不静默丢弃。

### 11.7 Run 查询索引

为跨 Revision 数据页、运行记录和删除等待节点后的定向清退增加或调整索引：

```text
(uid, workflow_id, status, current_node_id, id)
(uid, workflow_id, id)
(uid, workflow_id, status, id)
(uid, workflow_id, current_node_id, id)
(uid, workflow_id, completed_at, id)
```

`listRecords` 去掉 Revision 过滤后，默认分页必须使用 `(uid, workflow_id, id)`；保留期分支使用 `(uid, workflow_id, completed_at, id)`，按状态或节点过滤时使用对应索引。定向清退使用包含 `status + current_node_id` 的索引。查询当前节点人数和定向清退不得依赖 Revision 过滤。实施时应通过实际查询计划删除被这些新索引完全覆盖的旧 Revision 前缀索引，避免机械叠加重复索引。

Node Metric 跨 Revision 按 Node ID 聚合时增加：

```text
(uid, workflow_id, node_id, revision, shard_id)
```

## 12. 数据页语义

### 12.1 默认画布

数据页默认展示当前发布图；本期人数画布不提供 Revision 切换：

- 不因历史 Run 使用过旧 Revision 而切换到旧画布。
- 节点人数按当前图 Node ID 跨 Revision 聚合。
- 同一个稳定 Node ID 修改标题或配置后，当前人数继续显示在该节点上。
- 已从当前图删除的 Node ID 不再作为画布节点展示。

Revision 历史仍可用于审计和单人路径还原，但不作为人数看板的默认筛选维度。

### 12.2 顶栏汇总

顶栏使用长期累计 Metric，不扫描保留期 Run，也不随 45 天 Run 清理回落：

| 指标 | 口径 |
| --- | --- |
| 进入次数 | 所有 Revision 的累计 `entered` |
| 当前停留 | 所有 Revision、所有 Node ID 的当前 `current` |
| 已完成 | 所有 Revision 的累计 `completed` |
| 未完成 | 所有 Revision 的累计 `incomplete`，包括 `failed`、`cancelled` 和所有 `flow_changed_*` 退出 |

所有截至同一聚合水位的 Metric Event 处理完成后必须满足：

```text
entered = current + completed + incomplete
```

Metric 聚合是异步最终一致，因此存在待处理事件时四项数字可以短暂处于不同水位；接口同时返回 `calculatedAt`，且不得把暂时不满足恒等式解释为 Run 数据损坏。当前图无法承载的删除节点人数通过“当前停留”或“未完成”和运行记录解释，不通过 Revision 下拉补齐。

### 12.3 单人运行路径

每条 Node Execution 使用自己的 Revision 读取发布 Draft 快照，从而还原：

- 当时的节点标题
- Node Kind
- 节点配置
- 对应 Revision

当前未完成节点使用 Authoritative Task Revision 还原。Task 在 Run 结束 7 天后清理，Node Execution 与 Run 保留 45 天，因此已完成步骤不能依赖 Task 还原历史。

### 12.4 数据 API

数据页接口改为当前图语义：

- `GET /workflows/:workflowId/data` 不再接收 Revision 查询参数。
- `GET /workflows/:workflowId/records` 不再接收 Revision 查询参数；`nodeId`、`status` 和游标继续可选。
- `WorkflowDataOverview` 使用 `publishedRevision` 表示本次响应对应的当前发布图，并新增 `summary.entered/current/completed/incomplete`。
- `WorkflowDataOverview.nodes` 只返回当前发布图中的 Node ID，并对这些 Node ID 跨 Revision 聚合，继续遵守当前最大节点数契约；已删除的历史 Node ID 不进入节点数组，但仍计入 `summary`。
- `WorkflowEntryRecord.revision` 和 `WorkflowEntryRecordDetail.revision` 继续保留，表示该 Run 当前或最后一次 Node Arrival 的 Revision，用于解析当前节点元数据。
- `WorkflowEntryRecordStep` 增加 `revision`；已完成或失败步骤取 Node Execution Revision，当前步骤取 Authoritative Task Revision。Backend 使用该 Revision 还原标题和配置，不再用 Run 当前 Revision 解释整条路径。

共享 DTO、Backend route/service/reader、Web repository 和数据页的 Revision 切换逻辑必须一起修改，不能只移除 SQL 的 Revision 条件。

## 13. 指标语义

Workflow Node Metric 继续按 `revision + node_id` 持久化，以保留执行来源和支持内部审计；数据页 API 默认按 Node ID 跨 Revision 求和。`xy_wap_embed_workflow_node_metric_event` 增加 `incomplete_delta`，`xy_wap_embed_workflow_node_metric` 增加 `incomplete_count`。

节点状态变化时，每次离开只允许扣减一次 `current`：

- Run 创建时，Start 节点同时增加 `entered + 1` 和 `current + 1`。
- 成功进入下一节点时，从当前 Task Revision 记录一条离开事件 `current - 1, passed + 1`，并在下一 Task Revision 记录一条到达事件 `current + 1`。
- End 节点完成时记录 `current - 1, completed + 1`，不再额外记录普通离开事件。
- Flow Changed Exit、业务失败或取消从当前节点记录 `current - 1, incomplete + 1`，不再额外记录普通离开事件；即使当前 Node Execution 已成功完成，也不能重复扣减 `current`。
- 删除节点的定向清退必须产生与普通取消相同的 `left-incomplete` Metric Event。

Start 和 End 也参与底层 `current` 计数，以保证 Workflow 顶栏汇总恒等式成立；节点 UI 可以继续只展示对该 Node Kind 有意义的指标。

每条 Metric Event 行自行携带其 Node ID 所属 Revision。一次跨 Revision `advanced` 必须拆成两条持久化事件：离开事件使用当前 Task Revision，进入事件使用下一 Task Revision，并使用不同的稳定 Event Key；两条事件必须在推进事务中一起写入。不得继续让一组 `advanced` delta 共用单个 `runRevision`。

## 14. 状态与用户操作

### 14.1 Pause

Workflow Paused 时：

- 不创建新 Run。
- Scheduler 不领取、不派发新的到期 Task；已领取且正在执行的当前节点允许结束。
- 可以发布新 Revision。
- 已领取节点在暂停期间提交时，仍按提交时刻的最新发布 Revision 做 Forward Routing；下一 Task 保持 `pending`，直到恢复后再派发。
- 暂停期间一直未领取的当前节点，恢复后仍按原 Task Revision 完成，再按恢复时最新发布 Revision 路由。
- Revision Cleanup Request 在暂停期间照常执行。清退是发布后流程变更的终态处理，不是节点推进，不等待 Workflow 恢复。

### 14.2 Stop 与删除 Workflow

Stopped 或逻辑删除继续取消全部活动 Run，不等待节点边界，也不复用 `flow_changed`。

### 14.3 回滚

恢复历史 Revision 只恢复为 Draft。再次发布产生新的 Revision，并从发布后各 Run 的下一次 Forward Routing 开始生效。

回滚不撤销已经完成的 Action，不重新执行已经通过的节点，也不把 Run 的 Sequence 回退。

## 15. 兼容性与 Handler 保留

旧 Node Kind 或 Capability Contract Version 只要仍被可继续运行的 Workflow 当前发布 Revision，或被以下活动状态引用，就不能删除对应 Runtime 执行 Handler：

- 活动 Task
- Wait Event Subscription
- Inference Job
- 尚在 Retry 或 Lease Recovery 的 Node Execution

与旧模型相比，不再要求因为一个长 Run 曾从旧 Revision 启动，就永久保留该 Revision 的全部执行 Handler；只有尚未完成的旧节点执行仍需要可执行代码。

Revision 数据本身继续按审计和运行记录保留要求保存，不因没有活动 Task 立即删除。历史页面通过 Revision 快照或稳定展示元数据还原标题和配置，不要求保留能够再次执行该 Revision 的 Runtime Handler。

本能力上线前尚无生产运行数据，因此数据库升级采用一次性运行态重置，不兼容旧模型下已经创建的 Run。升级脚本清空 Run、Task、Wait Event Subscription、Inference Job、Node Execution、Outbox、Inbox、Entry Guard 和派生 Metric 数据；Workflow Definition、Draft、Revision 与 Trigger Binding 继续保留。这样既不会让旧模型的“当前节点与提前创建的下游 Task 不一致”被新 Reconciler 误判，也不会让旧指标口径污染新的 `entered = current + completed + incomplete` 汇总。

## 16. 非目标

本期不实现：

- 通用 BPMN Process Instance Migration Plan。
- 发布时批量改写所有 Run 和 Task Revision。
- 用户逐个选择哪些 Run 迁移。
- 当前 Action、Inference 或 Composite 节点的配置热替换。
- 已执行节点的补偿、撤销或重新执行。
- 删除当前节点时同步阻塞发布直到全部客户清退。
- 通过 Revision 下拉把数据页拆成彼此独立的人数看板。

## 17. 验收场景

### 17.1 后续配置变更

客户停留在 Wait，发布修改后续 Message 配置。Wait 按旧配置完成，Message 使用新 Revision 配置执行。

### 17.2 插入节点

客户停留在 Wait，发布后在 Wait 和 Message 之间插入 Coupon。Wait 完成后进入 Coupon，再进入 Message。

### 17.3 删除后续链路

客户当前节点仍存在，但对应 Outlet 或后续边被删除。当前节点完成后 Run 以 `flow_changed_outlet_deleted` 退出，不产生下一 Capability 调用。

### 17.4 删除当前 Wait

发布删除客户当前停留的 Wait。发布事务同时写入耐久清退请求；发布请求不等待实际清退完成。Worker 重试该请求时只取消仍停留在该 Wait 的 Run，不误伤已经前移或终止的 Run。即使 Workflow 随后暂停，清退仍继续完成。

### 17.5 删除当前 Action

Action 已到达或正在 Retry 时发布删除该节点。Action 继续使用旧 Revision 和相同 Idempotency Key 完成；完成后因最新版不存在当前 Node ID 而退出。

### 17.6 Branch 条件修改

Branch Path ID 不变，只修改条件。尚未到达 Branch 的 Run 使用新条件；已到达 Branch 的 Task 使用旧条件。旧 Branch 结果完成后按相同稳定 Outlet ID 在最新版路由。

### 17.7 Branch Path 删除重建

旧 Task 产生的 Outlet ID 已被删除。即使新 Path 展示名称相同，也按 `flow_changed_outlet_deleted` 退出。

### 17.8 Start 事件修改

Workflow 从好友添加事件改为消息事件。新 Run 使用消息 Trigger Projection；已有好友事件 Run 保留原 Trigger Projection 并继续前向路由。若新版后续节点要求消息正文，而旧 Run 不具备该字段，则在调用 Capability 前退出。

### 17.9 发布与节点提交竞态

发布和 `commitNodeResult` 同时发生。双方通过 Definition 行锁形成顺序：

- 提交先获得锁：当前节点按提交时已发布 Revision 路由。
- 发布先获得锁：当前节点按新 Revision 路由。

不存在事务外读取 Revision 后提交已过时下一跳的窗口。

### 17.10 执行依赖暂不可用

下一 Task 已按新 Revision 创建，但对应的 Product Entitlement、业务资源或下游服务暂时不可用。Task 按节点既有策略保持 Pending 并 retry 或 defer；依赖恢复后继续执行，不转为 `flow_changed`。

### 17.11 数据页

同一个 Wait Node ID 上同时有旧 Revision 和新 Revision 的 Run。当前图 Wait 节点展示两者总人数；单人路径分别使用各自 Node Execution Revision 还原标题和配置。Overview 和 Records 请求都不携带 Revision；跨 Revision 推进产生分别归属旧、新 Revision 的两条 Metric Event，全部聚合后顶栏满足 `entered = current + completed + incomplete`。

### 17.12 删除节点后恢复

Revision 3 删除 `wait-1` 并创建清退请求，但请求尚未完成。随后用户恢复包含同一 `wait-1` Node ID 的历史 Revision，并发布为 Revision 4。清退 Worker 在下一批处理前发现当前发布图已重新出现 `wait-1`，将旧请求标记为 `obsolete`；旧 Run 和 Revision 4 下新到达的 Run 均不得被该请求取消。

## 18. 实施顺序

建议拆为三个可独立验证的实现阶段，但可以放在同一个 Runtime 架构 PR 中：

1. **持久化与历史基础**
   - Node Execution 增加 Revision。
   - Run Revision 改为 Current Revision 语义。
   - 数据库注释、类型、Repository Contract 和历史读取更新。
2. **节点边界与事务路由**
   - Task Revision 驱动当前节点执行。
   - `commitNodeResult` 事务内读取最新版并创建下一 Task。
   - Fixed Wait 改为节点内等待。
   - Reconciler 收紧不变量。
   - 审计并统一 Claim、Wait Event、Inference、Capability、Cancellation、Cleanup 和 Reconciler 的数据库锁序。
3. **发布清退与数据页**
   - 增加 Revision Cleanup Request 表；删除 Wait/Wait Event 时原子写入请求，并实现租约、游标、节点复活失效和幂等的定向批量取消。
   - 当前图跨 Revision 人数聚合。
   - 累计 Summary Metric、未完成汇总和单人路径按 Execution Revision 还原。
   - 移除数据 API 的 Revision 请求参数并补齐 Records/Metric 查询索引。

每个阶段必须同时更新 Memory/MySQL Repository Contract，并覆盖发布与推进竞态、重试幂等、Wait 恢复、Flow Changed Exit、历史保留和数据聚合测试。

## 19. 受影响代码定位

| 能力 | 当前代码 |
| --- | --- |
| 发布 Revision 与 Definition 行锁 | `apps/backend/src/modules/workflow/workflow-mysql.repository.ts` |
| 发布校验与 Capability Availability | `apps/backend/src/modules/workflow/workflow.service.ts` |
| 当前节点执行与下一跳计算 | `packages/workflow-runtime/src/service.ts` |
| Run/Task/Wait/Inference 事务 | `packages/workflow-runtime/src/mysql-repository.ts`、`memory-repository.ts` |
| Run/Task 一致性修复 | `packages/workflow-runtime/src/reconciler.ts` 与 Repository 实现 |
| Execution Spec 与节点输出 | `packages/contracts/src/workflow/execution.ts`、`packages/workflow-engine` |
| 数据页共享 DTO | `packages/contracts/src/workflow/dto.ts` |
| 动态 Outlet ID | `apps/web/src/pages/chat/workflow/branch-paths.ts` 与节点 Definition |
| 数据页 API | `apps/backend/src/modules/workflow/workflow-data-mysql.repository.ts` |
| 数据页仓储、画布与汇总 | `apps/web/src/pages/chat/workflow/workflow-data-repository.ts`、`workflow-data-page.tsx` |
| 数据库表与索引 | `docs/db/schema.sql`、`docs/db/change-log.md` |
| 后端可写表白名单 | `apps/backend/src/db/writable-tables.ts` |
| 清退请求扫描与租约 | `apps/workflow-worker` 新增控制面角色，不走 Task Outbox |

本设计的核心不是让 Run 无版本执行，而是让每次 Node Arrival 都有稳定版本，并让后续节点在明确事务边界上跟随最新发布图。
