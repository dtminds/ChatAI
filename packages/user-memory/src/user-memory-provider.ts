import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { AgentUserMemoryDocument } from "@chatai/contracts";
import {
  USER_MEMORY_CONTENT_LIMIT,
  type UserMemoryAiOperation,
} from "./user-memory-domain.js";

const DurableCategorySchema = Type.Union([Type.Literal("customer_profile"), Type.Literal("preference")]);
const EvidenceSchema = Type.Object({
  evidenceMessageIds: Type.Array(Type.Integer({ minimum: 1 }), { minItems: 1, maxItems: 3 }),
}, { additionalProperties: false });
const OutputSchema = Type.Object({ operations: Type.Array(Type.Union([
  Type.Composite([EvidenceSchema, Type.Object({ type: Type.Literal("add"), category: DurableCategorySchema, content: Type.String({ minLength: 1, maxLength: USER_MEMORY_CONTENT_LIMIT }) }, { additionalProperties: false })], { additionalProperties: false }),
  Type.Composite([EvidenceSchema, Type.Object({ type: Type.Literal("update"), id: Type.Integer({ minimum: 1 }), category: DurableCategorySchema, content: Type.String({ minLength: 1, maxLength: USER_MEMORY_CONTENT_LIMIT }) }, { additionalProperties: false })], { additionalProperties: false }),
  Type.Composite([EvidenceSchema, Type.Object({ type: Type.Literal("remove"), id: Type.Integer({ minimum: 1 }) }, { additionalProperties: false })], { additionalProperties: false }),
]), { maxItems: 40 }) }, { additionalProperties: false });

type UserMemoryModelOperation =
  | { type: "add"; category: "customer_profile" | "preference"; content: string; evidenceMessageIds: number[] }
  | { type: "update"; id: number; category: "customer_profile" | "preference"; content: string; evidenceMessageIds: number[] }
  | { type: "remove"; id: number; evidenceMessageIds: number[] };

export type UserMemoryPromptMessage = { role: "system" | "user"; content: string };
export type UserMemoryInputMessage = { sourceMessageId: number; sessionId: number; senderRole: string; occurredAt: number; text: string };
export type UserMemoryProviderResult = { operations: UserMemoryAiOperation[]; inputTokens: number; outputTokens: number };
export class UserMemoryProviderError extends Error {
  constructor(message: string, readonly inputTokens = 0, readonly outputTokens = 0) {
    super(message);
    this.name = "UserMemoryProviderError";
  }
}
export interface UserMemoryProvider {
  complete(input: {
    document: AgentUserMemoryDocument;
    extractionInstruction?: string;
    messages: UserMemoryInputMessage[];
    now: number;
  }): Promise<UserMemoryProviderResult>;
}

