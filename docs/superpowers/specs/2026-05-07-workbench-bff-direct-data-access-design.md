# 聚合聊天工作台 BFF 直连数据层方案

- 日期：2026-05-07
- 状态：Draft
- 适用范围：第一期聚合聊天客服工作台的激进架构备选方案
- 目标：评估 Node.js BFF 直接访问 MySQL / Redis，仅少量调用 Java Core 的可行性、边界和风险

## 1. 方案结论

本方案采用更激进的职责划分：

```text
React 工作台
  -> Node.js BFF：工作台接口、查询聚合、账号接管、未读水位、轮询增量、发送入口编排
  -> MySQL / Redis：工作台主要读写数据源
  -> Java Core：少量基础能力和存量系统能力
  -> qywx-adapter：企微外挂协议接入与消息发送
```

这套方案的核心收益是前端团队可以用 TypeScript 形成更完整的垂直闭环，减少对 Java 老工程接口改造的依赖。

但这不是“BFF 只做胶水层”，而是让 Node.js BFF 承担工作台业务后端的一部分职责。它需要正式的后端工程纪律，包括数据模型、事务、幂等、迁移、监控、回滚和排障能力。

## 2. 推荐使用条件

只有满足下面条件，才建议采用本方案：

- 工作台是一个相对独立的新业务边界。
- 团队愿意正式维护 Node.js 后端服务，而不是临时脚本式 BFF。
- MySQL 表结构可以由工作台团队直接设计或协同设计。
- Redis key、锁、版本号、缓存策略有明确 owner。
- Java Core 不需要独占工作台消息、接管、未读等状态。
- 企微 Adapter 可以被 Node.js BFF 可靠调用，或由 Java Core 提供极薄转发接口。
- 有 CI、测试、灰度、日志、告警和回滚能力。

如果这些条件不成立，建议继续使用“BFF 调 Java 领域 API”的保守方案。

## 3. 职责边界

### 3.1 Node.js BFF 负责

- `/chat` 工作台所有面向前端的接口。
- 查询账号、会话、消息、客户基础资料。
- 账号接管状态写入。
- 会话摘要更新。
- 会话级未读、账号角标未读的计算。
- 发送消息入口、幂等受理和发送任务创建。
- 轮询增量游标生成和返回。
- Redis 版本号、短缓存、分布式锁。
- 调用 qywx-adapter 或 Java Core 极薄发送能力。

### 3.2 Java Core 保留

Java Core 只保留少量基础或存量能力：

- 登录态校验、员工身份解析。
- 组织、员工、角色等基础主数据查询。
- 如果企微 Adapter 只能由 Java 调用，则 Java 提供发送转发接口。
- 存量系统需要消费的工作台事件。

Java Core 不再负责工作台会话列表、消息查询、账号接管、未读水位和轮询增量。

### 3.3 qywx-adapter 负责

- 接收或拉取企微消息。
- 发送企微消息。
- 返回账号登录状态、发送成功或失败。
- 对外挂协议字段做最小标准化。

如果 qywx-adapter 当前只能接入 Java，则需要决定：

```text
选项 A：Node.js BFF 直接调用 qywx-adapter
选项 B：Java Core 保留 adapter proxy，只做协议转发，不拥有工作台业务规则
```

## 4. 数据访问策略

### 4.1 MySQL

Node.js BFF 直接读写工作台业务表：

- `workbench_account`
- `workbench_account_takeover`
- `workbench_conversation`
- `workbench_message`
- `workbench_message_send_task`
- `workbench_account_employee_state`
- `workbench_cursor_event` 或轻量版本表

第一期建议工作台表由 BFF 所属团队拥有，避免 Node.js 直接写 Java 老工程核心表。

### 4.2 Redis

Node.js BFF 使用 Redis 管理：

- 全局或账号维度版本号。
- 账号接管锁。
- 高频轮询摘要缓存。
- 发送幂等短缓存。
- 游标失效标记。

Redis key 必须使用独立 namespace：

```text
workbench:v1:account:{accountId}:version
workbench:v1:conversation:{conversationId}:version
workbench:v1:takeover:{accountId}
workbench:v1:send-idempotency:{employeeId}:{clientMessageId}
```

Redis 数据不能成为唯一不可恢复事实。关键状态仍应落 MySQL。

