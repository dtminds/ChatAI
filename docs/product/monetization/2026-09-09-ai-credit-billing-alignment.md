# AI 积分计费方案对齐

> 用途：Java 与 Node 并行推进 AI 用量、账单和后续正式扣费。\
> 当前阶段：内测期只生成 Shadow 账单，不扣积分、不因额度不足阻断业务。

## 1. 计费规则

所有 AI 能力共用一个积分账户。客户账单按业务动作计费，不直接按 Token 浮动；Token 用于成本核算、审计和价格校准。

| 能力 | 计费单位 | 基础积分 |
|---|---|---:|
| AI 生成回复 | 成功生成并交付 1 条回复 | 1 |
| 会话洞察 | 完成 1 个逻辑会话分析 | 4 |
| 用户记忆提炼 | 完成 1 个用户记忆提炼任务 | 1.5 |
| Workflow-AI 节点 | 成功执行 1 个 AI 节点实例 | 节点独立配置 |

规则：内部模型重试不重复计费；失败任务不产生可计费事件；用户主动重试视为新的业务动作；Workflow 未经过的分支不计费，循环每次执行分别计费。

## 2. 模型倍率

模型表或计费规则表配置模型档位倍率：

| 模型档位 | 倍率 |
|---|---:|
| Lite | 1x |
| Turbo | 1.5x |
| Pro | 2x |

公式：

```text
最终积分 = 基础积分 × 模型倍率
```

示例：会话洞察使用 Turbo：`4 × 1.5 = 6` 积分；记忆提炼使用 Pro：`1.5 × 2 = 3` 积分。

建议内部使用整数最小单位保存积分，例如 `1 积分 = 100 credit_units`，避免浮点误差。计费明细必须保存基础积分、倍率、最终积分和价格版本快照，历史账单不随当前配置变化。

## 3. 核心数据表

### 3.1 `ai_usage_event`：AI 用量事实

记录一次客户业务动作及其真实模型用量，原则上只追加、不修改。

| 字段 | 说明 |
|---|---|
| `event_id` | 业务幂等键，唯一 |
| `tenant_id` / `uid` | 租户 |
| `source` | `java` / `node` |
| `capability` | `ai_reply` / `conversation_insight` / `user_memory` / `workflow_node` |
| `subject_type`、`subject_id` | 计费业务对象 |
| `model_id` | 实际使用模型 |
| `input_tokens`、`output_tokens`、`total_tokens` | 实际 Token 用量 |
| `outcome` | `succeeded` / `failed` |
| `occurred_at` | 业务发生时间 |
| `metadata_json` | Workflow、任务等扩展字段 |

### 3.2 `ai_billing_price_rule`：价格规则

配置能力基础积分、Workflow 节点价格、模型倍率和生效时间。规则调整产生新版本，不覆盖历史规则。

### 3.3 `ai_billing_line`：计费明细

由 Usage Event 按价格规则生成：

| 字段 | 说明 |
|---|---|
| `usage_event_id` | 关联用量事件，唯一 |
| `base_credit_units` | 基础积分快照 |
| `model_multiplier` | 模型倍率快照 |
| `charged_credit_units` | 最终应计积分 |
| `pricing_version` | 价格版本 |
| `billing_mode` | `shadow` / `charge` |
| `status` | `billable` / `voided` / `refunded` |
| `billing_period` | 账期 |

### 3.4 正式期再启用：`credit_ledger`

正式扣费、充值和退款的不可变流水。内测期不写正式扣减，或写入独立 Shadow Ledger。

## 4. 四类事件的业务粒度

```text
AI 回复：        reply:{uid}:{answerRecordId}
会话洞察：      insight:{uid}:{logicalSessionId}:{analysisJobId}
用户记忆：      memory:{uid}:{runId}:{runItemId}
Workflow 节点：  workflow:{uid}:{runId}:{nodeExecutionId}
```

Node 上报会话洞察时，将摘要、打标、质检等内部步骤的 Token 汇总到一条逻辑会话事件；不拆成多条客户账单。记忆提炼按成功的 run item 上报。Workflow 必须具备稳定的 `nodeExecutionId`，不能使用每次模型请求 ID。

## 5. 并行推进与流程

```text
Java AI 回复 ───────────────┐
Node 会话洞察 ──────────────┤
Node 用户记忆 ──────────────┤
Node Workflow-AI 节点 ──────┘
              ↓
       Java Billing Service
              ↓
 Usage Event → Price Rule → Billing Line
              ↓
       Shadow Invoice（内测）
              ↓
       正式期再写 Credit Ledger
```

Node 侧在业务成功事务中写入本地 `usage_outbox`，后台定时扫描并批量 HTTP 上报 Java；不引入消息队列，不阻塞 AI 主流程。Java 侧按 `event_id` 幂等接收，批量接口逐条返回 `accepted / duplicates / rejected`。

Java AI 回复可在 Java 内部直接写 Usage Event；Node 的三类能力只负责生产真实用量事件和投递，不计算正式积分。订阅页面通过现有 Backend 读取 Java Billing 查询结果。

## 6. 双方交付边界

**Node 先行：**统一 Usage Event 契约、三类业务成功边界、token/model 快照、本地 outbox、批量投递器、Shadow 用量展示。\
**Java 负责：**Usage Event 接口、幂等落库、价格规则、Billing Line、账期汇总、查询接口；正式期再增加 Credit Ledger 和余额控制。

**对齐结论：**统一的是 Usage Event 和 Billing 账务，不要求 Java/Node 统一大模型调用实现；Node 不依赖 Java 数据库，Java ready 后只需接通批量接口即可联调。
