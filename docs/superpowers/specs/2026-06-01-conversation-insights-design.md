# 会话洞察设计方案

- 日期：2026-06-01
- 状态：Draft
- 适用范围：AI 客服工作台会话洞察第一版
- 目标页面：`/chat` 及后续洞察入口
- 推荐方案：`Node backend + 独立 worker + MySQL 派生表 + OpenAI-compatible LLM Provider`

## 1. 背景

当前工作台已经具备聚合聊天、消息读取、语音转写、智能回复等基础能力。下一阶段需要在会话数据之上增加 AI 洞察能力，用于会话摘要、客户诉求识别、标签提取、情绪分析、质检判断和后续扩展分析。

会话洞察不应直接污染平台消息事实表，也不应依赖前端临时状态。第一版应建立稳定的数据清洗、逻辑会话切片、后台任务、模型调用和结果落库链路，为后续主体抽取、投诉识别、成交意向评分、长期画像等分析维度预留扩展空间。

## 2. 目标与非目标

### 2.1 目标

第一版需要支持：

1. Node backend 只读平台 `xy_wap_embed_msg_audit_info` / `xy_wap_embed_conversation` 表，生成会话洞察派生数据。
2. 基于 `xy_wap_embed_conversation.id` 作为稳定会话 ID，基于 `xy_wap_embed_conversation.uid` 作为租户 ID。
3. 支持租户级逻辑会话切片配置，提供即时客服和私域跟进两个预设，并允许自定义。
4. 同一逻辑会话支持准实时多轮分析，结果对业务侧只展示一份最新洞察。
5. 复用现有 `xy_wap_embed_msg_audit_info` 解析能力实时构建 AI 输入，支持文本、语音转写、文件、链接、小程序/卡片摘要进入模型上下文；图片 OCR 第一版不做。
6. 通过独立 Node worker 执行同步、切片、分析任务，任务状态持久化到 MySQL。
7. 大模型通过可切换 Provider 接入，支持 OpenAI 官方、火山、阿里和其它 OpenAI-compatible API。
8. 结构化保存摘要、情绪、标签、质检结果、业务实体、意图、风险、行动项和 FAQ 机会，并支持后续新增分析维度。
9. 支持租户自定义洞察策略、标签、质检规则和实体词库。
10. 洞察结果第一版只读展示，不自动影响客服绩效、自动打标或自动触发业务动作。

### 2.2 非目标

第一版不做：

- AI 自动回复。
- 基于洞察结果的自动绩效扣分。
- 图片 OCR。
- 复杂语义切片作为主会话边界。
- 全量规则引擎和复杂质检流程编排。
- 原始 prompt 在线编辑。
- 跨租户模型训练或长期客户画像沉淀。
- Redis、Kafka、Temporal 等额外基础设施强依赖。

## 2.3 第一版确认范围

第一版开发范围：

```text
P0:
- 总览
- 服务质检
- 待处理
- 洞察配置
- 共享详情面板和证据消息

后置:
- 经营洞察
- 分析明细
```

第一版关键决策：

- 大模型优先接入火山方舟。
- 第一版火山方舟先走 OpenAI-compatible chat completions，不接 Responses API。
- 模型 API Key 先放 `.env`，不在页面配置。
- worker 独立进程部署；`INSIGHTS_WORKER_UID_ALLOWLIST` 仅用于控制账号是否可开启全局会话洞察开关。只要账号已开启会话洞察，worker 按配置表处理，不再受该环境变量限制。
- 支持从指定时间开始重刷历史数据。
- 语音转写读取 `xy_wap_embed_msg_audit_info.content.transVoiceText`。
- 数据页第一版不做额外角色权限，仍遵守登录态、租户和会话数据隔离；配置页仅管理员可见。
- 问题解决判定只判断当前逻辑会话内是否解决。
- 待处理行动项支持人工标记状态。
- 洞察配置数据第一版使用种子数据，后续再做完整 CRUD。

## 3. 方案结论

会话洞察属于 AI 客服工作台派生业务能力，推荐放在 `apps/backend` 侧实现。Java / 平台层继续负责消息事实源，Node backend 负责洞察派生链路。

```text
Java / 平台层
- 写入 xy_wap_embed_msg_audit_info 表
- 更新 xy_wap_embed_conversation.last_msgtime
- 维护平台账号、联系人、群和原始消息事实

Node backend API
- 提供 /api/server/* 洞察查询和配置接口
- 展示最新洞察结果
- 接收重新分析等命令

Node worker
- 只读 xy_wap_embed_msg_audit_info / xy_wap_embed_conversation
- 写入洞察派生表
- 处理 AI 输入构建、逻辑会话切片、任务调度和模型调用
```

部署形态为同一代码仓库、同一发布包或镜像，拆成两个进程：

```text
node dist/server.js  # API 服务
node dist/worker.js  # 后台 worker
```

第一阶段 worker 可以单实例部署。后续如需多实例，通过 MySQL lease lock 控制全局同步任务，通过任务表 lease 控制分析任务并发。

