# Workflow 租户级 Task 弹性并发控制 1.0

- 日期：2026-09-18
- 版本：1.0
- 状态：Draft
- 适用范围：`apps/workflow-worker`、`packages/workflow-runtime` 的 Task 执行容量保护
- 相关设计：[营销 Workflow 1.0 执行引擎设计](./2026-07-10-marketing-workflow-execution-engine.md)
- 相关实现：[Workflow Message 坐席发送频控契约](./2026-08-16-workflow-message-send-contract.md)

本文记录租户级 Task 执行容量保护的 1.0 方案。它是现有 Workflow 执行引擎设计的补充，不改变 Run、Task、Outbox 的业务事实来源，也不把 Redis 变成长期任务调度数据库。

当前代码路径锚点：Scheduler 的 `dispatchDueTasks` 位于
`packages/workflow-runtime/src/mysql-repository.ts`，Task Consumer 位于
`apps/workflow-worker/src/task-consumer.ts`，Runtime 的 `executeTask` 位于
`packages/workflow-runtime/src/service.ts`。本 Spec 只在 Runtime 的 `claimTask` 前增加容量准入，不改变上述入口和 Task 状态机的基本职责。

## 1. 决策摘要

1.0 采用“周期性容量控制器 + Consumer 执行准入”的弹性并发方案：

```text
Task 仍按现有 Scheduler 全局 FIFO 派发
        |
        v
Pulsar / Task Consumer
        |
        +-- Redis 原子申请全局执行许可和 UID 配额
        |       |
        |       +-- 允许：取得 Task 执行租约并执行
        |       +-- 拒绝：Task 延期、ACK 当前消息、等待下次唤醒
        |
        v
容量控制器每 5 分钟扫描积压并更新 UID 动态配额
```

核心决策：

- 保护对象是同一 `uid` 的 Task **同时执行数**，不是消息发送速率，也不是租户活跃 Run 数。
- 全局逻辑容量为 `N`，由部署显式配置；所有 Task 执行必须先取得一个短期 Redis 执行许可。
- 单租户无竞争时最多使用 `H = max(1, floor(N * 90%))`，保留一部分容量给新租户或其他租户；当 `N` 很小时仍至少允许一个 Task。
- 检测到多个租户同时积压后，控制器按活跃竞争 UID 数量下调动态配额；最多精细管理 100 个竞争 UID，超过后统一进入饱和模式，配额按 `max(1, floor(N / 100))` 计算。
- 已经取得许可并开始执行的 Task 不抢占；配额下调只影响后续 Task。
- 控制器周期为 5 分钟，允许在一个控制周期内存在过度占用；不承诺实时公平或严格 Round Robin。
- 不改写现有 `dispatchDueTasks` 的全局 FIFO 逻辑，不新增 Task 调度索引，不引入 UID 级 Scheduler 轮转队列。
- 不对 `Entry Consumer` 采用同一套延期逻辑。1.0 只保护 Task；Entry 的持久化延期和入口公平性另行设计。

这是一种 **best-effort 的 work-conserving bulkhead**，不是严格的公平调度器。它的验收目标是阻止单个租户长期占满实际执行容量，并在不超过约 5 分钟的控制窗口内收敛，而不是证明每个 UID 在每个瞬间都获得相同槽位。

## 2. 背景与当前问题

### 2.1 当前派发路径

当前 Scheduler 的 `dispatchDueTasks` 按全局 Task 队列读取到期任务，主要排序字段为：

```text
status, bucket_time, due_at, id
```

它没有 UID 维度。单个租户存在大量同时到期 Task 时，一个批次可能全部来自同一 UID，然后进入 Outbox、Pulsar 和 Task Consumer。

当前 `WORKFLOW_TASK_CONCURRENCY` 只限制单个 Worker 进程的接收并发；`WORKFLOW_ACTIVE_RUN_LIMIT` 只限制租户活跃 Run 数。两者都不能限制一个 UID 同时占用多少 Task 执行槽。

### 2.2 1.0 有意保留的行为

1.0 不改造为“先选 UID、再按 UID 派发”的严格公平 Scheduler。因此以下现象仍可能存在：

- 热点 UID 的 Task 可能先进入 Pulsar。
- Consumer 仍会短暂读取部分暂时不能执行的 Task。
- 被拒绝的 Task 会产生一次 Redis 准入检查和一次数据库延期写入。
- Shared Subscription 不提供租户级顺序或严格轮转保证。

这些是 1.0 明确接受的代价。容量控制器和 Consumer 准入必须足够轻量，不能将延期重试变成高频重投或大规模数据库写放大。

### 2.3 1.0 要解决的问题

需要解决的是：

- 一个 UID 的 Task 外部执行长期占满全部 Worker 执行能力。
- 新租户开始有任务时，热点租户仍无限制地继续取得新执行槽。
- Worker 扩容后不同实例各自计数，导致租户和全局容量被重复放大。
- Worker 崩溃后并发计数永久泄漏。
- 通过拒绝执行来保护容量时，Task attempt 被错误消耗或消息进入 DLQ。

## 3. 目标与非目标

### 3.1 目标

