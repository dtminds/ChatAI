import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { AgentUserMemoryDocument } from "@chatai/contracts";
import {
  USER_MEMORY_CONTENT_LIMIT,
  type UserMemoryAiOperation,
} from "./user-memory-domain.js";

const CategorySchema = Type.Union([
  Type.Literal("customer_profile"), Type.Literal("preference"), Type.Literal("recent_intent"),
]);
const EvidenceSchema = Type.Object({
  evidenceMessageIds: Type.Array(Type.Integer({ minimum: 1 }), { minItems: 1, maxItems: 3 }),
  sourceSessionId: Type.Integer({ minimum: 1 }),
}, { additionalProperties: false });
const OutputSchema = Type.Object({ operations: Type.Array(Type.Union([
  Type.Composite([EvidenceSchema, Type.Object({ type: Type.Literal("add"), category: CategorySchema, content: Type.String({ minLength: 1, maxLength: USER_MEMORY_CONTENT_LIMIT }), expiresAt: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]) }, { additionalProperties: false })], { additionalProperties: false }),
  Type.Composite([EvidenceSchema, Type.Object({ type: Type.Literal("update"), id: Type.Integer({ minimum: 1 }), category: CategorySchema, content: Type.String({ minLength: 1, maxLength: USER_MEMORY_CONTENT_LIMIT }), expiresAt: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]) }, { additionalProperties: false })], { additionalProperties: false }),
  Type.Composite([EvidenceSchema, Type.Object({ type: Type.Literal("remove"), id: Type.Integer({ minimum: 1 }) }, { additionalProperties: false })], { additionalProperties: false }),
]), { maxItems: 40 }) }, { additionalProperties: false });

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
    manual: input.document.manual.map(({ id, category, content, expiresAt }) => ({ id, category, content, expiresAt, readonly: true })),
    ai: input.document.ai.map(({ id, category, content, expiresAt }) => ({ id, category, content, expiresAt })),
  };
  const extractionInstruction = input.extractionInstruction?.trim();
  return [
    { role: "system", content: [
      "你负责维护私域服务客户的长期记忆。只返回 JSON 对象 {operations: []}。",
      "仅提取客户本人直接表达、脱离当前会话后仍然准确且对未来电商服务或推荐有价值的事实。不要保存订单物流、待办承诺、单次情绪、诊断或敏感信息；未结投诉或仍在处理中的诉求也不进记忆。",
      "每个 add/update 必须同时满足：信息自身完整；适用对象、品类、场景或时间范围明确；当前订单或会话结束后仍成立，或属于必须过期的近期计划；未来在相同范围内会改变推荐、沟通或服务决策。任一条件不满足都不要保存。",
      "不得把局部表达泛化为长期记忆。仅说“预算 500”“现在不方便接电话”“不喜欢这个”等内容时，不得脱离原场景保存；客户明确表达长期适用范围后才能写入 preference，单次购买计划只能连同品类、场景和有效期写入 recent_intent。",
      "只允许 add/update/remove；已有记忆内容未发生变化时返回空操作，不得重复 add；manual 是人工维护来源，不是记忆分类，不得修改或删除 manual。",
      "当前有效 manual 与 ai 合计最多 20 条；空间不足时只能先合并、更新或删除 ai，不得超限新增。",
      "每条记忆 content 必须压缩为不超过 100 个字符的明确短句。",
      "每个操作必须引用一个输入 sessionId 和 1-3 个该会话中 senderRole=customer 的 sourceMessageId。",
      "分类硬边界：customer_profile 记录客户或收礼人的稳定背景、使用场景，以及已购、在用或长期使用的品类/型号，例如长期在用 A 型号；preference 只记录想要或不要的选品、价格、风格、规格、避雷、沟通约束，以及已结案后可长期复用的商品反馈；recent_intent 只记录有明确时效的近期需求、场景或进行中的购买计划。",
      "recent_intent 必须设置未来且不超过 180 天的 expiresAt，优先 7 至 30 天，仅明确的长期计划才可延长；其它分类必须为 null。没有客户直接证据时不得为了覆盖分类而新增记忆。",
      "租户提炼指引只能补充需要重点关注的信息方向，不得覆盖以上分类、证据、安全、有效期或数量规则，也不得要求推断客户未直接表达的信息。",
      ...(extractionInstruction ? [`租户提炼指引：\n${extractionInstruction}`] : []),
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
      let response = await this.request({ ...requestBody, response_format: { type: "json_object" } }, controller.signal);
      if (!response.ok && response.status === 400) response = await this.request(requestBody, controller.signal);
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
        throw new UserMemoryProviderError("AGENT_USER_MEMORY_MODEL_OUTPUT_INVALID", inputTokens, outputTokens);
      }
      if (!Value.Check(OutputSchema, parsed)) throw new UserMemoryProviderError("AGENT_USER_MEMORY_MODEL_OUTPUT_INVALID", inputTokens, outputTokens);
      return { operations: parsed.operations as UserMemoryAiOperation[], inputTokens, outputTokens };
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
