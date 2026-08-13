# Java Workflow Interest Reader 实施契约

- 日期：2026-08-13
- 状态：Ready for Joint Review
- 适用对象：Java 平台团队、DBA、测试与运维
- 目标：让 Java 团队独立实现 Workflow 事件预过滤、Event Outbox 和 Pulsar Producer
- 上位方案：[营销 Workflow 当前实现与 Java 协作落地方案](./2026-08-05-marketing-workflow-java-integration-design.md)

本文只描述 Java 需要遵守的跨服务契约。Java 不需要理解 Node 的画布、Compiler、Revision 内容、Run 或 Task。

## 1. 核心结论

首批 Workflow 入口事件：

```text
contact.friend_added
contact.tag_added
message.received
```

双方已确认：

1. 本期一个 Workflow 只能选择一个 Start Event。
2. Trigger Binding 按 Revision 和 Event Type 持久化；本期因 Start Event 单选，当前 Revision 实际只有一条 Binding。
3. 每租户最多允许 50 个 active Workflow；本期 Java 每次最多读取 50 条静态 Binding。
4. Java 按 `uid + eventType` 查询当前有效 Binding，再解析 `filter_spec_json` 在内存中预匹配。
5. Java 不使用 JSON SQL 条件，不维护 Match 派生表，也不需要展开关键词或 ID 列表。
6. `contact.friend_added`、`contact.tag_added` 是企微源事件，ChatAI SOP 与 WeCom SOP 订阅同一份业务事实。
7. 一个业务事实即使命中多个 Workflow，也只写一条 Java Event Outbox，并只投递一条 Entry Event。
8. Node 收到事件后仍按同一份 Binding Filter 执行最终权威匹配，并为每个命中的 Workflow 创建 Run。
9. `message.received` 的静态 Start 兴趣与动态 Wait Event 兴趣任一命中，就必须投递事件。
10. 查询、JSON 解析或未知规则处理失败时必须 fail-open，继续投递事件。

## 2. 统一字段与身份关系

| 业务对象 | 公共 JSON / DTO 字段名 | 类型 | 用途 |
| --- | --- | --- | --- |
| 企微成员 | `workUserId` | positive safe integer | 添加好友、打标签的来源维度 |
| ChatAI 席位 | `seatId` | positive safe integer | 新消息来源维度 |
| 企微好友 | `externalUserId` | non-empty string，最长 128 | WeCom SOP Subject ID |
| ChatAI 席位好友 | `thirdExternalUserId` | non-empty string，最长 128 | ChatAI SOP Subject ID |
| 企微标签 | `tagId` | positive safe integer | 打标签精确匹配维度 |
| 好友来源 | `sourceId` | non-empty string，最长 128 | 添加好友来源筛选 |
| 消息 | `messageId` | positive safe integer | 新消息业务事实标识 |
| 消息正文 | `text` | string，最长 1000 | 新消息关键词预匹配 |

公共 JSON payload、Java DTO 和 TypeScript 类型使用 camelCase；只有 MySQL 物理列使用 snake_case。

已确认关系：

```text
(uid, seatId) -> 唯一 workUserId
(uid, workUserId) -> 0 或 1 个有效 seatId
```

Java 生成企微事件时，`workUserId`、`externalUserId` 必须存在。如果该企微成员存在有效 ChatAI 席位和好友映射，同时提供 `seatId`、`thirdExternalUserId`。ChatAI 映射缺失不影响事件被 WeCom SOP 使用。

Node 根据命中的 Binding 选择 Run Subject：

```text
subjectType = wecom_contact  -> subjectId = externalUserId
subjectType = chatai_contact -> subjectId = thirdExternalUserId
```

## 3. Entry Event DTO

### 3.1 公共信封

```json
{
  "schemaVersion": 1,
  "payloadVersion": 1,
  "eventId": "contact.friend_added:789",
  "eventType": "contact.friend_added",
  "uid": 10001,
  "occurredAt": "2026-08-11T02:30:15.000Z",
  "source": "wecom",
  "payload": {}
}
```