- 以 UID 为隔离维度限制 Task 同时执行数。
- 在所有 Task Consumer 副本之间共享全局容量 `N`。
- 允许单一租户在系统空闲时借用大部分容量。
- 在其他租户积压出现后，动态降低热点租户后续准入额度。
- 控制器最长约 5 分钟完成一次竞争状态判断和配额调整。
- Task 被拒绝时使用现有 `due_at` 持久化延期路径，不增加业务 `attempt`。
- Worker 崩溃、网络断开或释放逻辑未执行时，许可可以自动过期回收。
- 不新增数据库表，不新增 Task 索引，不改变 Task、Run、Outbox 的业务状态模型。
- 保持 MySQL 为 Task、Run、Outbox 和最终业务状态的事实来源。

### 3.2 非目标

- 不保证严格的 UID Round Robin、Deficit Round Robin 或 max-min fairness。
- 不保证同一时刻每个活跃 UID 都有一个执行槽。
- 不抢占已经运行的 Task。
- 不改变 Scheduler 的全局 FIFO 派发排序。
- 不消除热点 Task 已经进入 Pulsar 后产生的全部运输层开销。
- 不保护 Entry Consumer 的租户级执行容量。
- 不使用 Redis 保存长期 Task 状态、Run 状态或调度事实。
- 不通过 Redis 计数替代 MySQL 的 Task Version、状态和租约校验。

## 4. 术语与容量模型

### 4.1 租户

本文中的租户使用 `uid` 表示。一个 UID 下可以有多个 Workflow、Run、托管账号和并行客户任务。

### 4.2 全局逻辑容量 `N`

`N` 是所有 Task Consumer 副本共享的最大同时执行许可数：

```text
N = WORKFLOW_TASK_GLOBAL_CONCURRENCY
```

它必须小于或等于所有 Task Consumer 实例的最大有效执行并发总和：

```text
N <= sum(WORKFLOW_TASK_CONCURRENCY of all task-consumer replicas)
```

这里的“所有副本”是指共享同一 Workflow Task Topic、同一 Redis 容量命名空间的全部 Task Consumer；Entry Consumer、Inference Worker 和 Outbox Publisher 不计入 `N`，除非它们实际执行同一批 Task 节点。

如果 `N` 大于实际 Worker 并发，容量控制不会提升吞吐；如果 `N` 小于实际并发，则剩余 Worker 槽位作为有意保留的安全余量，不得绕过 Redis 许可直接执行。

1.0 假设部署容量相对稳定。扩缩容时必须同步调整 `N`，并通过配置发布或等价的受控部署流程完成；不在本版本内自动根据 Worker 数量推导 `N`。

### 4.3 单租户硬上限 `H`

```text
H = max(1, floor(N * tenantMaxShare))
tenantMaxShare = 90% by default
```

`H` 是单个 UID 的硬上限。即使系统没有其他竞争者，一个 UID 也不能取得超过 `H` 个同时有效许可，以保留至少一部分容量给后来租户。

### 4.4 活跃竞争 UID 数 `C`

`C` 不是数据库中所有租户的数量，也不是所有活跃 Run 的数量。它只包括控制器观察到的、在当前窗口内可能继续申请 Task 执行许可的 UID：

- Task 表中处于 `pending` 或 `dispatched`，且 `due_at <= now` 的 UID；
- 当前仍持有有效 Redis 执行许可的 UID；
- Consumer 因容量不足而记录过需求信号，且需求信号未过期的 UID。

未来 `due_at` 尚未到期的 Task 不参与 `C`，避免等待时间、消息发送窗口或其他业务延迟中的 UID 占用竞争名额。

### 4.5 动态配额 `Q(uid)`

控制器按以下规则写入动态配额：

| 观察到的竞争情况 | `Q(uid)` |
|---|---:|
| 没有活跃竞争 UID | 默认值 `H` |
| 只有一个 UID 有需求 | `H` |
| `2 <= C <= 100` | `max(1, floor(N / C))` |
| `C > 100` | 全局饱和配额 `max(1, floor(N / 100))` |

饱和模式不是只管理前 100 个 UID。Consumer 对所有 UID 都取 UID 动态配额、默认 `H` 和全局饱和配额中的最小值，因此未进入本轮候选集合的 UID 也不能绕过限制。实际同时运行的 UID 数仍由全局 `N` 限制。

当 `Q(uid)` 从较大值降低时，不回收已有许可。只要某 UID 的有效许可数已经达到新配额，它就不能再取得新许可；已有 Task 完成或许可过期后，容量自然释放。

### 4.6 全局许可占用

1.0 的 Redis 许可表示“已经取得执行权、即将或正在运行 Task”，不表示数据库中所有 `dispatched` Task：

```text
globalPermitUsed = valid Redis execution leases
uidPermitUsed(uid) = valid Redis execution leases owned by uid
```

这与严格 Scheduler 方案不同。1.0 不承诺：

```text
database dispatched + database running <= N
```

它只承诺：

```text
valid Redis execution leases <= N
valid Redis execution leases for uid <= Q(uid)
```

## 5. 总体架构

### 5.1 模块职责

