import { describe, expect, it, vi } from "vitest";
import type { WorkflowCustomerUpdateCommand } from "@chatai/contracts";
import { WORKFLOW_CUSTOMER_UPDATE_CAPABILITY_BINDING } from "@chatai/workflow-runtime";
import {
  HttpWorkflowCustomerUpdateCapabilityPort,
  executeWorkflowCustomerUpdate,
} from "../src/customer-update-capability-port.js";

describe("Workflow Customer Update Java port", () => {
  it("maps one idempotent all-or-nothing batch with plain decimal values", async () => {
    const fetchMock = vi.fn(async () => javaResponse({
      data: true,
      error: 0,
      errorMsg: "",
      success: true,
    }));

    await expect(executeWorkflowCustomerUpdate({
      baseUrl: "https://java.example.com/internal",
      command: customerUpdateCommand(),
      externalUserId: 101,
      fetch: fetchMock as typeof fetch,
      idempotencyKey: "9:run-1:customer-update-1:2",
      signal: new AbortController().signal,
      token: "internal-token",
      uid: 9,
    })).resolves.toEqual({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://java.example.com/third-internal/custom-field/update-contact-custom-field?idempotentKey=9%3Arun-1%3Acustomer-update-1%3A2",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({
        externalUserId: 101,
        fieldValues: [
          { fieldId: 301, value: "重点客户" },
          { fieldId: 302, value: "1995-04-18" },
          { fieldId: 303, value: "1230000000000000000000" },
          { fieldId: 304, value: "-0.000000125" },
        ],
        uid: 9,
      }),
      headers: {
        authorization: "Bearer internal-token",
        "content-type": "application/json",
      },
      method: "POST",
    });
  });

  it("completes an empty batch without calling Java", async () => {
    const fetchMock = vi.fn();

    await expect(executeWorkflowCustomerUpdate({
      ...executeInput(),
      command: customerUpdateCommand({ updates: [] }),
      fetch: fetchMock as typeof fetch,
    })).resolves.toEqual({});

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid command, prepared identity, or idempotency key before Java", async () => {
    const fetchMock = vi.fn();
    const port = new HttpWorkflowCustomerUpdateCapabilityPort({
      baseUrl: "https://java.example.com",
      fetch: fetchMock as typeof fetch,
    });
    const duplicateFields = customerUpdateCommand({
      updates: [
        { fieldId: 301, fieldType: 1, value: "first" },
        { fieldId: 301, fieldType: 1, value: "second" },
      ],
    });
    const invalidRequests = [
      { ...request(), command: duplicateFields },
      {
        ...request(),
        command: customerUpdateCommand({
          updates: [{ fieldId: 301, fieldType: 11, value: "1e+21" }],
        }),
      },
      {
        ...request(),
        command: customerUpdateCommand({
          updates: [{ fieldId: 301, fieldType: 1, value: "" }],
        }),
      },
      { ...request(), identities: {} },
      { ...request(), idempotencyKey: "" },
    ];

    for (const invalidRequest of invalidRequests) {
      await expect(port.execute(
        WORKFLOW_CUSTOMER_UPDATE_CAPABILITY_BINDING.definition,
        invalidRequest,
      )).rejects.toMatchObject({
        code: "WORKFLOW_CUSTOMER_UPDATE_REQUEST_INVALID",
        failureKind: "terminal",
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unsupported capability before Java", async () => {
    const fetchMock = vi.fn();
    const port = new HttpWorkflowCustomerUpdateCapabilityPort({
      baseUrl: "https://java.example.com",
      fetch: fetchMock as typeof fetch,
    });

    await expect(port.execute(
      { ...WORKFLOW_CUSTOMER_UPDATE_CAPABILITY_BINDING.definition, contractVersion: 2 },
      request(),
    )).rejects.toMatchObject({
      code: "WORKFLOW_CAPABILITY_UNSUPPORTED",
      failureKind: "terminal",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats HTTP 200 business rejection as terminal", async () => {
    await expect(executeWorkflowCustomerUpdate({
      ...executeInput(),
      fetch: vi.fn(async () => javaResponse({
        data: false,
        error: 40001,
        errorMsg: " 字段已停用 ",
        error_msg: "不应读取的兼容字段",
        success: false,
      })) as typeof fetch,
    })).rejects.toMatchObject({
      code: "WORKFLOW_CUSTOMER_UPDATE_REJECTED",
      diagnosticMessage:
        "Workflow Customer Update Java endpoint rejected the request: 40001 字段已停用",
      failureKind: "terminal",
    });
  });

  it("classifies transport and every non-200 response as retryable", async () => {
    const cases = [
      {
        code: "WORKFLOW_CUSTOMER_UPDATE_FAILED",
        fetch: vi.fn(async () => { throw new Error("network"); }),
      },
      ...[400, 408, 429, 503, 201].map(status => ({
        code: "WORKFLOW_CUSTOMER_UPDATE_UNAVAILABLE",
        fetch: vi.fn(async () => new Response(null, { status })),
      })),
    ];

    for (const item of cases) {
      await expect(executeWorkflowCustomerUpdate({
        ...executeInput(),
        fetch: item.fetch as typeof fetch,
      })).rejects.toMatchObject({ code: item.code, failureKind: "retryable" });
    }
  });

  it("treats invalid HTTP 200 envelopes as terminal", async () => {
    const fetches: Array<typeof fetch> = [
      vi.fn(async () => new Response("not-json", { status: 200 })) as typeof fetch,
      vi.fn(async () => javaResponse({ data: true })) as typeof fetch,
      vi.fn(async () => javaResponse({
        data: false,
        error: 0,
        errorMsg: "",
        success: true,
      })) as typeof fetch,
      vi.fn(async () => javaResponse({ data: true, success: 1 })) as typeof fetch,
    ];

    for (const fetchImplementation of fetches) {
      await expect(executeWorkflowCustomerUpdate({
        ...executeInput(),
        fetch: fetchImplementation,
      })).rejects.toMatchObject({
        code: "WORKFLOW_CUSTOMER_UPDATE_RESPONSE_INVALID",
        failureKind: "terminal",
      });
    }
  });

  it("reuses the caller-provided idempotency key and identical batch on retry", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(javaResponse({
        data: true,
        error: 0,
        errorMsg: "",
        success: true,
      }));
    const input = { ...executeInput(), fetch: fetchMock as typeof fetch };

    await expect(executeWorkflowCustomerUpdate(input)).rejects.toMatchObject({
      failureKind: "retryable",
    });
    await expect(executeWorkflowCustomerUpdate(input)).resolves.toEqual({});
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://java.example.com/third-internal/custom-field/update-contact-custom-field?idempotentKey=stable-key",
      "https://java.example.com/third-internal/custom-field/update-contact-custom-field?idempotentKey=stable-key",
    ]);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(fetchMock.mock.calls[1]?.[1]?.body);
  });

  it("propagates cancellation before issuing the Java request", async () => {
    const fetchMock = vi.fn();
    const controller = new AbortController();
    const reason = new Error("cancelled");
    controller.abort(reason);

    await expect(executeWorkflowCustomerUpdate({
      ...executeInput(),
      fetch: fetchMock as typeof fetch,
      signal: controller.signal,
    })).rejects.toBe(reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function customerUpdateCommand(
  overrides: Partial<WorkflowCustomerUpdateCommand> = {},
): WorkflowCustomerUpdateCommand {
  return {
    source: "workflow",
    updates: [
      { fieldId: 301, fieldType: 1, value: "重点客户" },
      { fieldId: 302, fieldType: 12, value: "1995-04-18" },
      { fieldId: 303, fieldType: 11, value: 1.23e21 },
      { fieldId: 304, fieldType: 11, value: -1.25e-7 },
    ],
    ...overrides,
  };
}

function request() {
  return {
    command: customerUpdateCommand(),
    deadlineAt: new Date("2026-08-21T10:00:15.000Z"),
    execution: {
      nodeId: "customer-update-1",
      revision: 1,
      runId: "run-1",
      sequence: 2,
      workflowId: "workflow-1",
    },
    identities: { externalUserId: 101 },
    idempotencyKey: "9:run-1:customer-update-1:2",
    signal: new AbortController().signal,
    subjectId: "contact-1",
    subjectType: "chatai_contact" as const,
    uid: 9,
  };
}

function executeInput() {
  return {
    baseUrl: "https://java.example.com",
    command: customerUpdateCommand(),
    externalUserId: 101,
    fetch: vi.fn(async () => javaResponse({
      data: true,
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
