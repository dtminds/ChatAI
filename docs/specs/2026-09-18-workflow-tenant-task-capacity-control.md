# Workflow 租户级 Task 弹性并发控制 1.0

- 日期：2026-09-19
- 版本：1.0
- 状态：Draft
- 适用范围：`apps/workflow-worker`、`packages/workflow-runtime` 的 Task 执行容量保护
- 相关设计：[营销 Workflow 1.0 执行引擎设计](./2026-07-10-marketing-workflow-execution-engine.md)
- 相关实现：[Workflow Message 坐席发送频控契约](./2026-08-16-workflow-message-send-contract.md)

本文记录租户级 Task 执行容量保护的 1.0 方案。它是现有 Workflow 执行引擎设计的补充，不改变 Run、Task、Outbox 的业务事实来源，也不把 Redis 变成长期任务调度数据库。

当前代码路径锚点：Scheduler 的 reservation 派发位于
`apps/workflow-worker/src/scheduler.ts` 与
`packages/workflow-runtime/src/mysql-repository.ts`，Task Consumer 位于
`apps/workflow-worker/src/task-consumer.ts`，Runtime 的 `executeTask` 位于
`packages/workflow-runtime/src/service.ts`。容量控制同时保护 Scheduler 派发口和 Consumer 执行口；MySQL 仍是 Task、Run、Outbox 的业务事实来源。

## 1. 决策摘要

1.0 采用“Scheduler reservation + Consumer 执行准入 + 周期性容量控制器”的弹性并发方案：

```text
Task 创建或节点推进 -> pending
        |
        v
Scheduler 读取 Redis 可用余量
        |
        +-- 无余量 / Redis 不可用：本轮不查询到期 Task
        |
        +-- 有余量：读取 pending 到期 Task -> Redis reservation
                                      |
                                      +-- 成功：pending -> dispatched + Outbox
                                      +-- 失败：Task 保持 pending
        |
        v
Pulsar / Task Consumer
        |
        +-- 已收到消息但容量不足：内存等待，不 ACK/NACK、不写 MySQL
        +-- 取得许可：claimTask -> 执行 -> 提交结果 -> 释放许可 -> ACK

容量控制器每 5 分钟扫描积压并更新 UID 动态配额
```

核心决策：

- 保护对象是同一 `uid` 的 Task **同时执行数**，不是消息发送速率，也不是租户活跃 Run 数。
- 全局逻辑容量为 `N`，由部署显式配置；所有 Task 执行必须先取得一个短期 Redis 执行许可。
- 单租户无竞争时最多使用 `H = max(1, floor(N * 90%))`，保留一部分容量给新租户或其他租户；当 `N` 很小时仍至少允许一个 Task。
- 检测到多个租户同时积压后，控制器按活跃竞争 UID 数量下调动态配额；最多精细管理 100 个竞争 UID，超过后统一进入饱和模式，配额按 `max(1, floor(N / 100))` 计算。
- 已经取得许可并开始执行的 Task 不抢占；配额下调只影响后续 Task。
- 控制器周期为 5 分钟，允许在一个控制周期内存在过度占用；本版本不承诺实时公平或严格 Round Robin。
- 保留现有全局 FIFO 候选顺序，只在派发前增加 Redis reservation；不新增 Task 调度索引，不引入 UID 级 Scheduler 轮转队列。
- 容量不足不是业务延期：不修改 `due_at`、`task_version` 或 `attempt`，不通过 `deferTask` 产生 MySQL 写放大。
- 不对 `Entry Consumer` 采用同一套延期逻辑。1.0 只保护 Task；Entry 的持久化延期和入口公平性另行设计。

这是一种 **best-effort 的 work-conserving bulkhead**，不是严格的公平调度器。它的验收目标是阻止单个租户长期占满实际执行容量，并在不超过约 5 分钟的控制窗口内收敛，而不是证明每个 UID 在每个瞬间都获得相同槽位。

## 2. 背景与当前问题

### 2.1 当前派发路径

