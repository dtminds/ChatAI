# Agent 用户记忆需求与技术设计

- 日期：2026-07-24
- 状态：修订草案
- 产品归属：Agent
- 页面入口：`/chat/ai-hosting/user-memory`
- 核心方案：MySQL 单行 JSON 保存客户当前记忆；每日从前一完整自然日抽样逻辑会话；AI 提出增量，固定规则负责合并

## 1. 方案结论

本期采用以下方案：

1. 用户记忆属于 Agent 模块，不属于 Insights。
2. Agent 导航新增“用户记忆”，用于功能启停、每日运行观测和人工维护。
3. Node 只负责维护 MySQL 数据；Java Agent 运行时直接读配置表和客户记忆表并自行拼接 Prompt。
4. 每个客户由 `uid + platform + third_external_userid` 唯一标识，在 MySQL 中保存一行 JSON，最多 20 条有效记忆。
5. 不使用向量数据库、文件存储、知识图谱或跨平台自然人合并。
6. 逻辑会话只是每日抽样来源；逻辑会话关闭事务不创建用户记忆任务，逻辑会话 `status` 不参与资格判断。
7. 每日 `02:00` 按 `Asia/Shanghai` 处理前一完整自然日。
8. 每个租户先从目标自然日选择消息数最多的有界候选单聊逻辑会话，候选会话上限为 `max(200, customer_limit * 2)`，排序固定为 `message_count DESC, ended_at DESC, id DESC`；本期默认额度 100，因此本期仍是 Top 200。
9. `message_count < 5` 的逻辑会话不参与候选。
10. 按候选排名首次出现顺序对客户键去重，最多选择当日套餐额度允许的客户；本期默认 100，去重后不足额度就按实际数量执行，不继续扩大本次候选会话范围。
11. 同一入选客户在候选池中出现的全部会话合并为一个维护项、一次模型请求；每个逻辑会话最多读取最后 50 条可供 AI 使用的对话消息。
12. 每个租户、每个目标自然日只有一条运行，定时执行和该运行的失败项重试共享同一组选中客户，不重新占用额度。
13. 本期没有“立即维护”入口和手工创建新运行 API；开启后等待下一次每日调度。
14. 不建设客户 pending 队列、全局发现游标、公平轮转、跨日连续消费窗口或“最终消费全部会话”的状态机。
15. 当日未进入有界候选池、去重后未入选、迟到写入已完成自然日的会话都不结转；这是成本受控抽样的明确取舍。
16. AI 只返回 `add`、`confirm`、`update`、`remove` 增量操作；服务端执行确定性校验和合并，不建设通用规则引擎。
17. 人工记忆优先。AI 不能修改或删除人工记忆，人工修改发生后，旧模型结果不得覆盖或重新提炼人工时间屏障之前的会话。
18. 同步推理是首期必须完成的执行模式；火山批量推理在官方 Batch 契约确认后接入，但不得改变抽样、额度和合并语义。

## 2. 产品目标与非目标

### 2.1 产品目标

1. 为 Agent 提供少量、稳定、可人工校正的客户长期背景。
2. 自动维护与消息同步、会话切片、洞察分析和在线回复完全解耦。
3. 用每日有界会话候选数和客户额度控制数据库扫描与模型成本。
4. 人工可以查看、新增、编辑和删除记忆，并拥有最终控制权。
5. AI 记忆可以追溯到来源逻辑会话和客户证据消息。
6. Worker 停机、失租或提供商暂时失败后，可以根据 MySQL 运行和运行项状态继续。
7. 重复、迟到或乱序结果不得覆盖人工修改，也不得用较早自然日覆盖较新的自动维护结果。
8. 用户可以看到每日运行、入选客户数、会话数、消息数、成功和失败情况。

### 2.2 非目标

本期不包含：

- 会话关闭后的实时或分钟级记忆提炼。
- “立即维护”或任意时间范围的人工运行。
- 在逻辑会话关闭事务中创建用户记忆任务。
- 复用洞察开关、洞察 Job、洞察快照或洞察结果。
- 保证所有逻辑会话最终都被消费。
- 客户 pending 队列、发现游标、公平轮转或跨日积压追赶。
- 向量检索、Embedding、文件记忆或对象存储。
- 群聊、群成员或群级记忆。
- 按 Agent 保存同一客户的不同记忆。
- 跨平台、跨租户或按姓名、手机号推断自然人合并。
- 完整会话摘要、客户时间线、行动项和实时业务状态镜像。
- AI 建议审批队列、完整版本历史或撤销。
- 开启功能时回刷开启前的历史会话。
- Node 提供 Agent 运行时 context API，或修改 Java Prompt/推理协议。

## 3. Agent 产品入口

### 3.1 导航与页面

在现有 Agent 导航中新增：

```text
Agent 管理
知识库
用户记忆
托管设置
订阅
```

路由：

```text
/chat/ai-hosting/user-memory
```

页面复用 `AiHostingLayout`，包含两个页签：

1. **运行概览**：功能开关、调度时间、套餐额度、当前/最近运行和失败项。
2. **记忆管理**：客户搜索、记忆查看、人工新增、编辑、删除和 AI 证据查看。

### 3.2 运行概览

至少展示：

- 当前是否启用。
- 固定调度时间、时区和下一次计划运行时间。
- 当前执行模式。
- 当前自然日客户额度和运行额度快照。
- 目标自然日、运行状态、阶段、开始时间和持续时间。
- 候选会话数、去重候选客户数、选中客户数和实际消息数。
- 成功、失败、跳过和取消的客户数。
- 模型请求数、输入/输出 Token 和稳定错误码。

页面操作只有：

- owner/admin 开启或关闭用户记忆。
- owner/admin 对终态运行执行“重试失败项”。
- 查看运行和客户级运行项详情。

页面不得提供“立即维护”按钮。后端也不得保留通用 `POST /runs` 创建接口。

“重试失败项”只重置来源运行中仍可重试的失败项：

