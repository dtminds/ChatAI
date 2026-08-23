import { describe, expect, it, vi } from "vitest";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import { Kysely, MysqlDialect } from "kysely";
import type { WorkflowDatabase } from "@chatai/workflow-runtime";
import { VolcengineChatCompletionAdapter } from "../src/volcengine-chat-completion-adapter.js";

const request = (overrides: Record<string, unknown> = {}) => ({
  contractVersion: 1,
  deadlineAt: new Date("2099-01-01T00:01:00.000Z"),
  executionKey: "workflow:1:llm:1",
  payload: {
    kind: "message-list" as const,
    messageList: [{
      content: [{ text: "hello", type: "text" as const }],
      role: "user" as const,
    }],
    modelTarget: { kind: "catalog-model" as const, modelId: "11" },
    reasoningEffort: "minimal" as const,
    responseFormat: { type: "text" as const },
    ...overrides,
  },
  signal: new AbortController().signal,
  uid: 9,
});

const database = {} as never;

function createProductionDatabase(rows: Array<Record<string, unknown>>) {
  const query = vi.fn((
    _sql: string,
    _parameters: readonly unknown[],
    callback: (error: unknown, result: unknown) => void,
  ) => callback(null, rows));
  const connection = {
    config: {},
    destroy: vi.fn(),
    query,
    release: vi.fn(),
    threadId: 1,
  };
  const pool = {
    end: (callback: (error: unknown) => void) => callback(null),
    getConnection: (callback: (error: unknown, connection: typeof connection) => void) => {
      callback(null, connection);
    },
  };
  const db = new Kysely<WorkflowDatabase>({ dialect: new MysqlDialect({ pool: pool as never }) });
  return { db, query };
}

describe("VolcengineChatCompletionAdapter", () => {
  it("resolves the production model row when no resolver is injected", async () => {
    const { db, query } = createProductionDatabase([{
      endpoint: "ep-production",
      model: "doubao-pro",
    }]);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "answer" } }],
    }), { status: 200 }));
    const adapter = new VolcengineChatCompletionAdapter(db, "secret", fetchImpl);

    await expect(adapter.execute(request())).resolves.toEqual({ content: "answer", type: "text" });

    expect(query).toHaveBeenCalledTimes(1);
    const executedSql = String(query.mock.calls[0]?.[0]).replace(/\s+/g, " ").trim();
    expect(executedSql).toContain(
      "SELECT endpoint, model FROM xy_wap_embed_ai_model WHERE id = ? AND uid = 0 AND status = 1 LIMIT 1",
    );
    expect(query.mock.calls[0]?.[1]).toEqual([11]);
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("ep-production");
  });

  it("rejects a production model row with an empty endpoint", async () => {
    const { db, query } = createProductionDatabase([{
      endpoint: "",
      model: "doubao-pro",
    }]);
    const fetchImpl = vi.fn();
    const adapter = new VolcengineChatCompletionAdapter(db, "secret", fetchImpl);

    await expect(adapter.execute(request())).rejects.toMatchObject({
      code: "WORKFLOW_INFERENCE_MODEL_INVALID",
      failureKind: "terminal",
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses a direct endpoint target without resolving the model catalog", async () => {
    const { db, query } = createProductionDatabase([]);
    const modelResolver = vi.fn();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        matchedCode: "I1",
        reason: "matched",
      }) } }],
    }), { status: 200 }));
    const adapter = new VolcengineChatCompletionAdapter(
      db,
      "secret",
      fetchImpl,
      modelResolver,
    );

    await expect(adapter.execute(request({
      modelTarget: { endpointId: "ep-20260227145914-nxcmn", kind: "endpoint" },
      reasoningEffort: "low",
      responseFormat: {
        fields: [
          { description: "Intent code", name: "matchedCode", type: "string" },
          { description: "Reason", name: "reason", type: "string" },
        ],
        type: "json",
      },
    }))).resolves.toEqual({
      type: "json",
      value: { matchedCode: "I1", reason: "matched" },
    });

    expect(query).not.toHaveBeenCalled();
    expect(modelResolver).not.toHaveBeenCalled();
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      model: "ep-20260227145914-nxcmn",
      reasoning_effort: "low",
      thinking: { type: "enabled" },
    });
  });

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

  it("maps ordered media blocks and resolves platform paths at Provider request time", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "answer" } }],
    }), { status: 200 }));
    const adapter = new VolcengineChatCompletionAdapter(
      database,
      "secret",
      fetchImpl,
      async () => ({ endpoint: "ep-test", model: "doubao-pro" }),
      undefined,
      "media.example.com",
    );

    await adapter.execute(request({
      messageList: [{
        content: [
          { text: "看下这个", type: "text" },
          { type: "image", url: "/audit/error.png" },
          { text: "怎么处理？", type: "text" },
          { type: "video", url: "/audit/demo.mp4" },
        ],
        role: "system",
      }],
    }));

    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.messages).toEqual([{
      content: [
        { text: "看下这个", type: "text" },
        { image_url: { url: "https://media.example.com/audit/error.png" }, type: "image_url" },
        { text: "怎么处理？", type: "text" },
        { text: "[视频]", type: "text" },
      ],
      role: "system",
    }]);
  });

  it("emits bounded provider diagnostics without prompt or completion content", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      id: "req-123",
      choices: [{ finish_reason: "stop", message: { content: "answer" } }],
      usage: { completion_tokens: 3, prompt_tokens: 5, total_tokens: 8 },
    }), { status: 200 }));
    const logger = { info: vi.fn() };
    const adapter = new VolcengineChatCompletionAdapter(
      database,
      "secret",
      fetchImpl,
      async () => ({ endpoint: "ep-test", model: "doubao-pro" }),
      logger,
    );

    await adapter.execute(request());

    expect(logger.info).toHaveBeenCalledWith({
      event: "workflow.inference.provider.completed",
      endpoint: "ep-test",
      finishReason: "stop",
      model: "doubao-pro",
      providerRequestId: "req-123",
      usage: { completion_tokens: 3, prompt_tokens: 5, total_tokens: 8 },
    }, "workflow inference provider completed");
    expect(logger.info.mock.calls[0]?.[0]).not.toHaveProperty("content");
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

  it("rejects an empty text completion", async () => {
    const adapter = new VolcengineChatCompletionAdapter(
      database,
      "secret",
      async () => new Response(JSON.stringify({
        choices: [{ message: { content: "" } }],
      }), { status: 200 }),
      async () => ({ endpoint: "ep-test", model: "doubao-pro" }),
    );

    await expect(adapter.execute(request())).rejects.toMatchObject({
      code: "WORKFLOW_INFERENCE_RESPONSE_INVALID",
      failureKind: "terminal",
    });
  });
});