#### Task Consumer / Runtime

- 在取得数据库 Task 执行租约前申请 Redis 执行许可。
- 许可不足时将 Task 写回延后状态，并 ACK 当前 Pulsar 消息。
- 许可成功后执行现有 `claimTask` 和节点推进路径。
- 在 Task 状态已经持久化后释放许可。
- 处理 Redis 许可过期、释放失败和旧 Task 消息等异常。

容量准入作为 Runtime 的一个可替换端口接入，不由 `task-consumer.ts` 自己复制 Task 查询或状态更新逻辑。`executeTask` 在容量拒绝时返回现有 Consumer 可识别的结果：

```ts
{
  kind: "deferred",
  reasonCode: "WORKFLOW_TASK_TENANT_CAPACITY_LIMITED"
    | "WORKFLOW_TASK_CAPACITY_UNAVAILABLE",
  retryAt: Date,
}
```

Consumer 按正常成功返回路径 ACK，并将其观测为租户容量延期或容量模块不可用；不得把容量拒绝抛成普通异常后依赖 Pulsar NACK 重投。

#### Task Capacity Controller

- 作为带有 `task-consumer` 的 Worker 内后台循环运行；不新增独立部署单元，也不新增必须单独配置的 Worker Role。
- 每个控制周期只允许一个实例执行扫描和配额计算。
- 周期性读取到期 Task 积压和 Redis 需求信号。
- 计算竞争 UID 集合和动态配额，写入 Redis。
- 不修改 Task 状态，不创建 Outbox，不直接派发 Task。

#### Scheduler

- 保持现有全局 FIFO 派发逻辑。
- 不读取动态 UID 配额。
- 不负责严格公平轮转。

#### MySQL

- 继续保存 Task、Run、Outbox、`due_at`、`task_version`、业务 attempt 和执行结果。
- 延期、Claim、完成、失败和恢复仍通过现有事务与版本条件完成。

#### Redis

- 保存短期执行许可、动态配额、需求信号和控制器锁。
- Redis 数据全部可重建、可过期，不作为业务事实来源。
- 生产环境 Redis 不可用时，Task 不得绕过准入控制执行。

### 5.2 逻辑流程

```text
1. Scheduler 按现有方式将到期 Task 写入 Outbox / Pulsar
2. Task Consumer 解析 Task 消息并读取当前 Task / Run
3. Runtime 完成权益、节点和发送窗口等无需执行许可的检查
4. Capacity Admission 原子申请 uid + 全局许可
5. 申请成功：claimTask -> 执行节点 -> 提交 Task 结果 -> 释放许可 -> ACK
6. 申请失败：记录 UID 需求 -> deferTask -> ACK
7. Controller 每 5 分钟扫描积压并调整 Q(uid)
```

## 6. Task Consumer 准入

### 6.1 准入位置

容量准入必须位于：


```text
findTask / findRun / Revision 校验
    -> 权益与 Workflow 边界校验
    -> 消息发送窗口等可持久延期检查
    -> Redis Capacity Admission
    -> claimTask
    -> 节点执行
```

不能在 `claimTask` 之后才申请。`claimTask` 会增加 Task `attempt` 并取得执行租约；容量不足不应消耗业务执行尝试。

容量拒绝和 Redis 不可用都必须在 `claimTask` 前完成持久化延期。实现需要扩展共享的
`WorkflowTaskDeferReasonCode`，至少加入：

```text
WORKFLOW_TASK_TENANT_CAPACITY_LIMITED
WORKFLOW_TASK_CAPACITY_UNAVAILABLE
```

两者都属于 Task Deferred，不属于 Capability Retry；前者表示全局许可或 UID 配额不足，后者表示无法确认许可状态。

### 6.2 申请成功

申请成功后：

1. 使用 `leaseId = uid + taskId + taskVersion` 标识许可。
2. 同一 `leaseId` 的重复申请必须复用同一许可和 Token，并增加短期引用计数，不得重复占用全局或 UID 许可；随后调用现有 `claimTask`，保持当前 `task_version + status` 条件更新。
   每个成功申请者释放一份引用，最后一份引用释放时才删除许可，避免重复投递在并发 Claim 竞态中提前释放仍在执行中的许可。
3. Claim 冲突、Task 过期或 Workflow 边界变化时立即释放许可。
4. Claim 成功后，许可覆盖从执行租约取得到最终 Task 状态提交的时间。
5. `executeTask` 返回后先确认数据库状态已提交，再释放许可。
6. 释放完成后 ACK 当前 Pulsar 消息；ACK 失败仍由现有重复消息和 Task Version 处理。

### 6.3 申请失败

申请失败包括：

- 全局许可已满；
- 当前 UID 已达到动态配额；
- 当前 Redis 许可数据不可用。

全局许可已满或 UID 配额已满时：

1. 在 Redis 需求 ZSET 中刷新该 UID 的 `lastDemandAt`。
2. 计算 `dueAt = now + capacityDeferDelay + jitter`。
3. 使用现有 `deferTask` 将 Task 延后。
4. 使用错误码 `WORKFLOW_TASK_TENANT_CAPACITY_LIMITED` 记录延期原因。
5. 不增加 Task `attempt`，但按现有规则增加 `task_version`。
6. ACK 当前 Pulsar 消息。