- 不重新扫描目标自然日。
- 不新增客户或会话。
- 不改变来源运行的 `quota_date`、额度快照和选中客户集合。
- 已被更晚自然日成功维护的客户标记为 `skipped/superseded`，不得用旧会话覆盖新状态。

### 3.3 记忆管理

- 复用现有客户访问范围和 cursor 搜索能力。
- 先分页客户，再批量读取当前页客户记忆，禁止逐客户 N+1 查询。
- 展示当前有效记忆数量，例如 `6 / 20`。
- 区分“人工”和“AI 提炼”。
- 支持人工新增、编辑和删除。
- 人工编辑 AI 记忆后，该条转为人工记忆。
- AI 记忆可以查看来源会话和 1 至 3 条证据消息。
- 无来源会话权限时不返回来源标识。

功能关闭时仍允许查看和人工维护已有记忆；只停止自动调度和失败项重试。

## 4. 客户身份与输入边界

### 4.1 客户稳定键

唯一键固定为：

```text
uid + platform + third_external_userid
```

不得使用 `agent_id`、客户名称、逻辑会话 ID、`conversation_id` 或客服账号 `third_userid` 作为记忆唯一键。

同一租户、同一平台、同一外部联系人通过多个客服账号产生的会话，共享同一份记忆。

### 4.2 自然日和时钟域

- 调度时区默认且首期固定为 `Asia/Shanghai`。
- 每日 `02:00` 的计划运行处理前一完整自然日 `[00:00:00.000, 次日 00:00:00.000)`。
- `quota_date` 是该目标自然日，不是运行实际开始日期。
- 目标区间在 Node 中换算为 Unix epoch 毫秒后，与 `logical_session.ended_at` 比较。
- `ended_at`、`enabled_at`、`manual_updated_at`、`last_auto_updated_at` 使用 Unix epoch 毫秒和 `BIGINT UNSIGNED`。
- 调度、租约和审计时间使用 `DATETIME(3)`；API 返回时统一映射为 epoch 毫秒。
- 不得混用 Unix 秒、毫秒和无时区 `DATETIME`。

仓库 Schema 已将 `logical_session.ended_at` 定义为 `BIGINT UNSIGNED`。上线前仍需核实现网字段类型；如果不一致，必须先迁移，禁止在热查询中对 `ended_at` 做 `CAST` 或 `UNIX_TIMESTAMP`。

### 4.3 合格逻辑会话

候选会话必须同时满足：

```text
session.uid = :uid
AND session.ended_at >= :dayStartMs
AND session.ended_at < :dayEndMs
AND session.ended_at > config.enabled_at
AND session.ended_at IS NOT NULL
AND session.message_count >= 5
AND session.third_external_userid <> ''
AND conversation.id = session.conversation_id
AND conversation.uid = session.uid
AND conversation.chat_type = 1
AND conversation.platform > 0
AND conversation.third_external_userid = session.third_external_userid
```

不得增加以下条件：

- `logical_session.status`。
- `insight_enabled`。
- `current_snapshot_id IS NOT NULL`。
- Final 洞察成功。
- 会话摘要、意图、标签或质检结果存在。

`open`、`canceled`、`closed_pending_analysis`、`analyzed` 等状态都不影响资格；只要 `ended_at` 合法就按相同规则参与当日候选。

### 4.4 有界候选会话和客户去重

运行创建时根据套餐客户额度计算并快照候选会话上限：

```text
candidateSessionLimit = max(200, customerLimit * 2)
```

本期 `customer_limit = 100`，因此候选会话上限仍为 200。未来 resolver 返回 200 或 500 时，对应上限为 400 或 1000。套餐额度表示“最多维护的去重客户数”，不是保证数量；如果候选池内唯一客户不足，仍按实际数量运行，不继续补扫。

发现 SQL 的业务顺序固定为：

```sql
SELECT
  session.id,
  session.ended_at,
  session.message_count,
  conversation.platform,
  session.third_external_userid
FROM xy_wap_embed_logical_session AS session
JOIN xy_wap_embed_conversation AS conversation
  ON conversation.id = session.conversation_id
 AND conversation.uid = session.uid
WHERE session.uid = :uid
  AND session.ended_at >= :dayStartMs
  AND session.ended_at < :dayEndMs
  AND session.ended_at > :enabledAtMs
  AND session.message_count >= 5
  AND session.third_external_userid <> ''
  AND conversation.chat_type = 1
  AND conversation.platform > 0
  AND conversation.third_external_userid = session.third_external_userid
ORDER BY
  session.message_count DESC,
  session.ended_at DESC,
  session.id DESC
LIMIT :candidateSessionLimit;
```

随后在内存中：

```text
rankedSessions = queryTopSessions(run.candidateSessionLimit)
groups = group by (platform, thirdExternalUserId)
customerRank = each group's first session position
selectedCustomers = groups ordered by customerRank
                    take run.customerLimit
```

约束：

1. 必须先取有界候选会话，再对客户去重，不能先按客户聚合后排序。
2. 去重后不足额度时按实际数量运行，不扩大到本次候选上限之后的会话。
3. 同一客户在候选池中的全部会话都进入该客户运行项，不只保留排名第一的会话。
4. 一个客户在一条运行中最多一个运行项和一次模型请求。
5. `candidate_session_count <= candidate_session_limit`，`selected_customer_count <= customer_limit`。
6. 本期默认 `customer_limit = 100`，通过套餐额度 resolver 获取并快照；未来可返回 200、500 等受支持的有界值。
7. 当天只有一条运行，因此额度天然按 `uid + quota_date` 共享。失败项重试不增加去重客户数。
8. 候选查询为空时，不创建运行项；run 直接以 `succeeded`、全零计数进入终态，并在同一围栏事务中清除 `active_run_id`。

### 4.5 每会话最后 50 条消息

对入选客户的每个候选会话：

