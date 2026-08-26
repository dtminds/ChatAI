import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyUserMemoryDocument } from "../src/user-memory-domain.js";
import { buildUserMemoryPrompt, UserMemoryProviderError, VolcengineUserMemoryProvider } from "../src/user-memory-provider.js";

describe("user memory prompt", () => {
  afterEach(() => vi.restoreAllMocks());
  it("contains only bounded memory context and message evidence, not customer identifiers", () => {
    const prompt = buildUserMemoryPrompt({
      document: emptyUserMemoryDocument(),
      extractionInstruction: "重点关注客户主动表达的尺码和面料偏好",
      now: 1,
      messages: [{ sourceMessageId: 2, sessionId: 3, senderRole: "customer", occurredAt: 4, text: "偏好无糖" }],
    });
    const serialized = JSON.stringify(prompt);
    expect(serialized).toContain("偏好无糖");
    expect(serialized).toContain("customer_profile");
    expect(serialized).toContain("recent_intent");
    expect(serialized).toContain("长期在用品类或型号");
    expect(serialized).toContain("AI 只维护以上两类长期记忆");
    expect(serialized).toContain("已有 recent_intent 视为只读并自然过期");
    expect(serialized).not.toContain("expiresInDays");
    expect(serialized).toContain("当前客户－单一关系－单一对象");
    expect(serialized).toContain("不能独立废弃的内容说明仍未拆分干净");
    expect(serialized).toContain("尽量控制在 50 个字符以内");
    expect(serialized).toContain("add 前必须先比较 current 中相同事实维度的记忆");
    expect(serialized).toContain("已有 manual 记忆覆盖或冲突时不生成操作");
    expect(serialized).toContain("这次预算 500");
    expect(serialized).toContain("购买护肤品时预算通常为 500 至 800");
    expect(serialized).toContain("以后不要电话联系，优先微信文字");
    expect(serialized).toContain("手机号、详细住址、身份证、银行卡、密码、验证码等个人隐私或安全信息");
    expect(serialized).toContain("[本次限定]");
    expect(serialized).toContain("[当下状态]");
    expect(serialized).toContain("[短期意图]");
    expect(serialized).toContain("[业务处理过程]");
    expect(serialized).toContain("[非当前客户事实]");
    expect(serialized).toContain("[敏感信息]");
    expect(serialized).toContain("[不提取｜本次限定]");
    expect(serialized).toContain("[不提取｜当下状态]");
    expect(serialized).toContain("[不提取｜短期意图]");
    expect(serialized).toContain("[不提取｜业务系统数据]");
    expect(serialized).toContain("收货地址、详细住址和手机号属于个人隐私");
    expect(serialized).toContain("[不提取｜非当前客户事实]");
    expect(serialized).toContain("[不提取｜业务处理过程]");
    expect(serialized).toContain("[不提取｜敏感信息]");
    expect(serialized).toContain("evidenceMessageIds");
    expect(serialized).toContain("不要输出 sourceSessionId");
    expect(serialized).toContain('{\\\"operations\\\":[]}');
    expect(serialized).toContain("客户ID3265，查询他的资料");
    expect(serialized).toContain("重点关注客户主动表达的尺码和面料偏好");
    expect(serialized).toContain("### 附加提炼指引");
    expect(serialized).toContain("<extraction_instruction>\\n重点关注客户主动表达的尺码和面料偏好\\n</extraction_instruction>");
    expect(serialized).not.toContain("additionalProperties");
    expect(serialized).not.toContain("maxItems");
    expect(serialized).not.toContain("thirdExternalUserId");
    expect(serialized).not.toContain('"uid"');
  });
  it("marks existing short-term memory as readonly without exposing expiry fields", () => {
    const now = 1_800_000_000_000;
    const document = emptyUserMemoryDocument();
    document.nextItemId = 3;
    document.manual.push({ id: 1, category: "preference", content: "偏好无糖", expiresAt: null, createdAt: now, updatedAt: now, updatedBySubUserId: 1 });
    document.ai.push({ id: 2, category: "recent_intent", content: "两周内购买咖啡机", expiresAt: now + 14 * 86_400_000, createdAt: now, updatedAt: now });

    const prompt = buildUserMemoryPrompt({ document, now, messages: [] });
    const payload = JSON.parse(prompt.find((message) => message.role === "user")?.content ?? "{}") as {
      current?: { manual?: Array<Record<string, unknown>>; ai?: Array<Record<string, unknown>> };
    };

    expect(payload.current?.manual).toEqual([expect.objectContaining({ id: 1, readonly: true })]);
    expect(payload.current?.ai).toEqual([expect.objectContaining({ id: 2, category: "recent_intent", readonly: true })]);
    expect(payload.current?.manual?.[0]).not.toHaveProperty("expiresAt");
    expect(payload.current?.ai?.[0]).not.toHaveProperty("expiresAt");
    expect(payload.current?.manual?.[0]).not.toHaveProperty("expiresInDays");
    expect(payload.current?.ai?.[0]).not.toHaveProperty("expiresInDays");
  });
  it("requires complete scope and durable value before creating or updating memory", () => {
    const prompt = buildUserMemoryPrompt({
      document: emptyUserMemoryDocument(),
      now: 1,
      messages: [{ sourceMessageId: 2, sessionId: 3, senderRole: "customer", occurredAt: 4, text: "这次预算 500" }],
    });
    const systemPrompt = prompt.find((message) => message.role === "system")?.content ?? "";

    expect(systemPrompt).toContain("由当前客户本人明确表达");
    expect(systemPrompt).toContain("当前会话结束后仍然成立");
    expect(systemPrompt).toContain("客服和系统消息只用于理解上下文与处理结果");
    expect(systemPrompt).toContain("[业务系统数据] 订单号、支付金额");
    expect(systemPrompt).toContain("[业务处理过程] 办理退款、积分转换");
    expect(systemPrompt).toContain("current.manual 中的人工记忆只用于比对");
    expect(systemPrompt).toContain("没有需要变更的内容时返回");
    expect(systemPrompt).toContain("新旧事实冲突或互斥且新事实提供替代内容时使用 update");
    expect(systemPrompt).toContain("现有 ai 记忆已明确失效且没有新事实可替代时使用 remove");
    const operationSection = systemPrompt.split("### 操作（type）")[1]?.split("### 输出")[0] ?? "";
    const operationLines = operationSection.split("\n").filter((line) => line.startsWith("- "));
    expect(operationLines).toHaveLength(3);
    expect(operationSection).toContain("- add：");
    expect(operationSection).toContain("- update：");
    expect(operationSection).toContain("- remove：");
    expect(operationSection).not.toContain("- manual");
    expect(operationSection).not.toContain("operations");
    expect(systemPrompt).not.toContain("附加提炼指引");
    expect(systemPrompt).not.toContain("<extraction_instruction>");
    expect(systemPrompt).not.toContain("confirm");
  });
  it("accepts strict operation JSON and reports provider usage", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ operations: [{ type: "add", category: "preference", content: "偏好无糖", evidenceMessageIds: [2] }] }) } }],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = new VolcengineUserMemoryProvider({ apiKey: "key", baseUrl: "https://ark.example/v3", model: "model" });
    const result = await provider.complete({ document: emptyUserMemoryDocument(), now: 1, messages: [{ sourceMessageId: 2, sessionId: 3, senderRole: "customer", occurredAt: 4, text: "偏好无糖" }] });
    expect(result).toMatchObject({ inputTokens: 12, outputTokens: 8, operations: [{ type: "add", content: "偏好无糖", evidenceMessageIds: [2] }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("accepts AI memory content over the 50-character prompt guideline", async () => {
    const content = `偏好型号为${"A".repeat(52)}的咖啡机`;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ operations: [{ type: "add", category: "preference", content, evidenceMessageIds: [2] }] }) } }],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    }), { status: 200 }));
    const provider = new VolcengineUserMemoryProvider({ apiKey: "key", baseUrl: "https://ark.example/v3", model: "model" });

    const result = await provider.complete({ document: emptyUserMemoryDocument(), now: 1, messages: [{ sourceMessageId: 2, sessionId: 3, senderRole: "customer", occurredAt: 4, text: content }] });

    expect(result.operations).toEqual([{ type: "add", category: "preference", content, expiresAt: null, evidenceMessageIds: [2] }]);
  });
  it("rejects AI-generated short-term memory", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ operations: [{
        type: "add", category: "recent_intent", content: "两周内购买咖啡机", evidenceMessageIds: [2],
      }] }) } }],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    }), { status: 200 }));
    const provider = new VolcengineUserMemoryProvider({ apiKey: "key", baseUrl: "https://ark.example/v3", model: "model" });

    const failure = await provider.complete({ document: emptyUserMemoryDocument(), now: 1_000, messages: [{ sourceMessageId: 2, sessionId: 3, senderRole: "customer", occurredAt: 4, text: "两周内购买咖啡机" }] }).catch((error: unknown) => error);

    expect(failure).toMatchObject({ message: "AGENT_USER_MEMORY_MODEL_SCHEMA_INVALID", inputTokens: 12, outputTokens: 8 });
  });
  it("rejects memory operations without customer evidence", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ operations: [{ type: "add", category: "preference", content: "偏好无糖" }] }) } }],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    }), { status: 200 }));
    const provider = new VolcengineUserMemoryProvider({ apiKey: "key", baseUrl: "https://ark.example/v3", model: "model" });

    const failure = await provider.complete({ document: emptyUserMemoryDocument(), now: 1, messages: [{ sourceMessageId: 2, sessionId: 3, senderRole: "customer", occurredAt: 4, text: "偏好无糖" }] }).catch((error: unknown) => error);

    expect(failure).toMatchObject({ message: "AGENT_USER_MEMORY_MODEL_SCHEMA_INVALID", inputTokens: 12, outputTokens: 8 });
  });
  it("sanitizes evidence metadata without rejecting the memory operation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ operations: [{
        type: "add", category: "preference", content: "偏好无糖",
        sourceSessionId: 3, evidenceMessageIds: ["2", 2, "invalid", 4, 5],
      }] }) } }],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    }), { status: 200 }));
    const provider = new VolcengineUserMemoryProvider({ apiKey: "key", baseUrl: "https://ark.example/v3", model: "model" });

    const result = await provider.complete({ document: emptyUserMemoryDocument(), now: 1, messages: [{ sourceMessageId: 2, sessionId: 3, senderRole: "customer", occurredAt: 4, text: "偏好无糖" }] });

    expect(result.operations).toEqual([{ type: "add", category: "preference", content: "偏好无糖", expiresAt: null, evidenceMessageIds: [2, 4, 5] }]);
  });
  it("does not retry when the provider rejects the request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("unsupported", { status: 400 }));
    const provider = new VolcengineUserMemoryProvider({ apiKey: "key", baseUrl: "https://ark.example/v3", model: "model" });

    const failure = await provider.complete({ document: emptyUserMemoryDocument(), now: 1, messages: [{ sourceMessageId: 2, sessionId: 3, senderRole: "customer", occurredAt: 4, text: "偏好无糖" }] }).catch((error: unknown) => error);

    expect(failure).toMatchObject({ message: "USER_MEMORY_LLM_HTTP_400" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toHaveProperty("response_format", { type: "json_object" });
  });

  it("preserves billed token usage when a successful response has invalid model output", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "{\"operations\":[{\"type\":\"confirm\",\"id\":1,\"evidenceMessageIds\":[2]}]}" } }],
      usage: { prompt_tokens: 21, completion_tokens: 13 },
    }), { status: 200 }));
    const provider = new VolcengineUserMemoryProvider({ apiKey: "key", baseUrl: "https://ark.example/v3", model: "model" });

    const failure = await provider.complete({ document: emptyUserMemoryDocument(), now: 1, messages: [{ sourceMessageId: 2, sessionId: 3, senderRole: "customer", occurredAt: 4, text: "偏好无糖" }] }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UserMemoryProviderError);
    expect(failure).toMatchObject({ message: "AGENT_USER_MEMORY_MODEL_SCHEMA_INVALID", inputTokens: 21, outputTokens: 13 });
  });

  it("classifies malformed JSON as invalid model output without losing billed usage", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "not-json" } }],
      usage: { prompt_tokens: 9, completion_tokens: 4 },
    }), { status: 200 }));
    const provider = new VolcengineUserMemoryProvider({ apiKey: "key", baseUrl: "https://ark.example/v3", model: "model" });

    const failure = await provider.complete({ document: emptyUserMemoryDocument(), now: 1, messages: [{ sourceMessageId: 2, sessionId: 3, senderRole: "customer", occurredAt: 4, text: "偏好无糖" }] }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UserMemoryProviderError);
    expect(failure).toMatchObject({ message: "AGENT_USER_MEMORY_MODEL_JSON_INVALID", inputTokens: 9, outputTokens: 4 });
  });
});
