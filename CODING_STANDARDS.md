# Coding Standards

本文件是编码加检约定。编写或审查涉及列表、接口、数据库、分页、Worker 或跨层契约的代码时读取。

Extra Checks 在编码和审查时同样适用，按变更路径执行，未触及的模块跳过。正常路径测试通过不能替代规模边界。跨层改动同时核对该契约的 Contract、Backend、Web 或 Worker 消费方。

Review 章节仅审查时使用。通用审查流程、Finding 门槛、严重级别和输出格式沿用 Review Skill。同时应用根目录 `AGENTS.md` 中适用于变更路径的约定。与本文件冲突时，以本文件的 Extra Checks 和 Finding 边界为准。

## Extra Checks

### Web

- 一次页面加载或一次用户操作的请求数不随列表项、字段或分页 `N` 线性增长。逐项请求改为批量接口或受控并发。`Promise.all` 只改变并发，不会消除 `N` 次调用。
- 不要在 `for`、`map` 或逐项 hydration 里发 HTTP。Effect 可以做稳定依赖下的单次加载；禁止依赖抖动或重复触发造成的请求放大。相同资源按稳定 Key 去重。
- 轮询和失败重试必须有启动条件、间隔、超时、退避、终止状态，以及页面隐藏或切换后的停止行为。

### Backend / Worker

- 不要在逐项循环里查 SQL。`N` 条主记录的 SQL 数量不能是 `1 + N`、`1 + 2N` 或嵌套增长。`Promise.all` 不会消除 N+1，只会把延迟变成数据库并发压力。
- 列表的关联资料、计数、权限范围和状态按当前页 ID 集合批量查询、聚合或 JOIN。
- 新增索引必须对应实际查询形状和现有索引，不要只因表大就加索引。
- JOIN 导致主记录重复、COUNT 失真、分页截断或结果集膨胀时，使用去重、预聚合、`EXISTS` 或分阶段批量查询。批量 `IN` 必须有明确上限。
- 不要先从 MySQL 或上游 API 读取全量再在 Node 里筛选、排序或 `slice` 分页。分页、筛选、权限和稳定排序在数据源完成，只对当前页 hydration。先分页再做会改变结果集的筛选或排序，会让 `items`、`total` 和翻页失真。
- 声明的 `pageSize` 与实际上限必须一致，调用方处理 `hasNext`、`total` 或 cursor。自动翻页必须有最大页数、最大记录数、超时和取消；无界拉全部分页等于内存全量加载。
- 应用层分页只在源数据有文档化的稳定小上限、内存成本可计算、筛选排序语义仍正确时才可接受，实现时写明该上限。导出、迁移或离线任务用流式读取、cursor、分块或持久化批次。
- Worker 对每个独立任务调用一次上游可以。禁止单任务内的重复放大，以及无批次上限或无受控并发的全量并发。

### Scale Evidence

- 列表、批量或分页的测试覆盖会改变当前契约行为的适用边界。接口没有 `hasNext`、重复资源或并发语义时，不要为这些场景补凑数测试，也不要把不适用的测试空白当成 Finding。只覆盖单条、第一页或唯一资源只能证明正常路径。
- 实现时能说明主要路径在 `N = 1` 和现实最大 `N` 下的请求数或 SQL 数、是否存在全量加载，以及单实例并发下的主要内存增长项。

## Review

通用审查流程沿用 Review Skill。下列条目是本仓库相对 Skill 的审查差。

### Scope

- 用户指定 Base、Commit 或比较范围时使用该范围，不要自行替换。
- 未提交改动覆盖 Staged、Unstaged 和 Untracked。
- 复审必须重读当前 Diff 和相关调用路径，不要沿用上次结论。
- 用户限制了审查范围时，范围外问题不列为本次 Finding。
- 只报告本次变更引入、暴露或显著扩大的问题。

### Finding Boundaries

#### 状态一致性与竞态

- 评估用户可感知影响、触发概率、异常持续时间、最终恢复机制和修复复杂度。
- 低概率、短暂且能由权威数据自动恢复的问题不默认定 `P2`，也不仅为理论完备性要求增加状态机、缓存层或跨路径同步。
- 存在明确用户损失、状态长期错误、无法自动恢复或已有实际故障证据时，才建议复杂修复。

#### MySQL ID

- 业务 ID 按约定不会触及 `Number.MAX_SAFE_INTEGER`。不要仅因使用 `BIGINT`、移除字符串转换或统一为 `number` 报告精度、溢出或安全整数越界。

#### 无障碍与文案语言

- “未完整支持无障碍或 WCAG”本身不是 Finding；同时造成真实交互、语义、测试或组件行为缺陷时才报。
- 当前项目不考虑国际化，硬编码中文提示本身不是 Finding。
- 未要求的视觉偏好、非契约性文案和纯风格差异不是 Finding。

#### 数据库时区

- UTC+8 部署契约、mysql2 `timezone: "+08:00"` 和运行时偏移校验完整时，使用 `CURRENT_TIMESTAMP`、读取 `DATETIME` 或接收 mysql2 返回的 `Date` 不是时区 Finding。
- 只有变更破坏该契约时才报，例如移除连接时区、绕过偏移校验、混用 UTC 与 UTC+8 `DATETIME`、重复手工转换，或引入未声明时区语义的外部时间字符串。

#### Java internal API 返回协议

- 审查新增或修改的 `/third-internal/*` JSON 调用时，逐个确认其通过 `@chatai/contracts` 的 `decodeJavaInternalApiEnvelope` 解码。`success: true` 和 `success: false` 是唯一、同等权威的成败信号；成功时不读取或校验 `error` / `errorMsg`，失败时将二者仅作为可选诊断，缺失或类型异常使用共享 decoder 的归一化值。缺失或非 boolean `success` 才是非法信封。把 `error === 0`、`code === 0`、诊断字段合法性或缺失字段默认成功作为成败条件，以及复制本地 decoder，均应报告为 Finding。
- 标准信封只统一 `success`、`error`、`errorMsg`，不规定业务字段位置。审查者必须根据该 endpoint 已确认的固定 schema 核对业务字段是 `data`、顶层 `list` / 分页字段还是其它固定结构；禁止用 `payload.list ?? payload.data?.list` 等多位置 fallback 猜测协议。非 JSON 的流式或文件响应不适用本条，但必须由 endpoint 的实际响应协议证明。
- 协议收口不得顺带改写调用方语义。逐个对照变更前后的业务结果、HTTP 状态、Workflow 路由以及 retry / terminal 行为；例如某节点原本将 Java 业务失败映射为 `result: false` 并继续时，改用共享 decoder 后仍须保持。`rejected` 路径应把归一化后的 `error` / `errorMsg` 写入既有内部日志或错误 details，不能只记录是否存在错误消息。

### Scale Findings

- 写明放大发生在哪一层，不要把前端逐项调用误报为后端轮询。
- 性能 Finding 写出增长关系或边界，例如每行一次 SQL、每资源一次请求、最多加载多少页；不要只写“可能性能不好”。
- 用户要求广泛性能审查时，区分已确认的调用放大、N+1、轮询、分页或索引问题，与经代码路径检查后不存在的风险类别，不要互相替换概念。

### Validation

- 构建和测试命令遵循 `AGENTS.md` 的 Pre-PR Verification；涉及列表、批量或分页时，额外覆盖当前契约下适用的规模边界。
- 提交前执行 `git diff --check`。
- 只有取得完整结束状态的命令才能声明通过；无法运行时写明未执行的命令、原因和剩余风险。

### Tautological tests considered harmful.
