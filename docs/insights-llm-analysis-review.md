# 会话洞察 LLM 分析模块 Review 与优化方案

> **文档状态：** Handoff Ready
> **生成日期：** 2026-06-03
> **涉及分支：** 当前 feature 分支（会话切片 + LLM 分析）
> **目标读者：** 负责落地 LLM 分析优化的工程师

---

## 目录

1. [架构现状](#1-架构现状)
2. [核心文件索引](#2-核心文件索引)
3. [问题清单与优化方案](#3-问题清单与优化方案)
   - [P0 - 必须修复](#p0---必须修复)
   - [P1 - 高优改进](#p1---高优改进)
   - [P2 - 中期优化](#p2---中期优化)
   - [P3 - 长期规划](#p3---长期规划)
4. [多阶段 Pipeline 架构设计](#4-多阶段-pipeline-架构设计)
5. [模型分层管理方案](#5-模型分层管理方案)
6. [Prompt 重构方案](#6-prompt-重构方案)
7. [验收标准](#7-验收标准)

---

## 1. 架构现状

### 数据流

```
消息入库
  → sessionization（逻辑会话切片，idle timeout / hard max）
  → worker claim analyze job
  → buildInsightMessageInput（消息预处理，角色/类型映射）
  → buildInsightPromptMessages（system + user prompt 构建）
  → OpenAI-compatible API（Volcengine Ark，temperature=0.2）
  → parseModelJsonObject（JSON 解析 + markdown fence 剥离）
  → normalizeAnalysisOutput（防御性字段读取 + fallback）
  → filterConfiguredAnalysisOutput（标签/规则/实体配置校验）
  → normalizeEvidenceIds（证据 ID 在 session 内校验）
  → saveAnalysisResult
```

### 关键参数

| 参数 | 当前值 | 说明 |
|------|-------|------|
| `temperature` | 0.2 | 固定，不可配置 |
| `max_tokens` | **未设置** | 可能导致输出截断或浪费 |
| `response_format` | 默认未启用 | 导致需要 3 层 JSON 解析容错 |
| `retry` | **无** | 网络/限流直接 fail |
| `fallback provider` | **无** | 单点依赖 Volcengine Ark |
| `token usage 记录` | **无** | 无法衡量成本 |
| 实体词库上限 | 80 条 | `normalizeContext` 中 slice(0, 80) |
| 标签配置上限 | 50 条 | slice(0, 50) |
| 质检规则上限 | 40 条 | slice(0, 40) |
| 每条配置的示例上限 | 5 条 | positive/negativeExamples 各 5 条 |

### 分析维度（单次 LLM 调用输出全部）

| 维度 | 输出字段 | 任务类型 |
|------|---------|---------|
| 会话摘要 | summary (customerIntent, processSummary, resultSummary, followUp) | 生成 |
| 问题解决度 | problemResolution (problemDetected, resolutionStatus, evidence) | 判断 + 抽取 |
| 质检规则 | qaFindings (ruleCode, passed, reason) | 判断 |
| 标签匹配 | tags (tagCode, tagName) | 匹配 |
| 情感分析 | sentiment (polarity, reason) | 判断 |
| 实体识别 | entities (entityId, entityName, entityType) | 匹配 |
| 意图抽取 | intents (intentCode, intentLabel) | 分类 |
| 待办事项 | actionItems (actionType, priority, title) | 生成 |
| FAQ 候选 | faqCandidates (question, answerHint) | 生成 |
| 风险标记 | **已弃用**（prompt 中要求输出空数组） | — |

---

## 2. 核心文件索引

| 文件 | 职责 |
|------|------|
| `apps/backend/src/modules/insights/insight-prompt-builder.ts` | **Prompt 构建核心** — system prompt、user prompt、output contract、tenant context 注入 |
| `apps/backend/src/modules/insights/llm-provider.ts` | **LLM 调用层** — Volcengine Ark 配置、API 调用、JSON 解析、输出 normalize |
| `apps/backend/src/modules/insights/insight-message-input-builder.ts` | **消息预处理** — 消息类型映射、角色映射、AI 文本生成 |
| `apps/backend/src/modules/insights/insights-worker.ts` | **Worker 编排** — sessionization、analyze job 调度、后处理管线 |
| `apps/backend/src/modules/insights/insights-worker-runtime.ts` | **运行时配置** — 环境变量解析、worker 初始化 |
| `apps/backend/src/modules/insights/insights.service.ts` | **业务服务层** — 洞察数据查询、聚合、前端 API |
| `apps/backend/src/modules/insights/insights-worker.repository.ts` | **数据访问层** — prompt context 加载、session CRUD |
| `apps/backend/src/modules/insights/insights-seeds.ts` | **默认配置** — sessionization、analysis policy、示例标签/规则/实体 |
| `apps/backend/src/modules/insights/insights.types.ts` | **类型定义** — 消息类型、角色类型、AI 输入类型 |
| `packages/contracts/src/insights/dto.ts` | **API DTO** — TypeBox schema、前端响应类型 |

**测试文件：**

| 文件 | 覆盖内容 |
|------|---------|
| `apps/backend/test/modules/insights/insight-prompt-builder.test.ts` | prompt 注入、空配置约束 |
| `apps/backend/test/modules/insights/llm-provider.test.ts` | provider 配置、JSON fence 解析、evidence role 兜底 |
| `apps/backend/test/modules/insights/insights-worker.test.ts` | worker 逻辑 |
| `apps/backend/test/modules/insights/insights-worker-runtime.test.ts` | 运行时配置解析 |
| `apps/backend/test/modules/insights/insights-service.test.ts` | 服务层业务逻辑 |

---

## 3. 问题清单与优化方案

### P0 - 必须修复

#### P0-1: 未启用 `response_format: json_object`

**现状：** `llm-provider.ts:90-92`，`responseFormat` 是可选配置，默认不发送。导致模型有时输出 markdown fence 或前后附加解释文字，需要 3 层 fallback 解析。

**影响：** JSON 解析失败率 ~5-15%（取决于模型），每次失败浪费一次 API 调用。

**修复方案：**
- 文件：`llm-provider.ts`
- 在 `createVolcengineArkProviderConfig` 中将 `responseFormat` 默认值设为 `"json_object"`
- 或在环境变量中增加 `VOLCENGINE_ARK_RESPONSE_FORMAT` 默认为 `"json_object"`
- 如果 provider 不支持此特性，保留当前 fallback 解析逻辑作为兼容层

**验收：** LLM 返回的 content 一定是合法 JSON，不需要 `stripMarkdownFence` 和花括号截取。

---

#### P0-2: 未设置 `max_tokens`

**现状：** `llm-provider.ts:81-88`，requestBody 中没有 `max_tokens` 字段。

**影响：**
- 模型可能生成过长输出（hallucination 时大量重复 actionItems），浪费推理预算
- 输出可能被 provider 默认限制截断，产生 invalid JSON

**修复方案：**
- 文件：`llm-provider.ts`
- 在 requestBody 中添加 `max_tokens: 4096`（根据实测正常输出长度调整）
- 可通过环境变量 `VOLCENGINE_ARK_MAX_TOKENS` 配置

**验收：** 所有正常 session 的输出不被截断；异常长输出被优雅截断（JSON 解析失败时记录 warning 而非 crash）。

---

#### P0-3: `contentStatus: "unsupported"` 的消息不应送给 AI

**现状：** `insight-message-input-builder.ts:18`，`includedForAi = messageType !== "system"`。图片消息的 messageType 是 `"image"`（非 system），所以 `includedForAi: true`，但送给 AI 的文本只有 `[图片]`。模型收到这些"空壳"消息后可能产生幻觉推断。

**影响：** 当 session 中有大量图片消息时，模型可能基于 `[图片]` 占位符编造内容，污染情感分析、意图抽取等维度。

**修复方案：**
- 文件：`insight-message-input-builder.ts:18`
- 修改为：`const includedForAi = messageType !== "system" && content.contentStatus !== "unsupported";`
- 对于 `contentStatus === "pending_transcription"` 的语音消息，也应排除（转写未完成）

**验收：** 发送给 AI 的 messages 列表中不存在 `contentStatus === "unsupported"` 或 `"pending_transcription"` 的消息。

---

#### P0-4: 清理已弃用的 `risks` 字段

**现状：** system prompt 要求 "risks 必须输出空数组"，但 outputContract 仍定义了 risks 结构，post-processing 仍遍历 risks 做 evidenceId 清洗。

**影响：** 每次调用多消耗约 30-50 output tokens 生成空 risks 数组，后处理做无用遍历。

**修复方案：**
- 文件：`insight-prompt-builder.ts` — 从 `buildOutputContract` 中移除 `risks` 字段，从 system prompt 中移除 risks 相关约束
- 文件：`llm-provider.ts` — `normalizeAnalysisOutput` 中移除 risks 解析，或保留为兼容层（`risks: []`）
- 文件：`insights-worker.ts` — `normalizeEvidenceIds` 和 `filterConfiguredAnalysisOutput` 中移除 risks 处理
- 文件：`insights-worker.ts:220-226`（InsightAnalysisOutput 类型）— 移除 risks 字段或标记为 deprecated
- 文件：`packages/contracts/src/insights/dto.ts` — 评估前端是否依赖 risks，如不依赖则移除

**验收：** LLM 输出中不再包含 risks 字段；后处理代码中 risks 相关逻辑已清理或标记 deprecated。

---

### P1 - 高优改进

#### P1-1: Prompt 结构化重构

**现状：** system prompt 是 15 条规则用 `\n` join 的纯文本列表。

**问题：**
- 规则之间缺乏层次，模型难以区分元规则 vs 业务规则 vs 防御规则
- 同一约束（"配置为空则输出空数组"）在 3 个字段上重复表达
- 缺少 few-shot 示例，输出格式不稳定

**重构方案：** 详见 [第 6 节 Prompt 重构方案](#6-prompt-重构方案)。

---

#### P1-2: `customerIntent` 约束不够具体

**现状：** `"summary.customerIntent 必须是 2-10 个字的短意图标签"`，仅 3 个正例。

**问题：**
- 中文字符计数不准确（标点、数字、英文混排）
- 无负例，模型不知道什么是错的
- 正例风格不一致（"产品咨询" vs "物流异常"）

**修复方案：**
- 增加 5-8 个正例覆盖不同类型，增加 2-3 个负例
- 定义意图标签的格式规范（如：统一用 `XX咨询` / `XX问题` / `XX异常` 模式）
- 考虑与 tenantContext 中的 labelConfigs 或独立的意图词典联动

**示例 prompt 补充：**
```
customerIntent 规范：
- 格式：2-6 个汉字，XX问题/XX咨询/XX需求/XX异常
- 正例：产品咨询、价格咨询、物流异常、退款申请、售后维修、发货催促、优惠咨询
- 负例：客户询问了白色羽绒服多少钱（太长）、咨询（太模糊）、关于退款（介词结构）
```

---

#### P1-3: Output Contract 用示例值而非类型描述

**现状：** `buildOutputContract` 中每个字段的值是示例数据（如 `"confidence": 0.8`、`"priority": "high | medium | low"`）。模型有时直接复制示例值。

**修复方案：** 将示例值改为 schema 描述格式：

```typescript
// 当前
{
  confidence: 0.8,
  priority: "high | medium | low",
  title: "待跟进事项标题",
}

// 改为
{
  confidence: "<number 0-1>",
  priority: "<high|medium|low>",
  title: "<string: 待跟进事项简述>",
}
```

**文件：** `insight-prompt-builder.ts` — `buildOutputContract` 函数

---

#### P1-4: 实现 `lowConfidenceThreshold` 使用

**现状：** `insights-seeds.ts:9` 定义了 `lowConfidenceThreshold: 0.6`，analysisPolicy schema 中也有此字段，但 `InsightsWorkerService.runAnalyzeJob` 中完全没有使用。

**修复方案：**
- 文件：`insights-worker.ts` — `runAnalyzeJob` 方法
- 在 `saveAnalysisResult` 之前，检查 `output.summary.confidence` 和 `output.problemResolution.confidence`
- 如果低于 `lowConfidenceThreshold`，将 `analysisStatus` 标记为 `partial`
- 可选：触发一个 `reanalyze_session` job 延迟重试

```typescript
// 在 runAnalyzeJob 中
const policy = await this.repository.getAnalysisPolicy(job.uid);
const overallConfidence = Math.min(
  output.summary.confidence,
  output.problemResolution.confidence,
);
const analysisStatus = overallConfidence < policy.lowConfidenceThreshold ? "partial" : "ready";
```

---

#### P1-5: 添加 LLM 调用重试机制

**现状：** 网络超时、429 限流、5xx 错误直接 throw，job 标记为 failed。

**修复方案：**
- 文件：`llm-provider.ts` — `OpenAiCompatibleInsightAnalyzer.analyzeSession`
- 添加指数退避重试（3 次，间隔 1s/2s/4s）
- 仅对可重试错误码重试（429, 500, 502, 503, 504, 超时）
- 4xx 非 429 错误不重试（参数错误等）

```typescript
async analyzeSession(input) {
  return withRetry(() => this.doAnalyzeSession(input), {
    maxAttempts: 3,
    baseDelayMs: 1000,
    retryableStatuses: [429, 500, 502, 503, 504],
  });
}
```

---

#### P1-6: 记录 Token Usage

**现状：** LLM API 返回的 `usage` 字段（prompt_tokens, completion_tokens, total_tokens）被丢弃。

**修复方案：**
- 文件：`llm-provider.ts` — 从 response 中提取 `usage` 字段
- 将 usage 信息附加到返回的 output 中或通过 callback 传递
- 文件：`insights-worker.ts` — 将 usage 记录到日志（已有 logger）和 analysis run 记录中

```typescript
// llm-provider.ts
const usage = payload.usage ?? {};
return {
  output: normalizeAnalysisOutput(parseModelJsonObject(content)),
  usage: {
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
  },
};
```

---

### P2 - 中期优化

#### P2-1: 分离 Extraction 和 Analysis 为两阶段

详见 [第 4 节多阶段 Pipeline 架构设计](#4-多阶段-pipeline-架构设计)。

#### P2-2: 添加 Fallback Provider

**方案：**
- 在 `llm-provider.ts` 中实现 `FallbackInsightAnalyzer`，包装主/备两个 provider
- 主 provider 返回 429/5xx 时自动切换到备用
- 环境变量配置：`LLM_FALLBACK_API_KEY`, `LLM_FALLBACK_BASE_URL`, `LLM_FALLBACK_MODEL`

#### P2-3: 图片 OCR / VLM 描述预处理

**方案：**
- 在 `insight-message-input-builder.ts` 的 image 分支中，如果消息包含 OCR 文本或 VLM 描述（从 content JSON 中读取），则将其作为 aiText
- 短期：接入 OCR 服务提取图片中的文字
- 中期：用 VLM（视觉语言模型）生成图片内容描述

#### P2-4: A/B 测试框架

**方案：**
- 在 `insights-worker-runtime.ts` 中增加 prompt version 配置
- `InsightWorkerRepositoryPort.getPromptContext` 返回时附带 prompt version
- `buildInsightPromptMessages` 根据 version 选择不同的 prompt 模板
- 分析结果中记录 prompt version，用于后续质量对比

---

### P3 - 长期规划

#### P3-1: 完整三阶段 Pipeline + 模型路由

详见 [第 4 节](#4-多阶段-pipeline-架构设计) 和 [第 5 节](#5-模型分层管理方案)。

#### P3-2: 输出质量自动评估 + Re-analyze 触发

- 基于 confidence 分数、validation warnings 数量、evidence 覆盖率等指标计算质量分
- 低质量结果自动触发 re-analyze（可用更强模型）

#### P3-3: Prompt 版本管理 + 灰度发布

- prompt 模板存储在数据库中，支持版本化
- 新版本 prompt 按比例灰度（如 10% 流量使用新 prompt）
- 对比新旧版本的输出质量指标

---

## 4. 多阶段 Pipeline 架构设计

### 4.1 当前单次调用的问题

1. **认知负荷过重**：10 个维度在同一推理过程中完成，互相竞争 attention
2. **无法差异化优化**：实体抽取需要 precision，情感需要 nuance，质检需要 rule-following
3. **成本不可优化**：所有维度用同一模型，但能力需求差异大
4. **错误无隔离**：一个维度的幻觉可能污染其他维度

### 4.2 推荐三阶段架构

```
┌─────────────────────────────────────────────────────┐
│ 阶段 1: 信息抽取 (Extraction)  — 小模型，低成本       │
│                                                       │
│  输入: session messages + entity dictionary           │
│  输出: entities[], intents[], tags[], faqCandidates[] │
│  特征: 纯匹配/分类任务，有词库参考                     │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│ 阶段 2: 深度分析 (Analysis)  — 中/大模型              │
│                                                       │
│  输入: session messages + 阶段 1 结果                  │
│  输出: problemResolution, qaFindings[], sentiment[]   │
│  特征: 需要理解对话语义、判断因果关系                   │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│ 阶段 3: 综合摘要 (Synthesis)  — 大模型               │
│                                                       │
│  输入: session messages + 阶段 1&2 结果               │
│  输出: summary, actionItems[], followUp               │
│  特征: 需要全局理解和自然语言生成                      │
└─────────────────────────────────────────────────────┘
```

### 4.3 各阶段 Prompt 设计要点

**阶段 1 Prompt（Extraction）：**
- 强制 JSON mode
- 给出完整的 entity dictionary 和 label config
- 匹配任务用 few-shot 最有效（"消息中提到'白鸭绒外套' → entityName: '白色羽绒服'"）
- temperature 可设更低（0.05-0.1）

**阶段 2 Prompt（Analysis）：**
- 将阶段 1 的结果作为上下文注入（"已识别的实体：白色羽绒服；客户意图：物流查询"）
- 质检规则 + 正负例完整注入
- problemResolution 的 evidence 构建是重点
- temperature 0.2-0.3

**阶段 3 Prompt（Synthesis）：**
- 注入阶段 1+2 的全部结果
- 重点优化 customerIntent 的规范化
- actionItems 需要结合质检结果和问题解决度
- temperature 可稍高（0.3-0.4）以获得更自然的摘要

### 4.4 实现路径

**Phase 1（不改架构，先验证）：** 在现有单次调用中，将 prompt 拆分为 system + user 部分时，user prompt 分两段注入（先抽取后分析），观察模型在分段提示下的输出质量差异。

**Phase 2（拆分两个 job）：** 将 analyze job 拆为 `extract_job` + `analysis_job`，extract_job 完成后创建 analysis_job。可在同一 worker 中串行执行。

**Phase 3（不同模型）：** 为 extract_job 和 analysis_job 配置不同的模型 endpoint。

---

## 5. 模型分层管理方案

### 5.1 抽象接口设计

```typescript
// 新增文件: apps/backend/src/modules/insights/model-router.ts

export type ModelTier = "extraction" | "analysis" | "synthesis";

export type ModelTierConfig = {
  apiKey: string;
  baseUrl: string;
  maxTokens: number;
  model: string;
  providerCode: string;
  temperature: number;
};

export type InsightModelRouterConfig = {
  extraction: ModelTierConfig;
  analysis: ModelTierConfig;
  synthesis: ModelTierConfig;
};

export class InsightModelRouter {
  private readonly analyzers: Map<ModelTier, InsightSessionAnalyzer>;

  constructor(config: InsightModelRouterConfig) {
    this.analyzers = new Map([
      ["extraction", new OpenAiCompatibleInsightAnalyzer(config.extraction)],
      ["analysis", new OpenAiCompatibleInsightAnalyzer(config.analysis)],
      ["synthesis", new OpenAiCompatibleInsightAnalyzer(config.synthesis)],
    ]);
  }

  getAnalyzer(tier: ModelTier): InsightSessionAnalyzer {
    const analyzer = this.analyzers.get(tier);
    if (!analyzer) throw new Error(`No analyzer configured for tier: ${tier}`);
    return analyzer;
  }
}
```

### 5.2 环境变量配置方案

```bash
# 阶段 1: 抽取（小模型）
INSIGHTS_EXTRACTION_MODEL=ep-xxx-lite
INSIGHTS_EXTRACTION_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
INSIGHTS_EXTRACTION_API_KEY=xxx
INSIGHTS_EXTRACTION_TEMPERATURE=0.1
INSIGHTS_EXTRACTION_MAX_TOKENS=2048

# 阶段 2: 分析（中模型）
INSIGHTS_ANALYSIS_MODEL=ep-xxx-pro
INSIGHTS_ANALYSIS_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
INSIGHTS_ANALYSIS_API_KEY=xxx
INSIGHTS_ANALYSIS_TEMPERATURE=0.2
INSIGHTS_ANALYSIS_MAX_TOKENS=4096

# 阶段 3: 摘要（大模型，可选与阶段 2 共用）
INSIGHTS_SYNTHESIS_MODEL=ep-xxx-pro
INSIGHTS_SYNTHESIS_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
INSIGHTS_SYNTHESIS_API_KEY=xxx
INSIGHTS_SYNTHESIS_TEMPERATURE=0.3
INSIGHTS_SYNTHESIS_MAX_TOKENS=2048

# 兼容模式: 全部使用同一模型（当前行为）
VOLCENGINE_ARK_MODEL=ep-xxx
VOLCENGINE_ARK_BASE_URL=...
VOLCENGINE_ARK_API_KEY=...
```

### 5.3 成本估算

以 20 条消息的典型 session 为例（input ~2000 tokens）：

| 方案 | 阶段 | 模型层级 | Input tokens | Output tokens | 相对成本 |
|------|------|---------|-------------|--------------|---------|
| **当前** | 单次 | 大模型 | ~3500 | ~1500 | 1.0x |
| **三阶段** | 抽取 | 小模型 | ~2500 | ~800 | 0.1x × 3300 = 0.07x |
| | 分析 | 中模型 | ~3000 | ~1000 | 0.3x × 4000 = 0.24x |
| | 摘要 | 大模型 | ~2000 | ~600 | 1.0x × 2600 = 0.52x |
| **三阶段合计** | | | | | **~0.83x** |

> 注：以上为粗略估算，实际成本取决于具体模型定价。小模型成本按大模型 1/10、中模型按 1/3 估算。
> 三阶段方案还有减少重试（因任务更简单、输出更稳定）的隐性成本节约。

---

## 6. Prompt 重构方案

### 6.1 重构后的 System Prompt

```xml
<role>
你是客服会话洞察分析器，服务对象是电商/私域客服团队。你的任务是基于当前逻辑会话内的消息，完成结构化分析。
</role>

<output_format>
- 只输出一个合法的 JSON object
- 不输出 Markdown、解释文字或代码块
- 所有字段必须出现，不允许省略
</output_format>

<evidence_rules>
- 所有 evidenceMessageIds 必须来自输入 messages 中的 sourceMessageId
- 没有证据时输出空数组，不允许编造消息 ID
- evidence 必须说明关键证据消息的角色和引用原因
</evidence_rules>

<analysis_rules>
1. 问题解决度：只判断当前逻辑会话内是否解决，不推断会话外后续处理
2. customerIntent：必须是 2-6 个汉字的短标签，格式为 XX问题/XX咨询/XX需求/XX异常
   正例：产品咨询、价格咨询、物流异常、退款申请、售后维修、发货催促
   负例：客户询问了白色羽绒服多少钱（太长）、咨询（太模糊）
3. problemSummary：用于描述客户提出的具体问题，可写成一句完整摘要
4. 置信度 confidence 取 0 到 1 之间的小数；证据不足时降低 confidence，不要强行下结论
</analysis_rules>

<config_rules>
- 标签只能从 tenantContext.labelConfigs 中选择；配置为空时 tags 输出空数组
- 质检只能评估 tenantContext.qaRuleConfigs 中的规则；配置为空时 qaFindings 输出空数组
- 实体只能从 tenantContext.entityDictionary 中选择；配置为空时 entities 输出空数组
</config_rules>
```

**变更点：**
1. 用 XML section 分区，模型对结构化 prompt 的遵从率更高
2. 消除"配置为空则输出空数组"的 3 次重复，合并为 1 条统一规则
3. customerIntent 增加了正例和负例
4. 移除了 risks 相关约束
5. 总 token 数减少约 20%（消除冗余）

### 6.2 Output Contract 重构

将 `buildOutputContract` 中的示例值改为 schema 描述格式：

```typescript
function buildOutputContract(context: InsightPromptContext) {
  return {
    actionItems: [
      {
        actionType: "<follow_up|refund_check|logistics_check|complaint_handle|custom>",
        dueHint: "<string optional: 处理时效或时间提示>",
        evidenceMessageIds: ["<sourceMessageId>"],
        priority: "<high|medium|low>",
        title: "<string: 待跟进事项标题>",
      },
    ],
    entities: context.entityDictionary.length > 0 ? [
      {
        confidence: "<number 0-1>",
        entityId: "<来自 tenantContext.entityDictionary>",
        entityName: "<来自 tenantContext.entityDictionary>",
        entityType: "<来自 tenantContext.entityDictionary>",
        evidenceMessageIds: ["<sourceMessageId>"],
        sentiment: "<positive|neutral|negative|mixed> optional",
      },
    ] : [],
    // ... 其他字段同理
  };
}
```

### 6.3 Few-shot Example 注入

在 user prompt 的 JSON 中增加 `canonicalExample` 字段：

```json
{
  "canonicalExample": {
    "description": "这是一个完整的分析示例，展示了期望的输出格式和推理逻辑",
    "messages": [
      {"senderRole": "customer", "content": "我买的白色羽绒服收到了，但是拉链坏了", "sourceMessageId": "1001"},
      {"senderRole": "agent", "content": "非常抱歉给您带来不便，我帮您登记换货，预计3个工作日内处理", "sourceMessageId": "1002"},
      {"senderRole": "customer", "content": "好的谢谢", "sourceMessageId": "1003"}
    ],
    "expectedOutput": {
      "summary": {
        "customerIntent": "售后维修",
        "processSummary": "客户反馈收到的白色羽绒服拉链损坏，客服登记换货并承诺3个工作日处理",
        "resultSummary": "客服已登记换货，客户表示接受",
        "confidence": 0.9
      },
      "problemResolution": {
        "problemDetected": true,
        "problemSummary": "客户收到的白色羽绒服拉链损坏",
        "resolutionStatus": "resolved",
        "confidence": 0.85,
        "evidence": [
          {"messageId": "1001", "evidenceRole": "customer_problem", "reason": "客户明确提出商品质量问题"},
          {"messageId": "1002", "evidenceRole": "agent_solution", "reason": "客服提供换货方案和处理时效"},
          {"messageId": "1003", "evidenceRole": "closure_signal", "reason": "客户表示接受方案"}
        ],
        "evidenceMessageIds": ["1001", "1002", "1003"]
      }
    }
  },
  "outputContract": { ... },
  "tenantContext": { ... },
  "messages": [ ... ]
}
```

---

## 7. 验收标准

### P0 验收

| 编号 | 验收项 | 验证方式 |
|------|-------|---------|
| P0-1 | LLM 请求中包含 `response_format: { type: "json_object" }` | 查看 request body 日志 |
| P0-2 | LLM 请求中包含 `max_tokens` 字段 | 查看 request body 日志 |
| P0-3 | 发送给 AI 的 messages 中不含 `[图片]`、`[语音消息，转写中]` 等占位符 | 单元测试：`contentStatus=unsupported` 的消息 `includedForAi` 为 false |
| P0-4 | LLM 输出中不含 risks 字段，后处理代码已清理 | 单元测试 + 代码审查 |

### P1 验收

| 编号 | 验收项 | 验证方式 |
|------|-------|---------|
| P1-1 | System prompt 使用 XML section 结构 | 代码审查 + prompt 快照测试 |
| P1-2 | customerIntent 有 5+ 正例和 2+ 负例 | prompt 快照测试 |
| P1-3 | Output contract 使用 schema 描述格式而非示例值 | prompt 快照测试 |
| P1-4 | confidence < lowConfidenceThreshold 时 analysisStatus 标记为 partial | 单元测试 |
| P1-5 | 429/5xx 错误自动重试 3 次 | 单元测试（mock fetch 返回 429 → 200） |
| P1-6 | 日志中包含 prompt_tokens / completion_tokens | 查看分析完成日志 |

### 整体质量验收

| 指标 | 目标 | 测量方式 |
|------|------|---------|
| JSON 解析成功率 | ≥ 99% | 监控 JSON parse 失败次数 / 总调用次数 |
| 平均 confidence | ≥ 0.7 | 统计所有 session 的 summary.confidence 均值 |
| validation warning 率 | ≤ 10% | 统计有 validation warnings 的 session 占比 |
| 平均分析耗时 | ≤ 15s (P95) | 从 job claim 到 save result 的时间 |
| 平均 token 消耗 | 可量化 | 从 usage 记录统计 |

---

## 附录：当前 Prompt 完整原文

### System Prompt（当前）

```
你是客服会话洞察分析器，服务对象是电商/私域客服团队。
你的任务是只基于当前逻辑会话内的消息，完成会话摘要、问题是否解决、质检规则判定、标签提取、情感/意图/实体提取和待跟进事项识别。
只输出一个 JSON object，不要输出 Markdown、解释文字或代码块。
所有 evidenceMessageIds 必须来自输入 messages.sourceMessageId；没有证据时输出空数组，不允许编造消息 ID。
问题是否解决只判断当前逻辑会话内是否解决，不要推断会话外后续处理。
summary.customerIntent 必须是 2-10 个字的短意图标签，例如"产品咨询""物流异常""退款咨询"，不要写完整句子，不要复述 problemSummary。
problemResolution.problemSummary 才用于描述客户提出的具体问题，可写成一句完整摘要。
problemResolution.evidence 必须说明关键证据消息、证据角色和引用原因，用于前端高亮对话消息。
标签只能从 tenantContext.labelConfigs 中选择；tenantContext.labelConfigs 为空时 tags 必须输出空数组；没有命中的标签时 tags 输出空数组。
质检只能评估 tenantContext.qaRuleConfigs 中启用的规则；tenantContext.qaRuleConfigs 为空时 qaFindings 必须输出空数组；没有配置规则时 qaFindings 输出空数组。
实体只能从 tenantContext.entityDictionary 中选择；tenantContext.entityDictionary 为空时 entities 必须输出空数组；消息里出现但词库未配置的实体不得输出。
风险关注已并入质检规则和待办触发，risks 必须输出空数组。
置信度 confidence 取 0 到 1 之间的小数；证据不足时降低 confidence，不要强行下结论。
必须输出完整字段：summary, sentiment, tags, qaFindings, problemResolution, entities, intents, risks, actionItems, faqCandidates。
```

### User Prompt 结构（当前）

```json
{
  "outputContract": { /* 完整的输出 JSON 结构示例 */ },
  "resolutionStatusGuide": {
    "no_customer_problem": "客户没有提出需要客服解决的问题...",
    "partially_resolved": "客服给出部分处理或承诺...",
    "resolved": "客户问题在当前逻辑会话内已有明确答复...",
    "unknown": "消息不足，无法判断",
    "unresolved": "客户问题没有被回应..."
  },
  "tenantContext": {
    "entityDictionary": [/* slice(0, 80) */],
    "labelConfigs": [/* slice(0, 50) */],
    "qaRuleConfigs": [/* slice(0, 40) */]
  },
  "messages": [
    {
      "content": "消息文本",
      "contentStatus": "ready",
      "messageType": "text",
      "senderRole": "customer",
      "sourceMessageId": "12345",
      "time": 1780244000000
    }
  ]
}
```
