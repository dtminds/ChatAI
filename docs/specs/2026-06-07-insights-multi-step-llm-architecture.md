# 洞察分析多步调用架构 Handoff

## 背景

当前洞察分析（Insight Worker）对每个会话执行**一次 LLM 调用**，在一个 JSON 里同时输出所有维度：summary、problemResolution、qaFindings、tags、entities、intents、sentiment、actionItems、faqCandidates、risks。

### 现存问题

- **任务性质混杂**：理解类（summary）、审计类（qaFindings）、匹配类（tags/entities）混在一次调用里，互相干扰
- **规则多时质量下降**：实体最多 80 个 ×8 别名、标签 50 个、质检规则 40 条，prompt 膨胀后 LLM 容易漏匹配
- **qaFindings 质量无保障**：质检结果直接用于客服绩效报表，但被夹在其他任务中间，LLM 容易"疲劳"跳过规则
- **重刷粗粒度**：改了标签配置必须全量重刷所有维度，浪费 token

---

## 当前代码结构

### Prompt 构建

`apps/backend/src/modules/insights/insight-prompt-builder.ts`

- `buildInsightPromptMessages()` — 入口，返回 `[systemPrompt, userPrompt]`
- `buildSystemPrompt()` — 固定 system prompt，描述所有任务
- `buildUserPrompt()` — 将 `tenantContext`（qaRuleConfigs、labelConfigs、entityDictionary）+ 消息 + 前序会话序列化为 JSON
- `buildOutputContract()` — 定义输出 JSON 的 schema，含条件判断：当某类配置为空时对应字段输出 `[]`

### Worker 调用链

`apps/backend/src/modules/insights/insights-worker.ts`

```
getPromptContext(uid)  →  buildInsightPromptMessages({ context, messages, previousSessionContexts })  →  model.analyzeSession()
```

### 配置管理

- QA 规则：`InsightQaRuleConfig`（ruleCode, ruleName, severity, judgmentCriteria, positiveExamples, negativeExamples, applicableScene, enabled）
- 标签：`InsightLabelConfig`（labelCode, labelName, description, positiveExamples, negativeExamples, enabled）
- 实体：`InsightEntityDictionaryItem`（canonicalName, entityType, aliases, enabled）
- 意图：`InsightIntentConfig`（intentCode, intentName, description, positiveExamples, negativeExamples, sortOrder, enabled）

### 前端展示

- 会话详情面板：`apps/web/src/pages/chat/insights/insight-detail-panel.tsx`
  - "质检"行在 `buildInsightResultItems()` 里，但只有 `qaFindings.length > 0` 时才展示
  - `InsightResultTable` 有 `visibleItems = items.filter(item => item.items.length > 0)` 过滤逻辑
- 质检页：`apps/web/src/pages/chat/insights/insights-quality-page.tsx`
- 配置页：`apps/web/src/pages/chat/insights/insights-settings-page.tsx`

---

## 架构决策

### 决策 1：拆分为 4 次调用

| 调用 | 内容 | 模型 | 任务性质 |
|------|------|------|----------|
| Call 1 | `summary` + `problemResolution` + `actionItems` | 主力模型 | 理解：读懂对话、判断问题是否解决、识别待跟进事项 |
| Call 2 | `qaFindings`（输入带 Call 1 结论） | 主力模型 | 审计：逐条规则独立判断，输入含判定标准和正例反例 |
| Call 3 | `tags` + `entities`（输入带 Call 1 结论） | Lite 模型 | 匹配：从词库里机械匹配，候选集大但任务模式简单 |
| Call 4 | `intents` + `sentiment` + `faqCandidates`（输入带 Call 1 结论） | Lite 模型 | 判断：意图匹配 + 情绪感知 + FAQ 提取，候选集小 |

**理由：**
- Call 1 和 Call 2 用主力模型：理解和审计都需要强推理能力，且 qaFindings 用于绩效报表，不可降质
- Call 3 和 Call 4 用 Lite 模型：匹配类任务对推理能力要求低，但 Call 3 需要专注（候选集大），不能被其他任务分心
- 每步的结论注入下一步的输入（`priorConclusions` 字段），后续步骤可利用"问题是什么"来更精准地提取