产品定位上，第一版不应只是“会话摘要列表”，而应成为客服主管和运营人员的“今日服务风险与经营机会入口”：

```text
今天哪些客户要优先处理？
哪些会话存在投诉、差评、退款或退货风险？
哪些客户有购买意向但还没有转化？
哪些商品、订单、物流或售后问题被频繁提及？
哪些问题值得沉淀为 FAQ、话术或商品说明？
```

页面和 API 可以先聚焦会话级洞察，但底层结果模型需要支持电商业务维度扩展。

## 4. 数据流

```text
xy_wap_embed_conversation / xy_wap_embed_msg_audit_info
  -> insight sync cursor
  -> xy_wap_embed_logical_session
  -> xy_wap_embed_logical_session_message
  -> xy_wap_embed_insight_job
  -> xy_wap_embed_analysis_run
  -> xy_wap_embed_session_insight_snapshot
  -> summary / sentiment / tag / qa finding / future dimensions
  -> /api/server/insights/*
```

关键原则：

- `xy_wap_embed_msg_audit_info` 是消息事实源。
- `xy_wap_embed_conversation.last_msgtime` 可用于发现活跃会话，但不作为唯一消息同步水位。
- AI 输入由 backend 现有消息解析能力实时构建。
- 每次 analysis run 保存输入消息范围、输入 hash 和必要的 prompt/input 摘要。
- 洞察表是派生数据，可按规则版本重建。
- AI 结果必须记录模型、prompt、规则版本和证据消息 ID。
- 任何模型失败不能影响聊天主链路。

## 5. 消息同步

Node worker 定时扫描平台消息增量。消息事实表使用 `xy_wap_embed_msg_audit_info`，会话表使用 `xy_wap_embed_conversation`。同步水位保存在 Node 自己的派生表中。

```text
xy_wap_embed_insight_sync_cursor
- id
- source: xy_wap_embed_msg_audit_info
- uid nullable
- cursor_msgtime
- cursor_audit_id
- updated_at
```

扫描策略：

```sql
SELECT *
FROM xy_wap_embed_msg_audit_info
WHERE msgtime > :cursor_msgtime
   OR (msgtime = :cursor_msgtime AND id > :cursor_audit_id)
ORDER BY msgtime ASC, id ASC
LIMIT :batch_size;
```

进入切片前需要把消息映射到稳定会话 ID。`xy_wap_embed_msg_audit_info` 本身不直接存 `conversation.id`，需要按消息会话类型关联 `xy_wap_embed_conversation`：

```sql
-- 单聊
SELECT c.id AS conversation_id, c.uid, c.platform
FROM xy_wap_embed_conversation c
WHERE c.uid = :message_uid
  AND c.platform = :message_platform
  AND c.chat_type = 1
  AND c.third_userid = :message_third_user_id
  AND c.third_external_userid = :message_third_external_id
  AND c.biz_status = 1
LIMIT 1;
```

```sql
-- 群聊
SELECT c.id AS conversation_id, c.uid, c.platform
FROM xy_wap_embed_conversation c
WHERE c.uid = :message_uid
  AND c.platform = :message_platform
  AND c.chat_type = 2
  AND c.third_userid = :message_third_user_id
  AND c.third_group_id = :message_third_group_id
  AND c.biz_status = 1
LIMIT 1;
```

worker 可按批量消息先收集单聊和群聊 lookup key，再批量查询 conversation，避免逐条查询。

每批消息完成以下步骤后推进 cursor：

1. 读取 `xy_wap_embed_msg_audit_info` 增量。
2. 批量解析对应 `xy_wap_embed_conversation.id` 和 `uid`。
3. 对可归属会话的消息推进逻辑会话切片。
4. 写入 `xy_wap_embed_logical_session` 和 `xy_wap_embed_logical_session_message`。
5. 按触发条件创建 live/final analysis job。

无法归属到有效 conversation 的消息不进入切片，并记录诊断日志。为了避免 `xy_wap_embed_conversation.last_msgtime` 摘要字段带来的乱序或补录问题，进入洞察链路的最终同步水位仍然以 `xy_wap_embed_msg_audit_info.msgtime + id` 为准。

如后续不允许 Node 直接读平台表，可将读取逻辑封装在 `platform-message-source` 适配层，替换为 Java 增量 API，不影响后续切片和分析逻辑。

## 6. AI 输入构建

`xy_wap_embed_msg_audit_info` 是消息事实表。backend 通过现有 mapper 和内容解析工具，把平台消息转换成模型可消费的运行时输入结构。

推荐新增一个内部工具或服务：

```text
insight-message-input-builder
- 读取 xy_wap_embed_msg_audit_info / conversation 行
- 复用现有 workbench message mapper 和内容解析工具
- 输出模型可消费的 AiMessageInput[]
```

内部输入结构：

```text
AiMessageInput
- source_message_id
- conversation_id
- occurred_at
- sender_role: customer / agent / system / bot / unknown
- message_type: text / voice / file / link / miniapp / image / system / unsupported
- content_status: ready / pending_transcription / unsupported / failed
- ai_text
- evidence_label
- included_for_ai
```

