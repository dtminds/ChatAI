# 电商客服洞察页设计方案

- 日期：2026-06-01
- 状态：Draft
- 适用范围：`ChatAI` 电商客服洞察页、洞察数据加工链路、后端 API 与前端展示
- 目标页面：`/chat/insights`
- 目标用户：电商商家、客服主管、私域运营、售后负责人

## 1. 背景

`ChatAI` 当前核心入口是 `/chat` 聚合客服工作台，后端通过 `/api/server/*` 暴露工作台接口。现有 MySQL schema 已包含消息、会话、客户、客服席位、群和群成员等清洗后的平台数据：

- `xy_wap_embed_msg_audit_info`：消息明细，包含会话类型、消息内容、消息类型、发送人身份、消息时间、情绪标记等。
- `xy_wap_embed_msg_audit_info_extend`：原始消息内容。
- `xy_wap_embed_conversation`：会话信息，区分私聊和群聊，包含最后消息、未读数、席位、客户或群标识。
- `xy_wap_embed_contact`：客户基础信息。
- `xy_wap_embed_customer_bind_relation`：客户与成员的绑定关系。
- `xy_wap_embed_group_seat`：群聊信息。
- `xy_wap_embed_group_member`：群成员信息。
- `xy_wap_embed_user_seat`：客服席位信息。

本设计借鉴 WeChat Radar 的“原始消息 -> 结构化特征 -> 聚合事实 -> 看板”的思路，但不沿用其技术社区话题体系。`ChatAI` 的客户是电商商家，洞察页必须围绕商品、订单、物流、售后、优惠、库存、购买意向、投诉风险和客服跟进展开。

当前 schema 中没有看到订单、商品、物流或售后工单主数据表。因此首期不依赖外部交易系统，将商品、订单、物流、售后等作为从聊天内容中抽取的业务实体。后续如果接入订单/PIM/ERP，可在实体表中补充外部系统 ID。

## 2. 目标与非目标

### 2.1 目标

第一期洞察页需要支持：

1. 让客服主管快速看到今日最需要处理的投诉、退款、退货、催发货和高购买意向会话。
2. 识别被频繁咨询或集中投诉的商品，区分“热度高”和“问题多”。
3. 汇总客户意图，包括售前咨询、交易问题、物流问题、售后问题和运营机会。
4. 将模型分析结果沉淀为可复用事实，避免不同看板重复分析同一段对话。
5. 每条洞察必须能回溯到原始消息证据，支持跳转回 `/chat` 对应会话。
6. 在模型分析尚未完成或失败时，仍能用 SQL 和规则展示基础统计与风险队列。
7. 遵守现有平台表边界：`xy_wap_embed_*` 平台只读表不由 Node 后端直接写入，洞察结果写入应用自有表。

### 2.2 非目标

第一期不做：

- 订单系统、ERP、PIM 或物流平台的实时联动。
- 自动退款、自动退货、自动改地址、自动发券等写交易动作。
- 客服绩效结算或薪酬考核。
- 跨店铺集团级 BI 大屏。
- 自动训练知识库或自动发布商品说明。
- 完整客户生命周期和会员分层运营。

## 3. 核心产品定位

洞察页不是聊天记录检索，也不是泛 BI 报表，而是电商客服的“今日经营信号台”：

```text
今天哪些客户要优先处理？
哪些商品正在被集中问或集中投诉？
哪些售后问题正在升温？
哪些客户有购买意向但还没转化？
哪些问题应该沉淀为 FAQ、话术或商品详情页说明？
```

页面信息层级应围绕行动优先级组织，而不是围绕数据库表组织。

## 4. 数据分层设计

### 4.1 ODS 原始层

来源为现有平台清洗表：

```text
xy_wap_embed_msg_audit_info
xy_wap_embed_msg_audit_info_extend
xy_wap_embed_conversation
xy_wap_embed_contact
xy_wap_embed_customer_bind_relation
xy_wap_embed_group_seat
xy_wap_embed_group_member
xy_wap_embed_user_seat
```

