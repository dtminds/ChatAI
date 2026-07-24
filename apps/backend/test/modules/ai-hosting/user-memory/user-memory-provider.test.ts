import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyUserMemoryDocument } from "../../../../src/modules/ai-hosting/user-memory/user-memory-domain.js";
import { buildUserMemoryPrompt, UserMemoryProviderError, VolcengineUserMemoryProvider } from "../../../../src/modules/ai-hosting/user-memory/user-memory-provider.js";

describe("user memory prompt", () => {
  afterEach(() => vi.restoreAllMocks());
  it("contains only bounded memory context and message evidence, not customer identifiers", () => {
    const prompt = buildUserMemoryPrompt({ document: emptyUserMemoryDocument(), now: 1, messages: [{ sourceMessageId: 2, sessionId: 3, senderRole: "customer", occurredAt: 4, text: "偏好无糖" }] });
    const serialized = JSON.stringify(prompt);
    expect(serialized).toContain("偏好无糖");
    expect(serialized).not.toContain("thirdExternalUserId");
    expect(serialized).not.toContain('"uid"');
  });
  it("accepts strict operation JSON and reports provider usage", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ operations: [{ type: "add", category: "preference", content: "偏好无糖", expiresAt: null, sourceSessionId: 3, evidenceMessageIds: [2] }] }) } }],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = new VolcengineUserMemoryProvider({ apiKey: "key", baseUrl: "https://ark.example/v3", model: "model" });
    const result = await provider.complete({ document: emptyUserMemoryDocument(), now: 1, messages: [{ sourceMessageId: 2, sessionId: 3, senderRole: "customer", occurredAt: 4, text: "偏好无糖" }] });
    expect(result).toMatchObject({ inputTokens: 12, outputTokens: 8, operations: [{ type: "add", content: "偏好无糖" }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("retries a 400 response without response_format", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("unsupported", { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "{\"operations\":[]}" } }] }), { status: 200 }));
    const provider = new VolcengineUserMemoryProvider({ apiKey: "key", baseUrl: "https://ark.example/v3", model: "model" });

    await provider.complete({ document: emptyUserMemoryDocument(), now: 1, messages: [{ sourceMessageId: 2, sessionId: 3, senderRole: "customer", occurredAt: 4, text: "偏好无糖" }] });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toHaveProperty("response_format", { type: "json_object" });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).not.toHaveProperty("response_format");
  });

  it("preserves billed token usage when a successful response has invalid model output", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "{\"operations\":[{\"type\":\"unsupported\"}]}" } }],
      usage: { prompt_tokens: 21, completion_tokens: 13 },
    }), { status: 200 }));
    const provider = new VolcengineUserMemoryProvider({ apiKey: "key", baseUrl: "https://ark.example/v3", model: "model" });

    const failure = await provider.complete({ document: emptyUserMemoryDocument(), now: 1, messages: [{ sourceMessageId: 2, sessionId: 3, senderRole: "customer", occurredAt: 4, text: "偏好无糖" }] }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UserMemoryProviderError);
    expect(failure).toMatchObject({ message: "AGENT_USER_MEMORY_MODEL_OUTPUT_INVALID", inputTokens: 21, outputTokens: 13 });
  });

  it("classifies malformed JSON as invalid model output without losing billed usage", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "not-json" } }],
      usage: { prompt_tokens: 9, completion_tokens: 4 },
    }), { status: 200 }));
    const provider = new VolcengineUserMemoryProvider({ apiKey: "key", baseUrl: "https://ark.example/v3", model: "model" });

    const failure = await provider.complete({ document: emptyUserMemoryDocument(), now: 1, messages: [{ sourceMessageId: 2, sessionId: 3, senderRole: "customer", occurredAt: 4, text: "偏好无糖" }] }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UserMemoryProviderError);
    expect(failure).toMatchObject({ message: "AGENT_USER_MEMORY_MODEL_OUTPUT_INVALID", inputTokens: 9, outputTokens: 4 });
  });
});
