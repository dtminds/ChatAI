# 聚合聊天工作台 BFF 与 Java 领域 API 设计

- 日期：2026-05-07
- 状态：Draft
- 适用范围：第一期聚合聊天客服工作台
- 目标：明确 Node.js BFF 与 Java Core 的接口边界、第一版接口集合和协作职责

## 1. 背景与结论

本项目第一期是聚合聊天客服工作台，前端需要面对一个稳定、贴近 `/chat` 工作台体验的接口层；Java 后端需要继续承担消息、权限、发送、未读等核心业务事实。为了兼顾前端迭代效率和后端稳定性，建议采用：

```text
React 工作台
  -> Node.js BFF：工作台产品接口、聚合、裁剪、错误归一
  -> Java Core：权限、账号状态、消息、发送状态、未读等领域真源
  -> MySQL / Redis / 企微 Adapter
```

Node.js BFF 不直接写业务 MySQL，不直接维护业务 Redis，不直接调用企微 Adapter。所有有业务后果的动作由 Java Core 最终判定。

工作台以账号接管为操作边界：

- 员工接管某个企微账号后，代表该账号处理其下的客户会话。
- 未读状态按账号维度维护。
- 当账号被其他员工接管时，当前员工需要在工作台感知接管人变化，并失去该账号的发送资格。
- 会话是账号下的聊天对象。

这只是第一期领域模型的一部分，不改变本文的主线：BFF 面向工作台产品接口，Java 面向稳定领域 API。

## 2. 设计原则

### 2.1 BFF 的职责

Node.js BFF 可以负责：

- 聚合 Java 多个领域 API，形成 `/chat` 页面需要的启动和同步数据。
- 裁剪字段、归一错误结构、补充前端需要的轻量派生状态。
- 屏蔽 Java 老工程接口差异，避免前端直接依赖后端内部拓扑。
- 承接后续工作台体验层接口演进。

Node.js BFF 不负责：

- 判定账号能否接管、能否发送。
- 维护未读数、发送状态、消息顺序等业务事实。
- 直接写业务表。
- 复刻 Java 的权限和状态机规则。

### 2.2 Java Core 的职责

```text
Java Core = 领域真源
```

Java Core 负责：

- 员工与账号权限。
- 账号登录状态和接管状态。
- 账号未读数。
- 会话和消息查询。
- 发送消息受理、幂等、最终状态回写。
- 增量同步游标生成和推进。

## 3. 核心领域概念

### 3.1 账号可见性

账号可见性决定员工是否能看到某个企微账号。Java 账号接口只返回当前员工可见的账号集合和账号事实状态。

最低字段：

- `employeeId`
- `accountId`

发送资格由账号在线状态和账号接管状态共同决定；发送接口仍由 Java 做最终校验。

### 3.2 账号接管

账号接管决定当前哪个员工正在代表该企微账号处理消息。

最低字段：

- `accountId`
- `takeoverEmployeeId`
- `takeoverEmployeeName`
- `takeoverStatus`：`NONE | TAKEN_BY_ME | TAKEN_BY_OTHER`
- `takeoverAt`
- `version`

`version` 用于处理并发接管、轮询增量和前端状态覆盖。

### 3.3 账号未读

未读按账号维度维护。

最低字段：

- `accountId`
- `unreadCount`
- `lastUnreadMessageId`
- `lastUnreadAt`

前端可以在会话列表里展示会话预览或局部提示；业务未读水位由账号维度维护。

### 3.4 会话

会话是账号下的客户聊天对象。

最低字段：

- `conversationId`
- `accountId`
- `customerId`
- `customerName`
- `customerAvatarUrl`
- `conversationType`：`SINGLE | GROUP`
- `previewText`
- `updatedAt`
- `lastMessageId`

会话字段保持在聊天对象维度，不承载员工处理人状态。

## 4. BFF 接口

BFF 面向 `/chat` 页面提供产品级接口。接口名称可以贴近工作台体验，但不应拥有业务规则。

### 4.1 工作台初始化

```http
GET /api/bff/chat/bootstrap
```

用途：进入 `/chat` 时一次性加载工作台启动数据。

返回建议：