`AiMessageInput` 用于 prompt 构建、证据定位和模型输入校验。每次 analysis run 保存输入消息 ID 范围、输入 hash 和必要的 prompt/input 摘要，用于排障和重跑追溯。

第一版消息类型处理：

- 文本：直接进入 `ai_text`。
- 语音：读取 `xy_wap_embed_msg_audit_info.content.transVoiceText`；未完成时标记 `pending_transcription`，模型上下文使用占位描述。
- 文件：使用文件名、类型、大小和已有摘要；没有正文解析时不强行解析。
- 链接：使用标题、描述和 URL 域名。
- 小程序/卡片：使用标题、描述和业务字段摘要。
- 图片：记录图片消息存在，但不做 OCR，不提供图片正文给模型。
- 系统消息：保留事件信息，但默认不作为有效消息延续逻辑会话。

语音转写完成后，平台消息内容发生更新。worker 通过扫描消息更新时间、转写状态或现有消息更新事件识别变化，将相关逻辑会话标记为 `stale`，由下一轮 live analysis 或 final analysis 重新实时构建输入并纳入完整语音文本。

高成本内容处理能力按独立 enrichment 模块扩展，例如文件正文解析、图片 OCR 或外部链接抓取。enrichment 模块负责保存处理状态、结果摘要和版本信息，供 `insight-message-input-builder` 读取。

## 7. 逻辑会话切片

逻辑会话用于表达一次相对完整的客户咨询或服务闭环。它不同于模型上下文切块：逻辑会话解决业务边界，模型上下文切块解决长文本输入限制。

第一版采用确定性切片规则：

```text
聚合 key = uid + conversation_id
边界条件 = idle_timeout + hard_max_duration + business_event
```

租户级配置：

```text
xy_wap_embed_sessionization_config
- uid
- preset: realtime_service / private_domain / custom
- idle_timeout_minutes
- hard_max_duration_hours
- analysis_delay_minutes
- late_arrival_window_minutes
- enabled
- rule_version
- created_at
- updated_at
```

预设值：

```text
即时客服：
- idle_timeout_minutes = 60
- hard_max_duration_hours = 24
- analysis_delay_minutes = 10
- late_arrival_window_minutes = 30

私域跟进：
- idle_timeout_minutes = 240
- hard_max_duration_hours = 72
- analysis_delay_minutes = 15
- late_arrival_window_minutes = 30
```

默认值：

```text
- idle_timeout_minutes = 120
- hard_max_duration_hours = 48
- analysis_delay_minutes = 10
- late_arrival_window_minutes = 30
```

配置校验：

```text
idle_timeout_minutes: 15 - 1440
hard_max_duration_hours: 1 - 168
analysis_delay_minutes: 0 - 60
late_arrival_window_minutes: 0 - 1440
hard_max_duration_hours * 60 > idle_timeout_minutes
late_arrival_window_minutes >= analysis_delay_minutes
```

逻辑会话表：

```text
xy_wap_embed_logical_session
- id
- uid
- conversation_id
- started_at
- ended_at
- last_message_at
- last_meaningful_message_at
- status: open / closed_pending_analysis / analyzing / analyzed / stale / failed
- close_reason: idle_timeout / hard_max_duration / business_event / manual / rule_rebuild
- rule_version
- idle_timeout_minutes
- hard_max_duration_hours
- analysis_delay_minutes
- current_snapshot_id nullable
- final_snapshot_id nullable
- message_count
- customer_message_count
- agent_message_count
- created_at
- updated_at
```

消息归属表：

```text
xy_wap_embed_logical_session_message
- id
- uid
- session_id
- conversation_id
- source_message_id
- source_message_time
- sender_role
- occurred_at
- message_type
- included_for_ai
- meaningful_for_boundary
- created_at
```

`xy_wap_embed_logical_session_message` 只表达平台消息和逻辑会话的归属关系，以及该消息是否参与 AI 输入和切片边界判断。动态内容状态由 `insight-message-input-builder` 在构建模型输入时从平台消息实时解析，不在该表维护。

会话内消息顺序按以下规则确定：

```text
ORDER BY source_message_time ASC, source_message_id ASC
```

建议约束和索引：

```text
UNIQUE(session_id, source_message_id)
INDEX(session_id, source_message_time, source_message_id)
INDEX(uid, conversation_id, source_message_time)
INDEX(source_message_id)
```

切片规则：

1. 新有效消息到达时，查找同一 `uid + conversation_id` 下的 open session。
2. 没有 open session 时创建新 session。
3. 有 open session 且距离 `last_meaningful_message_at` 未超过 `idle_timeout` 时追加消息。
4. 超过 `idle_timeout` 时关闭旧 session，并创建新 session。
5. 超过 `hard_max_duration` 时强制关闭旧 session，并创建新 session。
6. 明确业务结束事件可以提前关闭当前 session。
7. 系统消息默认不单独开启或延续 session，但可作为事件消息保留。
8. 关闭后的 session 延迟 `analysis_delay_minutes` 后触发 final analysis。
9. 迟到消息进入已分析 session 时，标记 session 为 `stale` 并创建 reanalysis 任务。