Scheduler 仍按全局 Task 队列读取到期 `pending` 任务，主要排序字段为：

```text
status, bucket_time, due_at, id
```

它没有 UID 维度。单个租户存在大量同时到期 Task 时，一个批次可能全部来自同一 UID，然后进入 Outbox、Pulsar 和 Task Consumer。

当前 `WORKFLOW_TASK_CONCURRENCY` 只限制单个 Worker 进程的接收并发；`WORKFLOW_ACTIVE_RUN_LIMIT` 只限制租户活跃 Run 数。两者都不能限制一个 UID 同时占用多少 Task 执行槽。

### 2.2 1.0 有意保留的行为

1.0 不改造为“先选 UID、再按 UID 派发”的公平 Scheduler。因此以下现象仍可能存在：

- 热点 UID 的 Task 可能先进入 Pulsar。
- 热点 UID 可能占用部分 Pulsar Consumer 的等待槽位。
- reservation 与实际消费之间存在竞态，Consumer 仍可能收到暂时不能执行的消息并在内存中等待。
- Shared Subscription 不提供租户级顺序或严格轮转保证。

这些是 1.0 明确接受的代价。容量保护的硬要求是没有许可不得执行，容量等待不得改写 MySQL Task 状态。

### 2.3 1.0 要解决的问题

需要解决的是：

- 一个 UID 的 Task 外部执行长期占满全部 Worker 执行能力。
- 新租户开始有任务时，热点租户仍无限制地继续取得新执行槽。
- Worker 扩容后不同实例各自计数，导致租户和全局容量被重复放大。
- Worker 崩溃后并发计数永久泄漏。
- 通过容量等待保护容量时，Task attempt、Task Version 和 `due_at` 不被错误改写。

## 3. 目标与非目标

### 3.1 目标

- 以 UID 为隔离维度限制 Task 同时执行数。
- 在所有 Task Consumer 副本之间共享全局容量 `N`。
- 允许单一租户在系统空闲时借用大部分容量。
- 在其他租户积压出现后，动态降低热点租户后续准入额度。
- 控制器最长约 5 分钟完成一次竞争状态判断和配额调整。
- 容量不足时不产生 Task 持久化延期；消息在 Consumer 内存中等待，Redis 故障时 fail-closed。
- Worker 崩溃、网络断开或释放逻辑未执行时，许可可以自动过期回收。
- 不新增数据库表，不新增 Task 索引，不改变 Task、Run、Outbox 的业务状态模型。
- 保持 MySQL 为 Task、Run、Outbox 和最终业务状态的事实来源。

### 3.2 非目标

- 不保证严格的 UID Round Robin、Deficit Round Robin 或 max-min fairness。
- 不保证同一时刻每个活跃 UID 都有一个执行槽。
- 不抢占已经运行的 Task。
- 不改变 Scheduler 的全局 FIFO 派发排序。
- 不消除热点 Task 已经进入 Pulsar 后产生的全部运输层开销或等待槽位占用。
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

由于 reservation 会在 MySQL `pending -> dispatched` 之前短暂存在，且消息可能已经进入 Pulsar，`dispatched + running <= N` 不是 1.0 的不变式；真正受 `N` 约束的是有效 Redis lease。

## 5. 总体架构

### 5.1 模块职责

#### Task Consumer / Runtime

- Consumer 在收到消息前先检查 Redis 全局余量；已经收到的消息在取得 Redis 执行许可前留在内存中等待。
- 容量不足或 Redis 不可用时不调用 Runtime、不 ACK/NACK、不修改 MySQL Task。
- 许可成功后将 reservation 转为执行许可，再执行现有 `claimTask` 和节点推进路径。
- 在 Task 状态已经持久化后释放许可。
- 处理 Redis 许可过期、释放失败和旧 Task 消息等异常。

容量准入作为 Runtime 的一个可替换端口接入，不由 `task-consumer.ts` 自己复制 Task 查询或状态更新逻辑。容量原因码仍保留给 Runtime 直接调用和观测，但生产 Task Consumer 不把容量等待转换为持久化延期结果：