这些表是平台事实源，Node 后端按现有约定只读。

### 4.2 DWD 明细层

逻辑层，不一定首期落物理表。该层将平台表字段统一为洞察加工输入：

```text
message_id
conversation_id
chat_type: single | group
seat_id
third_user_id
third_external_user_id
third_group_id
sender_type: customer | agent | system
sender_id
sender_name
content_type
plain_text
msgtime
is_revoked
sentiment_source_value
```

处理规则：

- 仅对 `text`、`link`、`weapp`、`mixed`、`image OCR 文本`、`voice 转写文本` 等可理解内容进入语义分析。
- `revoke`、系统提示、红包、表情、纯图片无 OCR 文本等默认不进入模型分析。
- 群聊中需区分客服成员和客户成员；现有 `mapSenderType` 已有类似逻辑，可复用。

### 4.3 DWM 特征层

对消息或会话窗口抽取结构化特征：

```text
entities
intents
sentiment
risk_level
risk_reasons
action_items
topic_candidates
faq_candidates
evidence_message_ids
```

该层是模型调用的主要产物，应持久化并带版本。

### 4.4 DWS 聚合层

按日、商品、意图、售后类型、客服席位、会话、客户、群聊聚合：

```text
daily summary
product summary
intent summary
after-sale summary
risk queue
customer opportunity summary
group insight summary
faq opportunity summary
```

### 4.5 ADS 应用层

服务洞察页：

```text
/chat/insights
/chat/insights/products
/chat/insights/after-sales
/chat/insights/risks
/chat/insights/intents
```

首期可以只做单页多模块，详情通过抽屉或右侧面板承载。

## 5. 电商实体体系

### 5.1 实体类型

首期实体类型：

| 类型 | 说明 | 示例 |
| --- | --- | --- |
| `product` | 商品、SKU、套装、规格 | 白色羽绒服、L 码、三件套 |
| `order` | 订单相关标识 | 订单号、拍下时间、支付状态 |
| `logistics` | 物流和配送 | 顺丰、运单号、未揽收、签收 |
| `after_sale` | 售后事项 | 退货、退款、换货、补发、维修 |
| `promotion` | 优惠和活动 | 优惠券、满减、直播价、赠品 |
| `inventory` | 库存和补货 | 缺货、预售、补货、到货提醒 |
| `channel` | 交易或触达渠道 | 私域群、直播间、小程序、抖音 |
| `customer` | 客户身份和客户线索 | 高意向客户、投诉客户、复购客户 |
| `service_issue` | 服务问题 | 未回复、回复慢、答非所问 |

### 5.2 实体归一化

模型生成的展示名不能作为聚合主键。实体需要稳定字段：

```text
entity_id
tenant uid
platform
entity_type
canonical_name
normalized_key
aliases
external_ref_type
external_ref_id
confidence
first_seen_at
last_seen_at
source_message_count
created_at
updated_at
```

示例：

```text
别名：
- 白色羽绒服 L码
- 那件白羽绒 L
- 直播间白鸭绒外套

归一实体：
- entity_type: product
- canonical_name: 白色羽绒服
- normalized_key: product:white-down-jacket
- attributes: color=白色, size=L, channel=直播间
```

### 5.3 别名合并

首期合并策略：

1. 规则优先：订单号、运单号、金额、手机号、规格词用正则抽取。
2. 别名表辅助：人工或模型识别出的商品别名写入 `chat_insight_entity_alias`。
3. 模型归一：同一批候选实体由模型输出 `normalized_key` 和 `canonical_name`。
4. 人工修正预留：后续可在管理页把多个实体合并。

## 6. 电商意图体系

### 6.1 售前意图

- 商品咨询
- 价格咨询
- 优惠/活动咨询
- 库存咨询
- 尺码/规格咨询
- 功能/材质/效果咨询
- 对比推荐
- 购买意向
- 催拍/犹豫

### 6.2 交易意图

- 下单问题
- 支付问题
- 改地址
- 改规格
- 发票问题
- 赠品问题

