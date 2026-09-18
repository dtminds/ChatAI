# 半托管 Agent Turn 前端交互规范

- 日期：2026-09-15
- 更新：2026-09-18
- 状态：Draft
- 范围：半托管模式 2.0 的辅助条、思考过程、人工介入和回复 Composer 交互
- 关联产品方案：[`docs/product/2026-09-09-semi-managed-mode-2.md`](../product/2026-09-09-semi-managed-mode-2.md)
- Preflight 产品方案：[`docs/product/2026-09-17-chat-agent-preflight.md`](../product/2026-09-17-chat-agent-preflight.md)
- Backend Mock：[`2026-09-16-agent-turn-mock-backend-protocol.md`](./2026-09-16-agent-turn-mock-backend-protocol.md)

## 1. 协议来源

Agent Turn 传输协议只在共享 Contract 中定义：

- 通用事件、人工决策、客服澄清和 Turn 结果：`packages/contracts/src/chat/agent-turn.ts`
- 开发环境 Mock 场景和启动请求：`packages/contracts/src/chat/agent-turn-mock.ts`

本文不复制事件联合类型、字段 Schema 或 Reducer 输入。Contract 是 Backend、Web 和测试的唯一协议来源；本文只记录客服可感知的交互、前端投影和扩展边界。

当前实现直接消费 `AgentTurnEventEnvelope`，不在前端维护第二套传输事件或通用活动协议。

## 2. 产品目标

一个 Agent Turn 可能连续经历思考、自动工具调用、需要客服审批的工具调用、客服澄清和最终回复。前端需要做到：

1. 辅助条始终用一句话表达当前进展。
2. 思考过程忠实展示本轮已经发生的可观察活动。
3. `tool_call` 与对应 `tool_result` 合并成同一条过程记录。
4. 人工审批和客服澄清使用独立面板，不与辅助条或过程面板叠加。
5. 最终对客回复写入共享 Composer，由客服检查后发送或忽略。
6. Mock 与未来真实 Agent Loop 使用同一套通用事件 Contract 和 UI 投影。

以下内容不是当前目标：

- 展示模型原始思维链。
- 引入 Intent Group、Frame 或其它高层活动分组。
- 由前端判断工具是否应该自动执行。
- 为未知工具猜测业务含义或成功文案。
- 在协议中指定 React 组件、颜色或动画实现。

## 3. 数据流

```text
Agent Turn SSE / 最近一次 Turn 快照
  -> AgentTurnEventEnvelope[]
  -> 当前 Turn 状态投影
  -> 辅助条 / 思考过程 / 人工介入面板 / Composer
```

事件信封中的 `turnId` 标识一次 Turn，`sequence` 定义 Turn 内顺序，`eventId` 用于去重，`callId` 配对同一次工具调用与结果。前端不根据到达时间猜测顺序。

通用事件的当前职责如下：

| 事件 | 前端职责 |
| --- | --- |
| `turn.started` | 进入运行态，辅助条显示通用思考状态 |
| `activity.updated` | 可选的可展示思考摘要；当前 Mock 不产生该事件 |
| `tool_call` | 创建过程活动，更新辅助条摘要，识别控制工具和审批模式 |
| `decision.requested` | 暂停普通运行 UI，展示工具审批面板 |
| `decision.resolved` | 记录客服选择，恢复运行态，等待后续工具结果 |
| `tool_result` | 更新同一 `callId` 的结果、失败或取消状态 |
| `turn.completed` | 结束执行循环；按 outcome 进入回复确认或完成态 |
| `turn.failed` | 展示 Turn 失败状态和原因 |
| `turn.cancelled` | 结束当前交互并回到等待态 |

前端只投影 Contract 已定义的事件。未来新增事件时先修改共享 Contract，再更新 Backend、Web 和本文，不在前端私自扩展另一套事件名。

## 4. 辅助条与过程面板

### 4.1 Turn 启动

Turn 刚启动且尚无可观察活动时：

- 辅助条显示「AI 正在思考」及当前步骤耗时。
- 思考过程面板保持关闭，避免用虚假的活动填充列表。

第一条 `activity.updated` 或 `tool_call` 到达后，过程面板自动向上展开。辅助条继续展示当前进展，不因过程面板出现而消失。

### 4.2 当前摘要

工具调用的摘要使用 `tool_call.summary`：

- 有非空 summary：辅助条展示 summary。
- 没有 summary：回退为「AI 正在思考」。
- `decision.requested` 没有可用 summary：展示「需要你确认」。
- 工具失败后 Agent 仍继续运行：展示轻量失败提示并等待下一项活动。

summary 是对当前动作的客服可见概括，不属于业务工具参数。前端不得根据工具名拼接不存在的执行结论。