```json
{
  "me": {
    "employeeId": "emp_001",
    "name": "客服A"
  },
  "accounts": [
    {
      "accountId": "qw_001",
      "displayName": "企微账号1",
      "loginStatus": "ONLINE",
      "takeoverStatus": "TAKEN_BY_ME",
      "takeoverEmployee": {
        "employeeId": "emp_001",
        "name": "客服A"
      },
      "unreadCount": 12,
      "canTakeover": true,
      "canSend": true
    }
  ],
  "activeAccount": {
    "accountId": "qw_001",
    "conversations": {
      "items": [],
      "nextCursor": "conv_cursor_001",
      "hasMore": true
    }
  },
  "activeConversation": {
    "conversationId": "cv_001",
    "messages": {
      "items": [],
      "nextCursor": "before_seq_1001",
      "hasMore": true
    }
  },
  "sync": {
    "cursors": {
      "accountCursor": "account_cursor_10086",
      "conversationCursor": "conversation_cursor_10086",
      "messageAfterSeq": 1001,
      "messageStatusCursor": "message_status_cursor_10086"
    },
    "nextPollAfterMs": 3000
  }
}
```

### 4.2 增量同步

```http
GET /api/bff/chat/sync?accountCursor=account_cursor_10086&conversationCursor=conversation_cursor_10086&messageAfterSeq=1009&messageStatusCursor=message_status_cursor_10086&activeAccountId=qw_001&activeConversationId=cv_001
```

用途：前端轮询获取账号、会话、消息和发送状态变化。

BFF 对前端保留单一同步接口；BFF 内部可以并发调用 Java 的账号更新、会话更新和消息更新接口，再组合成下面的页面同步结构。

返回建议：

```json
{
  "cursors": {
    "accountCursor": "account_cursor_10092",
    "conversationCursor": "conversation_cursor_10092",
    "messageAfterSeq": 1010,
    "messageStatusCursor": "message_status_cursor_10092"
  },
  "nextPollAfterMs": 3000,
  "accountUpdates": [
    {
      "accountId": "qw_001",
      "loginStatus": "ONLINE",
      "takeoverStatus": "TAKEN_BY_OTHER",
      "takeoverEmployee": {
        "employeeId": "emp_002",
        "name": "客服B"
      },
      "unreadCount": 18,
      "canSend": false,
      "version": 23
    }
  ],
  "conversationUpserts": [],
  "activeConversation": {
    "conversationId": "cv_001",
    "messageAppends": [],
    "messageUpdates": []
  }
}
```

BFF 不自行推导业务变化；账号、会话、消息各自的增量游标由 Java Core 生成和推进，BFF 只负责透传、保存和组合。

### 4.3 账号列表

```http
GET /api/bff/chat/accounts
```

用途：刷新当前员工有权限访问的账号列表。

返回账号权限、登录状态、接管状态、账号未读数。

### 4.4 接管账号

```http
POST /api/bff/chat/accounts/{accountId}/takeover
```

请求建议：

```json
{
  "expectedVersion": 22
}
```

返回建议：

```json
{
  "accountId": "qw_001",
  "takeoverStatus": "TAKEN_BY_ME",
  "takeoverEmployee": {
    "employeeId": "emp_001",
    "name": "客服A"
  },
  "canSend": true,
  "version": 23
}
```

`expectedVersion` 用于避免员工基于过期状态覆盖他人接管。Java 可以按业务需要选择强校验或弱校验，但需要返回明确错误码。

### 4.5 账号会话列表

```http
GET /api/bff/chat/accounts/{accountId}/conversations?cursor=latest&limit=30
```

用途：加载指定账号下的会话列表。

会话列表可以按最近消息时间排序。

### 4.6 会话消息列表

```http
GET /api/bff/chat/conversations/{conversationId}/messages?accountId=qw_001&cursor=latest&limit=30&direction=backward
```

用途：加载指定会话的历史消息。

`accountId` 建议显式传入，便于 Java 校验该会话是否属于当前账号，以及当前员工是否有该账号查看权限。

### 4.7 发送消息

```http
POST /api/bff/chat/messages/send
```

请求建议：

```json
{
  "accountId": "qw_001",
  "conversationId": "cv_001",
  "clientMessageId": "client_msg_abc",
  "content": {
    "type": "TEXT",
    "text": "您好，请问有什么可以帮您？"
  }
}
```

Java Core 负责校验：

