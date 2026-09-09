# Workflow 发券节点

## 产品与契约

一个节点只选一种优惠券，发放张数为整数 1–5，默认 1。标准弹窗提供名称查询、单选和分页；仅确定时提交选择，取消和关闭不改变草稿。面板回显优惠券名称、优惠内容、数量，支持编辑。未选券草稿可保存，发布必须选择一张券。Draft 保存轻量名称/内容快照供回显，Execution 仅包含 couponId、number，不把库存快照当发放许可。

查询固定调用 POST /third-internal/mall-coupon/page-coupon，getMode=2，不增加状态或库存筛选。每次用户查询/翻页一次调用，默认10条，可选20/50条，页码上限1000；达到上限提示缩小查询范围，不全量加载，不本地过滤或分页。身份uid来自登录会话，不信任浏览器租户参数。Java固定顶层list/count/page/pageSize/hasNext解码；失败为加载错误，可重试；取消请求与过期响应不更新弹窗。

## 执行

Action 身份为 mallUserId，使用统一身份解析，不能将externalUserId当成mallUserId。一次 POST /third-internal/mall-coupon/send-coupon-to-user，请求couponSends仅一项，number为1–5。用户确认该接口使用URL参数idempotentKey，Java保证同键重试不重复发券；不在Node循环按张发放。

顶层success=false或单项success=false为terminal。实际发放数量不足也为terminal，不补发、不回滚；诊断保留failReason。完整成功须券ID匹配、实际数量匹配、用户券ID数量一致且无重复，返回空输出并走默认出口。未新增业务输出或试运行按钮，避免隐式真实发券。HTTP/网络故障按现有Action机制retryable，复用稳定幂等键；超时沿用默认Capability deadline并传播AbortSignal。

节点接通真实Worker组合后为runtime-ready。无新增SQL、DDL、数据迁移或Live Revision变量引用；切换Revision沿用统一调度规则。Java资源与发券接口已由用户提供，幂等协议及失败终止语义已确认；自动测试不向真实客户发放优惠券，真实发放联调须单独授权。