Redis 不可用时不写需求 ZSET，使用同一 `deferTask` 路径但改用
`WORKFLOW_TASK_CAPACITY_UNAVAILABLE`。该路径使用至少 30 秒的退避，并需要限速观测，避免 Redis 故障时每条 Task 都立即产生一次 MySQL 延期写入。

推荐初始值：

```text
capacityDeferDelay = 60 seconds
jitter = 0..30 seconds
```

延期不能使用几秒级固定重试，否则控制周期内会产生大量重复唤醒。随机抖动只用于分散同一 UID 的同时唤醒，不承担公平排序职责。

### 6.4 许可释放保证

Runtime 必须使用 `try/finally` 覆盖以下所有路径：

- Claim 冲突；
- 节点成功完成；
- 业务可重试失败；
- 业务终态失败；
- Message rate limit 延期；
- Workflow 暂停、停止或权益失效；
- Abort、超时和未知异常。

如果释放请求失败，许可不立即视为可复用，由 Redis TTL 自动回收；系统记录释放失败观测，不修改已提交的 MySQL 业务状态。

## 7. Task Capacity Controller

### 7.1 执行周期

控制器默认每 5 分钟运行一次：

```text
controllerInterval = 300 seconds
demandWindow = 600 seconds
```

需求窗口取两个控制周期，避免一个 UID 在控制周期边界附近短暂消失后立即重新获得借用额度。

控制器可以在启动后立即执行一次，但必须先确认数据库和 Redis 就绪。控制器单次执行必须有最大耗时和扫描上限，不能无界读取 Task 表。

### 7.2 获取控制锁

多 Worker 副本可以同时运行控制器逻辑，但同一时刻只允许一个实例执行控制周期：

```text
SET workflow:task-capacity:controller-lock <workerId> NX PX <lockTtl>
```

控制锁只用于减少重复扫描，不是 Task 正确性的组成部分。控制器异常退出时由 TTL 释放；其他实例可以在下一个周期接管。

如果控制器锁获取失败，本轮跳过，不报 Worker 角色故障；如果连续多个周期没有任何控制器成功，应产生健康告警。

### 7.3 扫描任务积压

控制器先从租户容量守卫表读取当前 `active_run_count > 0` 的候选 UID，再对这批 UID 探测 Task 表中的：

```text
status IN ('pending', 'dispatched')
AND due_at <= now
```

按 UID 聚合需求。1.0 不增加新的 UID 调度索引，优先复用现有容量守卫表和 Task 表已有的 UID 前缀索引完成有界探测。

扫描要求：

- 单次最多读取 `WORKFLOW_TASK_CAPACITY_SCAN_LIMIT` 个活跃候选 UID，默认 500，配置上限也是 500；容量守卫表最多读取 501 条，用于判断是否完整。
- 对候选 UID 执行一次 `uid IN (...)` 的 Task 查询，并在数据库侧按 UID 去重；不按 UID 逐个查询，禁止产生 N 次 SQL。
- 容量控制查询不要求 Scheduler 的 Task FIFO 顺序，不使用 `ORDER BY bucket_time, due_at, id`。
- 这里的“有界”只约束 SQL 次数、候选 UID 数和 `IN (...)` 参数数量，不代表第二跳的数据库行扫描量有固定上限。现有 UID 前缀索引不包含 `bucket_time` / `due_at`，对没有到期 Task 的候选 UID，MySQL 可能需要检查该 UID 下大量 `pending` / `dispatched` 行才能确认没有命中；最坏成本会随候选 UID 对应的 Task 行数增长，而不是只随 UID 数增长。1.0 接受该近似，不新增索引，需用真实数据和 `EXPLAIN` 持续验证。
- 活跃候选 UID 达到上限时标记 `scanComplete=false`，不能据此扩大任意 UID 的配额。
- `scanComplete=false` 时保留上一周期的收紧配额；没有历史配额的 UID 使用保守默认值 `H`，并明确记录“本轮竞争集合不完整”，不宣称本轮已经完成公平判断。
- 数据库查询失败时保留上一周期配额，不把失败解释为空积压。

由于 1.0 允许近似判断，扫描结果只影响后续配额，不影响 Task 状态正确性。活跃 UID 候选未被本轮完整扫描时，Consumer 的需求信号仍可以将已到达 Consumer 的 UID 加入竞争集合；在竞争 UID 尚未被扫描或消费端观测到之前，不能承诺其已经获得当前竞争规模对应的精细配额。

### 7.4 合并需求信号

控制器将以下 UID 合并去重：

1. Task 表有到期 `pending` 或 `dispatched` Task 的 UID。
2. `demandWindow` 内曾因容量不足申请失败的 UID。
3. 当前仍持有有效 Redis 执行许可的 UID。

需求 ZSET 只保存最近发生容量竞争的 UID，不保存所有租户、不按 Task 保存成员。每个 UID 最多一个 member：

```text
workflow:task-capacity:demand
member = uid
score = lastDemandAtMs
```