- 当前员工是否有该账号权限。
- 当前员工是否正在接管该账号。
- 该会话是否属于该账号。
- 账号是否在线且可发送。
- `clientMessageId` 是否满足幂等要求。

BFF 不自行判定发送成功，只转发 Java 受理结果。

### 4.8 标记账号已读

```http
POST /api/bff/chat/accounts/{accountId}/read
```

请求建议：

```json
{
  "readUntilMessageId": "msg_1001"
}
```

用途：按账号维度清理未读。

账号已读由 Java 按 `readUntilMessageId` 更新账号未读水位。

## 5. Java 领域 API

Java API 面向业务领域，不面向页面组件。

### 5.0 通用约定

Java 内部接口建议统一使用响应 envelope，便于 BFF 做错误归一和降级处理。

成功响应：

```json
{
  "success": true,
  "data": {}
}
```

失败响应：

```json
{
  "success": false,
  "error": {
    "code": "ACCOUNT_NO_PERMISSION",
    "message": "当前员工没有该账号权限",
    "details": {
      "accountId": "qw_001"
    }
  }
}
```

分页字段统一：

```json
{
  "items": [],
  "nextCursor": "cursor_xxx",
  "hasMore": true
}
```

时间字段统一使用 ISO 8601 字符串，例如 `2026-05-07T10:20:30+08:00`。

Java 内部接口的业务标识统一放在 query 或 request body 中，不放在 path 中。例如 `accountId`、`conversationId` 使用 `?accountId=...&conversationId=...` 或请求体字段传递。

### 5.1 当前员工

```http
GET /internal/workbench/me
```

返回当前员工身份。

响应 schema：

```json
{
  "success": true,
  "data": {
    "employeeId": "emp_001",
    "name": "客服A",
    "avatarUrl": "https://example.com/avatar.png",
    "roles": ["AGENT"]
  }
}
```

### 5.2 账号查询

```http
GET /internal/chat/accounts
```

返回当前员工可见账号，以及每个账号的登录状态、接管状态、账号未读。