### 决策 2：qaFindings 独立调用

**理由：**
- `problemResolution` 是"整体判断"，`qaFindings` 是"逐条审计"，任务模式完全不同
- 规则多时，夹在 summary 里一起输出，LLM 轮到 qaFindings 时注意力已下降
- qaFindings 是高后果输出，值得独立的专注调用

### 决策 3：支持维度级重刷

当前重刷 schema：
```ts
{ from: string }
```

改为：
```ts
{
  from: string;
  dimensions?: Array<"qaFindings" | "tagsEntities" | "intentsSentiment" | "all">;
}
```

- 不传或传 `all`：全量重刷（向后兼容）
- 传具体维度：只重刷对应调用，节省 token 和时间

**典型场景：**
- 重构了标签配置 → 只重刷 `tagsEntities`
- 新增了质检规则 → 只重刷 `qaFindings`
- 意图配置变更 → 只重刷 `intentsSentiment`

---

## 实现要点

### Prompt Builder 改造

当前：`buildInsightPromptMessages()` 返回一个 `[system, user]` 消息对

改为：提供 4 个独立的 builder 函数，每个只构建自己维度的 prompt：

```ts
buildCall1Prompt(input): InsightPromptMessage[]   // summary + problemResolution + actionItems
buildCall2Prompt(input, call1Conclusion): InsightPromptMessage[]  // qaFindings
buildCall3Prompt(input, call1Conclusion): InsightPromptMessage[]  // tags + entities
buildCall4Prompt(input, call1Conclusion): InsightPromptMessage[]  // intents + sentiment + faqCandidates
```

每个 builder 的 system prompt 只描述当前步骤的职责，不混杂其他任务指令。

### 结论注入方式

后续调用的 user prompt 里新增 `priorConclusions` 字段：

```json
{
  "messages": [...],
  "tenantContext": { ... },
  "priorConclusions": {
    "summary": { ... },
    "problemResolution": { ... },
    "actionItems": [ ... ]
  }
}
```

LLM 能读到上下文但不重复输出这些字段。

### Worker 串行编排

```
Call 1 完成 → 拿到结论
  → 并行发 Call 2 + Call 3 + Call 4（三者无依赖，可并行）
  → 合并所有结果，存入 snapshot
```

Call 1 失败 → 整体失败；Call 2/3/4 任一失败 → 对应维度降级为 `[]`，主结论不丢。

### 重刷逻辑

Worker 接收 `dimensions` 参数后：
- 只构建对应维度的 prompt
- 只调用对应的 LLM
- 只更新 snapshot 中对应维度的字段（其余字段保留原值）

---

## 待确认事项

- [ ] Lite 模型选型：具体用哪个模型作为 Lite（当前项目里是否已有 Lite 模型配置）
- [ ] Call 3 和 Call 4 是否并行（建议并行，两者无依赖）
- [ ] 重刷 UI 入口：配置页"历史重刷"面板是否需要新增维度选择器
- [ ] 现有 snapshot schema 是否需要扩展（存储各维度的独立生成时间，方便重刷判断）

---

## 相关文件

- Prompt 构建：`apps/backend/src/modules/insights/insight-prompt-builder.ts`
- Worker 编排：`apps/backend/src/modules/insights/insights-worker.ts`
- DTO 定义：`packages/contracts/src/insights/dto.ts`
- 后端服务：`apps/backend/src/modules/insights/insights.service.ts`
- 前端详情面板：`apps/web/src/pages/chat/insights/insight-detail-panel.tsx`
- 前端质检页：`apps/web/src/pages/chat/insights/insights-quality-page.tsx`
- 前端配置页：`apps/web/src/pages/chat/insights/insights-settings-page.tsx`
- 默认配置种子：`apps/backend/src/modules/insights/insights-seeds.ts`
