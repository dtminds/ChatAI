# AI 客服工作台 BFF 落地前提

- 日期：2026-04-24
- 状态：Draft
- 适用范围：`Java` 负责写侧真源，`Node.js` 负责工作台读侧/BFF 的协作模式
- 目标：明确 Java 侧最小交付集合，使前端团队可以尽快落地 `/chat` 工作台的真实 BFF

## 1. 结论

当前工作台需求下，可以考虑采用：

```text
外挂接入 / 消息入库 / 核心业务写入：Java
工作台查询聚合 / 前端适配 / 轮询接口：Node.js BFF
命令链路：前端 -> Node.js BFF -> Java
```

前提是角色边界必须明确：

- `Java` 是业务写侧真源，独占所有有业务后果的操作
- `Node.js` 是工作台查询侧和前端适配层，不直接写核心业务表
- `Node.js` 可以查库，但最好通过只读库、只读账号、只读视图或投影表
- `Node.js` 不复刻 Java 业务规则，不维护第二套真相

如果这些边界做不到，不建议上 BFF。

## 2. Java 侧最小准备

只要 Java 侧把下面 4 类能力准备好，前端团队就可以开始开发并较快落地 BFF。

### 2.1 写侧职责稳定

Java 必须继续独占以下动作：

- 外挂消息接收、清洗、入库
- 会话归属写入：领取、释放、转接
- 消息发送受理与下发
- 发送状态回写：成功、失败、失败原因
- 已读/未读状态维护
- 账号在线状态写入

这部分即使暂时没有前端专属接口，也必须先明确“谁负责写入”和“谁负责最终判定”。

### 2.2 查询来源可读

Node.js BFF 至少要能稳定读取这些数据，不要求 Java 先做成完整前端接口，但必须给出稳定可访问的数据来源：

- 企微账号信息
- 会话摘要信息
- 消息明细信息
- 客户基础信息
- 员工与账号权限关系

推荐优先级：

1. Java 提供只读视图或投影表
2. Java 提供读库或只读账号
3. Node.js 直接查 Java 核心表

第 3 种不是不能做，但只适合作为短期过渡，后续应尽快收敛到只读视图或投影表。

### 2.3 命令接口可调用

Node.js BFF 不应直接写 Java 核心表，因此 Java 至少需要提供以下命令型接口：

- `sendMessage`
- `claimConversation`
- `markConversationRead`

建议第一期同时准备：

- `releaseConversation`
- `transferConversation`
- `retrySend` 或允许按消息内容重新发起发送

### 2.4 状态可以回收

这是最关键的落地前提。Java 必须保证：

- 一条消息从“受理发送”到“成功/失败”的状态最终会落到库里
- 该状态可以被 Node.js BFF 查询到
- 发送链路里存在稳定的关联标识

最低要求：

- `client_message_id`
- `message_id`
- `conversation_id`
- 最终状态
- 失败原因

如果 Java 只能“发出去”，但不能可靠回写最终状态，BFF 无法稳定支撑工作台。

## 3. 查询侧最小数据合同

下面不是最终表结构设计，而是 Node.js BFF 落地所需的最小字段集合。Java 不一定要按这些名字建表，但必须给出能稳定映射出这些字段的数据来源。

### 3.1 账号维度

Node.js BFF 至少需要：

- `account_id`
- `account_name`
- `operator_name` 或当前展示名称
- `login_status`：`online | offline | unknown`
- `last_active_at`
- `unread_count`

### 3.2 会话维度

Node.js BFF 至少需要：

- `conversation_id`
- `account_id`
- `customer_id`
- `customer_name`
- `customer_avatar_url`
- `conversation_mode`：`single | group`
- `assigned_employee_id`
- `conversation_status`：`public | claimed | closed`
- `priority`
- `preview_text`
- `updated_at`
- `unread_count`

### 3.3 消息维度

Node.js BFF 至少需要：

- `message_id`
- `client_message_id`
- `conversation_id`
- `account_id`
- `customer_id`
- `seq` 或稳定的单会话递增游标
- `sender_type`：`customer | agent | system`
- `content_type`
- `content_payload`
- `status`
- `fail_reason`
- `created_at`

### 3.4 权限维度

Node.js BFF 至少需要：

- `employee_id`
- `account_id`
- 权限状态：能否查看、能否接待、能否只读查看