响应 schema：

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "accountId": "qw_001",
        "displayName": "企微账号1",
        "avatarUrl": "https://example.com/qw-avatar.png",
        "loginStatus": "ONLINE",
        "lastActiveAt": "2026-05-07T10:20:30+08:00",
        "takeover": {
          "status": "TAKEN_BY_ME",
          "employeeId": "emp_001",
          "employeeName": "客服A",
          "takeoverAt": "2026-05-07T10:10:00+08:00",
          "version": 23
        },
        "unread": {
          "count": 12,
          "lastUnreadMessageId": "msg_1001",
          "lastUnreadAt": "2026-05-07T10:19:00+08:00"
        }
      }
    ]
  }
}
```

枚举：

```text
loginStatus: ONLINE | OFFLINE | UNKNOWN
takeover.status: NONE | TAKEN_BY_ME | TAKEN_BY_OTHER
```

### 5.3 账号更新增量

```http
GET /internal/chat/accounts/updates?cursor=account_cursor_10086
```

用途：返回当前员工可见账号中，在指定游标后发生变化的账号状态。

Java 负责根据当前员工身份返回：

- 账号登录状态变化
- 账号接管状态变化
- 账号未读数变化
- 账号最近消息时间变化
- 当前员工对账号的可操作权限变化

响应 schema：

```json
{
  "success": true,
  "data": {
    "cursor": "account_cursor_10092",
    "items": [
      {
        "accountId": "qw_001",
        "loginStatus": "ONLINE",
        "lastMessageAt": "2026-05-07T10:22:10+08:00",
        "takeover": {
          "status": "TAKEN_BY_OTHER",
          "employeeId": "emp_002",
          "employeeName": "客服B",
          "takeoverAt": "2026-05-07T10:22:00+08:00",
          "version": 24
        },
        "unread": {
          "count": 18,
          "lastUnreadMessageId": "msg_1010",
          "lastUnreadAt": "2026-05-07T10:22:10+08:00"
        }
      }
    ]
  }
}
```

### 5.4 账号会话更新增量

```http
GET /internal/chat/conversations/updates?accountId=qw_001&cursor=conversation_cursor_10086&limit=50
```

用途：返回指定账号下，在指定游标后新增或更新的会话摘要。

Java 负责校验当前员工是否有账号查看权限。第一期只要求返回 upsert；删除、隐藏、不可见等场景可以后续扩展为 removals。

响应 schema：

```json
{
  "success": true,
  "data": {
    "accountId": "qw_001",
    "cursor": "conversation_cursor_10092",
    "items": [
      {
        "conversationId": "cv_001",
        "accountId": "qw_001",
        "customer": {
          "customerId": "cus_001",
          "name": "张三",
          "avatarUrl": "https://example.com/customer.png"
        },
        "conversationType": "SINGLE",
        "previewText": "你好，我想咨询订单",
        "unreadCount": 3,
        "lastMessageId": "msg_1010",
        "updatedAt": "2026-05-07T10:22:10+08:00",
        "version": 45
      }
    ],
    "hasMore": false
  }
}
```

### 5.5 当前会话消息更新增量

```http
GET /internal/chat/messages/updates?accountId=qw_001&conversationId=cv_001&afterSeq=1009&statusCursor=message_status_cursor_10086&limit=50
```

用途：返回当前会话的新消息和消息状态变化。

Java 负责校验该会话属于指定账号，并校验当前员工是否有账号查看权限。

响应 schema：

```json
{
  "success": true,
  "data": {
    "accountId": "qw_001",
    "conversationId": "cv_001",
    "nextAfterSeq": 1010,
    "statusCursor": "message_status_cursor_10092",
    "messageAppends": [
      {
        "messageId": "msg_1010",
        "clientMessageId": null,
        "accountId": "qw_001",
        "conversationId": "cv_001",
        "seq": 1010,
        "direction": "INBOUND",
        "sender": {
          "type": "CUSTOMER",
          "id": "cus_001",
          "name": "张三"
        },
        "content": {
          "type": "TEXT",
          "text": "你好，我想咨询订单"
        },
        "sendStatus": "DELIVERED",
        "createdAt": "2026-05-07T10:22:10+08:00"
      }
    ],
    "messageUpdates": [
      {
        "messageId": "msg_1009",
        "clientMessageId": "client_msg_abc",
        "sendStatus": "FAILED",
        "failReason": "企微账号离线",
        "updatedAt": "2026-05-07T10:22:12+08:00"
      }
    ]
  }
}
```

账号、会话、消息三类游标都由 Java 生成。BFF 不根据时间戳自行推导增量。

### 5.6 接管账号

```http
POST /internal/chat/accounts/takeover?accountId=qw_001
```

请求 schema：

```json
{
  "operatorId": "emp_001",
  "expectedVersion": 22
}
```

响应 schema：

```json
{
  "success": true,
  "data": {
    "accountId": "qw_001",
    "takeover": {
      "status": "TAKEN_BY_ME",
      "employeeId": "emp_001",
      "employeeName": "客服A",
      "takeoverAt": "2026-05-07T10:23:00+08:00",
      "version": 23
    }
  }
}
```

Java 是接管冲突的最终裁判。典型错误码：

- `ACCOUNT_NOT_FOUND`
- `ACCOUNT_NO_PERMISSION`
- `ACCOUNT_OFFLINE`
- `ACCOUNT_TAKEN_BY_OTHER`
- `ACCOUNT_TAKEOVER_VERSION_CONFLICT`

### 5.7 账号会话列表

```http
GET /internal/chat/conversations?accountId=qw_001&cursor=latest&limit=30
```

Java 负责校验当前员工是否有账号查看权限。

响应 schema：

```json
{
  "success": true,
  "data": {
    "accountId": "qw_001",
    "items": [
      {
        "conversationId": "cv_001",
        "accountId": "qw_001",
        "customer": {
          "customerId": "cus_001",
          "name": "张三",
          "avatarUrl": "https://example.com/customer.png"
        },
        "conversationType": "SINGLE",
        "previewText": "你好，我想咨询订单",
        "lastMessageId": "msg_1010",
        "updatedAt": "2026-05-07T10:22:10+08:00"
      }
    ],
    "nextCursor": "conv_cursor_002",
    "hasMore": true
  }
}
```

枚举：

```text
conversationType: SINGLE | GROUP
```

### 5.8 会话消息列表

```http
GET /internal/chat/messages?accountId=qw_001&conversationId=cv_001&cursor=latest&limit=30&direction=backward
```

响应 schema：

```json
{
  "success": true,
  "data": {
    "accountId": "qw_001",
    "conversationId": "cv_001",
    "items": [
      {
        "messageId": "msg_001",
        "clientMessageId": null,
        "accountId": "qw_001",
        "conversationId": "cv_001",
        "seq": 1001,
        "direction": "INBOUND",
        "sender": {
          "type": "CUSTOMER",
          "id": "cus_001",
          "name": "张三"
        },
        "content": {
          "type": "TEXT",
          "text": "你好"
        },
        "sendStatus": "DELIVERED",
        "failReason": null,
        "createdAt": "2026-05-07T10:20:30+08:00",
        "updatedAt": "2026-05-07T10:20:30+08:00"
      }
    ],
    "nextCursor": "before_seq_1001",
    "hasMore": true
  }
}
```

枚举：

```text
direction: INBOUND | OUTBOUND | SYSTEM
sender.type: CUSTOMER | EMPLOYEE | SYSTEM
content.type: TEXT | IMAGE | FILE | AUDIO | VIDEO | LOCATION | LINK | UNKNOWN
sendStatus: PENDING | SENDING | DELIVERED | FAILED | REVOKED
direction=INBOUND 的消息也可以固定返回 DELIVERED，便于前端统一处理。
```

### 5.9 发送消息

```http
POST /internal/chat/messages/send
```

Java 负责：

- 幂等处理
- 账号接管校验
- 会话与账号关系校验
- 创建发送任务
- 调用企微 Adapter
- 回写发送状态

请求 schema：

```json
{
  "operatorId": "emp_001",
  "accountId": "qw_001",
  "conversationId": "cv_001",
  "clientMessageId": "client_msg_abc",
  "content": {
    "type": "TEXT",
    "text": "您好，请问有什么可以帮您？"
  }
}
```

响应 schema：

```json
{
  "success": true,
  "data": {
    "accepted": true,
    "accountId": "qw_001",
    "conversationId": "cv_001",
    "clientMessageId": "client_msg_abc",
    "messageId": "msg_1011",
    "sendTaskId": "task_001",
    "sendStatus": "SENDING",
    "createdAt": "2026-05-07T10:25:00+08:00"
  }
}
```

典型错误码：

- `ACCOUNT_NO_PERMISSION`
- `ACCOUNT_NOT_TAKEN_BY_OPERATOR`
- `ACCOUNT_OFFLINE`
- `CONVERSATION_NOT_FOUND`
- `CONVERSATION_ACCOUNT_MISMATCH`
- `DUPLICATE_CLIENT_MESSAGE_ID`
- `UNSUPPORTED_CONTENT_TYPE`

### 5.10 标记账号已读

```http
POST /internal/chat/accounts/read?accountId=qw_001
```

请求 schema：

```json
{
  "operatorId": "emp_001",
  "readUntilMessageId": "msg_1010"
}
```

响应 schema：

```json
{
  "success": true,
  "data": {
    "accountId": "qw_001",
    "unread": {
      "count": 0,
      "lastUnreadMessageId": null,
      "lastUnreadAt": null
    },
    "readVersion": 12
  }
}
```

如果 `readUntilMessageId` 不属于该账号，Java 应返回 `MESSAGE_ACCOUNT_MISMATCH`，不要静默成功。

## 6. 第一版推荐接口集合

第一版 BFF 只保留这些接口：

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

对应 Java 最小领域 API：

```text
GET  /internal/workbench/me
GET  /internal/chat/accounts
GET  /internal/chat/accounts/updates
GET  /internal/chat/conversations/updates
GET  /internal/chat/messages/updates
POST /internal/chat/accounts/takeover
GET  /internal/chat/conversations
GET  /internal/chat/messages
POST /internal/chat/messages/send
POST /internal/chat/accounts/read
```

## 7. 验收标准

BFF 可以接入真实链路的最低条件：

- Java 能返回当前员工可见账号及账号接管状态。
- Java 能按账号维护并返回未读数。
- Java 能处理账号接管冲突，并返回稳定错误码。
- Java 能校验发送消息时员工是否正在接管账号。
- Java 能保证消息发送最终状态可查询、可同步。
- Java 能分别提供账号、会话和消息维度的稳定增量游标，BFF 不需要自行推导业务变化。
- BFF 只做聚合、裁剪和错误归一，不复制 Java 领域规则。
