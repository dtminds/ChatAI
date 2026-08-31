import { describe, expect, it, vi } from "vitest";
import {
  decodeJavaContactCustomFieldResponse,
  HttpWorkflowContactCustomFieldPort,
} from "../src/contact-custom-field-port.js";

describe("Workflow contact custom field Java port", () => {
  it("posts the exact contact lookup DTO and maps value behind the adapter boundary", async () => {
    const fetchMock = vi.fn(async () => response({
      data: [{
        fieldid: 42,
        key: "level",
        limit: 0,
        optionVal: "普通,VIP",
        sort: 1,
        title: "客户等级",
        type: 1,
        value: "VIP",
      }],
      error: 0,
      errorMsg: "",
      success: true,
    }));
    const port = new HttpWorkflowContactCustomFieldPort({
      baseUrl: "https://java.example.com/internal",
      fetch: fetchMock as typeof fetch,
      token: "internal-token",
    });

    await expect(port.getContactCustomFields({
      externalUserId: 101,
      fieldIds: [42],
      uid: 9,
    }))
      .resolves.toEqual([{ fieldId: 42, fieldType: 1, rawValue: "VIP" }]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://java.example.com/third-internal/custom-field/get-contact-custom-field",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ externalUserId: 101, uid: 9 }),
      headers: {
        authorization: "Bearer internal-token",
        "content-type": "application/json",
      },
      method: "POST",
    });
  });

  it.each([
    { data: null, error: 0, errorMsg: "", success: true },
    { data: [{ fieldid: 1, type: 1 }], error: 0, errorMsg: "", success: true },
    {
      data: [
        { fieldid: 1, type: 1, value: "a" },
        { fieldid: 1, type: 1, value: "b" },
      ],
      error: 0,
      errorMsg: "",
      success: true,
    },
    { data: [], error: 40001, errorMsg: "参数无效", success: false },
  ])("rejects invalid successful data and Java business failures", (body) => {
    expect(() => decodeJavaContactCustomFieldResponse(body, [1])).toThrow(expect.objectContaining({
      failureKind: "terminal",
      name: "WorkflowContactCustomFieldLookupError",
    }));
  });

  it("validates only fields referenced by the current node", () => {
    expect(decodeJavaContactCustomFieldResponse({
      data: [
        null,
        { fieldid: 7, optionVal: "unused", type: null, value: null },
        {
          fieldid: 24,
          key: "income",
          optionVal: "5万以下,5万-15万,15万-30万",
          type: 2,
          value: "5万以下",
        },
      ],
      error: 0,
      errorMsg: "",
      success: true,
    }, [24])).toEqual([{ fieldId: 24, fieldType: 2, rawValue: "5万以下" }]);
  });

  it("classifies HTTP and network failures as retryable and invalid JSON as terminal", async () => {
    const cases: Array<{ expected: "retryable" | "terminal"; fetch: typeof fetch }> = [
      {
        expected: "retryable",
        fetch: vi.fn(async () => new Response(null, { status: 503 })) as typeof fetch,
      },
      {
        expected: "retryable",
        fetch: vi.fn(async () => { throw new Error("network"); }) as typeof fetch,
      },
      {
        expected: "terminal",
        fetch: vi.fn(async () => new Response("not-json", { status: 200 })) as typeof fetch,
      },
    ];
    for (const testCase of cases) {
      const port = new HttpWorkflowContactCustomFieldPort({
        baseUrl: "https://java.example.com",
        fetch: testCase.fetch,
      });
      await expect(port.getContactCustomFields({
        externalUserId: 101,
        fieldIds: [42],
        uid: 9,
      }))
        .rejects.toMatchObject({
          failureKind: testCase.expected,
          name: "WorkflowContactCustomFieldLookupError",
        });
    }
  });

  it("bounds a hanging request with the port timeout", async () => {
    vi.useFakeTimers();
    try {
      const port = new HttpWorkflowContactCustomFieldPort({
        baseUrl: "https://java.example.com",
        fetch: vi.fn((_url: URL | RequestInfo, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
              once: true,
            });
          })) as typeof fetch,
        timeoutMs: 50,
      });
      const pending = expect(port.getContactCustomFields({
        externalUserId: 101,
        fieldIds: [42],
        uid: 9,
      }))
        .rejects.toMatchObject({ failureKind: "retryable" });
      await vi.advanceTimersByTimeAsync(50);
      await pending;
    } finally {
      vi.useRealTimers();
    }
  });
});

function response(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