配置变更默认只影响新 session。历史 session 保存创建时使用的配置快照和规则版本。如需按新规则重建历史，需要用户显式触发。

## 8. 准实时多轮分析

第一版不要求等逻辑会话结束才分析。open session 可以进行 live analysis，closed session 进行 final analysis。

触发条件：

```text
live analysis:
- 距离上次分析新增有效消息数 >= 6
- 或距离上次分析超过 10-15 分钟
- 或命中投诉、负面、催促等轻量规则
- 或用户手动重新分析

final analysis:
- 逻辑会话关闭
- 且超过 analysis_delay_minutes
```

同一 session 可以多次分析，但业务查询只展示当前有效 snapshot。final analysis 成功后，`final_snapshot_id` 指向最终结果。若后续迟到消息导致结果过期，session 标记为 `stale` 并进入 reanalysis。

长会话超过模型上下文时，在分析层做 context chunk 和 rolling summary，不拆分业务逻辑会话。

模型调用应以逻辑会话或会话消息窗口为单位，默认一次输出多类结构化结果。第一版不应为摘要、标签、情绪、风险、实体分别重复调用同一段对话。后续只有在标签体系、质检规则或主体抽取单独升级时，才通过 `analysis_scope` 支持单维重跑。

## 9. 任务系统

后台任务通过 MySQL 持久化，worker 内部定时唤醒任务。定时器只负责唤醒，可靠性由任务表、cursor、lease、幂等和重试保证。

```text
xy_wap_embed_insight_job
- id
- uid
- job_type: sync_messages / sessionize_messages / close_idle_sessions / analyze_session / reanalyze_session
- analysis_scope: all / summary / tags / sentiment / qa / entities
- target_type: conversation / logical_session / uid
- target_id
- status: pending / running / succeeded / failed / dead
- priority
- run_after
- attempt_count
- max_attempts
- locked_by
- lease_until
- idempotency_key
- error_code
- error_message
- created_at
- updated_at
```

worker 进程启动后注册周期任务：

```text
sync_messages: 每 5 秒
close_idle_sessions: 每 60 秒
run_insight_jobs: 每 3 秒
release_expired_jobs: 每 60 秒
```

任务执行规则：

- worker 通过 `locked_by + lease_until` 抢占任务。
- 成功后标记 `succeeded`。
- 失败后按退避时间重新进入 `pending`。
- 超过最大次数后标记 `dead`。
- 任务写入使用 `idempotency_key` 防止重复创建。
- 模型调用类任务必须记录超时、错误码、原始错误摘要和可重试性。

## 10. 大模型接入

大模型调用通过内部 LLM Provider Adapter 抽象，不让业务逻辑直接依赖具体 SDK。

```text
analysis service
  -> prompt builder
  -> llm provider
  -> result validator
  -> insight repository
```

Provider 配置：

```text
xy_wap_embed_model_provider
- id
- provider_code: openai / volcengine_ark / dashscope / openai_compatible
- display_name
- base_url
- api_key_secret_ref
- enabled
- created_at
- updated_at
```

模型档案：

```text
xy_wap_embed_model_profile
- id
- uid nullable
- task_type: session_insight / tag_extraction / sentiment / qa_check / entity_extraction
- provider_id
- model_name
- temperature
- max_output_tokens
- timeout_ms
- retry_count
- prompt_version
- enabled
- created_at
- updated_at
```

第一版优先实现 `openai_compatible` provider。OpenAI 官方、火山方舟、阿里 DashScope 和公司自建模型网关均可通过 `base_url + api_key + model_name` 接入。底层 SDK 可选 Vercel AI SDK 或 OpenAI Node SDK，但业务代码只依赖内部 Provider 接口。

第一版默认 provider 使用火山方舟，通过 OpenAI-compatible chat completions 协议接入。API Key 从 `.env` 读取，model profile 可通过种子数据写入数据库。Responses API、`previous_response_id` 和 provider 侧缓存先不接入，后续只在 Provider Adapter 内扩展，不让 worker 和结果模型直接依赖 Responses 状态。

模型输出要求：

- 输出结构化 JSON。
- 使用 TypeBox schema 做结果校验。
- JSON parse 或 schema 校验失败时，可发起一次 repair retry。
- repair retry 仍失败时，任务失败并保留 raw output 摘要。
- 模型温度默认低值，保证稳定性。
- 每个结论尽量携带 `evidence_message_ids` 和 `confidence`。
- 保存 `provider_code`、`model_name`、`prompt_version`、`rule_version`、token usage、request id 和耗时。

第一版推荐模型输出维度：

```text
summary
sentiment
tags
qa_findings
problem_resolution
entities
intents
risk
action_items
faq_candidates
```