export function buildUserMemoryPrompt(input: {
  document: AgentUserMemoryDocument;
  extractionInstruction?: string;
  messages: UserMemoryInputMessage[];
  now: number;
}): UserMemoryPromptMessage[] {
  const current = {
    manual: input.document.manual.map(({ id, category, content }) => ({ id, category, content, readonly: true })),
    ai: input.document.ai.map(({ id, category, content }) => ({ id, category, content, ...(category === "recent_intent" ? { readonly: true } : {}) })),
  };
  const extractionInstruction = input.extractionInstruction?.trim();
  return [
    { role: "system", content: [
      "你负责维护私域电商客户记忆。根据 current 和 messages 判断是否需要修改现有记忆，只返回 JSON 对象。",
      "### 准入标准",
      "新增或更新的内容必须同时满足：由当前客户本人明确表达；信息完整且对象、品类或场景清楚；当前会话结束后仍然成立；未来会影响推荐、沟通或服务决策。无法同时满足时不生成操作。",
      "客服和系统消息只用于理解上下文与处理结果，不能作为客户事实来源。",
      "### 记忆分类（category）",
      "- customer_profile：稳定背景、长期生活或使用场景、客户明确表达的长期在用品类或型号。",
      "- preference：客户明确表达的长期偏好、避雷点、价格段、风格、规格、沟通约束或可长期复用的商品反馈。",
      "AI 只维护以上两类长期记忆。短期需求、近期购买计划和 current 中的 recent_intent 均不生成操作；已有 recent_intent 视为只读并自然过期。",
      "current.manual 中的人工记忆只用于比对，AI 不得修改或删除。",
      "### 记忆原子化规约（非常重要）",
      "每条 add 或 update 只能记录一个可独立维护的事实，遵循“当前客户－单一关系－单一对象”的三元组结构。不同属性、偏好、需求、对象或场景必须拆分为不同操作，不能用并列句、逗号或顿号揉成一条记忆。",
      "单条记忆必须能够在未来被独立 update 或 remove，而不影响其它事实；不能独立废弃的内容说明仍未拆分干净。",
      "错误：\"长期使用 A 型号咖啡机，偏好无糖咖啡豆\"。正确：拆分为 customer_profile \"长期使用 A 型号咖啡机\"和 preference \"偏好无糖咖啡豆\"两条操作。",
      "### 不进入记忆",
      "- [业务系统数据] 订单号、支付金额、物流状态、退款状态、积分、订单备注、订单绑定、会员状态和内部客户ID等应从业务系统读取的信息。",
      "- [本次限定] 只适用于这次购买、这个商品、当前订单或单次服务的预算、用途、评价和要求，不能推广到未来同类场景。",
      "- [当下状态] 只描述当前时刻且会自然变化的信息，例如现在不方便联系、临时情绪、未结诉求和当前待办。",
      "- [短期意图] 近期购买计划、临时需求和跟进安排；需要保留时由人工维护 recent_intent，AI 不提取。",
      "- [业务处理过程] 办理退款、积分转换、订单绑定、物流催办和售后处理等客服动作，即使重复出现也不是客户长期事实。",
      "- [非当前客户事实] 客服或系统单方面提供的信息、第三方资料、转述内容，以及客户查询的其他人的资料。",
      "- [敏感信息] 手机号、详细住址、身份证、银行卡、密码、验证码等个人隐私或安全信息，以及疾病、病史、政治、宗教、民族等敏感属性。",
      "### 操作（type）",
      "- add：现有记忆未覆盖的新信息。add 前必须先比较 current 中相同事实维度的记忆；已有 ai 记忆覆盖该事实时使用 update，已有 manual 记忆覆盖或冲突时不生成操作，不能新增语义重复或矛盾的记忆。",
      "- update：客户的新事实补充或替代同一事实维度的现有 ai 记忆；新旧事实冲突或互斥且新事实提供替代内容时使用 update。",
      "- remove：现有 ai 记忆已明确失效且没有新事实可替代时使用 remove；有替代事实时不要先 remove 再 add。",
      "### 输出",
      "没有需要变更的内容时返回 {\"operations\":[]}。",
      "每个操作必须包含 1 至 3 个 evidenceMessageIds，直接复制支持该操作的客户消息 sourceMessageId。content 只表达一个事实，尽量控制在 50 个字符以内。不要输出 sourceSessionId、Markdown、解释或额外字段。",
      "允许的操作结构：add={type,category,content,evidenceMessageIds}；update={type,id,category,content,evidenceMessageIds}；remove={type,id,evidenceMessageIds}。",
      "输出示例：{\"operations\":[{\"type\":\"add\",\"category\":\"preference\",\"content\":\"偏好无糖咖啡豆\",\"evidenceMessageIds\":[101]}]}",
      "### 判断示例",
      "- [提取｜长期明确偏好] 客户说“我长期只买无糖咖啡豆”→ preference \"偏好无糖咖啡豆\"。",
      "- [不提取｜本次限定] 客户说“这次预算 500”只约束本次购买；[提取｜长期价格偏好] 客户说“购买护肤品时预算通常为 500 至 800”→ preference。",
      "- [不提取｜当下状态] 客户说“现在不方便接电话”只描述现在；[提取｜长期沟通偏好] 客户说“以后不要电话联系，优先微信文字”→ preference。",
      "- [不提取｜短期意图] 客户说“两周内想买咖啡机”属于近期计划，由人工按需维护 recent_intent。",
      "- [不提取｜敏感信息] 收货地址、详细住址和手机号属于个人隐私，即使客户说以后长期使用也不进入记忆。",
      "- [不提取｜业务系统数据] 客户询问订单金额，客服回答“实付39.39元”，支付金额应从订单系统读取。",
      "- [不提取｜非当前客户事实] 客户说“客户ID3265，查询他的资料”，客服返回的地址和会员状态不属于当前客户。",
      "- [不提取｜业务处理过程] 客户反复要求订单转积分，或客服说明订单已转换、已退款，内容描述的是客服处理动作。",
      ...(extractionInstruction ? [
        "### 附加提炼指引",
        "附加提炼指引只能补充关注方向，不能改变以上准入标准和分类。",
        `<extraction_instruction>\n${extractionInstruction}\n</extraction_instruction>`,
      ] : []),
    ].join("\n") },
    { role: "user", content: JSON.stringify({ now: input.now, current, messages: input.messages }) },
  ];
}