### 6.3 物流意图

- 催发货
- 查物流
- 延迟配送
- 快递异常
- 未收到货
- 已签收但客户未收到

### 6.4 售后意图

- 退货
- 退款
- 换货
- 补发
- 质量问题
- 少件/错发
- 破损
- 维修
- 投诉
- 差评风险

### 6.5 运营机会

- 复购机会
- 加购/收藏意向
- 团购/批量采购
- 老客召回
- FAQ 沉淀机会
- 商品卖点优化机会
- 商品详情页补充机会

## 7. 模型调用设计

### 7.1 原则

不要让“话题、实体、意图、情绪、风险、行动项”分别重复调用同一段对话。推荐以“会话 + 时间窗口”为单位，一次模型调用输出多类结构化结果。

### 7.2 分析窗口

首期建议两种窗口：

1. 消息增量窗口：按会话取最近新增客户消息和必要上下文，用于实时风险和待跟进。
2. 日级汇总窗口：按自然日或最近 24 小时聚合会话特征，用于日报和趋势。

窗口输入应限制长度：

- 私聊：最近 20-50 条相关消息。
- 群聊：先用规则筛出商品、售后、负面、@客服、高互动片段，再送模型。
- 单次输入必须包含稳定 message id，模型输出必须引用这些 id。

### 7.3 推荐模型输出

```json
{
  "conversation_id": "123",
  "window_start": 1780243200000,
  "window_end": 1780329599999,
  "entities": [
    {
      "type": "product",
      "canonical_name": "白色羽绒服",
      "normalized_key": "product:white-down-jacket",
      "aliases": ["白鸭绒外套", "白色羽绒服 L码"],
      "attributes": {
        "color": "白色",
        "size": "L"
      },
      "confidence": 0.86,
      "evidence_message_ids": ["m1", "m3"]
    }
  ],
  "intents": [
    {
      "type": "after_sale.refund",
      "label": "退款",
      "status": "unresolved",
      "confidence": 0.92,
      "evidence_message_ids": ["m3"]
    }
  ],
  "sentiment": {
    "label": "negative",
    "score": -0.72,
    "evidence_message_ids": ["m3"]
  },
  "risk": {
    "level": "high",
    "reasons": ["客户明确表达投诉", "售后诉求未解决"],
    "evidence_message_ids": ["m3"]
  },
  "action_items": [
    {
      "type": "follow_up",
      "title": "确认退款进度并回复客户",
      "priority": "high",
      "due_hint": "today",
      "evidence_message_ids": ["m3"]
    }
  ],
  "faq_candidates": [
    {
      "question": "白色羽绒服是否支持七天无理由退货",
      "answer_hint": "需要结合店铺售后政策确认",
      "evidence_message_ids": ["m1", "m2"]
    }
  ]
}
```

### 7.4 缓存与版本

每次分析结果必须带：

```text
analyzer_version
prompt_version
model
content_hash
source_message_min_id
source_message_max_id
source_message_count
generated_at
```

缓存 key：

```text
uid + platform + conversation_id + window_start + window_end + content_hash + analyzer_version
```

同一窗口没有新增消息且分析版本未变时，不重复调用模型。

### 7.5 模型失败降级

模型不可用时：

- 仍展示消息量、会话量、未读、负面情绪字段、已有 `sentiment` 字段统计。
- 用规则识别售后关键词、退款关键词、物流关键词、投诉关键词。
- 页面标记“语义洞察待生成”，不阻塞基础看板。

## 8. 建议新增表

表名为建议，最终可按项目数据库命名规范调整。

### 8.1 `chat_insight_job_run`

记录洞察任务运行状态。

```text
id
uid
platform
job_type
scope_type
scope_id
window_start
window_end
status
analyzer_version
started_at
finished_at
error_message
processed_message_count
created_at
updated_at
```

### 8.2 `chat_insight_message_feature`

消息或消息窗口级特征。