公共约束：

| 字段 | 约束 |
| --- | --- |
| `schemaVersion` | 当前固定为 `1` |
| `payloadVersion` | 当前三个事件固定为 `1` |
| `eventId` | 1-128 字符，租户内稳定唯一 |
| `eventType` | 只允许本文三个事件类型 |
| `uid` | positive safe integer |
| `occurredAt` | UTC RFC 3339 毫秒格式 |
| `source` | `wecom` 或 `chatai` |
| `payload` | 必须通过对应事件的 payload 校验 |

同一业务事实重试、Outbox 重发和 Pulsar 重投时，`eventId` 和事件内容必须保持不变。

### 3.2 添加好友

```json
{
  "schemaVersion": 1,
  "payloadVersion": 1,
  "eventId": "contact.friend_added:789",
  "eventType": "contact.friend_added",
  "uid": 10001,
  "occurredAt": "2026-08-11T02:30:15.000Z",
  "source": "wecom",
  "payload": {
    "workUserId": 201,
    "externalUserId": "wm_external_123",
    "sourceId": "qr-code-1",
    "seatId": 101,
    "thirdExternalUserId": "chatai_external_456"
  }
}
```

必填：`workUserId`、`externalUserId`。可选：`sourceId`、`seatId`、`thirdExternalUserId`。

### 3.3 打标签

```json
{
  "schemaVersion": 1,
  "payloadVersion": 1,
  "eventId": "contact.tag_added:790",
  "eventType": "contact.tag_added",
  "uid": 10001,
  "occurredAt": "2026-08-11T02:31:15.000Z",
  "source": "wecom",
  "payload": {
    "workUserId": 201,
    "externalUserId": "wm_external_123",
    "tagId": 301,
    "seatId": 101,
    "thirdExternalUserId": "chatai_external_456"
  }
}
```

必填：`workUserId`、`externalUserId`、`tagId`。当前一条事件只表达一个 `tagId`。

### 3.4 收到消息

```json
{
  "schemaVersion": 1,
  "payloadVersion": 1,
  "eventId": "message.received:938271",
  "eventType": "message.received",
  "uid": 10001,
  "occurredAt": "2026-08-11T02:32:15.000Z",
  "source": "chatai",
  "payload": {
    "seatId": 101,
    "workUserId": 201,
    "thirdExternalUserId": "chatai_external_456",
    "externalUserId": "wm_external_123",
    "messageId": 938271,
    "text": "我想了解一下活动详情"
  }
}
```

必填：`seatId`、`workUserId`、`thirdExternalUserId`、`messageId`。`externalUserId`、`text` 可选。文本消息应提供归一化后的 `text`；非文本消息可以省略。

## 4. Java 只读数据库契约

Java 只读取以下三张 Workflow 表：

```text
xy_wap_embed_workflow_definition
xy_wap_embed_workflow_trigger_binding
xy_wap_embed_workflow_event_subscription
```

Java 不读取 Draft、Revision JSON、Execution Spec、Run 或 Task。Java 可以读取 Trigger Binding 的 `filter_spec_json`，但只能按本文冻结的事件 Filter 结构解析。

### 4.1 Definition

Interest Reader 使用：

```text
uid
id
published_revision
biz_status
runtime_status
```

静态 Start 只认 `biz_status = 1` 且 `runtime_status = 'active'`。

### 4.2 Trigger Binding

Interest Reader 使用：

```text
id
uid
workflow_id
revision
subject_type
event_type
filter_spec_json
status
```

Node 发布新 Revision 时，将旧 Binding 标记失效，并批量写入新 Revision 的 Binding。数据库按 `uid + workflow_id + revision + subject_type + event_type` 防止同一 Revision 的同一事件重复写入，不限制一个 Workflow 只能有一条 Binding。

有效 Binding 必须满足：

```text
binding.status = 1
definition.published_revision = binding.revision
definition.biz_status = 1
definition.runtime_status = active
```

`subject_type` 编码：