每轮控制器先删除过期 score。没有到期 Task 且需求信号已过期的 UID 不参与 `C`。

控制器不完整读取需求 ZSET。删除过期 score 后最多读取 101 个 UID：前 100 个用于精细配额计算，第 101 个只用于判定已经进入饱和模式。由于 demand member 按 UID 去重，只要读到第 101 个就足以证明 `C > 100`，无需继续加载其余 UID。

### 7.5 计算动态配额

设控制器已知的竞争集合为 `D`，`C = size(D)`，精细管理阈值 `M = 100`：

```text
H = max(1, floor(N * 90%))

if C <= 1:
  known uid quota = H
else if C <= M:
  quota(uid) = max(1, floor(N / C)) for uid in D
else:
  saturatedQuota = max(1, floor(N / M)) for every uid
```

没有出现在 `D` 中且没有历史收紧配额的 UID 使用默认配额 `H`，但仍受全局 `N` 限制。已有收紧配额的 UID 在恢复条件满足前继续使用旧配额，不能因为一次扫描暂时只看到一个 UID 就立即恢复到 `H`。

示例：

| `N` | 竞争 UID 数 `C` | 单 UID 后续配额 |
|---:|---:|---:|
| 100 | 1 | 90 |
| 100 | 2 | 50 |
| 100 | 10 | 10 |
| 100 | 100 | 1 |
| 100 | 1000 | 1，进入饱和模式 |
| 1000 | 100 | 10 |
| 1000 | 500 | 10，进入饱和模式 |

当 `C > 100` 时，控制器不再为所有竞争 UID 逐个写配额，只刷新一个全局饱和配额 Key。该模式限制的是每个 UID 的最大占用，不保证超过 100 个 UID 严格轮转；剩余 UID 仍通过延期和后续需求信号继续竞争。

### 7.6 配额收紧与恢复

- 配额收紧立即写入 Redis，但不撤销现有许可。
- 新配额小于当前 UID 已占用许可数时，当前 UID 暂停取得新许可，直到自然下降到配额以下。
- 发现 `C >= 2` 时立即收紧相关 UID 的配额。
- 发现竞争消失或只剩一个已知竞争 UID 后，不立即放宽当前 UID；当前仍可见 UID 需要连续 `WORKFLOW_TASK_CAPACITY_STABLE_CYCLES` 个完整周期满足稳定条件，默认 2 个周期，之后才提升到 `H`。
- 不维护历史受限 UID 集合。已经退出竞争集合的 UID 不再刷新其 quota Key，由 `WORKFLOW_TASK_CAPACITY_QUOTA_TTL_MS` 到期后惰性恢复到 `H`。
- 全局饱和配额同样使用 quota TTL；持续检测到 `C > 100` 时刷新，竞争规模下降后保守保留至 TTL 到期，不因一次扫描立即放宽。
- 控制器不能因为一次不完整扫描就恢复配额。
- 配额记录包含控制版本和更新时间，Consumer 只读取当前有效值。

默认动态配额过期后回退到 `H`，而不是无限制放开到 `N`。这样控制器暂时失活不会让单个 UID 重新占满全局容量；但这也意味着 1.0 在控制器长期失活时不提供严格的租户公平性，必须通过健康告警处理。

## 8. Redis 临时数据模型

Redis 只保存可重建的容量控制数据：

```text
workflow:task-capacity:config
  N、tenantMaxShare、configVersion、updatedAt

workflow:task-capacity:quota:{uid}
  quota、version、stableCycles、updatedAt、expiresAt

workflow:task-capacity:saturated-quota
  C > 100 时对所有 UID 生效的全局配额，带 TTL

workflow:task-capacity:leases
  ZSET: leaseId -> expiresAtMs

workflow:task-capacity:leases:{uid}
  ZSET: leaseId -> expiresAtMs

workflow:task-capacity:demand
  ZSET: uid -> lastDemandAtMs

workflow:task-capacity:controller-lock
  short-lived controller ownership
```

配额 TTL 默认不短于 `demandWindow + controllerInterval`，建议为 15 分钟。控制器只刷新当前已知竞争 UID 的 quota Key，离场 UID 和退出中的全局饱和配额依靠 TTL 惰性恢复；仍可见的单个 UID 继续使用稳定周期判断，避免立即放宽。

### 8.1 原子申请

申请许可必须由一个 Redis Lua 脚本原子完成：

1. 清理全局和当前 UID 已过期的 lease member。
2. 读取当前 UID `Q(uid)`；没有有效配额时使用 `H`。如果全局饱和配额存在，则使用二者中的较小值。
3. 检查全局有效 lease 数是否小于 `N`。
4. 检查当前 UID 有效 lease 数是否小于 `Q(uid)`。
5. 两项都满足时同时写入全局 ZSET 和 UID ZSET。
6. 任一条件不满足时不写入 lease，并返回拒绝原因和建议重试时间。

`ZSET` 没有 per-member TTL。每次申请、释放、续租和控制器扫描都必须显式清理过期 member；UID ZSET 在没有新 lease 时可以设置一个保守的 key TTL，但 TTL 不能替代 score 清理。

