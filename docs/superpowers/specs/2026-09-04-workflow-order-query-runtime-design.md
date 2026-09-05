# Workflow 订单查询节点运行设计

- 日期：2026-09-04
- 状态：Implemented
- 范围：`order-query` Contract、Compiler、Web、Runtime、Worker 与编辑器资源代理

## 1. 节点语义

订单查询是无副作用的 Query 节点，稳定出口为 `default`，不向 Java 发送 Action 幂等键。

节点支持两种互斥模式：

- `order-number`：引用一个可达的前置字符串或数字变量，精确查询主单号或子单号。
- `conditions`：使用当前客户的 `xyId`，按可选平台、可选店铺/达人、可选商品名称、订单时间、可选订单状态和金额条件查询。平台选择“全部”时不传平台筛选字段；商品名称使用 Java `goodsName` 的模糊匹配能力。

条件模式的订单时间字段支持下单时间、支付时间和完成时间，分别映射 Java 的 `orderTimes`、`payTimes` 和 `finishTime`。时间范围支持三种模式：

- `dynamic`：默认模式，开始时间引用 `trigger.occurredAt`，结束时间引用当前订单查询节点的 `enteredAt`；也可选择其它可达的 datetime 变量。
- `relative`：以订单查询节点的 `enteredAt` 为基准向前计算，并按配置覆盖时分；开始分钟从 `:00` 计入，结束分钟包含到 `:59`。
- `absolute`：配置固定的 UTC+8 本地日期时间范围。

Compiler 校验动态时间变量的 datetime 类型、确定前序可用性和因果顺序；Runtime 在调用 Java 前解析选择器、拒绝缺失或反向范围，并统一生成 UTC+8 wall-clock 秒级时间。

条件弹窗使用独立草稿；关闭、取消、点击遮罩或按 Esc 均丢弃本次修改，只有点击“保存”才更新节点配置。

保存时校验绝对时间完整且开始不晚于结束，订单金额仅接受非负数且最多两位小数，最低值不大于最高值。店铺/达人最多选择 20 个。相对时间和绝对时间均从第 361 天开始判为无效：时间点达到保存时刻前第 361 天，或时间跨度达到 361 天时拦截，因此完整的第 360 个自然日（最多 360 天 23 小时 59 分）允许保存。用户提示仍表述为“时间不能早于 360 天前”或“时间跨度不能超过 360 天”。Runtime 对非动态时间重复执行该边界检查，防止绝对时间配置随工作流长期运行而过期。

## 2. Java 接口

编辑器资源：

- `POST /third-internal/cdp-platform/list-platform`
- `POST /third-internal/cdp-shop/list-auth-shop`
- `POST /third-internal/cdp-order/select-order-status`
- 编辑器选择“全部”时，资源请求和 Java 请求均省略 `platformIds`。
- 订单状态下拉选择“不限”时，执行查询省略 `orderStatus`；状态值 `0` 是有效枚举值，不能按空值处理。

执行查询：

- `POST /third-internal/cdp-order/search-order`
- 固定只请求 `pageNum = 1`、`pageSize = 100`，不自动读取后续页。
- 条件查询按 `tradeTimeAsc = true` 请求稳定顺序。
- 未选择店铺时省略 `shopIdList`，表示不限制店铺。
- Java 标准信封统一通过 `decodeJavaInternalApiEnvelope` 解码。

HTTP 或网络失败进入 Runtime retry；Java 业务拒绝或非法响应时 terminal。Java 返回的 `count` 超过 100 时不视为失败，Runtime 仅按第一页最多 100 条计算并继续流程。

## 3. 订单统计与金额

金额筛选由 Worker 按第一页订单的 `actuPayment` 复核，可配置最低金额、最高金额或双边区间，边界均包含在内。Worker 只聚合本次返回的最多 100 条订单。

Java 查询响应使用顶层 `count`、`page`、`pageSize` 和 `list`；Runtime 校验响应为第一页且列表不超过 100 条，不根据 `count` 继续翻页。Runtime 使用第一页中最终通过金额复核的订单数作为累计订单数，不直接使用 Java 在复核前返回的 `count`。因此 `count > 100` 时，三项输出都明确是第一页最多 100 条订单的截断统计。

输出：

- `orderCount`：最终满足全部条件的累计订单数。
- `totalAmount`：命中订单的 `actuPayment` 累计值。
- `netAmount`：每笔 `actuPayment` 扣除已完成退款后的累计值，最低为 0。

当前 Java 文档没有提供 `subRefundState` 枚举，因此以非空 `subRefundFinishTime` 作为退款已完成的权威证据，再扣除对应 `subRefundAmount`。若 Java 后续提供稳定枚举，需单独更新该判定并补兼容测试。

每笔订单必须返回 `subOrders` 数组，空数组表示没有子单退款明细。字段缺失或类型错误时无法证明净成交金额正确，Runtime 按非法响应终止，不将其静默当作无退款。

## 4. 试运行

订单查询使用同步试运行接口，不创建 Attempt 记录、不进入 Worker 队列，也不轮询状态：

- `POST /api/server/workflows/:workflowId/nodes/:nodeId/order-query-test-run`
- Embed Surface 使用对应的 `/api/server/embed/workflows` 前缀。
- Backend 校验操作者权限、租户权益、当前已保存的 `draftVersion`、节点类型和 Execution Config 完整性。
- 单次试运行整体超时 12 秒；前端关闭或停止运行时取消当前 HTTP 请求。
- Backend 与生产 Worker 复用同一个订单查询 HTTP Capability Port，保持 Java DTO、分页、聚合和输出映射一致。

临时输入按当前节点模式决定：

- `order-number`：用户直接填写临时订单号，不需要客户身份，也不依赖节点是否已经选择 `orderNumberSelector`；正式发布仍要求配置订单号变量。
- `conditions`：用户填写正整数 `externalUserId`；Backend 调用 `POST /third-internal/wap-embed-contact/get-contact-identity`，以 `{ uid, type: 2, externalUserId }` 获取 `xyId`，再执行订单条件查询。`uid` 来自当前登录租户，不由用户填写。
- 动态时间的开始与结束选择器均需提供临时日期时间，包括 `current-node-lifecycle.enteredAt`；按 selector 去重后逐项填写，请求中的 selector 集合必须与当前已保存配置完全一致。
- Backend 的试运行开始时间只用于本次请求的超时与 deadline，不替代用户为动态时间选择器提供的临时值。

同步响应只返回节点真实的三项映射输出：`orderCount`、`totalAmount` 和 `netAmount`。接口失败通过全局 toast 反馈；字段缺失或格式不合法在对应输入附近提示。

## 5. 发布门禁

按订单号模式在 Compiler 校验变量可达性及字符串/数字类型。条件模式要求合法时间范围和合法金额边界；平台可选，省略时表示全部平台。Runtime 在任何 Java 查询前准备并校验 `xyId`。节点生产 Worker 已注册 `customer.order.query` Capability Binding，因此 maturity 为 `runtime-ready`。