```text
id
uid
platform
conversation_id
chat_type
message_id
msg_audit_id
msgtime
sender_type
plain_text_hash
feature_json
analyzer_version
confidence
created_at
updated_at
```

### 8.3 `chat_insight_conversation_fact`

会话窗口级事实。

```text
id
uid
platform
conversation_id
chat_type
seat_id
third_external_userid
third_group_id
window_start
window_end
primary_intent
intent_status
sentiment_label
sentiment_score
risk_level
risk_reasons_json
action_items_json
summary
evidence_message_ids_json
content_hash
analyzer_version
created_at
updated_at
```

### 8.4 `chat_insight_entity`

业务实体。

```text
id
uid
platform
entity_type
canonical_name
normalized_key
attributes_json
external_ref_type
external_ref_id
confidence
first_seen_at
last_seen_at
source_message_count
created_at
updated_at
```

唯一约束建议：

```text
uid + platform + entity_type + normalized_key
```

### 8.5 `chat_insight_entity_alias`

实体别名。

```text
id
uid
platform
entity_id
alias
alias_hash
source
confidence
created_at
updated_at
```

### 8.6 `chat_insight_entity_mention`

实体与消息/会话证据关系。

```text
id
uid
platform
entity_id
conversation_id
message_id
msg_audit_id
msgtime
mention_text
confidence
created_at
```

### 8.7 `chat_insight_topic`

电商主题聚合。这里的主题不是技术话题，而是经营问题，例如“白色羽绒服退款增多”“直播间赠品漏发”。

```text
id
uid
platform
topic_type
canonical_key
display_title
summary
status
risk_level
entity_ids_json
intent_types_json
first_seen_at
last_seen_at
message_count
conversation_count
customer_count
created_at
updated_at
```

### 8.8 `chat_insight_topic_evidence`

主题证据。

```text
id
uid
platform
topic_id
conversation_id
message_id
msg_audit_id
score
reason
created_at
```

### 8.9 `chat_insight_daily_stats`

洞察页汇总缓存。

```text
id
uid
platform
date
scope_type
scope_id
metric_key
metric_value
dimension_json
generated_at
created_at
updated_at
```

## 9. 洞察页信息架构

### 9.1 顶部筛选

筛选项：

- 时间范围：今日、昨日、近 7 天、近 30 天、自定义。
- 会话类型：全部、私聊、群聊。
- 客服席位。
- 商品实体。
- 意图类型。
- 风险等级。
- 情绪。
- 是否未解决。

### 9.2 总览指标

第一屏指标：

- 今日会话数。
- 客户消息数。
- 售后会话数。
- 高风险会话数。
- 高购买意向客户数。
- 待跟进事项数。
- 负面情绪会话占比。
- 平均未响应时长，如果当前字段足够支撑。

### 9.3 优先处理队列

按优先级展示：

- 投诉/差评风险。
- 退款/退货待处理。
- 催发货/物流异常。
- 高购买意向未转化。
- 客服长时间未响应。
- 群聊集中反馈问题。

每条队列项包含：

```text
风险等级
会话名称
客户或群名称
关联商品
主意图
未解决原因
最后客户消息时间
证据摘要
跳转回 /chat 的入口
```

### 9.4 商品洞察

模块：

- 商品咨询热度排行。
- 商品负面反馈排行。
- 商品售后问题排行。
- 商品购买意向排行。
- 商品 FAQ 机会。

商品行字段：

```text
商品名
咨询客户数
咨询会话数
提及次数
购买意向数
售后问题数
负面反馈数
风险会话数
典型问题
```

### 9.5 售后洞察

模块：

- 退货、退款、换货、补发趋势。
- 质量问题类型排行。
- 物流异常排行。
- 售后高风险会话。
- 需要主管介入的会话。

### 9.6 意图洞察

模块：

- 售前、交易、物流、售后、运营机会占比。
- 意图趋势。
- 意图对应的典型会话。
- 未解决意图列表。

### 9.7 群聊洞察

模块：

- 活跃群排行。
- 群内商品讨论热度。
- 群内集中投诉或售后问题。
- 群内高意向客户。
- 群聊 FAQ 和运营机会。