### 4.3 过程面板生命周期

- 运行中：第一条真实活动到达后自动展开。
- 活动追加：面板内容溢出时持续滚动到最新活动。
- 等待审批或澄清：辅助条和过程面板同时隐藏，由人工介入面板替代。
- 人工介入结束：恢复运行态，后续真实活动继续进入过程面板。
- Turn 结束：自动播放过程面板退出动画。
- Turn 已结束且存在历史活动：辅助条最右侧提供展开入口，客服可以手动查看最近一次 Turn。
- 手动展开后：辅助条展开按钮保持原图标但禁用；收起按钮位于过程面板右上角。
- 会话切换：通过 Backend 最近 Turn 接口重新加载，不依赖前端内存长期保存。

过程面板固定高度并内部滚动，不持续推高 Composer，也不承担审批或澄清操作。

## 5. 过程活动投影

前端展示模型定义在 `apps/web/src/pages/chat/lib/agent-turn-timeline.ts`，它只是 UI 投影，不是跨层协议。

### 5.1 工具调用

`tool_call` 创建一条以 `callId` 为 ID 的活动；`tool_result` 更新同一条活动：

```text
tool_call(call-1)
  -> 查询订单 / 运行中

tool_result(call-1, succeeded)
  -> 查询订单 / 已取得输出
```

同一 `callId` 的重复 `tool_call` 不产生第二条活动。找不到对应调用的结果不会创建孤立活动。

活动标题按工具名查前端标签表，未注册时直接显示工具名。summary 存在时优先作为过程行文案展示。

### 5.2 状态展示

- 运行中的活动使用动态文字效果。
- 成功活动不展示「已完成」等冗余状态。
- 工具失败使用警告图标，并允许查看错误原始信息。
- 客服拒绝或要求其它处理方式时使用警告图标并展示对应指令。
- 客服允许执行不额外展示「已允许」文案。
- 思考活动使用思考图标，不使用任务完成图标。

### 5.3 工具详情

过程列表默认只显示单行摘要。工具活动存在输入、输出或错误时可以展开原始数据；`turn.finish` 代表最终回复交付，不在过程列表中展开对客回复详情。

当前通用详情只负责安全地展示输入、输出和错误。业务化审批 UI 按工具名注册在审批组件中，协议不包含组件名。未知工具使用通用只读参数展示。

真实 Backend 接入后，内部参数和结果必须在进入客服 UI 前完成必要的脱敏或安全转换。

## 6. 工具审批

`tool_call.approvalMode` 由执行层确定：

- `auto`：直接执行，不展示审批面板。
- `human`：随后产生 `decision.requested`，展示工具审批面板。

审批面板替代辅助条和过程面板，Composer 仍保留，避免客服失去当前输入上下文。

工具参数在审批 UI 中只读。客服可以：

- 「继续」：批准原始 Tool Call。
- 「拒绝」：取消原始 Tool Call。
- 「拒绝并告知其他方式」：输入完整指令，让 Agent 重新规划。

修改参数不通过表单直接回写 Tool Call。客服需要变更订单号、金额或处理路径时，应通过完整指令告诉 Agent；后续新的 Tool Call 仍按自身审批模式处理。

按钮点击只提交决策，不代表业务执行成功。最终状态必须由后续 `tool_result` 决定。

## 7. 客服澄清

`request_kf_clarification` 是 Agent 主动调用的控制工具，不是 Tool Approval：

- 工具本身自动放行。
- 调用后暂停 Loop，并展示客服澄清面板。
- 建议选项是输入捷径，不是封闭枚举。
- 客服可以选择建议，也可以输入任意其它处理指令。
- 点击「继续」后，Backend 将输入归一为包含完整 instruction 的 `tool_result`，Agent 再继续运行。
- 点击「终止」取消挂起调用和当前 Turn，不把终止伪装成一条客服指令。

澄清面板与审批面板使用一致的视觉层级和进入动画。它们都替代运行中的辅助条与过程面板，避免同时出现多个争夺注意力的区域。

## 8. Turn 结束与 Composer

Agent 必须通过控制工具 `turn.finish` 明确结束执行循环：

- `outcome: "reply"`：包含给客户的完整消息 segments。
- `outcome: "no_reply"`：说明当前消息无需回复，并提供内部原因与摘要。

`turn.finish(outcome="reply")` 到达并完成后：

1. 回复 segments 写入工作台唯一的 Composer 实例。
2. Composer 切换到 suggestion 模式。
3. 辅助条展示完成摘要和「忽略」操作。
4. 客服发送成功后结束本次交互；忽略时清空当前建议并回到等待态。