### 8.2 释放与续租

- 释放脚本必须同时删除全局和 UID ZSET 中的 `leaseId`，并验证 lease 所属 UID。
- 续租脚本只允许原 `leaseId` 延长 score，不允许凭 UID 扩大或替换其他 Task 的许可。
- Lease TTL 至少覆盖当前 Task 的 `lease_expires_at`，并在长于 TTL 一半的执行中续租。
- Worker 崩溃后不依赖 `finally`，过期 lease 由下一次 Lua 操作或控制器清理。
- 许可清理只影响吞吐容量，不修改 MySQL Task 状态；Task 状态仍由现有 Reconciler 和版本条件恢复。

### 8.3 Redis 失败

Redis 许可申请失败时不得直接执行 Task。生产环境 Task Consumer 必须保持 Redis 必需配置，运行期 Redis 不可用时采用 fail-closed：

- 不消耗 Task `attempt`；
- 不执行外部节点动作；
- 按统一容量不可用退避处理，并记录 Worker 健康告警；
- Redis 恢复后重新取得许可。

实现时必须避免 Redis 故障导致每条 Task 都以几秒频率写回 MySQL。容量不可用退避至少使用 30 秒级延迟，或者由 Consumer 进入受控暂停接收状态；具体 Broker 停止接收方式由实现阶段按当前 Pulsar Adapter 能力确定。无论采用哪种方式，都不得因为 Redis 失败而绕过容量准入执行外部动作。

## 9. 数据库与状态机边界

### 9.1 不新增表和索引

1.0 不新增以下数据库对象：

- UID 调度队列表；
- Task 公平轮转 cursor；
- Task Capacity lease 表；
- `(status, uid, due_at)` 新索引。

控制器复用现有 Task、Outbox 和 Task Schedule 查询；容量许可只保存在 Redis 短期数据中。

### 9.2 延期使用现有 Task 路径

容量不足调用现有 `deferTask`，保持以下语义：

- 支持 `dispatched` Task 回到 `pending`；
- 更新 `due_at` 和 `bucket_time`；
- 写入 `last_error_code`；
- 清除 Task 执行租约字段；
- 增加 `task_version`；
- 不增加业务 `attempt`；
- 按 Run 当前状态更新 `next_execute_at` 和等待状态；
- 旧 Pulsar 消息 ACK 后不能再覆盖新版本 Task。

容量延期不是 Capability Retry，不应进入最大 Task 执行尝试次数，也不应产生 Task DLQ。

### 9.3 直接创建 `dispatched` Task

当前以下路径可能直接创建 `dispatched` Task 并写 Outbox：

- Entry 创建初始 Task；
- 节点完成后创建下一 Task；
- 外部等待或推理完成后恢复 Task。

1.0 不要求先把这些路径统一改成 `pending`。这些 Task 仍可进入 Pulsar，Consumer 在真正 Claim 前执行统一容量准入，因此 仍受执行许可保护。

这也是 1.0 与严格 Scheduler 公平方案的明确差异：1.0 保护的是实际执行，不保证派发队列本身的租户公平。

## 10. 配置建议

以下是 1.0 的建议配置名和默认值；最终实现应按当前 Worker 配置解析规范落地：

| 配置 | 默认值 | 说明 |
|---|---:|---|
| `WORKFLOW_TASK_GLOBAL_CONCURRENCY` | 生产必填 | 全局逻辑 Task 执行容量 `N` |
| `WORKFLOW_TASK_TENANT_MAX_SHARE_PERCENT` | `90` | 单 UID 无竞争最大占比 |
| `WORKFLOW_TASK_CAPACITY_CONTROLLER_INTERVAL_MS` | `300000` | 控制周期，5 分钟 |
| `WORKFLOW_TASK_CAPACITY_DEMAND_WINDOW_MS` | `600000` | 竞争需求保留窗口，10 分钟 |
| `WORKFLOW_TASK_CAPACITY_STABLE_CYCLES` | `2` | 当前仍可见的单 UID 恢复借用额度需要的稳定周期数 |
| `WORKFLOW_TASK_CAPACITY_SCAN_LIMIT` | `500` | 单周期最多探测的活跃候选 UID 数 |
| `WORKFLOW_TASK_CAPACITY_DEFER_DELAY_MS` | `60000` | 容量不足的基础延期时间 |
| `WORKFLOW_TASK_CAPACITY_DEFER_JITTER_MS` | `30000` | 容量延期随机抖动上限 |
| `WORKFLOW_TASK_CAPACITY_QUOTA_TTL_MS` | `900000` | 动态配额记录 TTL，默认 15 分钟 |
| `WORKFLOW_TASK_CAPACITY_CONTROLLER_LOCK_TTL_MS` | `30000` | 控制器短锁 TTL |

约束：