### 9.8 知识库机会

模块：

- 高频问题。
- 客服重复回答问题。
- 智能回复低置信或未覆盖问题。
- 可沉淀 FAQ。
- 商品说明页需要补充的信息。

## 10. 关键指标定义

### 10.1 会话级指标

```text
chat_type
customer_message_count
agent_message_count
last_customer_message_time
last_agent_reply_time
unanswered_duration
is_unresolved
primary_intent
risk_level
sentiment_label
related_entity_ids
related_product_ids
related_after_sale_types
```

### 10.2 商品级指标

```text
mention_count
conversation_count
customer_count
purchase_intent_count
after_sale_count
negative_feedback_count
risk_conversation_count
faq_candidate_count
top_issue_types
```

### 10.3 售后级指标

```text
after_sale_conversation_count
refund_count
return_count
exchange_count
reship_count
quality_issue_count
logistics_issue_count
complaint_risk_count
timeout_count
```

### 10.4 客服级指标

```text
handled_conversation_count
pending_reply_count
after_sale_handled_count
high_risk_conversation_count
average_response_duration
unresolved_conversation_count
negative_sentiment_conversation_count
```

客服级指标首期仅作为主管辅助观察，不作为绩效结算依据。

## 11. API 设计

公开业务接口延续 `/api/server/*`。

### 11.1 总览

```text
GET /api/server/insights/summary
```

查询参数：

```text
from
to
mode=single|group|all
seatId
entityId
intent
riskLevel
```

返回：

```text
overviewCards
priorityQueue
productHighlights
afterSaleHighlights
intentBreakdown
riskSummary
faqOpportunities
generatedAt
```

### 11.2 商品洞察

```text
GET /api/server/insights/products
```

返回商品列表、指标、典型问题和证据入口。

### 11.3 售后洞察

```text
GET /api/server/insights/after-sales
```

返回售后类型趋势、问题排行和风险会话。

### 11.4 意图洞察

```text
GET /api/server/insights/intents
```

返回意图分布、趋势和代表会话。

### 11.5 风险队列

```text
GET /api/server/insights/risks
```

支持分页、风险等级筛选、意图筛选、商品筛选。

### 11.6 会话事实

```text
GET /api/server/insights/conversations/:conversationId/facts
```

返回该会话的实体、意图、风险、行动项、证据消息。

### 11.7 重扫任务

```text
POST /api/server/insights/jobs/rescan
```

用于管理员触发指定时间范围重算。

## 12. 前端设计约束

新增页面建议路径：

```text
apps/web/src/pages/chat/insights
```

路由：

```text
/chat/insights
```

前端约定：

- 请求必须通过 `apps/web/src/lib/request.ts`。
- 页面 API 适配层放在 `apps/web/src/pages/chat/insights/api`。
- 共享 DTO 放入 `packages/contracts`，不要在 web/backend 双写类型。
- UI 优先使用 `apps/web/src/components/ui` 中已有 shadcn 基础组件。
- 图标继续使用 Hugeicons，不引入 Lucide。
- 页面文案使用电商客服语言，不使用“雷达”“技术话题”“工具链”等偏技术社区语义。

## 13. 后端设计约束

建议新增模块：

```text
apps/backend/src/modules/insights
```

模块职责：

- 洞察 API routes。
- 洞察查询 service。
- 洞察聚合 repository。
- 模型分析 job service。
- 实体归一化 service。

数据访问约束：

- 平台 `xy_wap_embed_*` 表只读。
- 洞察应用表由 Node 后端写入。
- SQL 查询通过 Kysely，不在 route 中散落 SQL。
- 长耗时模型任务不应阻塞普通 GET 请求。

## 14. 处理流程

### 14.1 增量分析流程

```text
读取最近新增消息
-> 标准化为洞察输入
-> 规则预筛
-> 按会话窗口组装上下文
-> 调用模型抽取多类结构化事实
-> 实体归一化
-> 写入 conversation_fact / entity / mention / topic
-> 更新 daily_stats
```

