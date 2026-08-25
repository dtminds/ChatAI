import { describe, expect, it, vi } from "vitest";
import type { WorkflowPointsTransferCommand } from "@chatai/contracts";
import { WORKFLOW_POINTS_TRANSFER_CAPABILITY_BINDING } from "@chatai/workflow-runtime";
import {
  HttpWorkflowPointsTransferCapabilityPort,
  executeWorkflowPointsTransfer,
} from "../src/points-transfer-capability-port.js";

describe("Workflow Points Transfer Java port", () => {
  it("maps one idempotent Java request and treats error 0 as success", async () => {
    const fetchMock = vi.fn(async () => javaResponse({
      data: null,
      error: 0,
      errorMsg: "",
    }));

    await expect(executeWorkflowPointsTransfer({
      baseUrl: "https://java.example.com/internal",
      command: pointsTransferCommand(),
      fetch: fetchMock as typeof fetch,
      idempotencyKey: "9:run-1:points-transfer-1:2",
      mallUserId: 202,
      signal: new AbortController().signal,
      token: "internal-token",
      uid: 9,
    })).resolves.toEqual({ result: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://java.example.com/third-internal/mall-order/transfer-order-point?idempotentKey=9%3Arun-1%3Apoints-transfer-1%3A2",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({
        mallUserId: 202,
        orderNumber: "SO20260824001",
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
    const port = new HttpWorkflowPointsTransferCapabilityPort({
      baseUrl: "https://java.example.com",
      fetch: fetchMock as typeof fetch,
    });
    const invalidRequests = [
      { ...request(), command: { ...pointsTransferCommand(), orderNumber: "" } },
      { ...request(), identities: {} },
      { ...request(), identities: { mallUserId: 0 } },
      { ...request(), idempotencyKey: "" },
    ];

    for (const invalidRequest of invalidRequests) {
      await expect(port.execute(
        WORKFLOW_POINTS_TRANSFER_CAPABILITY_BINDING.definition,
        invalidRequest,
      )).rejects.toMatchObject({
        code: "WORKFLOW_POINTS_TRANSFER_REQUEST_INVALID",
        failureKind: "terminal",
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unsupported capability before Java", async () => {
    const fetchMock = vi.fn();
    const port = new HttpWorkflowPointsTransferCapabilityPort({
      baseUrl: "https://java.example.com",
      fetch: fetchMock as typeof fetch,
    });

    await expect(port.execute(
      { ...WORKFLOW_POINTS_TRANSFER_CAPABILITY_BINDING.definition, contractVersion: 2 },
      request(),
    )).rejects.toMatchObject({
      code: "WORKFLOW_CAPABILITY_UNSUPPORTED",
      failureKind: "terminal",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("completes HTTP 200 business rejection as result false", async () => {
    await expect(executeWorkflowPointsTransfer({
      ...executeInput(),
      fetch: vi.fn(async () => javaResponse({
        data: "",
        error: 40001,
        errorMsg: " 订单不存在 ",
        error_msg: "不应读取的兼容字段",
        success: false,
      })) as typeof fetch,
    })).resolves.toEqual({ result: false });
  });

  it("classifies transport and every non-200 response as retryable", async () => {
    const cases = [
      {
        code: "WORKFLOW_POINTS_TRANSFER_FAILED",
        fetch: vi.fn(async () => { throw new Error("network"); }),
      },
      ...[400, 408, 429, 503, 201].map(status => ({
        code: "WORKFLOW_POINTS_TRANSFER_UNAVAILABLE",
        fetch: vi.fn(async () => new Response(null, { status })),
      })),
    ];

    for (const item of cases) {
      await expect(executeWorkflowPointsTransfer({
        ...executeInput(),
        fetch: item.fetch as typeof fetch,
      })).rejects.toMatchObject({ code: item.code, failureKind: "retryable" });
    }
  });

  it("treats invalid HTTP 200 envelopes as terminal", async () => {
    const fetches: Array<typeof fetch> = [
      vi.fn(async () => new Response("not-json", { status: 200 })) as typeof fetch,
      vi.fn(async () => javaResponse({ data: "ok" })) as typeof fetch,
      vi.fn(async () => javaResponse({ data: "ok", error: "0" })) as typeof fetch,
      vi.fn(async () => javaResponse({ data: "ok", error: 1.5 })) as typeof fetch,
    ];

    for (const fetchImplementation of fetches) {
      await expect(executeWorkflowPointsTransfer({
        ...executeInput(),
        fetch: fetchImplementation,
      })).rejects.toMatchObject({
        code: "WORKFLOW_POINTS_TRANSFER_RESPONSE_INVALID",
        failureKind: "terminal",
      });
    }
  });

  it("reuses the caller-provided idempotency key on retry", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(javaResponse({ error: 0 }));
    const input = { ...executeInput(), fetch: fetchMock as typeof fetch };

    await expect(executeWorkflowPointsTransfer(input)).rejects.toMatchObject({
      failureKind: "retryable",
    });
    await expect(executeWorkflowPointsTransfer(input)).resolves.toEqual({
      result: true,
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://java.example.com/third-internal/mall-order/transfer-order-point?idempotentKey=stable-key",
      "https://java.example.com/third-internal/mall-order/transfer-order-point?idempotentKey=stable-key",
    ]);
  });

  it("propagates cancellation before issuing the Java request", async () => {
    const fetchMock = vi.fn();
    const controller = new AbortController();
    const reason = new Error("cancelled");
    controller.abort(reason);

    await expect(executeWorkflowPointsTransfer({
      ...executeInput(),
      fetch: fetchMock as typeof fetch,
      signal: controller.signal,
    })).rejects.toBe(reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function pointsTransferCommand(): WorkflowPointsTransferCommand {
  return { orderNumber: "SO20260824001", source: "workflow" };
}

function request() {
  return {
    command: pointsTransferCommand(),
    deadlineAt: new Date("2026-08-24T10:00:15.000Z"),
    execution: {
      nodeId: "points-transfer-1",
      revision: 1,
      runId: "run-1",
      sequence: 2,
      workflowId: "workflow-1",
    },
    identities: { mallUserId: 202 },
    idempotencyKey: "9:run-1:points-transfer-1:2",
    signal: new AbortController().signal,
    subjectId: "contact-1",
    subjectType: "chatai_contact" as const,
    uid: 9,
  };
}

function executeInput() {
  return {
    baseUrl: "https://java.example.com",
    command: pointsTransferCommand(),
    fetch: vi.fn(async () => javaResponse({ error: 0 })) as typeof fetch,
    idempotencyKey: "stable-key",
    mallUserId: 202,
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