1. 只读取 `xy_wap_embed_logical_session_message.included_for_ai = 1` 的消息。
2. 按 `(source_message_time DESC, source_message_id DESC)` 取最后 50 条，再反转为正序。
3. 只把可解析的对话内容交给模型；系统占位、空内容和不支持类型按现有共享消息解析规则过滤。
4. 模型可阅读客服/机器人消息理解上下文，但每个记忆操作的证据只能引用 `sender_role = customer` 的消息。
5. 运行项的 `session_ids_json` 保存入选的有序逻辑会话 ID，不保存消息正文。
6. 本期不再增加会话数、总消息数或 Token 窗口状态机；提供商硬限制触发时按运行项失败处理，不静默丢弃某个会话。
7. `message_count >= 5` 是逻辑会话总消息数门槛，不保证存在 `included_for_ai = 1` 的可读消息。运行项最终没有任何可读对话消息时，直接标记 `skipped`，错误原因 `AGENT_USER_MEMORY_ITEM_NO_READABLE_MESSAGES`，不得构造空 Prompt 或调用模型。

### 4.6 人工时间屏障和自动日期围栏

准备模型输入时：

- 排除 `ended_at <= manual_updated_at` 的来源会话，避免人工维护后重放旧事实。
- 如果客户 `last_auto_quota_date > run.quota_date`，运行项直接标记 `skipped`，错误原因 `AGENT_USER_MEMORY_ITEM_SUPERSEDED`。

合并结果时必须再次验证：

- `version = base_memory_version`。
- `manual_updated_at` 与准备时一致。
- `last_auto_quota_date IS NULL OR last_auto_quota_date <= run.quota_date`。

版本或人工时间变化时丢弃旧结果并基于同一组 `session_ids_json` 重新准备；出现更晚自动日期时不重试，直接跳过旧结果。

## 5. 每日调度与恢复

### 5.1 调度创建

配置表保存 `next_run_at`。Scheduler 每次只处理到期且没有活动运行的租户：

```text
lock config
assert enabled = 1
assert next_run_at <= now
assert active_run_id is null

quotaDate = local date immediately before config.next_run_at
customerLimit = resolveSupportedCustomerLimit(uid)
candidateSessionLimit = max(200, customerLimit * 2)
insert run(
  uid,
  generation,
  quotaDate,
  customerLimit,
  candidateSessionLimit
)
  on duplicate uid + quotaDate:
    same generation and non-terminal -> reattach the existing run
    terminal or different generation -> treat this date as already closed
set active_run_id = run.id only when a non-terminal run is attached
advance next_run_at by exactly one local calendar day
commit
```

- 多实例通过配置行锁和 `UNIQUE(uid, quota_date)` 防止重复运行。
- 已终态自然日不得因关闭再开启或 Scheduler 重放而重新扫描；需要恢复失败项时只能使用原运行的 retry-failed。
- Worker 停机数日后，按过期的 `next_run_at` 一天一天补建遗漏自然日；同一租户同时只运行一个日期。
- 关闭后不补建关闭期间的日期；重新开启时把 `enabled_at` 设为当前毫秒，并把 `next_run_at` 设为下一次本地 `02:00`。
- 新开启不会立即运行，也不会扫描开启前历史。
- 调度只补建“应该存在的每日运行”，不保证迟到写入已终态日期的会话被再次发现。

### 5.2 运行状态

运行状态：

```text
pending -> running -> waiting -> running -> succeeded | partial | failed | canceled
```

同步模式通常不进入 `waiting`；批量模式提交后进入 `waiting`。

运行项状态：

```text
prepared -> submitted -> succeeded | failed | skipped | canceled
```

- 选择完成后直接创建 `prepared` 项，不引入 `discovered` 或 `deferred`。
- 临时错误在同一运行项内按短退避自动重试，达到最大次数后为 `failed`。
- 同一运行还有未到重试时间的非终态项时，run 的 `run_after` 对齐最早 `next_attempt_at`；不得在短退避窗口内反复领取和释放形成数据库热循环。
- 模型重调、版本冲突后的重新准备和提供商轮询都必须有统一的最大尝试或最大等待时长，不能无限停留在 `running/waiting/prepared`。
- 所有项终态后，运行聚合为 `succeeded`、`partial`、`failed` 或 `canceled`。
- 运行终态时清除配置 `active_run_id`，后续日期可以继续。
- 终态的成功、失败和跳过计数从运行项当前状态重新聚合，不能在重试时对旧计数继续累加；Token 计数则累计所有实际模型尝试，用于反映真实成本。

### 5.3 失败项重试

`POST /runs/:runId/retry-failed` 在短事务中：

1. 验证功能仍开启、配置代次一致、当前没有其它活动运行。
2. 锁定来源运行；只接受 `partial` 或 `failed`。
3. 不重新查询逻辑会话，不修改 `session_ids_json` 和选中客户集合。
4. 将仍未被更晚日期覆盖的 `failed` 项重置为 `prepared`，清理临时错误和自动尝试计数。
5. 将已被更晚日期成功处理的失败项转为 `skipped/superseded`。
6. 如果至少一个项目被重置，将同一 run 重新置为 `pending` 并设为 `active_run_id`。
7. 如果失败项全部已被更晚日期覆盖，则直接重聚合原 run 并保持终态，不创建无意义的活动运行，也不持续暴露不可恢复的重试入口。

它不是新运行，也不产生新额度。较早日期失败项永远不能覆盖 `last_auto_quota_date` 更晚的客户状态。

### 5.4 Worker 租约与围栏

1. 先无锁读取最早可领取的 `pending`、到期 `waiting` 或租约过期 `running` 候选，再按统一顺序 `config FOR UPDATE -> run FOR UPDATE` 锁定并重新校验资格；不得为追求 `SKIP LOCKED` 而形成 `run -> config` 的反向锁顺序。
2. 每次领取生成新的随机 `claim_token`，同时保存 `locked_by` 和 `lease_until`。
3. 模型和提供商调用期间不持有数据库事务。
4. 所有运行、运行项和客户记忆写入必须在数据库层验证：

