import { describe, expect, it, vi } from "vitest";
import type { WorkflowTagCommand } from "@chatai/contracts";
import { WORKFLOW_TAG_CAPABILITY_BINDING } from "@chatai/workflow-runtime";
import {
  HttpWorkflowTagCapabilityPort,
  executeWorkflowTag,
} from "../src/tag-capability-port.js";

describe("Workflow Tag Java port", () => {
  it.each([
    ["add", 1],
    ["remove", 2],
  ] as const)("maps %s to one idempotent all-or-nothing Java request", async (
    operation,
    type,
  ) => {
    const fetchMock = vi.fn(async () => javaResponse({
      data: "updated",
      error: 0,
      errorMsg: "",
      success: true,
    }));

    await expect(executeWorkflowTag({
      baseUrl: "https://java.example.com/internal",
      command: tagCommand(operation),
      externalUserId: 101,
      fetch: fetchMock as typeof fetch,
      idempotencyKey: "9:run-1:tag-1:2",
      signal: new AbortController().signal,
      token: "internal-token",
      uid: 9,
    })).resolves.toEqual({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://java.example.com/third-internal/work-tag/update-wecom-contact-tag?idempotentKey=9%3Arun-1%3Atag-1%3A2",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({
        externalUserId: 101,
        tagIds: [301, 302],
        type,
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
    const port = new HttpWorkflowTagCapabilityPort({
      baseUrl: "https://java.example.com",
      fetch: fetchMock as typeof fetch,
    });
    const invalidRequests = [
      { ...request(), command: { ...tagCommand(), tagIds: [] } },
      { ...request(), identities: {} },
      { ...request(), idempotencyKey: "" },
    ];

    for (const invalidRequest of invalidRequests) {
      await expect(port.execute(
        WORKFLOW_TAG_CAPABILITY_BINDING.definition,
        invalidRequest,
      )).rejects.toMatchObject({
        code: "WORKFLOW_TAG_REQUEST_INVALID",
        failureKind: "terminal",
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unsupported capability before Java", async () => {
    const fetchMock = vi.fn();
    const port = new HttpWorkflowTagCapabilityPort({
      baseUrl: "https://java.example.com",
      fetch: fetchMock as typeof fetch,
    });

    await expect(port.execute(
      { ...WORKFLOW_TAG_CAPABILITY_BINDING.definition, contractVersion: 2 },
      request(),
    )).rejects.toMatchObject({
      code: "WORKFLOW_CAPABILITY_UNSUPPORTED",
      failureKind: "terminal",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats HTTP 200 business rejection as terminal", async () => {
    await expect(executeWorkflowTag({
      ...executeInput(),
      fetch: vi.fn(async () => javaResponse({
        data: "",
        error: 40001,
        errorMsg: " 标签不存在 ",
        error_msg: "不应读取的兼容字段",
        success: false,
      })) as typeof fetch,
    })).rejects.toMatchObject({
      code: "WORKFLOW_TAG_REJECTED",
      diagnosticMessage:
        "Workflow Tag Java endpoint rejected the request: 40001 标签不存在",
      failureKind: "terminal",
    });
  });

  it("classifies transport and every non-200 response as retryable", async () => {
    const cases = [
      {
        code: "WORKFLOW_TAG_FAILED",
        fetch: vi.fn(async () => { throw new Error("network"); }),
      },
      ...[400, 408, 429, 503, 201].map(status => ({
        code: "WORKFLOW_TAG_UNAVAILABLE",
        fetch: vi.fn(async () => new Response(null, { status })),
      })),
    ];

    for (const item of cases) {
      await expect(executeWorkflowTag({
        ...executeInput(),
        fetch: item.fetch as typeof fetch,
      })).rejects.toMatchObject({ code: item.code, failureKind: "retryable" });
    }
  });

  it("treats invalid HTTP 200 envelopes as terminal", async () => {
    const fetches: Array<typeof fetch> = [
      vi.fn(async () => new Response("not-json", { status: 200 })) as typeof fetch,
      vi.fn(async () => javaResponse({ data: "updated" })) as typeof fetch,
      vi.fn(async () => javaResponse({ data: "updated", success: 1 })) as typeof fetch,
    ];

    for (const fetchImplementation of fetches) {
      await expect(executeWorkflowTag({
        ...executeInput(),
        fetch: fetchImplementation,
      })).rejects.toMatchObject({
        code: "WORKFLOW_TAG_RESPONSE_INVALID",
        failureKind: "terminal",
      });
    }
  });

  it("reuses the caller-provided idempotency key on retry", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(javaResponse({ data: "updated", success: true }));
    const input = { ...executeInput(), fetch: fetchMock as typeof fetch };

    await expect(executeWorkflowTag(input)).rejects.toMatchObject({
      failureKind: "retryable",
    });
    await expect(executeWorkflowTag(input)).resolves.toEqual({});
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://java.example.com/third-internal/work-tag/update-wecom-contact-tag?idempotentKey=stable-key",
      "https://java.example.com/third-internal/work-tag/update-wecom-contact-tag?idempotentKey=stable-key",
    ]);
  });

  it("propagates cancellation before issuing the Java request", async () => {
    const fetchMock = vi.fn();
    const controller = new AbortController();
    const reason = new Error("cancelled");
    controller.abort(reason);

    await expect(executeWorkflowTag({
      ...executeInput(),
      fetch: fetchMock as typeof fetch,
      signal: controller.signal,
    })).rejects.toBe(reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a non-Error cancellation reason to the stable retryable failure", async () => {
    const fetchMock = vi.fn();
    const controller = new AbortController();
    controller.abort("cancelled");

    await expect(executeWorkflowTag({
      ...executeInput(),
      fetch: fetchMock as typeof fetch,
      signal: controller.signal,
    })).rejects.toMatchObject({
      code: "WORKFLOW_TAG_ABORTED",
      failureKind: "retryable",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function tagCommand(
  operation: WorkflowTagCommand["operation"] = "add",
): WorkflowTagCommand {
  return { operation, source: "workflow", tagIds: [301, 302] };
}

function request() {
  return {
    command: tagCommand(),
    deadlineAt: new Date("2026-08-21T10:00:15.000Z"),
    execution: {
      nodeId: "tag-1",
      revision: 1,
      runId: "run-1",
      sequence: 2,
      workflowId: "workflow-1",
    },
    identities: { externalUserId: 101 },
    idempotencyKey: "9:run-1:tag-1:2",
    signal: new AbortController().signal,
    subjectId: "contact-1",
    subjectType: "chatai_contact" as const,
    uid: 9,
  };
}

function executeInput() {
  return {
    baseUrl: "https://java.example.com",
    command: tagCommand(),
    externalUserId: 101,
    fetch: vi.fn(async () => javaResponse({ data: "updated", success: true })) as typeof fetch,
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