```ts
{
  kind: "deferred",
  reasonCode: "WORKFLOW_TASK_TENANT_CAPACITY_LIMITED"
    | "WORKFLOW_TASK_CAPACITY_UNAVAILABLE",
  retryAt: Date,
}
```

容量等待不能依赖 Pulsar NACK 重投。Task Consumer 的 Task subscription 必须关闭 ACK timeout；Worker 关闭时中止等待，让未 ACK 消息由 Broker 连接恢复机制重新投递。

#### Task Capacity Controller

- 作为带有 `task-consumer` 的 Worker 内后台循环运行；不新增独立部署单元，也不新增必须单独配置的 Worker Role。
- 每个控制周期只允许一个实例执行扫描和配额计算。
- 周期性读取到期 Task 积压和 Redis 需求信号。
- 计算竞争 UID 集合和动态配额，写入 Redis。
- 不修改 Task 状态，不创建 Outbox，不直接派发 Task。

#### Scheduler

- 先通过 Redis Lua 读取全局可用余量；Redis 不可用或余量为 0 时，本轮不查询到期 Task。
- 有余量时按现有全局 FIFO 读取有限的 `pending` 到期候选。
- 对候选逐个申请 Redis reservation；只有 reservation 成功的候选才允许写入 `dispatched` 和 Outbox。
- DB 状态冲突或事务失败时释放未使用 reservation；reservation 自身以 TTL 兜底。
- 不负责 UID 公平轮转，也不新增调度索引。

#### MySQL

- 继续保存 Task、Run、Outbox、`due_at`、`task_version`、业务 attempt 和执行结果。
- 延期、Claim、完成、失败和恢复仍通过现有事务与版本条件完成。

#### Redis

- 保存短期执行许可、动态配额、需求信号和控制器锁。
- Redis 数据全部可重建、可过期，不作为业务事实来源。
- 生产环境 Redis 不可用时，Task 不得绕过准入控制执行。

### 5.2 逻辑流程

```text
1. 新 Task 和节点推进 Task 先写入 pending，不直接写 Outbox
2. Scheduler 检查 Redis availability；无余量或 Redis 不可用时结束本轮到期派发
3. Scheduler 读取有限的 pending 到期候选，并为候选申请 Redis reservation
4. reservation 成功后，在 MySQL 事务内执行 pending -> dispatched 并写 Outbox
5. Outbox Publisher 发布 Task 消息
6. Consumer 收到消息后取得或复用同一 lease；容量不足时在内存等待
7. 取得 lease 后执行 claimTask -> 节点 -> 提交结果 -> 释放 lease -> ACK
8. Controller 每 5 分钟扫描积压并调整 Q(uid)
```

## 6. Task Consumer 准入

### 6.1 准入位置

容量准入必须覆盖两个位置：


```text
Scheduler:
    Redis availability
        -> 读取 pending 到期候选
        -> Redis reservation
        -> MySQL pending -> dispatched + Outbox

Task Consumer:
    收到消息
        -> Redis Capacity Admission
        -> claimTask
        -> 节点执行
```

不能在 `claimTask` 之后才申请。`claimTask` 会增加 Task `attempt` 并取得执行租约；容量不足不应消耗业务执行尝试。Consumer 在取得许可前也不应调用 `findTask`、`findRun` 或 Runtime，避免把等待消息变成 MySQL 读放大。

容量原因码仍使用：

```text
WORKFLOW_TASK_TENANT_CAPACITY_LIMITED
WORKFLOW_TASK_CAPACITY_UNAVAILABLE
```

前者表示全局许可或 UID 配额不足，后者表示无法确认许可状态。它们不能用于容量等待时的 `deferTask`。

### 6.2 申请成功

申请成功后：

1. 使用 `leaseId = uid + taskId + taskVersion` 标识许可。
2. 同一 `leaseId` 的重复申请必须复用同一许可和 Token，并增加短期引用计数，不得重复占用全局或 UID 许可；随后调用现有 `claimTask`，保持当前 `task_version + status` 条件更新。
   每个成功申请者释放一份引用，最后一份引用释放时才删除许可，避免重复投递在并发 Claim 竞态中提前释放仍在执行中的许可。