```text
run.id = :runId
AND run.status = 'running'
AND run.claim_token = :claimToken
AND run.lease_until > NOW(3)
```

5. 失租 Worker 的迟到写入必须整体回滚。
6. `waiting` 必须先领取为 `running` 并换新 token，才能轮询、拉取结果或合并。
7. 转为 `waiting` 或终态时清空 claim 和 lease。

### 5.5 明确不做的恢复

本期不持久化或实现：

- `maintenance_pending`。
- `pending_generation`。
- `pending_after_*`、`pending_through_*`。
- `selection_order_at`。
- 配置或运行发现游标。
- `cooldown_until`。
- 因未入选而创建的 `deferred` 项。

恢复边界只有：运行租约恢复、同一运行项自动重试、人工重试失败项和遗漏每日运行补建。未进入当日快照的会话不会跨日结转。

## 6. 记忆内容边界

### 6.1 固定分类

| category | 含义 | 示例 |
| --- | --- | --- |
| `profile` | 客户主动表达且与服务相关的稳定背景 | 家中有学龄儿童、购买用于送长辈 |
| `preference` | 商品、服务或消费偏好 | 偏好无糖、喜欢浅色、预算在 500 元以内 |
| `communication` | 沟通方式和联系约束 | 不方便接电话、优先微信文字沟通 |
| `product_context` | 已购、在用或明确关注的商品服务背景 | 正在使用 A 型号、关注换新方案 |
| `recent_context` | 近期仍可能影响服务的上下文 | 正在准备婚礼伴手礼、近期比较 A/B 产品 |
| `manual_note` | 仅允许人工维护的补充说明 | 重点客户服务要求 |

`manual_note` 不允许由 AI 新增。

### 6.2 应保存的内容

AI 记忆应同时满足：

1. 由客户本人直接表达。
2. 对未来服务仍有使用价值。
3. 可以压缩为一个明确短句。
4. 不依赖实时业务状态才能成立。
5. 不属于禁止自动提取的敏感信息。

### 6.3 不应自动保存的内容

- 单次会话摘要或客服处理过程。
- 待办、承诺回访、退款处理等行动项。
- 订单、物流、库存、余额、积分等动态业务状态。
- 单次情绪、质检结论或风险判断。
- 人格、价值或经济能力推断。
- 密码、验证码、银行卡和身份证件等安全敏感信息。
- 未经客户直接表达的健康诊断、政治、宗教、民族等敏感属性。
- 客服单方面陈述、转发或引用中无法归属于客户本人的事实。

语义边界由 Prompt 和模型负责；服务端不建设敏感词规则库或第二次模型审核。

### 6.4 内容限制

- `content` trim 后非空，最长 200 个字符。
- 每个 AI 操作引用一个来源会话和其中 1 至 3 个客户证据消息。
- `recent_context` 必须有晚于当前时间且不超过 180 天的 `expiresAt`。
- 其它分类可以没有过期时间。
- 当前有效人工和 AI 记忆总数最多 20。

## 7. 数据模型

### 7.1 配置表

```sql
CREATE TABLE IF NOT EXISTS xy_wap_embed_agent_user_memory_config (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  enabled TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '自动维护开关',
  generation INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '启停代次，用于拒绝旧运行结果',
  enabled_at BIGINT UNSIGNED NULL COMMENT '本代次启用时间，Unix毫秒',
  next_run_at DATETIME(3) NULL COMMENT '下一调度槽位',
  active_run_id BIGINT UNSIGNED NULL COMMENT '当前活动运行ID',
  create_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  update_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_agent_user_memory_config_uid (uid),
  KEY idx_agent_user_memory_config_due (enabled, next_run_at, uid)
) COMMENT='Agent用户记忆租户配置';
```

约束：

- 所有租户默认关闭。
- `enabled = 1` 时 `enabled_at` 和 `next_run_at` 非空。
- 开启和关闭都递增 `generation`。
- Java 只读取 `enabled`；不写配置表。

### 7.2 客户当前记忆表

```sql
CREATE TABLE IF NOT EXISTS xy_wap_embed_agent_user_memory (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  platform INT UNSIGNED NOT NULL COMMENT '接入平台',
  third_external_userid VARCHAR(128) NOT NULL COMMENT '平台外部联系人ID',
  memories_json JSON NOT NULL COMMENT '当前有效记忆JSON，最多20条',
  version INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '记忆JSON乐观锁版本',
  manual_updated_at BIGINT UNSIGNED NULL COMMENT '最近人工维护时间，Unix毫秒',
  last_auto_quota_date DATE NULL COMMENT '最近成功自动维护的目标自然日',
  last_auto_updated_at BIGINT UNSIGNED NULL COMMENT '最近自动维护时间，Unix毫秒',
  create_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  update_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_agent_user_memory_customer (
    uid, platform, third_external_userid
  ),
  KEY idx_agent_user_memory_uid_updated (uid, update_time, id)
) COMMENT='Agent客户当前用户记忆';
```

约束：

- 一客户一行，一个 JSON 保存全部当前记忆。
- 自动合并和人工写入都锁定该行并整体替换合法 JSON。
- 只有 JSON 内容变化时递增 `version`。
- `last_auto_quota_date` 只能单调前进。
- 不保存 pending、消费水位或发现游标。

### 7.3 当前记忆 JSON

```json
{
  "schemaVersion": 1,
  "nextItemId": 3,
  "manual": [
    {
      "id": 1,
      "category": "communication",
      "content": "不要电话联系，优先微信文字沟通",
      "createdAt": 1784880000000,
      "updatedAt": 1784880000000,
      "expiresAt": null,
      "updatedBySubUserId": 101
    }
  ],
  "ai": [
    {
      "id": 2,
      "category": "preference",
      "content": "偏好无糖饮品",
      "sourceSessionId": 501,
      "evidenceMessageIds": [9002],
      "createdAt": 1784880000000,
      "updatedAt": 1784880000000,
      "expiresAt": null
    }
  ]
}
```

