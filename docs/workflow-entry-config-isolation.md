# Workflow Entry 配置与失败隔离

## 配置边界

已发布的 Start 配置可能保留当前版本不再消费的字段，例如 `pushAccountStrategy`。
Runtime 按当前 Start Schema 提取需要的字段，忽略顶层和嵌套对象中的额外字段，再校验提取结果。
不维护废弃字段白名单，也不因不消费的字段阻止 Run 启动。

实际消费的字段仍须满足必填、类型、枚举、数量和范围约束；额外字段清理不能通过删除错误值或填入默认值绕过校验，既有显式默认值策略不变。
此处不改变 Entry Envelope 的版本、事件类型、身份字段校验，也不放宽其他节点的执行契约。
Draft 保存沿用当前已实现的节点配置投影，清除未声明字段；回归测试同时确认已声明字段保留及保存后可重新读取。

## Binding 隔离

同一事件匹配多个 Workflow 时，单个准入失败不得阻断其他匹配项。
不可重试的 Start 配置错误仅拒绝对应 Workflow；暂时性错误在其他匹配项处理完后仍导致整条消息 NACK。
存在暂时性错误时不将该事件标记为已处理，成功创建的 Run 沿用事件 ID 去重。
配置错误被消费后不会因稍后修复配置而自动补处理原事件。

## 诊断

`workflow.entry.admission.failed` 独立记录单个准入异常，即使消息最终为 `admitted` 也不隐藏该异常。
字段包含租户、Workflow、Revision、事件 ID、错误码、是否可重试，以及有限的节点和 Schema 路径信息，不记录完整配置或 Schema 错误中的字段值。
沿用 Entry Observer 的每分钟采样窗口，默认最多记录 3 条准入异常样本；不按 Workflow 建立无界缓存。
`workflow.entry.consume.summary.admissionFailed` 统计所有准入异常次数，独立于消息级的成功、拒绝和 NACK 计数。
日志失败不得改变 binding 处理或 ACK/NACK 决策。
