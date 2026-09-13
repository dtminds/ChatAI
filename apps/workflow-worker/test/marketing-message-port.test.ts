import { describe, expect, it, vi } from "vitest";
import {
  HttpWorkflowMarketingMessagePort,
  JAVA_MARKETING_MESSAGE_PUSH_PATH,
  JAVA_MARKETING_MESSAGE_QUERY_PATH,
} from "../src/marketing-message-port.js";

describe("Workflow Marketing Message Java port", () => {
  it("pushes a user with bizId and internal authorization", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => javaResponse({
      error: 0,
      errorMsg: "",
      success: true,
    }));
    const port = createPort(fetchMock);

    await expect(port.pushUser({
      bizId: 123,
      externalUserId: 3166,
      planId: 701,
      signal: new AbortController().signal,
      uid: 272,
    })).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`https://java.example.com${JAVA_MARKETING_MESSAGE_PUSH_PATH}`);
    expect(init).toMatchObject({
      headers: {
        authorization: "Bearer internal-token",
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      bizId: 123,
      externalUserId: 3166,
      planId: 701,
      uid: 272,
    });
  });

  it.each([true, false])("queries the Java aggregate pushSuccess=%s", async (pushSuccess) => {
    const fetchMock = vi.fn<typeof fetch>(async () => javaResponse({
      data: { pushSuccess },
      error: 0,
      errorMsg: "",
      success: true,
    }));
    const port = createPort(fetchMock);

    await expect(port.queryPushResult({
      bizId: 123,
      signal: new AbortController().signal,
      uid: 272,
    })).resolves.toEqual({ pushSuccess });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`https://java.example.com${JAVA_MARKETING_MESSAGE_QUERY_PATH}`);
    expect(JSON.parse(String(init?.body))).toEqual({ bizId: 123, uid: 272 });
  });

  it.each([
    { body: { error: 40001, errorMsg: "任务不存在", success: false }, code: "WORKFLOW_MARKETING_MESSAGE_REJECTED" },
    { body: { data: {}, success: true }, code: "WORKFLOW_MARKETING_MESSAGE_RESPONSE_INVALID" },
  ])("terminates on invalid Java result: $code", async ({ body, code }) => {
    const port = createPort(vi.fn<typeof fetch>(async () => javaResponse(body)));

    await expect(port.queryPushResult({
      bizId: 123,
      signal: new AbortController().signal,
      uid: 272,
    })).rejects.toMatchObject({ code, failureKind: "terminal" });
  });

  it.each([
    vi.fn<typeof fetch>(async () => { throw new Error("network"); }),
    vi.fn<typeof fetch>(async () => new Response(null, { status: 503 })),
  ])("terminates on transport failure without asking Runtime to retry", async (fetchMock) => {
    const port = createPort(fetchMock);

    await expect(port.pushUser({
      bizId: 123,
      externalUserId: 3166,
      planId: 701,
      signal: new AbortController().signal,
      uid: 272,
    })).rejects.toMatchObject({ failureKind: "terminal" });
  });

  it("rejects invalid numeric IDs before issuing a request", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const port = createPort(fetchMock);

    await expect(port.pushUser({
      bizId: 0,
      externalUserId: 3166,
      planId: 701,
      signal: new AbortController().signal,
      uid: 272,
    })).rejects.toMatchObject({
      code: "WORKFLOW_MARKETING_MESSAGE_REQUEST_INVALID",
      failureKind: "terminal",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function createPort(fetch: typeof globalThis.fetch) {
  return new HttpWorkflowMarketingMessagePort({
    baseUrl: "https://java.example.com/internal",
    fetch,
    token: "internal-token",
  });
}

function javaResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