约束：

1. `schemaVersion = 1`。
2. `nextItemId` 大于所有现有条目 ID，只由 Node 维护。
3. `manual` 和 `ai` 条目 ID 在客户 JSON 内唯一。
4. `sourceSessionId` 对应逻辑会话 ID。
5. `evidenceMessageIds` 保存平台源消息 ID。
6. 已存 JSON 非法时不得返回空 JSON 覆盖原数据。
7. Java 直接读表时按 `enabled`、`schemaVersion` 和 `expiresAt` 过滤；Java 只读。

### 7.4 每日运行表

```sql
CREATE TABLE IF NOT EXISTS xy_wap_embed_agent_user_memory_run (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  config_generation INT UNSIGNED NOT NULL COMMENT '配置代次快照',
  quota_date DATE NOT NULL COMMENT '目标自然日，Asia/Shanghai',
  scheduled_for DATETIME(3) NOT NULL COMMENT '计划调度时间',
  execution_mode VARCHAR(32) NOT NULL COMMENT 'sync或volcengine_batch',
  status VARCHAR(32) NOT NULL COMMENT 'pending/running/waiting/终态',
  phase VARCHAR(32) NOT NULL COMMENT 'selecting/inference/merging/completed',
  customer_limit INT UNSIGNED NOT NULL COMMENT '当日客户额度快照',
  candidate_session_limit INT UNSIGNED NOT NULL COMMENT '当日候选会话上限快照',
  candidate_session_count INT UNSIGNED NOT NULL DEFAULT 0,
  candidate_customer_count INT UNSIGNED NOT NULL DEFAULT 0,
  selected_customer_count INT UNSIGNED NOT NULL DEFAULT 0,
  success_count INT UNSIGNED NOT NULL DEFAULT 0,
  failure_count INT UNSIGNED NOT NULL DEFAULT 0,
  skipped_count INT UNSIGNED NOT NULL DEFAULT 0,
  input_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
  output_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
  locked_by VARCHAR(128) NULL COMMENT 'Worker实例标识',
  claim_token VARCHAR(64) NULL COMMENT '每次领取生成的新围栏token',
  lease_until DATETIME(3) NULL,
  run_after DATETIME(3) NULL,
  last_error_code VARCHAR(128) NULL,
  started_at DATETIME(3) NULL,
  finished_at DATETIME(3) NULL,
  create_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  update_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_agent_user_memory_run_day (uid, quota_date),
  KEY idx_agent_user_memory_run_claim (status, run_after, lease_until, id),
  KEY idx_agent_user_memory_run_terminal (status, finished_at, id),
  KEY idx_agent_user_memory_run_uid (uid, id)
) COMMENT='Agent用户记忆每日维护运行';
```

约束：

- `customer_limit > 0`。
- `candidate_session_limit = max(200, customer_limit * 2)`，并在创建 run 时快照，重试不得修改。
- `candidate_session_count <= candidate_session_limit`。
- `selected_customer_count <= customer_limit`。
- 同一租户、同一自然日只有一条运行。
- 重试复用原运行，不创建 `retry_of_run_id`。
- 表内不保存 Prompt、消息正文、模型原始输出或记忆快照。

### 7.5 客户运行项表

```sql
CREATE TABLE IF NOT EXISTS xy_wap_embed_agent_user_memory_run_item (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  run_id BIGINT UNSIGNED NOT NULL COMMENT '运行ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  platform INT UNSIGNED NOT NULL COMMENT '接入平台',
  third_external_userid VARCHAR(128) NOT NULL COMMENT '平台外部联系人ID',
  session_ids_json JSON NOT NULL COMMENT '本项固定来源逻辑会话ID',
  session_count INT UNSIGNED NOT NULL COMMENT '来源会话数',
  message_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '实际输入消息数',
  status VARCHAR(32) NOT NULL COMMENT 'prepared/submitted/终态',
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(3) NULL,
  base_memory_version INT UNSIGNED NULL,
  base_manual_updated_at BIGINT UNSIGNED NULL,
  provider_item_key VARCHAR(128) NULL,
  provider_batch_id VARCHAR(256) NULL,
  input_tokens INT UNSIGNED NOT NULL DEFAULT 0,
  output_tokens INT UNSIGNED NOT NULL DEFAULT 0,
  last_error_code VARCHAR(128) NULL,
  finished_at DATETIME(3) NULL,
  create_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  update_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_agent_user_memory_run_customer (
    run_id, platform, third_external_userid
  ),
  KEY idx_agent_user_memory_item_run_status (run_id, status, next_attempt_at, id),
  KEY idx_agent_user_memory_item_provider (provider_batch_id, provider_item_key)
) COMMENT='Agent用户记忆客户维护项';
```

约束：

- `session_ids_json` 非空、无重复，且全部来自该 run 的有界候选会话快照。
- 同一 run、同一客户只有一项。
- `message_count <= session_count * 50`。
- 不保存消息正文、Prompt、模型原始输出或完整记忆副本。

### 7.6 逻辑会话索引

新增：

```sql
ALTER TABLE xy_wap_embed_logical_session
  ADD KEY idx_logical_session_uid_ended_message (
    uid, ended_at, message_count, id
  );
```

该索引用于限制单 UID、单自然日扫描范围；有界候选查询可能仍需在该日有限结果上执行 filesort。上线前必须按最大受支持套餐的候选上限在生产量级副本执行 `EXPLAIN ANALYZE`，确认没有跨 UID 或跨日期全表扫描。

不增加含 `status` 的用户记忆索引，也不增加未结束会话屏障索引。

### 7.7 运行历史保留

运行和运行项默认保留 90 天：

- 只清理终态运行。
- 事务内按 ID 锁定一批终态 run，先删 item，再删 run。
- 清理失败使用短退避；成功后才进入长间隔。
- 当前记忆和配置不随运行历史删除。

## 8. AI 输入与输出

### 8.1 输入

每个客户维护项包含：