3. Claim 冲突、Task 过期或 Workflow 边界变化时立即释放许可。
4. Claim 成功后，许可覆盖从执行租约取得到最终 Task 状态提交的时间。
5. `executeTask` 返回后先确认数据库状态已提交，再释放许可。
6. 释放完成后 ACK 当前 Pulsar 消息；ACK 失败仍由现有重复消息和 Task Version 处理。

### 6.3 容量不足与 Redis 不可用

申请失败包括：

- 全局许可已满；
- 当前 UID 已达到动态配额；
- 当前 Redis 许可数据不可用。

Scheduler 发现全局余量为 0 或 Redis 不可用时：

1. 直接结束本轮到期派发，不查询 Task 表。
2. 已有 `pending` Task 保持原状态和 `due_at`。

已经进入 Pulsar 的消息在 Consumer 内部等待：

1. 全局或 UID 容量不足时继续以短间隔检查容量。
2. Redis 不可用时至少 30 秒后再重试，避免 Redis 故障期间形成高频轮询。
3. 等待期间不调用 Runtime，不修改 `due_at`、`task_version` 或 `attempt`，不 ACK/NACK。
4. Worker 关闭时中止等待；消息保持未 ACK，交由 Broker 在连接恢复后重新投递。
5. Scheduler 与 Consumer 的 reservation 竞态由 Redis Lua 和 MySQL Task Version 处理，不通过写回 Task 状态解决。

推荐初始值：

```text
capacityRetryDelay = 60 seconds
jitter = 0..30 seconds
```

抖动只用于分散重复容量检查，不承担公平排序职责；它不写入 Task 的 `due_at`。

### 6.4 许可释放保证

Runtime 必须使用 `try/finally` 覆盖以下所有路径：

- Claim 冲突；
- 节点成功完成；
- 业务可重试失败；
- 业务终态失败；
- Message rate limit 延期；
- Workflow 暂停、停止或权益失效；
- Abort、超时和未知异常。

Scheduler reservation 还必须覆盖：

- reservation 成功但 Task 状态已被其他 Scheduler 改变；
- `pending -> dispatched` 事务失败；
- Workflow 边界判断将候选转为 `suspended` 或 `cancelled`；
- Outbox 写入失败。

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

Scheduler reservation 和 Consumer 执行许可必须由 Redis Lua 脚本原子完成。Lease 记录包含 `reserved` 和 `active` 两个阶段：

1. 清理全局和当前 UID 已过期的 lease member。
2. 读取当前 UID `Q(uid)`；没有有效配额时使用 `H`。如果全局饱和配额存在，则使用二者中的较小值。
3. 检查全局有效 lease 数是否小于 `N`。
4. 检查当前 UID 有效 lease 数是否小于 `Q(uid)`。
5. 两项都满足时写入 `reserved` lease，同时写入全局 ZSET 和 UID ZSET。
6. Scheduler 完成 DB 派发后，Consumer 对同一 `leaseId` 的第一次 `acquire` 将 reservation 转为 `active`。
7. 任一条件不满足时不写入 lease，并返回拒绝原因和建议重试时间。

`ZSET` 没有 per-member TTL。每次申请、释放、续租和控制器扫描都必须显式清理过期 member；UID ZSET 在没有新 lease 时可以设置一个保守的 key TTL，但 TTL 不能替代 score 清理。

### 8.2 释放与续租

- 释放脚本必须同时删除全局和 UID ZSET 中的 `leaseId`，并验证 lease 所属 UID。
- 续租脚本只允许原 `leaseId` 延长 score，不允许凭 UID 扩大或替换其他 Task 的许可。
- reservation TTL 至少覆盖 Scheduler 派发和 Outbox 投递的正常窗口；active lease TTL 至少覆盖当前 Task 的 `lease_expires_at`，并在长于 TTL 一半的执行中续租。
- Worker 崩溃后不依赖 `finally`，过期 lease 由下一次 Lua 操作或控制器清理。
- 许可清理只影响吞吐容量，不修改 MySQL Task 状态；Task 状态仍由现有 Reconciler 和版本条件恢复。

