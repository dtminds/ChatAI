# AI 积分计费方案对齐

> 商业口径已确认；接口与物理表设计待双方确认。内测免费覆盖全部四类能力，不扣余额、不做额度拦截、不追溯扣费。

## 积分与模型倍率

| 能力 | 计费单位 | 基础积分 |
|---|---|---:|
| AI 回复 | 成功生成一次回复，半托管与全托管一致 | 2 |
| 会话洞察 | 一个逻辑会话的自动分析 | 2~4 |
| 用户记忆提炼 | 一个用户的一次成功提炼任务项 | 3 |
| Workflow 意图识别 | 一个成功的节点执行实例 | 0.1 |
| Workflow 大模型节点 | 一个成功的节点执行实例 | 1~4 |
| Workflow AI 资料收集 | 一个成功的节点执行实例 | 1~2 |

模型表通过 `credit_multiplier` 配置倍率，使用整数基点表示：`100 = 1x`、`150 = 1.5x`、`200 = 2x`。例如 Lite 为 `100`、Turbo 为 `150`、Pro 为 `200`。

```text
应计积分 = 基础积分 × (credit_multiplier / 100)
内测减免 = 应计积分
实扣积分 = 0
```

- 回复成功生成即计量，未发送也计量；同一结果拆成多条消息不重复计量。
- 同一逻辑会话的实时更新、最终分析、内部重试合计只计费一次；用户主动重刷另算一次。
- 洞察混用模型时，按事先确定的对外档位计价，不叠加内部模型倍率；实际 Token 仅保留在业务运行记录中。
- 记忆成功分析但无变更也计量；未调用模型就跳过、任务失败不收费。
- Workflow 未执行分支不计量，循环每次执行分别计量；内部重试不重复收费。
- 编辑器试运行记录用量，首期标记调试减免，不扣积分。
- Token 用于内部成本核算，不直接使客户单次价格浮动；失败成本仍保留在业务运行记录中。

## 最简核心表

表结构与协议由我们设计，Billing Service 团队确认并实现账单表的部署、接口和写入。以下为逻辑名称，物理命名按服务规范落定。

| 所属方 | 表 | 内容 |
|---|---|---|
| Node | `xy_wap_embed_ai_usage_outbox` | 稳定事件键、uid、事件载荷、投递状态、重试时间、次数、租约及错误 |
| Billing Service | `ai_usage_bill` | 用量事实、业务对象、基础积分、模型倍率、应计/减免/实扣积分、减免原因和时间 |

账单按租户与业务事件键唯一去重，保存 Node 上报的基础积分和整数基点倍率。积分采用定点表示，精度与舍入方式在协议中统一。业务时间遵循 UTC+8。

Node 按能力确定基础积分，并把基础积分与模型倍率快照一同上报。模型倍率放模型表的 `credit_multiplier` 字段，模型 API 与跨服务计费契约统一传递整数基点原值；只有 UI 展示层换算为 `credit_multiplier / 100`。Billing Service 不查询能力价格或模型表，只根据上报快照计算账单。暂不建独立用量表、价格表、账期汇总表或积分流水表。汇总先查询账单明细；正式扣费阶段再评估复用现有积分账户与流水。

## 流程与归属

```mermaid
flowchart TD
    A[AI 回复完成] --> D[Billing Service]
    B[Node 洞察 / 记忆 / Workflow 完成] --> C[Node outbox 持久化]
    C -->|后台批量 HTTP，可重试，无 MQ| D
    D --> E[幂等接收、统一计价、内测减免]
    E --> F[用量账单表]
    G[订阅页面] --> H[Node Backend 鉴权与适配]
    H --> I[Billing Service 账单查询接口]
    I --> F
```

Node 提供基础积分与模型倍率快照，但不计算应计、减免或实扣积分，也不直接写账单表。业务成功与 outbox 的持久化必须保证一致，投递故障不重新执行模型任务。批量响应逐条区分接收、重复、拒绝；超时后使用原事件键重发。

自动洞察的计费键应按逻辑会话稳定，不能每个分析 job 都生成新账单；主动重刷使用独立业务操作键。记忆按 run item，Workflow 按节点执行实例去重。内部调用成本与客户计费事件分开；Token 不写入 Usage Event，由各业务运行记录独立保存。

### Usage Event 契约

- `eventKey` 标识一次实际完成的用量事件，用于 Node 重试幂等；`billingKey` 标识客户计费单元，由 Billing Service 去重。两者不得合并。
- `occurredAt` 使用 UTC RFC 3339，并在 Node 构造事件时统一为三位毫秒的 `.sssZ`；免费期按该业务发生时间判断。
- Node 上报六位小数字符串 `baseCredits` 和整数基点 `creditMultiplier`；Usage Event 不包含模型 Token。
- `businessSnapshot` 仅保存运行模式、节点标识等审计所需标量字段，最多 16 项；不得写入消息正文、Prompt、客户资料或嵌套业务对象。
- `capability` 与 `businessType` 固定配对：回复对应 `agent_reply`，洞察对应 `logical_session`，记忆对应 `user_memory_run_item`，三类 Workflow AI 节点对应 `workflow_node_execution`。
- 单批最多 100 个事件，Billing Service 按 `uid + eventKey` 对每条返回 `accepted`、`duplicate` 或 `rejected`。账单查询金额使用六位小数字符串，避免跨服务的浮点误差。
- 账单汇总和明细查询显式传递 `uid`；明细使用 cursor 分页，单页最多 100 条。

### Outbox 状态与 SQL 预算

- `pending` 到期后可领取为 `leased`；过期 `leased` 可被其他 Worker 恢复领取；Billing Service 接收成功进入 `delivered`，业务拒绝进入 `rejected`，超过重试策略进入 `dead`，可重试故障回到 `pending`。
- 所有状态更新都校验 `id + leased + lease_owner`，旧租约持有者不能覆盖新 Worker 的处理结果。
- 领取批次硬上限为 100，优先恢复过期租约，再用剩余额度领取待投递事件；每批最多锁 100 行，执行最多 2 条候选查询和 1 条批量更新，不随批内事件数增加 SQL。正常首次入队 1 条 SQL，重复键校验为 2 条 SQL。
- 索引仅服务已定义查询：`(status, next_attempt_at, id)` 用于待投递领取，`(status, lease_expires_at, id)` 用于过期租约恢复，`(uid, business_type, business_id, id)` 用于按业务对象排查和回放。

## 并行交付

- 我们：表设计、上报/查询协议、Node 用量接入、outbox、真实 HTTP 客户端、订阅页面与契约测试。
- Billing Service：确认设计，实现账单表、回复计量、批量幂等接收、计价减免和查询接口。
- 接口未就绪：采集和投递均保持关闭，生产环境暂不创建 outbox 表。模拟服务仅用于测试，不能确认生产事件已投递。账单入口暂不开放，不显示伪造账单或零用量。
- 免费期归属由 Billing Service 按业务发生时间与受控政策确认，不按接收时间补扣，也不信任调用方任意指定减免。

实施步骤与验收见[联调准备计划](../../plans/2026-09-10-ai-credit-billing.md)。