1. 当前有效人工记忆，明确标记为只读。
2. 当前有效 AI 记忆及稳定条目 ID。
3. 本运行项固定的逻辑会话，按 `(ended_at, id)` 正序。
4. 每个会话最后最多 50 条消息，按时间正序。
5. 消息的 `sourceMessageId`、`sessionId`、发送角色和解析后内容。
6. 当前时间、固定分类、禁止内容和最多 20 条约束。

不得包含 UID、客户姓名或平台外部联系人 ID。

### 8.2 输出

模型只返回：

```json
{
  "operations": [
    {
      "type": "confirm",
      "id": 2,
      "sourceSessionId": 510,
      "evidenceMessageIds": [9101]
    },
    {
      "type": "update",
      "id": 4,
      "category": "preference",
      "content": "预算调整为 800 元以内",
      "expiresAt": null,
      "sourceSessionId": 511,
      "evidenceMessageIds": [9102]
    },
    {
      "type": "remove",
      "id": 5,
      "sourceSessionId": 512,
      "evidenceMessageIds": [9103]
    },
    {
      "type": "add",
      "category": "recent_context",
      "content": "正在准备婚礼伴手礼",
      "expiresAt": 1790000000000,
      "sourceSessionId": 512,
      "evidenceMessageIds": [9104]
    }
  ]
}
```

- `add`：新增 AI 记忆。
- `confirm`：用新证据确认已有 AI 记忆。
- `update`：更新已有 AI 记忆。
- `remove`：新证据明确推翻或使已有 AI 记忆失效。

模型不得返回完整快照。未知操作、未知字段、重复操作或超过 40 个操作时整体拒绝。

## 9. 固定合并规则

### 9.1 结构与证据校验

每个操作必须满足：

- 来源会话在运行项 `session_ids_json` 中。
- 证据消息属于该来源会话和同一客户。
- 证据消息在实际送入模型的最后 50 条消息内。
- 证据角色为 `customer`。
- `confirm/update/remove` 的目标 ID 存在于当前 AI 记忆。
- AI 不得引用或修改 manual 条目 ID。
- 同一响应不得对同一目标 ID 多次操作。

### 9.2 应用顺序

固定顺序：

```text
remove -> update -> confirm -> add
```

任一步失败，整批操作不写入，不做部分成功。

### 9.3 精确去重

`normalize(content)` 只执行：

1. trim。
2. 连续 Unicode 空白压缩为单个空格。
3. 删除末尾连续句号、逗号、分号、冒号和对应中文标点。

不做同义词、Embedding、大小写推断或模糊相似。

规则：

- AI add 与人工内容精确重复：不新增。
- AI add 与 AI 内容精确重复：转为 confirm。
- AI update 与人工内容精确重复：删除该 AI 条目。
- 合并后 AI-AI 重复：保留较小 ID，证据更新为本次较新证据。
- 人工新增/编辑与其它有效记忆重复：返回明确错误。

### 9.4 数量上限

- 先过滤已过期条目，再应用操作。
- 合并后有效条目超过 20，整个结果失败。
- 不按置信度截断，不静默丢弃操作。
- 人工新增达到 20 条时返回 `AGENT_USER_MEMORY_LIMIT_REACHED`。

### 9.5 人工维护

人工写入使用 `expectedVersion`：

- 成功后整体替换 JSON并递增 `version`。
- 更新 `manual_updated_at = Date.now()`。
- 人工编辑 AI 条目时保留 ID，移动到 `manual`，移除来源字段。
- 删除最后一条时保留客户行和合法空 JSON。
- 不修改 `last_auto_quota_date`。

旧运行结果因 version/manual 时间冲突必须重新准备；重新准备时排除人工屏障之前结束的会话。

### 9.6 自动合并事务

每个模型结果在短事务中：

1. 锁定配置并验证 `enabled = 1`、代次一致、`active_run_id = run.id`。
2. 锁定并验证运行处于 `running`，claim 和 lease 有效。
3. 锁定运行项并验证 `status = submitted`。
4. 锁定或创建客户行，验证 version、人工时间和自动日期围栏。
5. 执行结构、证据、去重和数量规则。
6. JSON 变化时整体更新 JSON 并递增 version；空操作或仅 confirm 未改变内容时可以保持 version。
7. 将 `last_auto_quota_date` 单调推进到 run 的 `quota_date`，更新 `last_auto_updated_at`。
8. 将运行项置为 `succeeded` 并更新运行聚合计数。

配置关闭、代次变化或失租时整个事务回滚。版本/人工冲突退回 `prepared`；更晚自动日期冲突转为 `skipped/superseded`。

## 10. 推理执行模式

### 10.1 同步模式

首期同步模式：

```text
prepared
  -> 围栏事务写 submitted 和 base version
  -> 事务外调用模型
  -> 围栏事务合并
```

进程在 `submitted` 后退出时，新持有者重新校验当前状态并重新构建输入；允许重复模型成本，不允许重复或回退数据库写入。

通用 Ark HTTP、结构化 JSON 和 usage 映射可以提取到 `apps/backend/src/shared/ai/`，但用户记忆不得导入 Insights Worker、Prompt 或 Repository。

### 10.2 火山批量模式

Batch 是后续可选阶段，接入前必须核实官方契约：

- 目标模型是否支持 Batch。
- 输入上传、幂等提交、轮询和结果下载协议。
- 单批条目/文件限制。
- 取消、保留和删除语义。

接入后必须满足：

- 与同步模式共享同一业务输入、输出和合并规则。
- provider key 不包含 UID、客户 ID或姓名。
- `provider_batch_id` 持久化，重启后继续轮询。
- 轮询有最大等待时长；超过后运行项进入可重试失败，不允许永久停留在 `waiting` 并阻塞后续自然日。
- 本地临时文件只作传输，上传后立即删除，恢复不得依赖文件。
- Batch 失败不得静默降级为同步模式。
- `waiting` 结果合并前必须重新领取为 `running` 并换新 claim。

