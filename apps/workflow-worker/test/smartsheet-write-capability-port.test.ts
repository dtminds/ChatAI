import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_SMARTSHEET_WRITE_CAPABILITY_BINDING } from "@chatai/workflow-runtime";
import { HttpWorkflowSmartsheetWriteCapabilityPort } from "../src/smartsheet-write-capability-port.js";

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const definition = WORKFLOW_SMARTSHEET_WRITE_CAPABILITY_BINDING.definition;
const webhookUrl = "https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook?key=test";
const imageUrl = "https://example.com/image.png";

function request() {
  return {
    command: { webhookUrl, fields: [
      { fieldId: "n", fieldType: "number" as const, value: 0 },
      { fieldId: "b", fieldType: "checkbox" as const, value: false },
      { fieldId: "s", fieldType: "single_select" as const, value: "known" },
      { fieldId: "i", fieldType: "image" as const, value: imageUrl },
      { fieldId: "i2", fieldType: "image" as const, value: imageUrl },
    ] },
    deadlineAt: new Date(Date.now() + 60_000), execution: { nodeId: "sheet", revision: 1, runId: "1", sequence: 2, workflowId: "1" },
    identities: {}, idempotencyKey: "9:1:sheet:2", signal: new AbortController().signal,
    subjectId: "1", subjectType: "wecom_contact" as const, uid: 9,
  };
}

function fetchMock(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init));
}

describe("WeCom smartsheet adapter", () => {
  it("downloads unique images once and posts one typed record with Base64 images", async () => {
    const http = fetchMock(async (url, init) => {
      if ((init?.method ?? "GET") === "POST") {
        expect(url).toBe(webhookUrl);
        return new Response('{"errcode":0,"add_records":[]}', { status: 200 });
      }
      expect(url).toBe(imageUrl);
      return new Response(png);
    });
    await expect(new HttpWorkflowSmartsheetWriteCapabilityPort(http).execute(definition, request()))
      .resolves.toEqual({ success: true });
    expect(http).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(http.mock.calls[1]![1]?.body))).toEqual({ add_records: [{ values: {
      n: 0, b: false, s: [{ text: "known" }],
      i: [{ title: "image.png", image_base64: png.toString("base64") }],
      i2: [{ title: "image.png", image_base64: png.toString("base64") }],
    } }] });
  });

  it("retries a failed download once but never retries an unknown POST outcome", async () => {
    let downloads = 0;
    const http = fetchMock(async (_url, init) => {
      if ((init?.method ?? "GET") === "POST") throw new Error("connection reset after write");
      if (downloads++ === 0) throw new Error("temporary download error");
      return new Response(png);
    });
    await expect(new HttpWorkflowSmartsheetWriteCapabilityPort(http).execute(definition, request()))
      .resolves.toMatchObject({ success: false, errorCode: expect.any(String) });
    expect(http.mock.calls.map(([, init]) => init?.method ?? "GET")).toEqual(["GET", "GET", "POST"]);
  });

  it("does not post when image download fails, content is not an image, or request is cancelled", async () => {
    for (const content of [null, Buffer.from("<html>not an image</html>")]) {
      const http = fetchMock(async () => {
        if (content === null) throw new Error("unavailable");
        return new Response(content);
      });
      await expect(new HttpWorkflowSmartsheetWriteCapabilityPort(http).execute(definition, request()))
        .resolves.toMatchObject({ success: false, errorCode: expect.any(String) });
      expect(http).toHaveBeenCalledTimes(content === null ? 2 : 1);
    }
    const http = fetchMock(async () => new Response(png));
    await expect(new HttpWorkflowSmartsheetWriteCapabilityPort(http).execute(definition, {
      ...request(),
      signal: AbortSignal.abort(),
    })).resolves.toMatchObject({ success: false, errorCode: expect.any(String) });
    expect(http).not.toHaveBeenCalled();
  });

  it("treats rejected and malformed responses as failures without retry", async () => {
    for (const body of ['{"errcode":40001}', '{"errcode":"0"}', '{}', 'not json']) {
      const http = fetchMock(async (_url, init) => {
        if ((init?.method ?? "GET") === "POST") return new Response(body, { status: 200 });
        return new Response(png);
      });
      await expect(new HttpWorkflowSmartsheetWriteCapabilityPort(http).execute(definition, request()))
        .resolves.toMatchObject({ success: false, errorCode: expect.any(String) });
      expect(http.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    }
  });

  it("rejects webhook URLs that are not the WeCom smartsheet host", async () => {
    const http = fetchMock(async () => new Response(png));
    await expect(new HttpWorkflowSmartsheetWriteCapabilityPort(http).execute(definition, {
      ...request(),
      command: {
        ...request().command,
        webhookUrl: "https://example.com/cgi-bin/wedoc/smartsheet/webhook?key=test",
      },
    })).resolves.toEqual({ success: false, errorCode: "INVALID_REQUEST" });
    expect(http).not.toHaveBeenCalled();
  });
});