- `N` 必须是正整数。
- `1 <= tenantMaxSharePercent <= 100`，默认不得超过 90，除非有明确的部署级授权。
- `scanLimit` 必须有上限，不能使用无界全表读取。
- `deferDelay` 不得低于 30 秒，避免容量不足形成高频唤醒循环。
- `quotaTtl` 不得短于 `demandWindow + controllerInterval`，避免一次正常控制周期间隔就丢失收紧配额。
- `controllerLockTtl` 必须覆盖单次扫描的最大执行时间并留有余量，释放锁时必须校验 owner token，不能删除其他实例新取得的锁。
- 生产 `N` 必须由部署配置明确给出，不能从单个 Worker 进程的 `WORKFLOW_TASK_CONCURRENCY` 自动推断。

## 11. 可观测性

### 11.1 Consumer 观测

Task 观测需要区分：

- `tenant_capacity_limited`：UID 配额或全局容量不足；
- `capacity_unavailable`：无法从 Redis 确认容量许可；
- `rate_limited`：消息发送节点坐席发送频控；
- `deferred`：其他持久化延期原因；

其中前两类都属于容量保护，但不能计入消息发送节点的 `rateLimited` 指标。

`createTaskObservation` 的分类规则应按原因码判断：只有
`WORKFLOW_MESSAGE_RATE_LIMITED` 进入 `rate_limited`；两个容量原因码分别进入
`tenant_capacity_limited` 和 `capacity_unavailable`，不能因为 `kind === "deferred"`
就统一记为消息频控。

`tenant_capacity_limited` 不计入消息发送 `rateLimited` 指标。

建议记录或汇总：

- UID、Run、Task、Task Version；
- 当前 UID 配额和拒绝原因；
- `retryAt`；
- 当前 Worker；
- 当前 Redis 配置版本。

单 Task 日志必须采样，不能在大量积压时为每次延期写完整 Warn 日志。

### 11.2 Controller 观测

每个控制周期输出一条 summary：

```text
workflow.task.capacity.controller.summary
```

至少包含：

- `globalCapacity`；
- `knownContenderCount`；
- `scannedUidCount`；
- `scanComplete`；
- `demandUidCount`，最多记录到 101，`101` 表示需求已超过精细管理阈值；
- `quotaChangedCount`；
- `controllerLockSkipped`；
- `durationMs`；
- `lastSuccessfulAt`。

需要告警：

- 连续控制周期扫描失败；
- Redis 许可申请失败率升高；
- 全局许可长期接近 `N`；
- 单 UID 延期次数持续增长；
- `scanComplete=false` 持续出现；
- 控制器连续超过一个需求窗口没有成功运行。

### 11.3 运维解释

用户侧不展示内部 Redis 配额、Lease 或控制周期。消息发送节点的既有文案只解释消息发送频率；Task 容量控制属于 Worker 运行保护，使用运维指标和内部日志解释。

## 12. 一致性、不变式与故障处理

### 12.1 必须保持的不变式

1. 没有有效 Redis 许可的 Task 不得进入节点执行。
2. 全局有效 Redis 许可数不得超过 `N`。
3. UID 有效 Redis 许可数不得超过当前 `Q(uid)`；配额下调不追收已有许可。
4. 容量拒绝不增加 Task `attempt`。
5. 容量延期必须更新 `task_version`，旧消息不能提交结果。
6. MySQL Task、Run、Outbox 状态更新仍通过现有事务和版本条件完成。
7. Redis lease 过期只能造成暂时容量释放，不能直接修改 Task 业务状态。
8. 控制器失败只能使配额暂时停留在旧值，不能导致 Task 被错误取消或完成。

### 12.2 Worker 崩溃

- Worker 在取得许可后崩溃，Redis lease 在 TTL 到期后释放。
- MySQL Task 的 `running` lease 由现有 Reconciler 恢复。
- 恢复后的 Task 以新 `task_version` 重新进入现有派发路径。
- Redis lease 和 MySQL Task lease 短时间不一致是允许的；不一致只能造成过度保守或短暂重复保护，不能允许同一 Task 绕过版本条件提交两次结果。

### 12.3 控制器延迟或停止

- 旧配额继续生效，直到 quota record 过期。
- 过期后的 UID 配额回退到 `H`，不回退到 `N`。
- 全局 `N` 仍由 Redis 原子许可保护。
- 控制器不负责释放执行许可；lease 的过期清理由申请、释放、续租脚本和后续控制周期完成。

### 12.4 多副本竞争

- 多个 Consumer 通过 Redis Lua 原子申请，不会重复发放同一全局槽位。
- 多个 Controller 通过短期锁减少重复计算；即使锁失效产生重复更新，也不会改变 Task 状态正确性。
- Scheduler 仍可多副本运行，继续使用现有 MySQL `FOR UPDATE` / `SKIP LOCKED` 语义。

## 13. 性能与容量边界

### 13.1 正常允许路径

每个 Task 的新增成本为：

```text
一次 Redis Lua acquire
一次现有 Task claim
一次外部节点执行
一次 Redis release
```

长任务按需要增加 Redis renew，但不新增 MySQL 表写入。

### 13.2 容量拒绝路径

每个被拒绝 Task 的新增成本为：

```text
一次 Redis acquire
一次需求信号更新
一次现有 deferTask 数据库事务
一次 Pulsar ACK
```