在该适配器完成前，运行时只接受 `sync`。

## 11. API 契约

所有接口属于 Agent 模块：

```text
/api/server/ai-hosting/user-memory/*
```

### 11.1 配置和概览

```http
GET /api/server/ai-hosting/user-memory/overview
PUT /api/server/ai-hosting/user-memory/settings
```

设置请求：

```json
{
  "enabled": true
}
```

额度、候选会话上限、最少消息数和每会话消息上限均为只读策略，不属于 settings 请求。

### 11.2 运行管理

```http
GET  /api/server/ai-hosting/user-memory/runs?cursor=&pageSize=20
GET  /api/server/ai-hosting/user-memory/runs/:runId?itemCursor=&itemPageSize=20&status=
POST /api/server/ai-hosting/user-memory/runs/:runId/retry-failed
```

明确不存在：

```http
POST /api/server/ai-hosting/user-memory/runs
```

运行详情中的客户项必须分页，不允许一次返回全量项。

### 11.3 客户记忆管理

```http
GET    /api/server/ai-hosting/user-memory/customers?query=&cursor=&pageSize=20
GET    /api/server/ai-hosting/user-memory/customers/:thirdExternalUserId?platform=5
GET    /api/server/ai-hosting/user-memory/customers/:thirdExternalUserId/items/:itemId/evidence?platform=5
POST   /api/server/ai-hosting/user-memory/customers/:thirdExternalUserId/items?platform=5
PATCH  /api/server/ai-hosting/user-memory/customers/:thirdExternalUserId/items/:itemId?platform=5
DELETE /api/server/ai-hosting/user-memory/customers/:thirdExternalUserId/items/:itemId?platform=5
```

客户列表复用 Workbench cursor 分页和可见范围，用户记忆只批量补充当前页记忆。

证据接口先验证客户访问范围，再验证 AI 条目、来源会话客户归属，最后复用 `WorkbenchService.getMessagesBySeqs()` 读取证据；不得复用只校验 UID 的洞察消息上下文接口。

### 11.4 稳定错误码

| 错误码 | 场景 |
| --- | --- |
| `AGENT_USER_MEMORY_DISABLED` | 功能关闭，不能重试自动运行 |
| `AGENT_USER_MEMORY_RUN_ACTIVE` | 当前存在其它活动运行 |
| `AGENT_USER_MEMORY_RUN_NOT_RETRYABLE` | 运行没有可重试失败项 |
| `AGENT_USER_MEMORY_RUN_NOT_FOUND` | 运行不存在或不属于当前租户 |
| `AGENT_USER_MEMORY_ITEM_SUPERSEDED` | 较早自然日运行项已被更晚自动维护覆盖 |
| `AGENT_USER_MEMORY_ITEM_NO_READABLE_MESSAGES` | 入选会话没有可供模型读取的消息，运行项直接跳过 |
| `AGENT_USER_MEMORY_CUSTOMER_NOT_FOUND` | 客户不存在或不在访问范围 |
| `AGENT_USER_MEMORY_ITEM_NOT_FOUND` | 记忆条目不存在 |
| `AGENT_USER_MEMORY_LIMIT_REACHED` | 当前有效记忆达到 20 条 |
| `AGENT_USER_MEMORY_VERSION_CONFLICT` | 客户记忆被其它请求更新 |
| `AGENT_USER_MEMORY_CONTENT_DUPLICATE` | 人工内容与其它有效记忆重复 |
| `AGENT_USER_MEMORY_CONTENT_INVALID` | 分类、内容或过期时间非法 |
| `AGENT_USER_MEMORY_DATA_INVALID` | 已存 JSON 或运行快照损坏 |
| `AGENT_USER_MEMORY_MODEL_OUTPUT_INVALID` | 模型输出或证据校验失败 |
| `AGENT_USER_MEMORY_ATTEMPTS_EXHAUSTED` | 自动尝试次数耗尽 |

## 12. Java 直接读表边界

Node 交付边界止于稳定维护：

- `xy_wap_embed_agent_user_memory_config`。
- `xy_wap_embed_agent_user_memory`。

Java Agent 运行时：

1. 直接读取上述两张表。
2. 只读，不修改配置、JSON、version 或维护元数据。
3. 根据 `enabled` 决定是否注入。
4. 校验 `memories_json.schemaVersion = 1`。
5. 过滤 `expiresAt <= now` 的条目。
6. 不读取运行表或运行项表。
7. 自行决定 Prompt 拼接方式；不经过 Node context API。

## 13. 权限与安全

1. 页面和接口沿用 Agent 模块权限。
2. owner/admin 可以启停、重试失败项和人工增删改。
3. operator/viewer 只可查看其客户访问范围内的记忆和证据。
4. 所有接口从 JWT 取 UID，不信任客户端 UID。
5. 日志、运行表和运行项表不得保存消息正文、Prompt、完整模型输出或完整记忆。
6. provider key 不得包含可识别客户信息。
7. 证据接口不得扩大现有会话访问范围。
8. 用户记忆表之外的平台联系人、会话和消息表只读。

## 14. 性能与成本

1. 每个租户、每个自然日只查询一次该日合格逻辑会话，并按运行快照的 `candidate_session_limit` 返回有界结果；默认额度 100 时取 200 条，当前预留最大额度 500 时取 1000 条。
2. 不做配置启用以来的全历史扫描，不做跨日 pending 扫描。
3. 一条运行最多发起 `customer_limit` 个客户级同步模型请求；本期默认最多 100，当前预留套餐上限 500。
4. 每个会话最多读取最后 50 条 AI 消息。
5. 同一客户当日多个候选会话合并为一次请求。
6. 候选查询使用 `(uid, ended_at, message_count, id)` 限定 UID 和日期；上线前执行生产量级 `EXPLAIN ANALYZE`。
7. 消息读取使用现有 `(session_id, source_message_time, source_message_id)` 索引。
8. 客户列表先分页再批量读记忆，禁止 N+1。
9. 单客户最多 20 条，整体解析和替换 JSON，不增加 JSON 索引或明细表。
10. 运行历史有界保留 90 天。
11. Batch 失败不得自动同步降级，避免成本突增。
12. 候选不足、去重不足或未入选不补扫，避免为了理论完整性引入高频扫描和复杂状态。