## 5. 核心表建议

### 5.1 account_takeover

```text
account_id
employee_id
employee_name
takeover_at
version
updated_at
```

唯一约束：

```text
unique(account_id)
```

### 5.2 conversation

```text
id
account_id
customer_id
customer_name
customer_avatar_url
conversation_type
preview_text
last_message_id
last_message_at
version
created_at
updated_at
```

索引：

```text
idx_conversation_account_updated(account_id, updated_at)
idx_conversation_account_version(account_id, version)
```

### 5.3 account_employee_state

```text
account_id
employee_id
unread_count
last_read_message_id
read_version
updated_at
```

第一期账号角标可以由已加载会话累加；如果需要全量账号未读，则在这里维护账号维度未读水位。

### 5.4 conversation_employee_state

```text
conversation_id
account_id
employee_id
unread_count
last_read_message_id
updated_at
```

会话级 unread 用于会话列表展示和账号角标累加。

### 5.5 message

```text
id
account_id
conversation_id
customer_id
sender_type
sender_employee_id
content_type
content_payload
status
client_message_id
external_message_id
seq
send_time
fail_reason
status_version
created_at
updated_at
```

索引：

```text
idx_message_conversation_seq(conversation_id, seq)
idx_message_conversation_status_version(conversation_id, status_version)
unique(account_id, external_message_id)
unique(sender_employee_id, client_message_id)
```

### 5.6 message_send_task

```text
id
message_id
account_id
conversation_id
status
retry_count
next_retry_at
last_error
created_at
updated_at
```

## 6. BFF 对前端接口

前端只调用 BFF：

```text
GET  /api/bff/chat/bootstrap
GET  /api/bff/chat/sync
GET  /api/bff/chat/accounts
POST /api/bff/chat/accounts/{accountId}/takeover
GET  /api/bff/chat/accounts/{accountId}/conversations
GET  /api/bff/chat/conversations/{conversationId}/messages
POST /api/bff/chat/messages/send
POST /api/bff/chat/accounts/{accountId}/read
```

这组接口可以与保守方案保持一致，方便后续在 BFF 内部切换数据来源。

## 7. BFF 内部数据接口

因为 BFF 直接访问 MySQL / Redis，对 Java 不再需要完整领域 API。BFF 内部需要实现这些数据访问模块：

```text
AccountRepository
TakeoverRepository
ConversationRepository
MessageRepository
SendTaskRepository
CursorRepository
WorkbenchRedis
```

模块边界建议：

- Repository 只做数据读写。
- Service 负责事务和业务规则。
- Controller 负责 HTTP 入参、出参和错误映射。

## 8. 增量同步设计

BFF 对前端保留单一接口：

```http
GET /api/bff/chat/sync?accountCursor=...&conversationCursor=...&messageAfterSeq=...&messageStatusCursor=...&activeAccountId=...&activeConversationId=...
```

BFF 内部直接查 MySQL / Redis：

```text
1. accounts/updates
   查当前员工可见账号的登录状态、接管状态、最近消息时间。

2. conversations/updates
   查 activeAccountId 下 version > conversationCursor 的会话摘要。

3. messages/updates
   查 activeConversationId 下 seq > messageAfterSeq 的新消息。
   查 activeConversationId 下 status_version > messageStatusCursor 的状态变化。
```

返回结构：

```json
{
  "cursors": {
    "accountCursor": "account_cursor_10092",
    "conversationCursor": "conversation_cursor_10092",
    "messageAfterSeq": 1010,
    "messageStatusCursor": "message_status_cursor_10092"
  },
  "nextPollAfterMs": 3000,
  "accountUpdates": [],
  "conversationUpserts": [],
  "activeConversation": {
    "conversationId": "cv_001",
    "messageAppends": [],
    "messageUpdates": []
  }
}
```

## 9. 写链路

### 9.1 接管账号

```text
1. 前端请求 BFF takeover。
2. BFF 校验员工是否可见该账号。
3. BFF 使用 MySQL 事务或 Redis 锁更新 account_takeover。
4. BFF 推进账号版本。
5. BFF 返回最新账号接管状态。
```

### 9.2 发送消息