| 编码 | 领域值 |
| --- | --- |
| `1` | `chatai_contact` |
| `2` | `wecom_contact` |
| `3` | `miniapp_member`，本期不可用 |

Node 保证索引：

```text
(uid, event_type, status, workflow_id, revision, id)
```

### 4.3 Event Subscription

当前只用于 `message.received` Wait Event。Java 使用：

```text
uid
workflow_id
event_type
subject_type
subject_id
seat_id
status
effective_from
expires_at
collect_until
```

### 4.4 权限

Java 数据库账号只授予上述三张表的 `SELECT`，不得获得 INSERT、UPDATE 或 DELETE 权限。所有 SQL 收敛在单一 `WorkflowInterestReader` DAO 中。

## 5. 静态 Start Binding 查询

三个事件共用一条候选查询，只替换 `:eventType`：

```sql
SELECT
  binding.id,
  binding.workflow_id,
  binding.revision,
  binding.subject_type,
  binding.event_type,
  binding.filter_spec_json
FROM xy_wap_embed_workflow_trigger_binding AS binding
INNER JOIN xy_wap_embed_workflow_definition AS definition
  ON definition.uid = binding.uid
 AND definition.id = binding.workflow_id
 AND definition.published_revision = binding.revision
WHERE binding.uid = :uid
  AND binding.event_type = :eventType
  AND binding.status = 1
  AND definition.biz_status = 1
  AND definition.runtime_status = 'active'
ORDER BY binding.id
LIMIT 50;
```

Backend 在启用或恢复前通过普通 `COUNT(*)` 检查每租户最多 50 个 active Workflow。这是防止正常产品操作超限的轻量护栏，不为极端并发请求增加租户级锁；本期单事件约束下，正常状态最多返回 50 条 Binding。

Java 不在 SQL 中拆解 JSON。查询返回后逐条解析 Filter 并在内存判断；任意一条匹配即得到静态 Start 兴趣。

## 6. Filter JSON 与内存匹配

### 6.1 添加好友

```json
{
  "eventType": "contact.friend_added",
  "workUserIds": [201, 202],
  "sourceIds": ["qr-code-1", "store-2"],
  "entryPolicy": { "mode": "never" }
}
```

匹配规则：

```text
workUserIds contains payload.workUserId
AND
(
  sourceIds is empty
  OR sourceIds contains payload.sourceId
)
```

`sourceIds=[]` 表示任意来源。`sourceIds` 非空而事件缺少 `sourceId` 时不匹配。

### 6.2 打标签

```json
{
  "eventType": "contact.tag_added",
  "workUserIds": [201, 202],
  "tagIds": [301, 302],
  "entryPolicy": { "mode": "never" }
}
```

匹配规则：

```text
workUserIds contains payload.workUserId
AND tagIds contains payload.tagId
```

### 6.3 收到消息

```json
{
  "eventType": "message.received",
  "seatIds": [101, 102],
  "keywords": ["价格", "优惠"],
  "entryPolicy": { "mode": "never" }
}
```

匹配规则：

```text
seatIds contains payload.seatId
AND
(
  keywords is empty
  OR payload.text contains any keyword
)
```

`keywords=[]` 表示任意新消息。关键词只支持“包含任意一个”，不支持 `all`、正则、分词或大小写规则。`keywords` 非空而事件缺少 `text` 时不匹配。

### 6.4 未知 Filter

以下情况不能返回 `NOT_INTERESTED`：

- JSON 解析失败。
- `eventType` 与查询事件不一致。
- 缺少当前契约要求的字段。
- 出现未知规则或无法可靠判断的值。

这些情况返回 `UNKNOWN`，由调用方 fail-open 投递事件，并记录告警。

## 7. 动态 Wait Event 兴趣

`message.received` 还需要查询动态 Wait Event Subscription：