Agent Turn 的执行结束不等于消息已经发送。客服仍然拥有最终编辑和发送权。

`outcome: "no_reply"` 不进入回复 Composer，辅助条展示轻量结论；原因只在需要时作为补充信息提供。

## 9. 话术推荐兼容层

现有话术推荐暂时使用独立投影接入同一套辅助条和共享 Composer，不伪造通用 Agent Turn 事件：

```text
SmartReplySuggestion / pending
  -> resolveSmartReplyAssistantTurn
  -> 辅助条阶段 + Composer 模式
```

关键规则：

- Composer 为空时直接生成；已有内容时先确认是否起草回复。
- 建议 ready 后覆盖同一个 Lexical Editor，并保留一次撤销恢复原内容的能力。
- suggestion 模式仍支持引用、表情、快捷回复、素材和文件插入，但只通过「采纳并发送」统一发送。
- 横条确认态只保留「重新生成」「忽略」。
- 忽略已生成建议会清空 Composer 和违规词检测结果，不恢复旧草稿。
- 重新生成失败时保留旧建议并解除编辑锁。
- 活跃建议期间到达的新客户消息不排队自动生成下一条建议。

Smart Reply 的 `generateStatus` 不是通用 Agent Turn 协议；真实 Agent Loop 接入后应替换事件来源，不扩展 Smart Reply 状态枚举承载工具调用。

## 10. Preflight

Preflight 在最新未回复客户消息到达后进行弱感知判断：

- `no_response_needed`：辅助条保持等待态。
- `response_needed`：展示连续上下文摘要和启动 Agent 的确认操作。

Preflight 不展示独立 loading 状态，不自动启动 Agent，也不抢占 Composer。客服确认后才进入 Agent Turn。Preflight 响应 Contract 位于 `packages/contracts/src/chat/chat-agent-preflight.ts`。

## 11. 实现边界

当前主要实现入口：

- 辅助条：`apps/web/src/pages/chat/components/chat-ai-assistant-status-bar.tsx`
- Agent Turn 控制器：`apps/web/src/pages/chat/components/use-agent-turn-mock.ts`
- 过程投影：`apps/web/src/pages/chat/lib/agent-turn-timeline.ts`
- 过程 UI：`apps/web/src/pages/chat/components/chat-agent-turn-timeline.tsx`
- 工具审批：`apps/web/src/pages/chat/components/chat-agent-tool-approval-prompt.tsx`
- 客服澄清：`apps/web/src/pages/chat/components/chat-agent-clarification-prompt.tsx`
- 工作台组装：`apps/web/src/pages/chat/components/chat-panel.tsx`

`use-agent-turn-mock.ts` 当前包含 Mock 接线和 UI 状态投影。真实 Agent Orchestrator 接入时应替换数据来源和命名，不改变 Contract 事件的前端语义。

## 12. 验收场景

| 场景 | 预期结果 |
| --- | --- |
| Turn 启动但尚无活动 | 辅助条显示思考状态，过程面板不展开 |
| 第一条真实活动到达 | 过程面板自动展开 |
| Tool Call 有 summary | 辅助条和过程行展示 summary |
| Tool Call 无 summary | 辅助条回退为通用思考文案 |
| Tool Result 返回 | 更新同一活动，不增加重复过程行 |
| 工具失败 | 过程行显示警告，可展开错误信息 |
| 工具需要审批 | 辅助条和过程面板隐藏，展示审批面板 |
| 客服批准 | 等待后续 Tool Result，不提前显示成功 |
| 客服拒绝 | 过程历史记录拒绝结果，Agent 可以继续规划 |
| 客服要求其它方式 | 完整指令返回 Agent，后续调用重新进入正常审批流程 |
| Agent 请求客服澄清 | 展示建议和自由指令，不产生审批事件 |
| 客服终止澄清 | 取消挂起调用和 Turn，回到等待态 |
| Turn 生成回复 | 回复写入共享 Composer，由客服编辑并发送 |
| Turn 无需回复 | 不写入 Composer，展示轻量完成结论 |
| Turn 结束 | 过程面板自动收起，允许从辅助条手动展开历史 |
| 过程内容超过高度 | 面板内部滚动并持续定位最新活动 |
| 切换会话 | 从 Backend 加载该会话最近一次 Turn |

## 13. 待对齐项

真实 Agent Orchestrator 接入前仍需明确：

- 工具输入、输出和错误的脱敏责任。
- Backend 最近 Turn 的持久化和保留周期。
- 多个并行 Tool Call 出现时，辅助条当前摘要的选择规则。
- `activity.updated` 是否由模型提供可展示 reasoning summary；没有该能力时可以长期不产生该事件。