### 14.2 日级聚合流程

```text
读取当日 conversation_fact
-> 按商品、意图、售后、风险、客服、群聊聚合
-> 写入 daily_stats
-> 洞察页读取 summary
```

### 14.3 证据回查流程

```text
洞察卡片点击证据
-> 读取 evidence_message_ids
-> 查询 msg_audit_info
-> 显示上下文
-> 支持跳转 /chat?conversationId=...
```

## 15. 错误处理与降级

- 模型调用失败：记录 `chat_insight_job_run`，页面展示基础 SQL 统计。
- 分析结果过期：返回 `generatedAt` 和 `stale=true`，提示用户数据仍在更新。
- 实体归一化低置信：保留候选实体，但在 UI 中不进入核心排行，或标记为“待确认”。
- 平台表缺字段或数据异常：不在应用层回写修复，记录错误并暴露诊断日志。
- 长时间任务：必须异步执行，接口返回任务状态，不阻塞请求。

## 16. 测试策略

### 16.1 Contracts

- 新增 insights DTO schema。
- 验证 summary、product、after-sales、risk response 的必填字段。

### 16.2 Backend

- repository 查询参数过滤测试。
- 实体归一化测试。
- 模型输出解析和容错测试。
- 规则降级识别测试，例如退款、退货、催发货、投诉关键词。
- 权限测试：用户只能看到自己权限范围内的席位、会话和客户。

### 16.3 Web

- 洞察页加载、筛选、空状态、错误状态。
- 风险队列点击跳转。
- 商品洞察列表展示。
- 证据抽屉展示。
- 不断言易变视觉 class，仅断言用户可感知行为。

## 17. MVP 范围

第一期只交付：

1. `/chat/insights` 单页。
2. 总览指标卡。
3. 优先处理队列。
4. 商品咨询和负面反馈排行。
5. 售后问题排行。
6. 意图分布。
7. 风险会话列表。
8. 证据消息抽屉或跳转。
9. 洞察结果缓存表。
10. 基础重扫任务接口。

暂缓：

- 独立商品详情页。
- 独立客户画像页。
- 人工实体合并管理页。
- 外部订单系统联动。
- 自动生成知识库文章。

## 18. 验收标准

1. 客服主管能在 1 分钟内看到今天最需要处理的售后和风险会话。
2. 商品排行同时展示咨询热度和负面反馈，不能只按提及次数排序。
3. 每条模型洞察都能回溯到原始消息证据。
4. 同一商品的不同叫法能归并到同一商品实体，首期至少支持别名合并。
5. 同一会话不会因为打开多个看板而重复调用模型。
6. 模型不可用时，页面仍能展示基础 SQL/规则统计。
7. 平台只读表不被 Node 后端写入。
8. 新 API 走 `/api/server/*`，新 DTO 放入 `packages/contracts`。
9. 前端请求从 `request.ts` 和页面适配层发起，不在组件中裸写 `fetch`。
10. 页面文案贴合电商客服场景，避免技术社区话题语言。

## 19. 推荐实施顺序

1. 定义 contracts DTO。
2. 建洞察应用表。
3. 实现只读标准化查询，先不接模型。
4. 实现规则降级版 summary、risk、after-sales。
5. 接入模型抽取 conversation facts。
6. 接入实体归一化和商品排行。
7. 实现 `/chat/insights` 页面。
8. 加入重扫任务和任务状态。
9. 补测试与构建验证。

## 20. 待确认问题

以下问题不阻塞 MVP 设计，但实现前需要产品或业务确认：

1. 是否已有真实商品、订单、售后、物流系统 API 可接入。
2. 客服主管是否需要跨全部席位查看，还是只能看自己授权席位。
3. `xy_wap_embed_msg_audit_info.sentiment` 的生成逻辑和可信度。
4. 语音转写和图片 OCR 文本是否已经稳定写回消息内容或扩展表。
5. 风险等级是否需要和现有客服 SOP 绑定。