```sql
SELECT 1
FROM xy_wap_embed_workflow_event_subscription AS subscription
INNER JOIN xy_wap_embed_workflow_definition AS definition
  ON definition.uid = subscription.uid
 AND definition.id = subscription.workflow_id
WHERE subscription.uid = :uid
  AND subscription.subject_type = 1
  AND subscription.event_type = 'message.received'
  AND subscription.subject_id = :thirdExternalUserId
  AND (subscription.seat_id IS NULL OR subscription.seat_id = :seatId)
  AND (
    (subscription.status = 'waiting'
      AND subscription.effective_from <= :occurredAt
      AND subscription.expires_at > :occurredAt)
    OR
    (subscription.status = 'triggered'
      AND subscription.collect_until > CURRENT_TIMESTAMP)
  )
  AND definition.biz_status = 1
  AND definition.runtime_status IN ('active', 'paused')
LIMIT 1;
```

消息事件最终判断：

```text
static_start_interested OR dynamic_wait_interested
```

Start 的关键词不限制 Wait Event。即使所有静态 Start Filter 都不匹配，只要存在有效 Wait Subscription，Java 仍必须投递该消息事件。

## 8. 返回模型与 fail-open

```java
enum WorkflowInterestDecision {
    INTERESTED,
    NOT_INTERESTED,
    UNKNOWN
}
```

| 结果 | 含义 |
| --- | --- |
| `INTERESTED` | 至少一个静态 Binding 或动态 Subscription 匹配 |
| `NOT_INTERESTED` | 查询和全部 Filter 解析成功，确认没有兴趣 |
| `UNKNOWN` | 查询、解析或规则处理失败，无法可靠判断 |

伪代码：

```java
WorkflowInterestDecision decide(WorkflowEntryEvent event) {
    try {
        List<BindingRow> bindings = bindingDao.listActive(event.uid(), event.eventType(), 50);
        boolean staticInterested = bindings.stream()
            .map(BindingRow::filterSpecJson)
            .map(filterParser::parse)
            .anyMatch(filter -> matcher.matches(filter, event.payload()));

        boolean dynamicInterested = event.eventType().equals("message.received")
            && subscriptionDao.existsActiveMessageWait(event);

        return staticInterested || dynamicInterested
            ? WorkflowInterestDecision.INTERESTED
            : WorkflowInterestDecision.NOT_INTERESTED;
    } catch (Exception error) {
        return WorkflowInterestDecision.UNKNOWN;
    }
}
```

以下情况返回 `UNKNOWN` 并继续投递：SQL 超时、数据库连接异常、JSON 解析失败、未知 Filter、Reader 熔断或其它无法可靠判断的错误。

缺少 Entry Event 必填字段、无法生成稳定 `eventId` 或无法序列化合法信封属于 Mapper 错误，不应投递非法事件。

## 9. Java 事件生产流程

```text
Java 业务事务形成业务事实
  -> 生成稳定 eventId
  -> 映射 Entry Event
  -> Interest Reader 查询
  -> INTERESTED / UNKNOWN：同一事务写 Java Event Outbox
  -> NOT_INTERESTED 且 enforce：不写 Workflow Event Outbox
  -> 提交业务事务
  -> Outbox Publisher 异步发送 Pulsar
```

Java 不应在业务事务内直接调用 Pulsar并依赖发送成功。

| Reader 结果 | `observe` | `enforce` |
| --- | --- | --- |
| `INTERESTED` | 写 Outbox | 写 Outbox |
| `NOT_INTERESTED` | 写 Outbox，并记录本可过滤指标 | 不写 Outbox |
| `UNKNOWN` | 写 Outbox | 写 Outbox |

第一阶段使用 `observe`，对账 Reader Decision、Node `no_match` 和 Run 创建量后，再按 uid 小流量进入 `enforce`。

建议 Event ID：

```text
contact.friend_added:<业务事件主键>
contact.tag_added:<业务事件主键>
message.received:<messageId>
```

Partition Key：

```text
contact.friend_added / contact.tag_added
  -> uid:wecom_contact:externalUserId

message.received
  -> uid:chatai_contact:thirdExternalUserId
```

## 10. 数据库与时间契约