输出中的每个重要结论都应包含：

```text
confidence
evidence_message_ids  # xy_wap_embed_msg_audit_info.id
reason
```

业务实体和意图的展示名不能直接作为聚合主键。模型可给出候选展示名、别名、属性和置信度，系统通过实体归一化逻辑生成稳定 key。

模型输入除会话消息外，还应注入租户自定义配置：

```text
租户标签体系
租户质检规则
租户实体和业务词库
租户分析策略
```

第一版不向用户暴露原始 prompt 编辑。用户通过业务配置影响模型判断，系统负责将配置转换为稳定 prompt 片段。

## 11. 租户自定义配置

租户自定义配置用于让不同商家按自身业务重点使用洞察模块。第一版开放业务语义配置，不开放底层 prompt、temperature、模型私有参数等技术项。

### 11.1 分析策略

```text
xy_wap_embed_insight_analysis_policy
- uid
- live_analysis_enabled
- live_min_new_meaningful_messages
- live_min_interval_minutes
- final_analysis_enabled
- rule_fallback_enabled
- low_confidence_threshold
- enabled
- created_at
- updated_at
```

默认建议：

```text
live_min_new_meaningful_messages = 20
live_min_interval_minutes = 15
low_confidence_threshold = 0.6
rule_fallback_enabled = true
```

### 11.2 标签体系

```text
xy_wap_embed_insight_label_config
- id
- uid
- label_code
- label_name
- description
- positive_examples_json
- negative_examples_json
- enabled
- include_in_statistics
- created_at
- updated_at
```

用户可配置示例：

```text
价格敏感
高意向
需要主管介入
老客复购
售后不满
大额客户
竞品比较
物流催促
```

模型提取标签时优先从租户配置的标签中选择。模型认为需要新增标签时，只能输出候选标签，不直接写入正式标签体系。

### 11.3 质检规则

```text
xy_wap_embed_insight_qa_rule_config
- id
- uid
- rule_code
- rule_name
- description
- severity: low / medium / high
- applicable_scene
- judgment_criteria
- positive_examples_json
- negative_examples_json
- enabled
- created_at
- updated_at
```

用户可配置示例：

```text
是否及时回复
是否使用禁语
是否明确下一步
是否安抚负面情绪
是否解释退款规则
是否承诺无法保障的事项
是否遗漏客户问题
```

第一版质检规则是模型判断依据，不作为自动扣分或绩效结算规则。

风险类判断并入质检规则和代办触发，不再维护独立的租户风险关注配置。

### 11.4 实体和业务词库

```text
xy_wap_embed_insight_entity_dictionary
- id
- uid
- entity_type
- canonical_name
- aliases_json
- attributes_json
- enabled
- include_in_aggregation
- created_at
- updated_at
```

用户可配置示例：

```text
商品别名
SKU 规格
活动名称
优惠券名称
物流词
售后原因
竞品名称
黑名单词/禁语
```

实体词库用于实体抽取、别名归一、风险识别和聚合展示。后续接入订单、PIM、ERP 或物流系统时，可通过 `external_ref_type` 和 `external_ref_id` 绑定外部主数据。

### 11.6 配置生效规则

- 配置变更只影响后续新 analysis run。
- 已生成 snapshot 保留当时使用的配置版本。
- 用户手动重新分析时使用最新配置。
- 配置应参与 analysis input hash 或 config hash，便于判断结果是否过期。
- 低置信结果可以展示为候选，不进入核心统计。

## 12. 洞察结果模型

结果模型采用 snapshot + 维度表，避免未来新增分析维度时改大宽表。

当前有效结果：

```text
xy_wap_embed_session_insight_current
- session_id
- current_snapshot_id
- updated_at
```

结果快照：

```text
xy_wap_embed_session_insight_snapshot
- id
- session_id
- phase: live / final
- status: ready / failed / partial
- source_message_high_watermark
- analysis_version
- model_profile_id
- prompt_version
- rule_version
- created_at
- updated_at
```

分析运行记录：

```text
xy_wap_embed_analysis_run
- id
- session_id
- job_id
- mode: live / final / manual_reanalyze
- analysis_scope
- source_message_from
- source_message_to
- status
- input_token_count
- output_token_count
- cost_estimate
- provider_code
- model_name
- prompt_version
- raw_output_ref
- error_code
- error_message
- created_at
- finished_at
```

摘要：

```text
xy_wap_embed_session_summary
- snapshot_id
- customer_intent
- process_summary
- result_summary
- follow_up
- confidence
```

情绪：

```text
xy_wap_embed_session_sentiment
- snapshot_id
- subject: customer / agent / overall
- sentiment: positive / neutral / negative
- confidence
- evidence_message_ids
```

标签：

```text
xy_wap_embed_session_tag
- snapshot_id
- tag_code
- tag_name
- confidence
- evidence_message_ids
```

质检结果：

```text
xy_wap_embed_session_qa_finding
- snapshot_id
- rule_code
- severity: low / medium / high
- passed
- reason
- confidence
- evidence_message_ids
```

