import { describe, expect, it, vi } from "vitest";
import type { WorkflowOrderBindCommand } from "@chatai/contracts";
import { WORKFLOW_ORDER_BIND_CAPABILITY_BINDING } from "@chatai/workflow-runtime";
import {
  HttpWorkflowOrderBindCapabilityPort,
  executeWorkflowOrderBind,
} from "../src/order-bind-capability-port.js";

describe("Workflow Order Bind Java port", () => {
  it("maps one idempotent Java request and treats success true as operation success", async () => {
    const fetchMock = vi.fn(async () => javaResponse({
      success: true,
    }));

    await expect(executeWorkflowOrderBind({
      baseUrl: "https://java.example.com/internal",
      command: orderBindCommand(),
      externalUserId: 101,
      fetch: fetchMock as typeof fetch,
      idempotencyKey: "9:run-1:order-bind-1:2",
      signal: new AbortController().signal,
      token: "internal-token",
      uid: 9,
    })).resolves.toEqual({ result: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://java.example.com/third-internal/one-id/order-bind?idempotentKey=9%3Arun-1%3Aorder-bind-1%3A2",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({
        existAcctSkip: true,
        externalUserId: 101,
        orderBind: true,
        source: 28,
        tradeNo: "SO20260821001",
        uid: 9,
      }),
      headers: {
        authorization: "Bearer internal-token",
        "content-type": "application/json",
      },
      method: "POST",
    });
  });

  it("rejects an invalid command, prepared identity, or idempotency key before Java", async () => {
    const fetchMock = vi.fn();
    const port = new HttpWorkflowOrderBindCapabilityPort({
      baseUrl: "https://java.example.com",
      fetch: fetchMock as typeof fetch,
    });
    const invalidRequests = [
      { ...request(), command: { ...orderBindCommand(), orderNumber: "" } },
      { ...request(), identities: {} },
      { ...request(), identities: { externalUserId: 0 } },
      { ...request(), idempotencyKey: "" },
    ];

    for (const invalidRequest of invalidRequests) {
      await expect(port.execute(
        WORKFLOW_ORDER_BIND_CAPABILITY_BINDING.definition,
        invalidRequest,
      )).rejects.toMatchObject({
        code: "WORKFLOW_ORDER_BIND_REQUEST_INVALID",
        failureKind: "terminal",
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unsupported capability before Java", async () => {
    const fetchMock = vi.fn();
    const port = new HttpWorkflowOrderBindCapabilityPort({
      baseUrl: "https://java.example.com",
      fetch: fetchMock as typeof fetch,
    });

    await expect(port.execute(
      { ...WORKFLOW_ORDER_BIND_CAPABILITY_BINDING.definition, contractVersion: 2 },
      request(),
    )).rejects.toMatchObject({
      code: "WORKFLOW_CAPABILITY_UNSUPPORTED",
      failureKind: "terminal",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves legacy error-only results and honors success when present", async () => {
    await expect(executeWorkflowOrderBind({
      ...executeInput(),
      fetch: vi.fn(async () => javaResponse({ error: 0, errorMsg: "" })) as typeof fetch,
    })).resolves.toEqual({ result: true });
    await expect(executeWorkflowOrderBind({
      ...executeInput(),
      fetch: vi.fn(async () => javaResponse({ error: 40001 })) as typeof fetch,
    })).resolves.toEqual({ result: false });
    await expect(executeWorkflowOrderBind({
      ...executeInput(),
      fetch: vi.fn(async () => javaResponse({
        error: 1.5,
        errorMsg: null,
        success: true,
      })) as typeof fetch,
    })).resolves.toEqual({ result: true });

    await expect(executeWorkflowOrderBind({
      ...executeInput(),
      fetch: vi.fn(async () => javaResponse({
        data: "",
        error: 40001,
        errorMsg: " 订单不存在 ",
        error_msg: "不应读取的兼容字段",
        success: false,
      })) as typeof fetch,
    })).resolves.toEqual({ result: false });
    await expect(executeWorkflowOrderBind({
      ...executeInput(),
      fetch: vi.fn(async () => javaResponse({ error: 40001, errorMsg: null, success: false })) as typeof fetch,
    })).resolves.toEqual({ result: false });
    await expect(executeWorkflowOrderBind({
      ...executeInput(),
      fetch: vi.fn(async () => javaResponse({ success: false })) as typeof fetch,
    })).resolves.toEqual({ result: false });
  });

  it("classifies transport and every non-200 response as retryable", async () => {
    const cases = [
      {
        code: "WORKFLOW_ORDER_BIND_FAILED",
        fetch: vi.fn(async () => { throw new Error("network"); }),
      },
      ...[400, 408, 429, 503, 201].map(status => ({
        code: "WORKFLOW_ORDER_BIND_UNAVAILABLE",
        fetch: vi.fn(async () => new Response(null, { status })),
      })),
    ];

    for (const item of cases) {
      await expect(executeWorkflowOrderBind({
        ...executeInput(),
        fetch: item.fetch as typeof fetch,
      })).rejects.toMatchObject({ code: item.code, failureKind: "retryable" });
    }
  });

  it("treats invalid HTTP 200 envelopes as terminal", async () => {
    const fetches: Array<typeof fetch> = [
      vi.fn(async () => new Response("not-json", { status: 200 })) as typeof fetch,
      vi.fn(async () => javaResponse({ data: "ok", success: 1 })) as typeof fetch,
      vi.fn(async () => javaResponse({ data: "ok", error: "0" })) as typeof fetch,
      vi.fn(async () => javaResponse({ data: "ok", error: 1.5 })) as typeof fetch,
    ];

    for (const fetchImplementation of fetches) {
      await expect(executeWorkflowOrderBind({
        ...executeInput(),
        fetch: fetchImplementation,
      })).rejects.toMatchObject({
        code: "WORKFLOW_ORDER_BIND_RESPONSE_INVALID",
        failureKind: "terminal",
      });
    }
  });

  it("reuses the caller-provided idempotency key on retry", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(javaResponse({
        error: 0,
        errorMsg: "",
        success: true,
      }));
    const input = { ...executeInput(), fetch: fetchMock as typeof fetch };

    await expect(executeWorkflowOrderBind(input)).rejects.toMatchObject({
      failureKind: "retryable",
    });
    await expect(executeWorkflowOrderBind(input)).resolves.toEqual({
      result: true,
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://java.example.com/third-internal/one-id/order-bind?idempotentKey=stable-key",
      "https://java.example.com/third-internal/one-id/order-bind?idempotentKey=stable-key",
    ]);
  });

  it("propagates cancellation before issuing the Java request", async () => {
    const fetchMock = vi.fn();
    const controller = new AbortController();
    const reason = new Error("cancelled");
    controller.abort(reason);

    await expect(executeWorkflowOrderBind({
      ...executeInput(),
      fetch: fetchMock as typeof fetch,
      signal: controller.signal,
    })).rejects.toBe(reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function orderBindCommand(): WorkflowOrderBindCommand {
  return { orderNumber: "SO20260821001", source: "workflow" };
}

function request() {
  return {
    command: orderBindCommand(),
    deadlineAt: new Date("2026-08-21T10:00:15.000Z"),
    execution: {
      nodeId: "order-bind-1",
      revision: 1,
      runId: "run-1",
      sequence: 2,
      workflowId: "workflow-1",
    },
    identities: { externalUserId: 101 },
    idempotencyKey: "9:run-1:order-bind-1:2",
    signal: new AbortController().signal,
    subjectId: "contact-1",
    subjectType: "chatai_contact" as const,
    uid: 9,
  };
}

function executeInput() {
  return {
    baseUrl: "https://java.example.com",
    command: orderBindCommand(),
    externalUserId: 101,
    fetch: vi.fn(async () => javaResponse({
      error: 0,
      errorMsg: "",
      success: true,
    })) as typeof fetch,
    idempotencyKey: "stable-key",
    signal: new AbortController().signal,
    token: null,
    uid: 9,
  };
}

function javaResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
