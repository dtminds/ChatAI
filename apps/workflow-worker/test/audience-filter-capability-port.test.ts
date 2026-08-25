import { describe, expect, it, vi } from "vitest";
import {
  WORKFLOW_AUDIENCE_FILTER_CAPABILITY_BINDING,
} from "@chatai/workflow-runtime";
import {
  HttpWorkflowAudienceFilterCapabilityPort,
  decodeWorkflowAudienceFilterJavaResponse,
} from "../src/audience-filter-capability-port.js";

describe("Workflow Audience Filter Java port", () => {
  it("queries once with 1 or 3 groupIds and returns the requested intersection", async () => {
    const fetchMock = vi.fn(async () => javaResponse({
      data: { exist: true, groupIds: [999, 301, 303] },
      error: 0,
      errorMsg: "",
      error_msg: "",
      success: true,
    }));
    const port = new HttpWorkflowAudienceFilterCapabilityPort({
      baseUrl: "https://java.example.com/internal",
      fetch: fetchMock as typeof fetch,
      token: "internal-token",
    });

    await expect(port.execute(
      WORKFLOW_AUDIENCE_FILTER_CAPABILITY_BINDING.definition,
      request({ groupIds: [301] }),
    )).resolves.toEqual({ exist: true, groupIds: [301] });

    await expect(port.execute(
      WORKFLOW_AUDIENCE_FILTER_CAPABILITY_BINDING.definition,
      request({ groupIds: [301, 302, 303] }),
    )).resolves.toEqual({ exist: true, groupIds: [301, 303] });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://java.example.com/third-internal/cdp-group-operate/check-contact-exist",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ externalUserId: 101, groupIds: [301], uid: 9 }),
      headers: {
        authorization: "Bearer internal-token",
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      externalUserId: 101,
      groupIds: [301, 302, 303],
      uid: 9,
    });
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("idempotencyKey");
  });

  it("keeps exist when membership is empty and ignores ids outside the request", () => {
    expect(decodeWorkflowAudienceFilterJavaResponse({
      data: { exist: true, groupIds: [999] },
      success: true,
    }, [301, 302])).toEqual({ exist: true, groupIds: [] });
    expect(decodeWorkflowAudienceFilterJavaResponse({
      data: { exist: false },
      error: 0,
    }, [301])).toEqual({ exist: false, groupIds: [] });
  });

  it("rejects string, invalid, or duplicate group ids as terminal", () => {
    expect(() => decodeWorkflowAudienceFilterJavaResponse({
      data: { exist: true, groupIds: ["301"] },
      success: true,
    }, [301])).toThrow(expect.objectContaining({
      code: "WORKFLOW_AUDIENCE_FILTER_OUTPUT_INVALID",
      diagnosticMessage: "Workflow Audience Filter Java result contains an invalid group id",
      failureKind: "terminal",
    }));
    expect(() => decodeWorkflowAudienceFilterJavaResponse({
      data: { exist: true, groupIds: [301, {}] },
      success: true,
    }, [301])).toThrow(expect.objectContaining({
      code: "WORKFLOW_AUDIENCE_FILTER_OUTPUT_INVALID",
      failureKind: "terminal",
    }));
    expect(() => decodeWorkflowAudienceFilterJavaResponse({
      data: { exist: true, groupIds: [301, 301] },
      success: true,
    }, [301])).toThrow(expect.objectContaining({
      diagnosticMessage: "Workflow Audience Filter Java result contains a duplicate group id",
      failureKind: "terminal",
    }));
  });

  it("treats an explicit Java business failure as terminal", () => {
    expect(() => decodeWorkflowAudienceFilterJavaResponse({
      data: { exist: false, groupIds: [] },
      error: 40001,
      errorMsg: " 人群包参数无效 ",
      error_msg: "不应读取的兼容字段",
      success: false,
    }, [301])).toThrow(expect.objectContaining({
      code: "WORKFLOW_AUDIENCE_FILTER_REJECTED",
      diagnosticMessage:
        "Workflow Audience Filter Java endpoint rejected the request: 40001 人群包参数无效",
      failureKind: "terminal",
    }));
  });

  it.each([
    { data: { exist: true, groupIds: [] }, error: 1 },
    { data: { exist: true, groupIds: [] }, success: 1 },
  ])("treats an invalid success envelope as terminal", (body) => {
    expect(() => decodeWorkflowAudienceFilterJavaResponse(body, [301])).toThrow(
      expect.objectContaining({
        code: "WORKFLOW_AUDIENCE_FILTER_RESPONSE_INVALID",
        failureKind: "terminal",
      }),
    );
  });

  it.each([
    [{ exist: "yes", groupIds: [] }, "missing exist"],
    [{ exist: true, groupIds: {} }, "invalid groupIds"],
  ])("rejects an invalid successful payload: %s", (data, diagnostic) => {
    expect(() => decodeWorkflowAudienceFilterJavaResponse({ data, success: true }, [301]))
      .toThrow(expect.objectContaining({
        diagnosticMessage: expect.stringContaining(diagnostic),
        failureKind: "terminal",
      }));
  });

  it("rejects a missing prepared externalUserId before calling Java", async () => {
    const fetchMock = vi.fn();
    const port = new HttpWorkflowAudienceFilterCapabilityPort({
      baseUrl: "https://java.example.com",
      fetch: fetchMock as typeof fetch,
    });

    await expect(port.execute(
      WORKFLOW_AUDIENCE_FILTER_CAPABILITY_BINDING.definition,
      { ...request({ groupIds: [301] }), identities: {} },
    )).rejects.toMatchObject({
      code: "WORKFLOW_AUDIENCE_FILTER_REQUEST_INVALID",
      failureKind: "terminal",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("classifies transport, HTTP, and envelope failures", async () => {
    const cases = [
      {
        expected: { code: "WORKFLOW_AUDIENCE_FILTER_FAILED", failureKind: "retryable" },
        fetch: vi.fn(async () => { throw new Error("network"); }),
      },
      {
        expected: { code: "WORKFLOW_AUDIENCE_FILTER_UNAVAILABLE", failureKind: "retryable" },
        fetch: vi.fn(async () => new Response(null, { status: 408 })),
      },
      {
        expected: { code: "WORKFLOW_AUDIENCE_FILTER_UNAVAILABLE", failureKind: "retryable" },
        fetch: vi.fn(async () => new Response(null, { status: 503 })),
      },
      {
        expected: { code: "WORKFLOW_AUDIENCE_FILTER_RESPONSE_INVALID", failureKind: "terminal" },
        fetch: vi.fn(async () => new Response("not-json", { status: 200 })),
      },
      {
        expected: { code: "WORKFLOW_AUDIENCE_FILTER_REJECTED", failureKind: "terminal" },
        fetch: vi.fn(async () => javaResponse({ data: { exist: false }, success: false })),
      },
    ];

    for (const item of cases) {
      const port = new HttpWorkflowAudienceFilterCapabilityPort({
        baseUrl: "https://java.example.com",
        fetch: item.fetch as typeof fetch,
      });
      await expect(port.execute(
        WORKFLOW_AUDIENCE_FILTER_CAPABILITY_BINDING.definition,
        request({ groupIds: [301] }),
      )).rejects.toMatchObject(item.expected);
    }
  });

  it("propagates cancellation before issuing the Java request", async () => {
    const fetchMock = vi.fn();
    const controller = new AbortController();
    const reason = new Error("cancelled");
    controller.abort(reason);
    const port = new HttpWorkflowAudienceFilterCapabilityPort({
      baseUrl: "https://java.example.com",
      fetch: fetchMock as typeof fetch,
    });

    await expect(port.execute(
      WORKFLOW_AUDIENCE_FILTER_CAPABILITY_BINDING.definition,
      { ...request({ groupIds: [301] }), signal: controller.signal },
    )).rejects.toBe(reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function request(command: { groupIds: number[] }) {
  return {
    command,
    deadlineAt: new Date("2026-08-24T09:30:15.000Z"),
    execution: {
      nodeId: "audience-filter",
      revision: 1,
      runId: "run-1",
      sequence: 1,
      workflowId: "workflow-1",
    },
    identities: { externalUserId: 101 },
    signal: new AbortController().signal,
    subjectId: "contact-1",
    subjectType: "chatai_contact" as const,
    uid: 9,
  };
}

function javaResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