如果没有这块，BFF 很容易在前端展示出“看得到但不该操作”的错误状态。

## 4. Java 命令接口最小合同

### 4.1 发送消息

接口最低要求：

- 输入：
  - `account_id`
  - `conversation_id`
  - `client_message_id`
  - `content_type`
  - `content`
  - `operator_id`
- 输出：
  - 是否受理成功
  - `message_id` 或服务端关联 id
  - `request_id` / `trace_id`
  - 错误码
  - 错误文案

### 4.2 领取会话

接口最低要求：

- 输入：
  - `conversation_id`
  - `operator_id`
- 输出：
  - 最终归属人
  - 是否成功
  - 错误码

### 4.3 标记已读

接口最低要求：

- 输入：
  - `conversation_id`
  - `operator_id`
- 输出：
  - 是否成功
  - 会话当前未读是否清零

## 5. Java 侧明确不需要先做好的东西

为了让 Node.js BFF 尽快启动，Java 侧不需要先提供这些能力：

- 前端专属聚合接口
- 完整的轮询接口
- 前端页面级 DTO
- 历史按日期查询
- WebSocket / SSE
- 客户画像、复杂统计、复杂搜索

这些都可以在 Node.js BFF 里先做前端适配和拼装。

## 6. Node.js BFF 的职责边界

Node.js BFF 可以负责：

- 聚合账号、会话、消息为前端友好结构
- 将多个表或视图映射成 `/chat` 页面需要的查询结果
- 实现前端轮询接口
- 做短周期缓存、字段兼容、前端视图模型适配
- 将前端命令转发给 Java，并补充前端需要的幂等参数

Node.js BFF 不应该负责：

- 直接写消息主表、会话主表、归属主表
- 自己判定最终发送成功/失败
- 自己维护会话归属规则
- 自己维护未读清零规则
- 复刻 Java 领域规则

## 7. 验收门槛

只有满足下面这些条件，BFF 才建议接真实链路。

### 7.1 Go 条件

- Java 核心表结构在未来 2 到 4 周内不会做破坏性改动
- Java 给到可查询的数据来源
- Java 提供 `sendMessage`、`claimConversation`、`markConversationRead`
- Java 保证消息最终状态会回写
- Java 给到基础状态枚举和错误码说明

### 7.2 No-Go 条件

出现以下任一情况，应暂停真实链路接入：

- 只能直接查主库，且没有只读保护
- 核心表结构每天都在改
- 发送状态不能回写
- 会话归属规则不稳定
- Java 不接受 Node.js 作为前端统一入口
- 团队无法明确谁拥有字段定义和变更通知责任

## 8. 分阶段实施建议

### 8.1 第一步：最小可跑通链路

目标：

- Node.js BFF 能展示账号列表、会话列表、消息流
- Node.js BFF 能透传发消息、领取、已读动作
- 前端能看到发送状态回收

Java 需要准备：

- 读表或只读视图
- `sendMessage`
- `claimConversation`
- `markConversationRead`
- 消息状态回写

### 8.2 第二步：收敛为稳定协作模式

目标：

- 从“直接查核心表”迁移到“查只读视图/投影表”
- 加入错误码字典、trace id、变更通知机制
- 降低 Node.js 对 Java 内部 schema 的耦合

Java 需要准备：

- 只读视图或投影表
- 字段字典
- 变更通知机制

## 9. 对后端团队的明确诉求

如果要让前端团队快速落地 BFF，建议对 Java 团队的诉求表达为：

1. 不要求你们先把前端接口全部做完
2. 只要求你们明确写侧真源边界
3. 只要求你们提供稳定的查询来源
4. 只要求你们先打通最小命令接口
5. 只要求你们保证状态最终会回写

这套诉求比“请先做完整工作台后端”更容易落地，也更符合当前项目节奏。

## 10. 当前推荐判断

基于当前需求和团队协作现状，推荐判断如下：

- 可以考虑上 `Node.js BFF`
- 但它必须是工作台专用读侧/BFF，而不是第二业务后端
- Java 仍然是核心写侧和规则真源
- 如果 Java 侧连最小读合同和状态回写都给不出来，则不建议接真实链路

一句话总结：

```text
Java 负责“写对”
Node.js 负责“给前端看对”
前提是二者之间的数据边界和责任边界必须先定清楚
```