因此该方案不能在数十万 Task 每秒被重复拒绝的情况下无限扩展。1.0 需要通过 60 秒级延期、随机抖动、控制周期和批量扫描将拒绝频率保持在可接受范围。

### 13.3 何时需要升级

出现以下任一情况时，应重新评估严格 Scheduler 公平调度：

- 容量拒绝导致 MySQL `deferTask` 写入成为主要数据库负载；
- Pulsar 中大量消息只是被读取后立即延期，实际执行占比下降；
- 某 UID 在多个控制周期内持续占据运输层队头，其他 UID 明显饿死；
- 需要严格保证 `dispatched + running <= N`；
- 需要严格 Round Robin、租户优先级或 SLA；
- UID 数量和 Task 积压规模使周期性近似扫描无法在预算内完成。

升级方向是将容量控制前移到 Scheduler：按 UID 选择到期 Task、以 MySQL 状态作为占用权威、增加适配查询形状的索引，并定义多 Scheduler 的全局公平协调。该方向不属于本 1.0。

## 14. 发布与兼容性

### 14.1 数据兼容性

- 不新增数据库表和字段。
- 不改变现有 Task、Run、Outbox 状态枚举。
- 历史 Task 消息仍按原 `uid`、`taskId`、`taskVersion` 解析。
- 旧 Worker 不理解容量准入时会绕过该保护，因此严格容量保证必须在所有 Task Consumer 完成版本切换后才成立。

### 14.2 灰度顺序

1. 先部署观测模式的 Controller，只扫描并输出竞争统计，不改变 quota。
2. 验证 Redis key 前缀、Lua 脚本、全局 N 和部署实际 Consumer 容量一致。
3. 所有 Task Consumer 部署支持 Capacity Admission，但先将拒绝观测和配额写入打开、执行开关关闭。
4. 开启单个测试环境或小租户范围的执行准入。
5. 观察 Task 延期、Pulsar backlog、MySQL 写入、Redis latency 和外部动作吞吐。
6. 全量开启后保留旧 Task Version、Reconciler 和 Outbox 恢复路径。

滚动发布期间，新旧 Worker 并存可能暂时超过逻辑 `N`，这是容量保护的一致性窗口，不是数据破坏。若需要从第一秒起保证 `N`，必须先停止旧 Task Consumer 再切换。

## 15. 验收标准

### 15.1 功能验收

- 单 UID、无其他竞争时，实际有效许可不超过 `H = max(1, floor(N * 90%))`。
- 两个或以上 UID 被控制器识别为竞争者后，后续配额收敛到 `max(1, floor(N/C))`。
- `C > N` 时每 UID 配额仍为 1，不出现小数配额。
- 配额下调不抢占已经执行的 Task。
- 容量拒绝 Task 在延迟后可以重新派发和执行。
- 容量拒绝不增加 Task `attempt`。
- 同一 Task 的旧消息在延期后不能覆盖新 Task Version。
- Worker 崩溃后 lease 自动过期，容量可以重新使用。
- Redis 许可释放失败不会永久锁死 UID 或全局容量。
- 同一 Task 消息重复投递时，同一 `leaseId` 不会重复计数，且最终仍由 MySQL `task_version` / 状态条件阻止重复提交。

### 15.2 负载与故障验收

- 多 Worker 副本并发申请时，全局有效 lease 不超过 `N`。
- 1000 个 UID 竞争时，Redis demand 只按 UID 保存 member、不按 Task 展开，控制器每轮最多读取 101 个 demand UID，并使用一个全局饱和配额 Key，不逐 UID 写入 1000 份配额。
- 控制器扫描达到上限时不错误放大配额。
- 控制器数据库查询失败时保留旧配额并产生告警。
- Redis 暂时不可用时没有 Task 外部动作绕过准入。
- 容量拒绝不会造成 Pulsar 高频 NACK、Task attempt 快速耗尽或 Task DLQ 污染。
- 观测能区分租户容量延期、消息发送频控延期和其他延期。
- 控制器作为 `task-consumer` Worker 的后台循环运行，多副本下只有持锁实例扫描，不需要额外 Worker 部署。

### 15.3 停止条件

以下任一条件出现时停止全量开启，回退到观测模式：

- 出现超过 `N` 的实际并行外部 Task 执行；
- 出现容量拒绝后 Task attempt 增长；
- 出现旧 Task Version 覆盖新版本状态；
- Redis lease 泄漏导致容量持续下降且无法由 TTL 恢复；
- `deferTask` 写入成为明显数据库瓶颈；
- 其他租户在一个以上控制窗口内持续无法取得任何执行机会。

## 16. 后续版本候选

以下能力不纳入 1.0，但保留为明确升级方向：

- Scheduler 按 UID 轮转，只把获得容量的 Task 写入 Outbox。
- MySQL UID 级调度索引和批量候选 UID 查询。
- 基于数据库 Task 状态的严格 `dispatched + running <= N` 约束。
- Key_Shared Subscription 和 UID Message Key 的完整迁移。
- UID 优先级、SLA、加权公平和 Deficit Round Robin。
- Entry Consumer 的租户级持久化准入与延迟入口队列。
- 自动注册 Worker 容量并动态计算全局 `N`。