问题解决判定：

```text
xy_wap_embed_session_problem_resolution
- snapshot_id
- problem_detected
- problem_summary
- resolution_status: resolved / unresolved / partially_resolved / no_customer_problem / unknown
- unresolved_reason
- agent_action_summary
- customer_final_state
- confidence
- evidence_message_ids
```

该维度用于服务质检页。模型需要判断逻辑会话中客户是否提出明确问题、诉求或投诉，并判断该问题在当前逻辑会话内是否得到解决。若未解决或部分解决，必须给出判定理由和证据消息。

业务实体：

```text
xy_wap_embed_session_entity
- snapshot_id
- entity_type: product / order / logistics / after_sale / promotion / inventory / channel / customer / service_issue / custom
- entity_value
- normalized_value
- confidence
- evidence_message_ids
- attributes_json
```

实体归一化：

```text
xy_wap_embed_insight_entity
- id
- uid
- entity_type
- canonical_name
- normalized_key
- aliases_json
- external_ref_type nullable
- external_ref_id nullable
- confidence
- first_seen_at
- last_seen_at
- source_message_count
- created_at
- updated_at
```

实体证据：

```text
xy_wap_embed_insight_entity_mention
- id
- uid
- entity_id
- session_id
- conversation_id
- source_message_id
- mention_text
- confidence
- created_at
```

意图：

```text
xy_wap_embed_session_intent
- snapshot_id
- intent_type: pre_sale / transaction / logistics / after_sale / operation / custom
- intent_code
- intent_label
- status: unresolved / in_progress / resolved / unknown
- confidence
- evidence_message_ids
```

风险：

```text
xy_wap_embed_session_risk
- snapshot_id
- risk_level: low / medium / high
- risk_type: complaint / bad_review / refund / return / logistics_delay / unanswered / negative_sentiment / custom
- reason
- confidence
- evidence_message_ids
```

行动项：

```text
xy_wap_embed_session_action_item
- snapshot_id
- action_type: follow_up / supervisor_intervention / refund_progress_check / logistics_check / faq_candidate_review / custom
- title
- priority: low / medium / high
- due_hint
- status: open / dismissed / done
- evidence_message_ids
```

行动项状态允许人工标记。第一版状态变更只影响洞察模块，不回写平台消息、交易系统或客服绩效。

FAQ 机会：

```text
xy_wap_embed_session_faq_candidate
- snapshot_id
- question
- answer_hint
- source: customer_question / repeated_answer / low_confidence_smart_reply / product_detail_gap
- confidence
- evidence_message_ids
```

### 12.1 反向关联与证据链

所有洞察结果必须能反向关联到平台会话和平台消息。会话级链路如下：

```text
dimension record
  -> snapshot_id
  -> xy_wap_embed_session_insight_snapshot.session_id
  -> xy_wap_embed_logical_session.conversation_id
  -> xy_wap_embed_conversation.id
```

消息级证据链路如下：

```text
dimension record
  -> xy_wap_embed_insight_evidence.source_message_id
  -> xy_wap_embed_msg_audit_info.id
```

`evidence_message_ids` 在模型输出和 API 输出中均表示 `xy_wap_embed_msg_audit_info.id`，不能使用模型生成的临时消息编号。

建议新增统一证据表：

```text
xy_wap_embed_insight_evidence
- id
- uid
- snapshot_id
- dimension_type: summary / sentiment / tag / qa / problem_resolution / entity / intent / risk / action_item / faq_candidate
- dimension_record_id
- session_id
- conversation_id
- source_message_id
- evidence_role: primary / supporting / context
- reason
- created_at
```

约束和索引建议：

```text
INDEX(snapshot_id, dimension_type, dimension_record_id)
INDEX(session_id, source_message_id)
INDEX(conversation_id, source_message_id)
INDEX(source_message_id)
```

写入规则：

- 维度结果表负责保存结构化结论。
- `xy_wap_embed_insight_evidence` 负责保存结论和原始消息的多对多证据关系。
- 每条风险、质检、问题解决判定、标签、意图、实体、行动项和 FAQ 机会至少应有一条 primary 证据。
- 摘要可以保存 supporting 或 context 证据，用于展示关键消息来源。
- 如果模型输出的证据 ID 不存在、跨租户或不属于当前 session，该证据应被丢弃，并在 analysis run 中记录校验告警。
- API 可以继续返回 `evidence_message_ids`，但服务端应从 `xy_wap_embed_insight_evidence` 聚合生成。

证据回查 SQL：

```sql
SELECT *
FROM xy_wap_embed_msg_audit_info
WHERE uid = :uid
  AND id IN (:evidence_message_ids)
ORDER BY msgtime ASC, id ASC;
```

前端点击任意洞察结论时，应能打开证据消息上下文，并支持跳转：

```text
/chat?conversationId=...&messageId=...
```

新增分析维度时，应优先新增 analyzer 和维度结果表，而不是改动核心 snapshot 表。