export class VolcengineUserMemoryProvider implements UserMemoryProvider {
  constructor(private readonly config: { apiKey: string; baseUrl: string; model: string; maxTokens?: number; timeoutMs?: number }) {}
  async complete(input: {
    document: AgentUserMemoryDocument;
    extractionInstruction?: string;
    messages: UserMemoryInputMessage[];
    now: number;
  }): Promise<UserMemoryProviderResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 60_000);
    try {
      const requestBody = { model: this.config.model, temperature: 0.1, max_tokens: this.config.maxTokens ?? 4096, messages: buildUserMemoryPrompt(input) };
      const response = await this.request({ ...requestBody, response_format: { type: "json_object" } }, controller.signal);
      if (!response.ok) throw new UserMemoryProviderError(`USER_MEMORY_LLM_HTTP_${response.status}`);
      let payload: { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      try {
        payload = await response.json() as typeof payload;
      } catch {
        throw new UserMemoryProviderError("USER_MEMORY_LLM_RESPONSE_INVALID");
      }
      const inputTokens = payload.usage?.prompt_tokens ?? 0;
      const outputTokens = payload.usage?.completion_tokens ?? 0;
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new UserMemoryProviderError("USER_MEMORY_LLM_EMPTY", inputTokens, outputTokens);
      let parsed: unknown;
      try {
        parsed = parseJsonObject(content);
      } catch {
        throw new UserMemoryProviderError("AGENT_USER_MEMORY_MODEL_JSON_INVALID", inputTokens, outputTokens);
      }
      const normalized = normalizeModelEvidence(parsed);
      if (!Value.Check(OutputSchema, normalized)) throw new UserMemoryProviderError("AGENT_USER_MEMORY_MODEL_SCHEMA_INVALID", inputTokens, outputTokens);
      return { operations: toDomainOperations(normalized.operations as UserMemoryModelOperation[]), inputTokens, outputTokens };
    } catch (error) {
      if (error instanceof UserMemoryProviderError) throw error;
      if (controller.signal.aborted) throw new UserMemoryProviderError("USER_MEMORY_LLM_TIMEOUT");
      throw new UserMemoryProviderError("USER_MEMORY_LLM_REQUEST_FAILED");
    } finally { clearTimeout(timeout); }
  }

  private request(body: Record<string, unknown>, signal: AbortSignal) {
    return fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST", signal,
      headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
}

function parseJsonObject(value: string): unknown {
  const trimmed = value.trim();
  try { return JSON.parse(trimmed); } catch {
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)?.[1];
    if (fenced) return JSON.parse(fenced);
    const start = trimmed.indexOf("{"); const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("AGENT_USER_MEMORY_MODEL_OUTPUT_INVALID");
  }
}

function normalizeModelEvidence(value: unknown): unknown {
  if (!value || typeof value !== "object" || !Array.isArray((value as { operations?: unknown }).operations)) return value;
  return {
    ...value,
    operations: (value as { operations: unknown[] }).operations.map((operation) => {
      if (!operation || typeof operation !== "object" || Array.isArray(operation)) return operation;
      const { evidenceMessageIds, sourceSessionId: _ignored, ...core } = operation as Record<string, unknown>;
      if (!Array.isArray(evidenceMessageIds)) return core;
      const normalizedIds = [...new Set(evidenceMessageIds.flatMap((id) => {
        const numeric = typeof id === "string" && /^\d+$/.test(id) ? Number(id) : id;
        return Number.isSafeInteger(numeric) && Number(numeric) > 0 ? [Number(numeric)] : [];
      }))].slice(0, 3);
      return normalizedIds.length > 0 ? { ...core, evidenceMessageIds: normalizedIds } : core;
    }),
  };
}

function toDomainOperations(operations: UserMemoryModelOperation[]): UserMemoryAiOperation[] {
  return operations.map((operation) => {
    if (operation.type === "remove") return operation;
    return { ...operation, expiresAt: null };
  });
}