### 8.3 Redis 失败

Redis availability、reservation 或 active lease 申请失败时不得直接执行 Task。生产环境 Task Consumer 必须保持 Redis 必需配置，运行期 Redis 不可用时采用 fail-closed：

- 不消耗 Task `attempt`；
- 不执行外部节点动作；
- Scheduler 不再读取新的到期 Task；
- 已收到的消息按 30 秒级退避等待，并记录 Worker 健康告警；
- 不 ACK/NACK，不写入 MySQL Task 延期；
- Redis 恢复后重新取得许可。

实现时必须避免 Redis 故障导致每条 Task 都以几秒频率访问 Redis 或写回 MySQL。Task subscription 的 ACK timeout 必须关闭；容量等待是 Consumer 的反压，不是 NACK 重投。

## 9. 数据库与状态机边界

### 9.1 不新增表和索引

1.0 不新增以下数据库对象：

- UID 调度队列表；
- Task 公平轮转 cursor；
- Task Capacity lease 表；
- `(status, uid, due_at)` 新索引。

控制器复用现有 Task、Outbox 和 Task Schedule 查询；容量许可只保存在 Redis 短期数据中。

### 9.2 Task 创建与派发状态

所有会产生可执行 Task 的新写路径统一写入 `pending`，不直接写 `dispatched`，也不直接写 Task Outbox：

- Entry 创建初始 Task；
- 节点完成后创建下一 Task；
- 外部等待或推理完成后恢复 Task。

Scheduler 只从 `pending` 到期队列读取候选。reservation 成功后，`dispatchReservedTasks` 在短事务内：

1. 将候选校验为当前 `task_version` 且仍为 `pending`；
2. 按 Workflow 当前边界将任务转为 `suspended`、`cancelled` 或 `dispatched`；
3. 仅为转为 `dispatched` 的任务递增 `task_version` 并写入 Outbox。

Scheduler reservation 使用派发后的 `task_version` 生成 `leaseId`，因此 Outbox 消息和 Consumer 的 active lease 使用同一个任务版本。

已经 `dispatched` 的任务只由 Outbox Publisher 发布；发布超时的 Reconciler 必须先为当前任务版本申请 reservation，再创建同版本的新 Outbox。该路径不把容量等待写回 `pending`。

本版本上线前确认生产环境没有需要迁移的遗留 `pending` Task；不提供旧状态回填或兼容迁移逻辑。旧 Worker 不得与启用该契约的 Task Consumer 并行执行同一 Task Topic。

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
| `WORKFLOW_TASK_CAPACITY_DEFER_DELAY_MS` | `60000` | Redis 容量等待的基础重试退避 |
| `WORKFLOW_TASK_CAPACITY_DEFER_JITTER_MS` | `30000` | 容量等待重试的抖动上限，不写入 Task `due_at` |
| `WORKFLOW_TASK_CAPACITY_QUOTA_TTL_MS` | `900000` | 动态配额记录 TTL，默认 15 分钟 |
| `WORKFLOW_TASK_CAPACITY_CONTROLLER_LOCK_TTL_MS` | `30000` | 控制器短锁 TTL |

约束：

- `N` 必须是正整数。
- `1 <= tenantMaxSharePercent <= 100`，默认不得超过 90，除非有明确的部署级授权。
- `scanLimit` 必须有上限，不能使用无界全表读取。
- `deferDelay` 不得低于 30 秒，避免 Redis 不可用时形成高频容量检查循环。
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

其中前两类都属于容量保护，但不能计入消息发送节点的 `rateLimited` 指标。生产 Consumer 在容量等待期间不产生 ACK 观测；这两个分类保留给 Runtime 直接调用或其他需要记录容量结果的边界路径。

