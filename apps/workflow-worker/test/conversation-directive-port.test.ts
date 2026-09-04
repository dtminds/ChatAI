import { describe, expect, it, vi } from "vitest";
import { HttpWorkflowConversationDirectivePort } from "../src/conversation-directive-port.js";

describe("Workflow conversation directive port", () => {
  it("sends ready-to-inject guidance with a UTC+8 wall-clock expiry and disables by bizId", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: 88,
        error: 0,
        errorMsg: "",
        success: true,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: true,
        error: 0,
        errorMsg: "",
        success: true,
      }), { status: 200 }));
    const port = new HttpWorkflowConversationDirectivePort({
      baseUrl: "https://java.internal",
      fetch: fetchImpl,
      token: "secret",
    });
    const signal = new AbortController().signal;

    await port.addOrUpdate({
      bizId: "workflow-task:88",
      bizInfo: "",
      conversationId: 301,
      expiresAt: new Date("2026-08-30T01:02:03.000Z"),
      limitRound: 3,
      payload: "请结合当前对话自然确认订单号",
      priority: 0,
      signal,
      type: "collect-fields",
      uid: 9,
    });
    await port.disable({
      bizId: "workflow-task:88",
      reason: "completed",
      signal,
      type: "collect-fields",
      uid: 9,
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(1,
      new URL("https://java.internal/third-internal/wap-embed-agent-directive/add-or-update"),
      expect.objectContaining({
        body: JSON.stringify({
          bizId: "workflow-task:88",
          bizInfo: "",
          conversationId: 301,
          expiresAt: "2026-08-30T09:02:03",
          limitRound: 3,
          payload: "请结合当前对话自然确认订单号",
          priority: 0,
          type: "collect-fields",
          uid: 9,
        }),
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        method: "POST",
        signal,
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(2,
      new URL("https://java.internal/third-internal/wap-embed-agent-directive/disable"),
      expect.objectContaining({
        body: JSON.stringify({
          bizId: "workflow-task:88",
          reason: "completed",
          type: "collect-fields",
          uid: 9,
        }),
      }),
    );
  });

  it.each([
    { data: 88, success: true },
    { data: 88, error: 1, errorMsg: "", success: true },
  ])("accepts success as authoritative: %j", async (body) => {
    const port = new HttpWorkflowConversationDirectivePort({
      baseUrl: "https://java.internal",
      fetch: vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
    });

    await expect(port.addOrUpdate(activationInput())).resolves.toBeUndefined();
  });

  it("classifies an explicit Java rejection separately from an invalid envelope", async () => {
    const port = new HttpWorkflowConversationDirectivePort({
      baseUrl: "https://java.internal",
      fetch: vi.fn(async () => new Response(JSON.stringify({
        error: 1,
        errorMsg: "x",
        success: false,
      }), { status: 200 })),
    });

    await expect(port.addOrUpdate(activationInput())).rejects.toMatchObject({
      code: "WORKFLOW_AI_COLLECT_DIRECTIVE_REJECTED",
      diagnosticMessage: "Directive endpoint rejected the request: 1 x",
      failureKind: "terminal",
    });
  });
});

function activationInput() {
  return {
    bizId: "workflow-task:88",
    bizInfo: "",
    conversationId: 301,
    expiresAt: new Date("2026-08-30T01:02:03.000Z"),
    limitRound: 3,
    payload: "请结合当前对话自然确认订单号",
    priority: 0,
    signal: new AbortController().signal,
    type: "collect-fields" as const,
    uid: 9,
  };
}