第一版电商意图建议内置以下枚举作为模型提示和筛选维度：

```text
售前：商品咨询、价格咨询、优惠/活动咨询、库存咨询、尺码/规格咨询、对比推荐、购买意向
交易：下单问题、支付问题、改地址、改规格、发票问题、赠品问题
物流：催发货、查物流、延迟配送、快递异常、未收到货、签收异常
售后：退货、退款、换货、补发、质量问题、少件/错发、破损、维修、投诉、差评风险
运营机会：复购机会、加购/收藏意向、团购/批量采购、老客召回、FAQ 沉淀机会、商品说明补充机会
```

## 13. API 草案

第一版公开业务接口继续走 `/api/server/*`。

配置接口：

```text
GET /api/server/insights/sessionization-config
PUT /api/server/insights/sessionization-config
GET /api/server/insights/analysis-policy
PUT /api/server/insights/analysis-policy
GET /api/server/insights/label-configs
PUT /api/server/insights/label-configs
GET /api/server/insights/qa-rule-configs
PUT /api/server/insights/qa-rule-configs
GET /api/server/insights/entity-dictionary
PUT /api/server/insights/entity-dictionary
```

第一版配置数据先由种子数据提供，配置 API 可先支持读取。完整 CRUD 后续迭代。

会话洞察查询：

```text
GET /api/server/insights/sessions
GET /api/server/insights/sessions/:sessionId
POST /api/server/insights/sessions/:sessionId/reanalyze
POST /api/server/insights/jobs/rescan
```

`POST /api/server/insights/jobs/rescan` 支持从指定时间开始重刷历史数据，最小输入为租户上下文和 `from` 时间。该接口只创建异步任务，不在 HTTP 请求内执行分析。

洞察总览：

```text
GET /api/server/insights/summary
GET /api/server/insights/risks
GET /api/server/insights/entities
GET /api/server/insights/intents
```

列表接口支持：

```text
- uid context from auth
- conversation_id
- phase: live / final
- sentiment
- tag_code
- qa_severity
- risk_level
- intent_code
- entity_id
- analyzed_at range
- pagination
```

详情接口返回：

```text
- logical session metadata
- current snapshot
- summary
- sentiment
- tags
- qa findings
- problem resolution
- entities
- intents
- risks
- action items
- faq candidates
- evidence message ids
- evidence message contexts
- source message range
- analysis status
```

第一版 API 不提供自动业务动作接口。重新分析只写入任务表，不在 HTTP 请求内同步调用模型。

证据回查流程：

```text
洞察卡片点击证据
-> 读取 evidence_message_ids
-> 查询 xy_wap_embed_insight_evidence
-> 查询 xy_wap_embed_msg_audit_info
-> 展示证据消息上下文
-> 支持跳转 /chat?conversationId=...&messageId=...
```

## 14. 前端展示范围

第一版页面路径建议为：

```text
/chat/insights
```

页面以只读洞察为主：

- 总览指标卡。
- 优先处理队列。
- 会话洞察列表和详情。
- 摘要、客户诉求、跟进建议。
- 情绪、标签、实体和意图。
- 风险等级和风险原因。
- 质检命中项和证据消息。
- 客户问题识别、解决状态和未解决理由。
- 标签、风险、意图、实体、行动项和 FAQ 的证据消息。
- FAQ 机会。
- 重新分析按钮。
- 分析中、失败、结果过期状态提示。
- 洞察配置入口。

第一版不做复杂报表看板、完整规则引擎和模型参数配置后台。洞察配置入口只覆盖业务语义配置，模型 profile 可先通过后台配置或种子数据维护。

用户配置入口第一版建议覆盖：

```text
洞察策略
自定义标签
质检规则
实体和业务词库
```

洞察策略合并会话结束判定和分析触发配置，对用户呈现为“服务节奏”和“分析时机”。配置页不提供原始 prompt 编辑、模型参数细调，也不开放新增有效消息数阈值、最小分析间隔、最终分析开关、规则降级开关、迟到消息窗口等底层参数。

优先处理队列建议按以下信号排序：

```text
投诉/差评风险
退款/退货待处理
催发货/物流异常
高购买意向未转化
客服长时间未响应
群聊集中反馈问题
```

每条队列项包含：

```text
风险等级
会话名称
客户或群名称
关联实体
主意图
未解决原因
最后客户消息时间
证据摘要
跳转回 /chat 的入口
```

服务质检页路径：

```text
/chat/insights/quality
```

服务质检页围绕“客户问题是否解决”组织，而不是只展示规则命中。核心问题：

```text
今天有多少逻辑会话
其中多少会话客户提出了明确问题
已解决多少
未解决多少
部分解决多少
未解决的是哪些会话
未解决理由是什么
支撑判定的原始消息是什么
```

质检页核心模块：