`createTaskObservation` 的分类规则应按原因码判断：只有
`WORKFLOW_MESSAGE_RATE_LIMITED` 进入 `rate_limited`；两个容量原因码分别进入
`tenant_capacity_limited` 和 `capacity_unavailable`，不能因为 `kind === "deferred"`
就统一记为消息频控。

`tenant_capacity_limited` 不计入消息发送 `rateLimited` 指标。

建议记录或汇总：

- UID、Run、Task、Task Version；
- 当前 UID 配额和 reservation 失败原因；
- 容量重试时间；
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
4. 容量等待不修改 Task `attempt`、`task_version`、`due_at` 或状态。
5. 只有 reservation 成功且 DB CAS 成功的 Task 才能进入 `dispatched` 并写入 Outbox。
6. MySQL Task、Run、Outbox 状态更新仍通过现有事务和版本条件完成。
7. Redis lease 过期只能造成暂时容量释放，不能直接修改 Task 业务状态。
8. 控制器失败只能使配额暂时停留在旧值，不能导致 Task 被错误取消或完成。

### 12.2 Worker 崩溃

- Worker 在取得许可后崩溃，Redis lease 在 TTL 到期后释放。
- MySQL Task 的 `running` lease 由现有 Reconciler 恢复。
- 恢复后的 Task 以新 `task_version` 重新进入现有派发路径。
- Scheduler reservation 在 DB 提交前失联时由 TTL 回收；DB 事务失败时由 Scheduler 主动释放。
- Consumer 关闭时不 ACK 等待中的消息，消息由 Broker 连接恢复机制重新投递。
- Redis lease 和 MySQL Task lease 短时间不一致是允许的；不一致只能造成过度保守或短暂重复保护，不能允许同一 Task 绕过版本条件提交两次结果。

### 12.3 控制器延迟或停止

- 旧配额继续生效，直到 quota record 过期。
- 过期后的 UID 配额回退到 `H`，不回退到 `N`。
- 全局 `N` 仍由 Redis 原子许可保护。
- 控制器不负责释放执行许可；lease 的过期清理由申请、释放、续租脚本和后续控制周期完成。

### 12.4 多副本竞争

- 多个 Consumer 通过 Redis Lua 原子申请，不会重复发放同一全局槽位。
- 多个 Controller 通过短期锁减少重复计算；即使锁失效产生重复更新，也不会改变 Task 状态正确性。
- 多个 Scheduler 通过 Redis reservation 和 MySQL Task Version/CAS 协作；不会因候选重复读取而重复写入有效 Outbox。

## 13. 性能与容量边界

### 13.1 正常允许路径

每个 Task 的新增成本为：

```text
一次 Redis availability
一次 Redis Lua reservation
一次现有 Task dispatch transaction
一次 Redis Lua acquire/activate
一次现有 Task claim
一次外部节点执行
一次 Redis release
```

长任务按需要增加 Redis renew，但不新增 MySQL 表写入。

### 13.2 容量等待路径

容量不足时不写 MySQL Task。Scheduler 只在 availability 大于 0 时读取有限候选；候选 reservation 失败时继续尝试本批其他候选，剩余任务保持 `pending`。已经进入 Pulsar 的消息在 Consumer 内存中等待：

```text
Redis acquire / retry
不 ACK/NACK
不修改 Task due_at、task_version 或 attempt
```

Redis 不可用时使用 30 秒级退避；Pulsar Task subscription 关闭 ACK timeout，等待中的消息形成受控反压，不通过 NACK 形成重投风暴。

### 13.3 何时需要升级

出现以下任一情况时，应重新评估后续调度方案：

- Pulsar 中大量消息长期处于未 ACK 的容量等待，实际执行占比下降；
- 热点 UID 长期占据 Consumer 等待槽位并造成可观测的业务延迟；
- 需要严格保证 `dispatched + running <= N`；
- 需要 Broker 层 UID 公平、租户优先级或 SLA；
- UID 数量和 Task 积压规模使周期性近似扫描无法在预算内完成。