```text
1. 前端提交 clientMessageId、accountId、conversationId、content。
2. BFF 校验账号在线、当前员工已接管账号、会话属于账号。
3. BFF 用 clientMessageId 做幂等。
4. BFF 写入 message，状态为 queued 或 sending。
5. BFF 写入 message_send_task。
6. BFF 调用 qywx-adapter 或 Java adapter proxy。
7. BFF 根据回调或轮询结果更新 message.status。
8. BFF 推进 message status version。
```

### 9.3 入站消息

入站消息有两种实现方式：

```text
选项 A：qywx-adapter 直接回调 Node.js BFF
选项 B：Java 接收 adapter 事件后投递给 Node.js BFF
```

BFF 收到入站消息后：

```text
1. 校验 accountId、customerId、externalMessageId。
2. 使用 externalMessageId 去重。
3. 写入 message。
4. 更新 conversation 摘要和 version。
5. 更新 conversation_employee_state.unread_count。
6. 推进账号或会话版本。
```

## 10. Java Core 最小接口

本方案下 Java Core 只需要提供少量接口：

```text
GET  /internal/me
GET  /internal/employees
GET  /internal/org-units
POST /internal/qywx/messages/send       # 仅当 qywx-adapter 不能被 Node 直接调用
GET  /internal/qywx/accounts/status     # 可选，账号在线状态查询
```

如果 Node.js BFF 能直接调用 qywx-adapter，则发送和账号状态也可以不经过 Java。

## 11. 风险

### 11.1 数据规则分裂

如果 Java 老工程也读写同一批工作台表，会出现双写、状态覆盖和排障困难。

规避方式：

- 工作台表由 BFF 单独拥有。
- Java 只通过事件或只读视图消费工作台数据。
- 禁止 Java 和 BFF 同时写同一个业务状态。

### 11.2 Node.js 后端能力不足

BFF 直连数据层后，Node.js 就是业务后端，不能只按前端项目方式维护。

必须补齐：

- migration
- schema review
- 事务测试
- 幂等测试
- 慢查询监控
- Redis key 管理
- 灰度发布
- 告警与回滚

### 11.3 企微 Adapter 边界不清

如果 adapter 仍强依赖 Java，Node.js 发送链路可能被迫绕回 Java。

规避方式：

- 明确 Java adapter proxy 只做协议转发。
- 发送状态最终落 BFF 管理的 message 表。
- Java 不维护第二套发送任务状态。

## 12. 验收标准

采用本方案前，必须满足：

- BFF 可以稳定连接 MySQL / Redis。
- BFF 有独立 migration 机制。
- BFF 拥有工作台表的写入权限和 schema owner。
- Java 不同时写工作台核心状态。
- 账号接管、发送消息、入站消息、未读水位都有自动化测试。
- 发送状态失败、重复发送、重复入站消息都有幂等测试。
- 生产至少 2 个 BFF 实例，所有业务状态不依赖本机内存。

## 13. 推荐落地顺序

### 13.1 第一阶段：只读直连

BFF 直接读 MySQL / Redis，写操作仍走 Java 或 mock。

目标：

- 验证查询性能。
- 验证 TypeScript 数据访问层。
- 验证前端工作台迭代效率。

### 13.2 第二阶段：接管与已读写入

BFF 接管账号和已读水位写入。

目标：

- 验证事务、锁、版本号和 Redis 协作。
- 验证多实例一致性。

### 13.3 第三阶段：发送链路写入

BFF 承担发送消息受理、发送任务创建和发送状态回写。

目标：

- 验证最关键的工作台写链路。
- 明确 qywx-adapter 调用路径。

### 13.4 第四阶段：入站消息写入

BFF 接收入站消息并维护会话摘要、未读和增量游标。

目标：

- 让工作台核心闭环完全由 BFF 管理。
- Java Core 退回基础能力和存量系统边界。

## 14. 最终判断

本方案可以显著提升 TypeScript 全链路开发效率，也更适合 AI 辅助单人完成垂直功能切片。

但它的真实含义是：Node.js BFF 成为工作台业务后端。团队需要按正式后端服务标准建设它，而不是把它当作前端旁路服务。

如果团队愿意承担这部分工程责任，本方案值得作为激进路线试点；如果当前缺少 Node.js 后端运维和数据治理能力，应先采用保守方案或从只读直连开始。