## 15. 可观测性

至少记录和展示：

- `quota_date`、计划时间、实际开始和结束时间。
- 候选会话数、候选去重客户数、额度快照和选中客户数。
- 来源会话数、实际消息数和每会话 50 条截断次数。
- 成功、失败、跳过、取消和 superseded 数量。
- 模型请求、Token、耗时和批量任务状态。
- `add/confirm/update/remove` 数量、空操作和精确去重数量。
- 版本冲突、人工时间冲突、失租拒绝和模型 Schema 错误。
- 下一调度已过期但没有运行的异常。

日志只记录运行/运行项 ID、UID、脱敏客户键、quota date、计数和稳定错误码，不记录正文。

## 16. 代码边界和环境变量

建议位置：

```text
apps/backend/src/modules/ai-hosting/user-memory/
apps/web/src/pages/chat/ai-hosting/user-memory-page.tsx
packages/contracts/src/ai-hosting/user-memory.ts
```

环境变量：

```env
AGENT_USER_MEMORY_WORKER_ENABLED=false
AGENT_USER_MEMORY_DAILY_TIME=02:00
AGENT_USER_MEMORY_TIMEZONE=Asia/Shanghai
AGENT_USER_MEMORY_EXECUTION_MODE=sync
```

候选会话基数 200、额度倍数 2、最少 5 条、每会话 50 条和默认客户额度 100 先作为集中策略常量/套餐 resolver，不增加环境变量或页面设置。

Worker 可以由现有 `apps/backend/src/worker.ts` 启动，但必须使用独立 runtime、模块内持久化代码、错误码和观测，不得并入 Insights service；本期不为仅代理 Kysely 的空壳 Repository 增加层级。

## 17. 上线与回滚

1. 新增配置、当前记忆、运行和运行项四张表。
2. 增加 `idx_logical_session_uid_ended_message` 并验证执行计划。
3. 四张新表加入 Kysely Schema、codegen 表清单和 Node 可写白名单。
4. 逻辑会话、会话消息和平台联系人表保持只读。
5. 所有租户默认关闭，不初始化客户水位，不回刷历史。
6. 首期只启用同步模式和少量测试 UID。
7. 观察至少一个完整自然日后再扩大灰度。
8. Batch 官方契约和适配器未完成前不得配置 batch mode。
9. 回滚时关闭 Worker 和租户开关；保留当前记忆及运行历史。
10. 回滚不得影响逻辑会话、Insights 或 Agent 其它功能。

## 18. 验收标准

### 18.1 模块边界

1. Agent 导航存在“用户记忆”独立页面。
2. 页面没有“立即维护”；后端没有通用创建运行 API。
3. 逻辑会话关闭事务不创建用户记忆任务。
4. 用户记忆不读写洞察开关、Job、快照或运行状态。
5. Node 不提供 Agent runtime context API；Java 直接只读两张业务表。

### 18.2 每日选择

1. 每日 02:00 处理前一完整 `Asia/Shanghai` 自然日。
2. 查询只取单聊、`ended_at` 合法、`message_count >= 5` 的会话。
3. `logical_session.status` 任意变化都不影响资格。
4. 排序为 `message_count DESC, ended_at DESC, id DESC`，最多取 `max(200, customer_limit * 2)` 条；默认额度 100 时最多 200 条。
5. 必须先取有界候选会话后客户去重。
6. 去重不足额度时不补扫候选上限之后的会话。
7. 同一入选客户的候选池内全部会话合并为一个运行项。
8. 每会话最多取最后 50 条 AI 对话消息。
9. 默认每自然日最多 100 个去重客户，重试不新增客户或额度。
10. 候选会话为零时 run 直接成功终态、计数全零并清除 `active_run_id`。
11. 入选运行项没有任何可读消息时直接跳过，不调用空 Prompt。

### 18.3 调度和恢复

1. `UNIQUE(uid, quota_date)` 防止多实例重复创建。
2. Worker 错过调度后按 `next_run_at` 补建遗漏自然日，但同租户同时只有一个活动运行。
3. 未入选和迟到会话不结转，不存在 pending 或发现游标。
4. 失败项在原运行内自动或人工重试，来源会话集合保持不变。
5. 较早运行项不能覆盖 `last_auto_quota_date` 更晚的客户。
6. Worker 失租后所有状态和记忆写入都被数据库围栏拒绝。
7. `waiting` 必须重新领取并换 token 后才能合并。
8. 功能关闭或代次变化后旧结果不能写入。

### 18.4 人工优先

1. AI 不能修改或删除人工记忆。
2. 人工编辑 AI 记忆后转为人工并移除来源字段。
3. 人工修改发生在模型调用期间时，旧结果不能覆盖。
4. 重新准备时排除 `ended_at <= manual_updated_at` 的会话。
5. 未来新会话再次明确表达同一事实时，AI 可以重新新增。

### 18.5 合并和数量

1. 当前有效记忆总数不超过 20。
2. AI 超限结果整体失败，不静默截断。
3. 精确重复按固定规则处理。
4. 所有 AI 操作都能验证到运行项内的客户证据。
5. 空操作也把 `last_auto_quota_date` 单调推进到当前 run 日期。
6. 版本冲突重建输入，不把旧增量套到新 JSON。

### 18.6 权限和数据边界

1. 同一客户在同租户、平台下只有一行记忆。
2. 不同租户、平台和外部联系人不会串数据。
3. 群聊不进入维护。
4. 功能关闭时自动维护停止，人工维护仍可用。
5. 非 owner/admin 不能启停、重试或修改记忆。
6. 无会话权限时不暴露证据标识。
7. 日志和运行表不出现消息或记忆正文。
