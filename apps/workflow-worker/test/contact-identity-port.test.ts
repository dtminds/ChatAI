import { describe, expect, it, vi } from "vitest";
import {
  HttpWorkflowContactIdentityPort,
  createJavaContactIdentityRequest,
  decodeJavaContactIdentityResponse,
} from "../src/contact-identity-port.js";

describe("Workflow contact identity Java port", () => {
  it.each([
    [
      { thirdExternalUserId: "chatai-1", type: "thirdExternalUserId" } as const,
      { thirdExternalUserId: "chatai-1", type: 1, uid: 9 },
    ],
    [
      { externalUserId: 101, type: "externalUserId" } as const,
      { externalUserId: 101, type: 2, uid: 9 },
    ],
    [
      { mallUserId: 202, type: "mallUserId" } as const,
      { mallUserId: 202, type: 3, uid: 9 },
    ],
  ])("maps a concrete identity key to the Java DTO", (key, expected) => {
    expect(createJavaContactIdentityRequest(9, key)).toEqual(expected);
  });

  it("posts the concrete identity with internal authorization and returns all IDs", async () => {
    const fetchMock = vi.fn(async () => response({
      data: {
        externalUserId: 101,
        mallUserId: 202,
        thirdExternalUserId: "chatai-1",
        xyId: 303,
      },
      success: true,
    }));
    const port = new HttpWorkflowContactIdentityPort({
      baseUrl: "https://java.example.com/internal",
      fetch: fetchMock as typeof fetch,
      token: "internal-token",
    });

    await expect(port.getContactIdentity({
      key: { thirdExternalUserId: "chatai-1", type: "thirdExternalUserId" },
      uid: 9,
    })).resolves.toEqual({
      externalUserId: 101,
      mallUserId: 202,
      thirdExternalUserId: "chatai-1",
      xyId: 303,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://java.example.com/third-internal/wap-embed-contact/get-contact-identity",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ thirdExternalUserId: "chatai-1", type: 1, uid: 9 }),
      headers: {
        authorization: "Bearer internal-token",
        "content-type": "application/json",
      },
      method: "POST",
    });
  });

  it.each([
    { data: {}, success: false },
    { data: {}, error: 0 },
    { data: {}, success: 1 },
  ])("treats every success !== true envelope as failure", async (body) => {
    const port = new HttpWorkflowContactIdentityPort({
      baseUrl: "https://java.example.com",
      fetch: vi.fn(async () => response(body)) as typeof fetch,
    });
    await expect(port.getContactIdentity({
      key: { externalUserId: 101, type: "externalUserId" },
      uid: 9,
    })).rejects.toMatchObject({ name: "WorkflowContactIdentityLookupError" });
  });

  it("accepts success with no generated IDs and preserves zero or empty values as missing", () => {
    expect(decodeJavaContactIdentityResponse({
      data: {
        externalUserId: 0,
        mallUserId: 0,
        thirdExternalUserId: "",
        xyId: 0,
      },
      success: true,
    })).toEqual({
      externalUserId: 0,
      mallUserId: 0,
      thirdExternalUserId: "",
      xyId: 0,
    });
    expect(decodeJavaContactIdentityResponse({ data: null, success: true })).toEqual({});
  });

  it("rejects HTTP, network, invalid JSON, and invalid field types", async () => {
    const inputs: Array<typeof fetch> = [
      vi.fn(async () => new Response(null, { status: 503 })) as typeof fetch,
      vi.fn(async () => { throw new Error("network"); }) as typeof fetch,
      vi.fn(async () => new Response("not-json", {
        headers: { "content-type": "application/json" },
        status: 200,
      })) as typeof fetch,
      vi.fn(async () => response({
        data: { externalUserId: "101" },
        success: true,
      })) as typeof fetch,
    ];
    for (const fetchImplementation of inputs) {
      const port = new HttpWorkflowContactIdentityPort({
        baseUrl: "https://java.example.com",
        fetch: fetchImplementation,
      });
      await expect(port.getContactIdentity({
        key: { externalUserId: 101, type: "externalUserId" },
        uid: 9,
      })).rejects.toMatchObject({ name: "WorkflowContactIdentityLookupError" });
    }
  });

  it("bounds a hanging Java request with the port timeout", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn((_url: URL | RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        })) as typeof fetch;
      const port = new HttpWorkflowContactIdentityPort({
        baseUrl: "https://java.example.com",
        fetch: fetchMock,
        timeoutMs: 50,
      });
      const pending = port.getContactIdentity({
        key: { externalUserId: 101, type: "externalUserId" },
        uid: 9,
      });
      const rejection = expect(pending).rejects.toMatchObject({
        name: "WorkflowContactIdentityLookupError",
      });

      await vi.advanceTimersByTimeAsync(50);
      await rejection;
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
