import { describe, expect, it, vi } from "vitest";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import { VolcengineChatCompletionAdapter } from "../src/volcengine-chat-completion-adapter.js";

const request = (overrides: Record<string, unknown> = {}) => ({
  contractVersion: 1,
  deadlineAt: new Date("2099-01-01T00:01:00.000Z"),
  executionKey: "workflow:1:llm:1",
  payload: {
    kind: "message-list" as const,
    messageList: [{ content: "hello", role: "user" as const }],
    modelTarget: { kind: "catalog-model" as const, modelId: "11" },
    reasoningEffort: "minimal" as const,
    responseFormat: { type: "text" as const },
    ...overrides,
  },
  signal: new AbortController().signal,
  uid: 9,
});

const database = {} as never;

describe("VolcengineChatCompletionAdapter", () => {
  it("resolves the active platform model and sends the endpoint with provider controls", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) =>
      new Response(JSON.stringify({
        choices: [{ message: { content: "answer" } }],
      }), { status: 200 }),
    );
    const adapter = new VolcengineChatCompletionAdapter(
      database,
      "secret",
      fetchImpl,
      async () => ({ endpoint: "ep-test", model: "doubao-pro" }),
    );

    await expect(adapter.execute(request())).resolves.toEqual({ content: "answer", type: "text" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer secret",
          "Content-Type": "application/json",
        },
      }),
    );
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      max_completion_tokens: 4096,
      model: "ep-test",
      reasoning_effort: "minimal",
      thinking: { type: "disabled" },
    });
    expect(body).not.toHaveProperty("model", "doubao-pro");
  });

  it("sends strict JSON schema and validates the normalized result", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ summary: "ok", score: 1 }) } }],
    }), { status: 200 }));
    const adapter = new VolcengineChatCompletionAdapter(
      database,
      "secret",
      fetchImpl,
      async () => ({ endpoint: "ep-test", model: "doubao-pro" }),
    );

    await expect(adapter.execute(request({
      reasoningEffort: "high",
      responseFormat: {
        type: "json" as const,
        fields: [
          { description: "摘要", name: "summary", type: "string" as const },
          { description: "分数", name: "score", type: "number" as const },
        ],
      },
    }))).resolves.toEqual({
      type: "json",
      value: { summary: "ok", score: 1 },
    });
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { strict: true },
    });
    expect(body.thinking).toEqual({ type: "enabled" });
  });

  it.each([
    [429, "retryable"],
    [500, "retryable"],
    [400, "terminal"],
  ])("classifies Provider HTTP %s as %s", async (status, failureKind) => {
    const adapter = new VolcengineChatCompletionAdapter(
      database,
      "secret",
      async () => new Response("provider error", { status }),
      async () => ({ endpoint: "ep-test", model: "doubao-pro" }),
    );
    await expect(adapter.execute(request())).rejects.toMatchObject({
      failureKind,
      code: `WORKFLOW_INFERENCE_PROVIDER_${status}`,
    });
  });

  it("fails closed for missing model rows and oversized responses", async () => {
    const missing = new VolcengineChatCompletionAdapter(
      database,
      "secret",
      vi.fn(),
      async () => undefined,
    );
    await expect(missing.execute(request())).rejects.toMatchObject({
      code: "WORKFLOW_INFERENCE_MODEL_INVALID",
      failureKind: "terminal",
    });

    const oversized = new VolcengineChatCompletionAdapter(
      database,
      "secret",
      async () => new Response("x".repeat(1024 * 1024 + 1), { status: 200 }),
      async () => ({ endpoint: "ep-test", model: "doubao-pro" }),
    );
    await expect(oversized.execute(request())).rejects.toBeInstanceOf(
      WorkflowCapabilityExecutionError,
    );
  });
});