```text
质检概览
- 逻辑会话总数
- 已分析会话数
- 有客户问题会话数
- 已解决会话数
- 未解决会话数
- 部分解决会话数
- 无明确客户问题会话数

未解决会话列表
- 会话名称
- 客户或群名称
- 客服席位
- 客户问题摘要
- 解决状态
- 未解决理由
- 严重等级
- 证据摘要
- 最后客户消息时间
- 跳转聊天

未解决原因排行
- 客服未回复
- 回复未覆盖客户问题
- 只安抚但未给处理方案
- 要求客户等待但未说明下一步
- 售后/物流/退款进度未确认
- 客户仍表达不满或继续追问

客服维度
- 处理逻辑会话数
- 有问题会话数
- 已解决数
- 未解决数
- 部分解决数
- 未解决率
```

服务质检结果第一版作为主管辅助复核，不作为自动绩效扣分依据。

## 15. 稳定性与可观测性

上线要求：

- worker 独立进程部署，不混入 API server 自动启动。
- 所有后台任务持久化到 MySQL。
- 所有任务具备幂等键。
- 模型调用有超时、重试、限流和失败状态。
- 分析结果写入不影响聊天主链路。
- 支持死信任务查看和手动重跑。
- 保存模型调用耗时、token usage、失败率和成本估算。
- 关键日志包含 `uid`、`conversation_id`、`session_id`、`job_id`、`analysis_run_id`。

模型失败时需要提供降级结果：

- 仍展示会话量、消息量、未读、最后客户消息时间等基础 SQL 指标。
- 用规则识别退款、退货、催发货、投诉、差评、未回复等关键词。
- 页面标记语义洞察状态为 `pending`、`failed` 或 `stale`。
- 已有 snapshot 可继续展示，但需要返回 `generatedAt` 和 `stale=true`。
- 低置信实体和意图可作为候选保留，不进入核心排行。

第一版 worker 单实例即可上线。多实例扩展时增加：

- 全局同步任务 lease lock。
- 分析任务并发上限。
- 租户级模型调用限流。
- Provider 级失败熔断和降级。

## 16. 上线策略

上线分阶段：

1. 通过 uid allowlist 灰度全局开关开通权限，已开启账号进入消息同步和切片，不调用模型。
2. 从指定时间开始重刷少量历史逻辑会话，校验摘要和标签质量。
3. 开启 live analysis，但限制模型并发和每日调用量。
4. 开启 final analysis。
5. 开放只读页面入口。
6. 开放基础配置入口。
7. 收集人工反馈后扩展多媒体摘要、实体抽取和更多质检规则。

上线前评估：

- 抽样 50-100 段真实逻辑会话。
- 人工检查摘要准确率、标签合理性、实体归一化、意图识别、情绪误判、风险误报、质检误报和漏报。
- 人工检查客户问题识别和问题解决状态，重点关注未解决理由是否有证据支撑。
- 统计模型平均耗时、失败率、token 成本和重试比例。
- 观察迟到消息和语音转写异步完成对结果重算的影响。

## 17. 第一版验收标准

第一版完成时应满足：

1. Node worker 能从平台表读取新增消息并写入逻辑会话和消息引用。
2. 系统能按租户配置生成逻辑会话，并支持 open session 的 live analysis。
3. 同一逻辑会话多轮分析后，业务侧只读取一份当前最新 snapshot。
4. 会话关闭后能触发 final analysis。
5. 模型结果能结构化保存摘要、情绪、标签、质检结果、客户问题解决判定、实体、意图、风险、行动项和 FAQ 机会。
6. 每个 AI 结论能追溯到模型、prompt、规则版本、平台会话和平台消息证据。
7. 失败任务可重试，超过次数后进入 dead 状态。
8. 重新分析通过任务异步执行，不阻塞 API 请求。
9. 租户可以配置洞察策略、标签、质检规则和实体词库。
10. 洞察结果只读展示，不自动影响绩效或业务动作。
11. 任意维度结果都能通过 `snapshot_id -> session_id -> conversation_id` 反查到 `xy_wap_embed_conversation.id`。
12. 标签、风险、质检项、问题解决判定、意图、实体、行动项和 FAQ 机会都能通过 `xy_wap_embed_insight_evidence` 反查到至少一条 `xy_wap_embed_msg_audit_info.id` 证据消息。
13. 详情 API 能返回证据消息上下文，且证据消息按 `msgtime ASC, id ASC` 排序。
14. 用户点击任意标签、风险、质检项、问题解决判定、意图、实体、行动项或 FAQ 机会时，可以查看支撑该结论的原始消息，并跳转回 `/chat` 对应会话和消息位置。
15. 服务质检页能统计有客户问题会话数、已解决数、未解决数、部分解决数，并列出未解决会话及判定理由。
16. 待处理行动项支持人工标记 `done` 和 `dismissed`，且状态只影响洞察模块。
17. 系统支持按指定起始时间创建历史重刷任务。
18. 模型输出的证据 ID 如不存在、跨租户或不属于当前逻辑会话，系统会丢弃该证据并在 analysis run 中记录校验告警。
19. 后续新增主体抽取等分析维度时，不需要推翻核心 snapshot、证据链和任务模型。
