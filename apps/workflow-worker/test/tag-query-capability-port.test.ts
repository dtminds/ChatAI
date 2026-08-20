import { describe, expect, it, vi } from "vitest";
import {
  WORKFLOW_TAG_QUERY_CAPABILITY_BINDING,
} from "@chatai/workflow-runtime";
import {
  HttpWorkflowTagQueryCapabilityPort,
  decodeWorkflowTagQueryJavaResponse,
} from "../src/tag-query-capability-port.js";

describe("Workflow Tag Query Java port", () => {
  it("queries once with the prepared externalUserId and returns the requested intersection", async () => {
    const fetchMock = vi.fn(async () => javaResponse({
      data: [
        {
          groupAttr: 1,
          groupId: 20,
          groupName: "客户阶段",
          groupSort: 10,
          id: 302,
          name: " 已成交 ",
          type: 0,
        },
        { id: 301, name: "重点客户" },
      ],
      success: true,
    }));
    const port = new HttpWorkflowTagQueryCapabilityPort({
      baseUrl: "https://java.example.com/internal",
      fetch: fetchMock as typeof fetch,
      token: "internal-token",
    });

    await expect(port.execute(
      WORKFLOW_TAG_QUERY_CAPABILITY_BINDING.definition,
      request({ tagIds: [301, 302] }),
    )).resolves.toEqual({
      matchedTags: [
        { id: 302, name: "已成交" },
        { id: 301, name: "重点客户" },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://java.example.com/third-internal/work-tag/get-wecom-contact-tags",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ externalUserId: 101, tagIds: [301, 302], uid: 9 }),
      headers: {
        authorization: "Bearer internal-token",
        "content-type": "application/json",
      },
      method: "POST",
    });
  });

  it("treats null or missing successful data as an empty intersection", () => {
    expect(decodeWorkflowTagQueryJavaResponse({ data: null, success: true }, [301]))
      .toEqual({ matchedTags: [] });
    expect(decodeWorkflowTagQueryJavaResponse({ success: true }, [301]))
      .toEqual({ matchedTags: [] });
  });

  it("treats an explicit Java business failure as terminal", () => {
    expect(() => decodeWorkflowTagQueryJavaResponse({
      data: [],
      error: 40001,
      success: false,
    }, [301])).toThrow(expect.objectContaining({
      code: "WORKFLOW_TAG_QUERY_REJECTED",
      failureKind: "terminal",
    }));
  });

  it.each([
    { data: [], error: 0 },
    { data: [], success: 1 },
  ])("treats an invalid success envelope as terminal", (body) => {
    expect(() => decodeWorkflowTagQueryJavaResponse(body, [301])).toThrow(
      expect.objectContaining({
        code: "WORKFLOW_TAG_QUERY_RESPONSE_INVALID",
        failureKind: "terminal",
      }),
    );
  });

  it.each([
    [[{ id: 999, name: "请求外标签" }], "outside the requested intersection"],
    [[{ id: 301, name: "重点客户" }, { id: 301, name: "重复" }], "duplicate tag"],
    [[{ id: 0, name: "无效" }], "invalid tag id"],
    [[{ id: 301, name: "" }], "invalid tag name"],
    [[null], "non-object tag"],
  ])("rejects an invalid successful intersection: %s", (data, diagnostic) => {
    expect(() => decodeWorkflowTagQueryJavaResponse({ data, success: true }, [301]))
      .toThrow(expect.objectContaining({
        code: "WORKFLOW_TAG_QUERY_OUTPUT_INVALID",
        diagnosticMessage: expect.stringContaining(diagnostic),
        failureKind: "terminal",
      }));
  });

  it("rejects a missing prepared externalUserId before calling Java", async () => {
    const fetchMock = vi.fn();
    const port = new HttpWorkflowTagQueryCapabilityPort({
      baseUrl: "https://java.example.com",
      fetch: fetchMock as typeof fetch,
    });

    await expect(port.execute(
      WORKFLOW_TAG_QUERY_CAPABILITY_BINDING.definition,
      { ...request({ tagIds: [301] }), identities: {} },
    )).rejects.toMatchObject({
      code: "WORKFLOW_TAG_QUERY_REQUEST_INVALID",
      failureKind: "terminal",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("classifies transport, HTTP, and envelope failures", async () => {
    const cases = [
      {
        expected: { code: "WORKFLOW_TAG_QUERY_FAILED", failureKind: "retryable" },
        fetch: vi.fn(async () => { throw new Error("network"); }),
      },
      {
        expected: { code: "WORKFLOW_TAG_QUERY_UNAVAILABLE", failureKind: "retryable" },
        fetch: vi.fn(async () => new Response(null, { status: 408 })),
      },
      {
        expected: { code: "WORKFLOW_TAG_QUERY_UNAVAILABLE", failureKind: "retryable" },
        fetch: vi.fn(async () => new Response(null, { status: 429 })),
      },
      {
        expected: { code: "WORKFLOW_TAG_QUERY_UNAVAILABLE", failureKind: "retryable" },
        fetch: vi.fn(async () => new Response(null, { status: 503 })),
      },
      {
        expected: { code: "WORKFLOW_TAG_QUERY_UNAVAILABLE", failureKind: "retryable" },
        fetch: vi.fn(async () => new Response(null, { status: 400 })),
      },
      {
        expected: { code: "WORKFLOW_TAG_QUERY_UNAVAILABLE", failureKind: "retryable" },
        fetch: vi.fn(async () => new Response(null, { status: 201 })),
      },
      {
        expected: { code: "WORKFLOW_TAG_QUERY_RESPONSE_INVALID", failureKind: "terminal" },
        fetch: vi.fn(async () => new Response("not-json", { status: 200 })),
      },
      {
        expected: { code: "WORKFLOW_TAG_QUERY_RESPONSE_INVALID", failureKind: "terminal" },
        fetch: vi.fn(async () => javaResponse({ data: {}, success: true })),
      },
      {
        expected: { code: "WORKFLOW_TAG_QUERY_REJECTED", failureKind: "terminal" },
        fetch: vi.fn(async () => javaResponse({ data: [], success: false })),
      },
    ];

    for (const item of cases) {
      const port = new HttpWorkflowTagQueryCapabilityPort({
        baseUrl: "https://java.example.com",
        fetch: item.fetch as typeof fetch,
      });
      await expect(port.execute(
        WORKFLOW_TAG_QUERY_CAPABILITY_BINDING.definition,
        request({ tagIds: [301] }),
      )).rejects.toMatchObject(item.expected);
    }
  });

  it("propagates cancellation before issuing the Java request", async () => {
    const fetchMock = vi.fn();
    const controller = new AbortController();
    const reason = new Error("cancelled");
    controller.abort(reason);
    const port = new HttpWorkflowTagQueryCapabilityPort({
      baseUrl: "https://java.example.com",
      fetch: fetchMock as typeof fetch,
    });

    await expect(port.execute(
      WORKFLOW_TAG_QUERY_CAPABILITY_BINDING.definition,
      { ...request({ tagIds: [301] }), signal: controller.signal },
    )).rejects.toBe(reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function request(command: { tagIds: number[] }) {
  return {
    command,
    deadlineAt: new Date("2026-08-20T10:00:15.000Z"),
    execution: {
      nodeId: "tag-query",
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