- Interest Reader 使用 `READ COMMITTED`。
- Java 不对 Workflow 表加锁。
- Entry Event 的 `occurredAt` 使用 UTC RFC 3339 毫秒格式。
- Workflow MySQL `DATETIME` 遵守项目统一的 UTC+8 wall-clock 契约。
- Java JDBC 连接和 Session 固定使用 `+08:00`。
- 业务代码不得手工再次加减 8 小时。

## 11. 可观测性

建议指标：

```text
workflow_interest_lookup_total{eventType,decision,mode}
workflow_interest_lookup_duration_seconds{eventType}
workflow_interest_candidate_count{eventType}
workflow_interest_fail_open_total{eventType,reason}
workflow_event_filtered_total{eventType}
workflow_event_outbox_created_total{eventType}
```

不得把 `uid`、`workUserId`、`seatId`、`externalUserId`、`thirdExternalUserId` 放入指标 Label。日志不得输出完整 payload、消息正文或客户资料。

## 12. Java 实施任务

### J1：WorkflowInterestReader

- 建立单一 DAO。
- 实现 Binding JOIN Definition 候选查询。
- 实现三个事件的版本化 Filter Parser 与内存 Matcher。
- 实现消息动态 Wait Event 查询。
- 实现短超时、`UNKNOWN`、fail-open 与 `observe / enforce`。
- 对关键 SQL 执行 `EXPLAIN` 并确认索引命中。

### J2：Entry Event Mapper

- 为三个 Event Type 建立版本化 DTO。
- 从业务事实解析本文要求的身份字段。
- 生成稳定 `eventId`。
- 使用 Node 提供的共享 JSON Fixture 做序列化测试。

### J3：Java Event Outbox 与 Pulsar Producer

- 业务事实与 Outbox INSERT 保持同一事务。
- Publisher 支持重试、积压、发送状态和告警。
- 投递 `workflow-entry` Topic，并保留 Event ID、内容和 Partition Key。
- 不按 Workflow Type、Subject Type 或命中的 Workflow 数量拆消息。

## 13. Java 验收场景

### 场景 A：添加好友来源命中

```text
Filter：workUserIds=[201], sourceIds=[qr-code-1]
事件：workUserId=201, sourceId=qr-code-1
结果：INTERESTED
```

### 场景 B：添加好友任意来源

```text
Filter：workUserIds=[201], sourceIds=[]
事件：workUserId=201, sourceId 缺失
结果：INTERESTED
```

### 场景 C：标签不匹配

```text
Filter：workUserIds=[201], tagIds=[301]
事件：workUserId=201, tagId=302
结果：NOT_INTERESTED
```

### 场景 D：关键词任意命中

```text
Filter：seatIds=[101], keywords=[价格, 优惠]
事件：seatId=101, text=请问有什么优惠
结果：INTERESTED
```

### 场景 E：静态消息不匹配但 Wait Event 有兴趣

```text
静态 Start：NOT_INTERESTED
动态 Wait Event：INTERESTED
最终结果：INTERESTED
```

### 场景 F：ChatAI SOP 与 WeCom SOP 同时订阅同一企微事实

Java 只写一条 Outbox、投递一条消息。Node 负责按两个 Binding 创建不同 Subject Type 的 Run。

### 场景 G：Filter JSON 异常或 SQL 超时

Reader 返回 `UNKNOWN`，`observe` 和 `enforce` 都继续写 Outbox。

## 14. 联合评审需确认的实施事实

1. Java 业务域中 `workUserId`、`seatId`、`externalUserId`、`thirdExternalUserId`、`sourceId` 的权威来源。
2. 三类业务事实各自生成稳定 `eventId` 的主键。
3. Java 当前可复用的 Transactional Outbox 实现及事务边界。
4. Java 数据库账号、Schema 名称和三张表的只读授权。
5. Java JDBC `+08:00` 与 `READ COMMITTED` 配置。
6. Pulsar Topic、Namespace、分区数、认证和环境配置。
7. `observe` 与 `enforce` 的 uid 灰度配置归属。

上述事实确认后，Java 可以独立完成 Interest Reader、Mapper、Outbox 和 Producer，不需要了解 Node 内部 Workflow 图或节点实现。
