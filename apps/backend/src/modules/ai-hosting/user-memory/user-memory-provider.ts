import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { AgentUserMemoryDocument } from "@chatai/contracts";
import type { UserMemoryAiOperation } from "./user-memory-domain.js";

const CategorySchema = Type.Union([
  Type.Literal("profile"), Type.Literal("preference"), Type.Literal("communication"),
  Type.Literal("product_context"), Type.Literal("recent_context"),
]);
const EvidenceSchema = Type.Object({
  evidenceMessageIds: Type.Array(Type.Integer({ minimum: 1 }), { minItems: 1, maxItems: 3 }),
  sourceSessionId: Type.Integer({ minimum: 1 }),
}, { additionalProperties: false });
const OutputSchema = Type.Object({ operations: Type.Array(Type.Union([
  Type.Composite([EvidenceSchema, Type.Object({ type: Type.Literal("add"), category: CategorySchema, content: Type.String({ minLength: 1, maxLength: 200 }), expiresAt: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]) }, { additionalProperties: false })], { additionalProperties: false }),
  Type.Composite([EvidenceSchema, Type.Object({ type: Type.Literal("confirm"), id: Type.Integer({ minimum: 1 }) }, { additionalProperties: false })], { additionalProperties: false }),
  Type.Composite([EvidenceSchema, Type.Object({ type: Type.Literal("update"), id: Type.Integer({ minimum: 1 }), category: CategorySchema, content: Type.String({ minLength: 1, maxLength: 200 }), expiresAt: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]) }, { additionalProperties: false })], { additionalProperties: false }),
  Type.Composite([EvidenceSchema, Type.Object({ type: Type.Literal("remove"), id: Type.Integer({ minimum: 1 }) }, { additionalProperties: false })], { additionalProperties: false }),
]), { maxItems: 40 }) }, { additionalProperties: false });

export type UserMemoryPromptMessage = { role: "system" | "user"; content: string };
export type UserMemoryInputMessage = { sourceMessageId: number; sessionId: number; senderRole: string; occurredAt: number; text: string };
export type UserMemoryProviderResult = { operations: UserMemoryAiOperation[]; inputTokens: number; outputTokens: number };
export interface UserMemoryProvider { complete(input: { document: AgentUserMemoryDocument; messages: UserMemoryInputMessage[]; now: number }): Promise<UserMemoryProviderResult>; }

export function buildUserMemoryPrompt(input: { document: AgentUserMemoryDocument; messages: UserMemoryInputMessage[]; now: number }): UserMemoryPromptMessage[] {
  const current = {
    manual: input.document.manual.map(({ id, category, content, expiresAt }) => ({ id, category, content, expiresAt, readonly: true })),
    ai: input.document.ai.map(({ id, category, content, expiresAt }) => ({ id, category, content, expiresAt })),
  };
  return [
    { role: "system", content: [
      "你负责维护私域服务客户的长期记忆。只返回 JSON 对象 {operations: []}。",
      "仅提取客户本人直接表达、对未来服务有价值的稳定事实。不要保存订单物流、待办承诺、单次情绪、诊断或敏感信息。",
      "只允许 add/confirm/update/remove；不得修改或删除 manual；manual_note 只能人工维护。",
      "每个操作必须引用一个输入 sessionId 和 1-3 个该会话中 senderRole=customer 的 sourceMessageId。",
      "recent_context 必须设置未来且不超过 180 天的 expiresAt；其它分类可为 null。",
    ].join("\n") },
    { role: "user", content: JSON.stringify({ now: input.now, current, messages: input.messages }) },
  ];
}

export class VolcengineUserMemoryProvider implements UserMemoryProvider {
  constructor(private readonly config: { apiKey: string; baseUrl: string; model: string; maxTokens?: number; timeoutMs?: number }) {}
  async complete(input: { document: AgentUserMemoryDocument; messages: UserMemoryInputMessage[]; now: number }): Promise<UserMemoryProviderResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 60_000);
    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST", signal: controller.signal,
        headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.config.model, temperature: 0.1, max_tokens: this.config.maxTokens ?? 4096, response_format: { type: "json_object" }, messages: buildUserMemoryPrompt(input) }),
      });
      if (!response.ok) throw new Error(`USER_MEMORY_LLM_HTTP_${response.status}: ${(await response.text()).slice(0, 500)}`);
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error("USER_MEMORY_LLM_EMPTY");
      const parsed = parseJsonObject(content);
      if (!Value.Check(OutputSchema, parsed)) throw new Error("AGENT_USER_MEMORY_MODEL_OUTPUT_INVALID");
      return { operations: parsed.operations as UserMemoryAiOperation[], inputTokens: payload.usage?.prompt_tokens ?? 0, outputTokens: payload.usage?.completion_tokens ?? 0 };
    } finally { clearTimeout(timeout); }
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