升级方向可以是 Ready 队列、UID 级索引或更严格的 Scheduler 协调；这些都不属于本 1.0。

## 14. 发布与兼容性

### 14.1 数据兼容性

- 不新增数据库表和字段。
- 不改变现有 Task、Run、Outbox 状态枚举。
- 所有新 Task 创建和节点推进路径从发布起写入 `pending`，不需要历史 `pending` 回填或状态迁移。
- 发布前确认线上没有需要兼容的遗留 `pending` Task；本版本不提供旧 `pending` 的迁移分支。
- 启用容量契约前必须停止旧 Task Consumer，避免旧 Worker 绕过 Redis reservation 和 active lease。

### 14.2 灰度顺序

1. 验证 Redis key 前缀、Lua 脚本、全局 N 和部署实际 Consumer 容量一致。
2. 先停止旧 Task Consumer，再部署包含 Scheduler reservation、Consumer 等待和 Reconciler reservation 的版本。
3. 确认新建 Task 为 `pending`，Scheduler 只在 reservation 成功后写 `dispatched` 和 Outbox。
4. 观察 Pulsar 未 ACK backlog、MySQL Task 状态写入、Redis latency、reservation 释放和外部动作吞吐。
5. 验证 Redis 故障期间 Scheduler 不读取新到期 Task，Consumer 不 ACK/NACK、不写 Task 延期。

不支持新旧 Task Consumer 并行运行；若需要从第一秒起保证 `N`，必须先停止旧 Task Consumer 再切换。

## 15. 验收标准

### 15.1 功能验收

- 单 UID、无其他竞争时，实际有效许可不超过 `H = max(1, floor(N * 90%))`。
- 两个或以上 UID 被控制器识别为竞争者后，后续配额收敛到 `max(1, floor(N/C))`。
- `C > N` 时每 UID 配额仍为 1，不出现小数配额。
- 配额下调不抢占已经执行的 Task。
- reservation 成功后才会产生 `dispatched` Task 和 Outbox。
- reservation 失败的候选保持 `pending`，不改变 `due_at`、`task_version` 或 `attempt`。
- Consumer 容量等待期间不调用 Runtime、不 ACK/NACK、不写 MySQL。
- 同一 Task 的重复消息仍由同一 `leaseId` 和 MySQL `task_version` / 状态条件阻止重复提交。
- Worker 崩溃后 lease 自动过期，容量可以重新使用。
- Redis 许可释放失败不会永久锁死 UID 或全局容量。

### 15.2 负载与故障验收

- 多 Worker 副本并发申请时，全局有效 lease 不超过 `N`。
- 1000 个 UID 竞争时，Redis demand 只按 UID 保存 member、不按 Task 展开，控制器每轮最多读取 101 个 demand UID，并使用一个全局饱和配额 Key，不逐 UID 写入 1000 份配额。
- 控制器扫描达到上限时不错误放大配额。
- 控制器数据库查询失败时保留旧配额并产生告警。
- Redis 不可用或全局余量为 0 时 Scheduler 不查询到期 Task。
- DB 派发事务失败时所有未使用 reservation 都被释放或最终由 TTL 回收。
- Redis 暂时不可用时没有 Task 外部动作绕过准入。
- 容量等待不会造成 Pulsar 高频 NACK、Task attempt 快速耗尽、Task dueAt 改写或 Task DLQ 污染。
- 观测能区分租户容量等待、消息发送频控延期和其他延期。
- 控制器作为 `task-consumer` Worker 的后台循环运行，多副本下只有持锁实例扫描，不需要额外 Worker 部署。

### 15.3 停止条件

以下任一条件出现时停止全量开启，回退到观测模式：

- 出现超过 `N` 的实际并行外部 Task 执行；
- 出现容量等待后 Task attempt、Task Version 或 `due_at` 增长；
- 出现旧 Task Version 覆盖新版本状态；
- Redis lease 泄漏导致容量持续下降且无法由 TTL 恢复；
- 容量等待导致 Pulsar 未 ACK backlog 成为明显瓶颈；
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
