# Workflow 群发触达节点

## 产品语义

`marketing-message` 属于会话互动分组，同时适用于 `wecom_sop` 和 `chatai_sop`。节点选择一个推送型触达任务，并保存 `{ planId, planName }` 快照用于画布和设置面板回显；运行时以 `planId` 为准，不重新校验计划状态或渠道。

节点只有默认出口，支持两种等待策略：

- 不等待：Java 确认任务下发成功后立即执行后续节点，输出 `pushSuccess: true`。该值只表示任务下发成功，不代表实际触达了用户。
- 等待指定时间：任务下发成功后等待 30 分钟至 48 小时，到期只查询一次触达结果，输出查询结果后继续执行后续节点。查询结果中 `status` 为 `1` 时输出 `pushSuccess: true`，其余情况输出 `pushSuccess: false`。

触达结果为 `false` 时节点正常完成，由用户通过输出决定后续流程。身份映射失败、推送接口失败或查询接口失败时终止流程。

`chatai_sop` 和 `wecom_sop` 均由开始节点配置消息发送时段，默认 `09:00-20:00`。群发触达节点仅在允许时段内调用推送接口；时段外到达时延期至下一个允许发送时间。历史 Run 未保存时段时同样使用默认值。等待时长从任务成功下发后开始计算，已下发任务的到期结果查询不受发送时段限制。

## 资源列表

Backend 代理以下 Java 接口，页码从 1 开始，单页固定 20 条：

```http
POST /third-internal/cdp-market-plan/list-plan
```

请求：

```json
{
  "page": 1,
  "pageSize": 20,
  "planName": "双十一",
  "uid": 272
}
```

Java 返回标准信封以及固定顶层分页字段 `count`、`hasNext`、`list`、`page`、`pageSize`。列表项包含 `name`、`planId`、`sendChannels` 和 `status`；渠道 `1` 表示短信，`3` 表示企业微信。选择器支持搜索、分页、加载错误重试和过期响应隔离，每次搜索或翻页最多产生一次列表请求。

`wecom_sop` 显示禁用的“去创建”入口，跳转地址确认后再接入；`chatai_sop` 隐藏该入口。

## 推送与查询

推送接口：

```http
POST /third-internal/cdp-market-plan/push-user?idempotentKey=<nodeExecutionKey>
```

```json
{
  "bizId": 123,
  "externalUserId": 3166,
  "planId": 701,
  "uid": 272,
  "workUserId": 35954
}
```

查询接口：

```http
POST /third-internal/cdp-market-plan/get-push-user-result
```

```json
{
  "bizId": 123,
  "planId": 701,
  "uid": 272
}
```

查询成功响应：

```json
{
  "success": true,
  "data": {
    "status": 2
  }
}
```

`externalUserId` 使用 Workflow 统一身份准备结果。WeCom 联系人主体可直接使用数字 `subjectId`；ChatAI 联系人通过身份映射获取。`workUserId` 使用 Entry 事件中的 `trigger.projection.workUserId`。任一字段映射不到正整数时，不调用推送接口并终止流程。

`idempotentKey` 使用 Runtime 生成的稳定 Node Execution Key，并沿用其他 Action 节点的 Java 幂等协议：相同 Key 和相同请求不得重复下发，相同 Key 但请求内容不同应拒绝。超时或进程恢复后的重复推送复用同一个 Key。

`bizId` 使用当前 Workflow Task 的数字 ID，只用于后续查询触达结果，不承担幂等职责。查询接口是只读操作，不携带 `idempotentKey`。

等待模式下，Node 在推送成功后持久化 `bizId` 和 `dueAt`，到期恢复时不再次推送。查询接口由 Java 聚合短信和企业微信等渠道结果；`status` 为 `1` 时向 Workflow 返回 `pushSuccess: true`，其余情况返回 `pushSuccess: false`。

## 错误与上线边界

两个执行接口都通过共享 `decodeJavaInternalApiEnvelope` 解码。`success: false`、非法信封、非法 JSON、非法业务字段、非 200 HTTP、网络异常及单次操作超时均为 terminal，流程停止；当前产品语义不对推送或到期查询执行 Runtime 自动重试。若后续要对传输故障增加重试，必须先重新确认“只查询一次”的用户语义和 Java 幂等边界。

当前查询接口契约和生产执行链路已接通，节点 maturity 为 `runtime-ready`，允许发布并进入真实 Runtime。正式发布前仍必须完成以下目标环境集成验收：

1. Java 查询接口在目标环境部署并通过真实响应联调。
2. Java 按 URL query 中 `idempotentKey` 的推送幂等行为通过重复请求验证。
3. 等待中、触达成功和触达失败三种查询结果通过联调。
4. Node Worker 的超时、错误诊断和恢复路径通过目标环境验收。
