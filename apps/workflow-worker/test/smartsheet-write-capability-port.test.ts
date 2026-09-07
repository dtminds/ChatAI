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
      { fieldId: "i", fieldType: "url" as const, value: imageUrl },
      { fieldId: "i2", fieldType: "url" as const, value: imageUrl },
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
  it("writes URL values without downloading them", async () => {
    const http = fetchMock(async (url, init) => {
      if ((init?.method ?? "GET") === "POST") {
        expect(url).toBe(webhookUrl);
        return new Response('{"errcode":0,"add_records":[]}', { status: 200 });
      }
      throw new Error(`unexpected GET ${url}`);
    });
    await expect(new HttpWorkflowSmartsheetWriteCapabilityPort(http).execute(definition, request()))
      .resolves.toEqual({ success: true });
    expect(http).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(http.mock.calls[0]![1]?.body))).toEqual({ add_records: [{ values: {
      n: 0, b: false, s: [{ text: "known" }],
      i: [{ link: imageUrl, text: imageUrl }],
      i2: [{ link: imageUrl, text: imageUrl }],
    } }] });
  });

  it("never downloads URL values and never retries an unknown POST outcome", async () => {
    const http = fetchMock(async (_url, init) => {
      throw new Error("connection reset after write");
    });
    await expect(new HttpWorkflowSmartsheetWriteCapabilityPort(http).execute(definition, request()))
      .resolves.toMatchObject({ success: false, errorCode: expect.any(String) });
    expect(http.mock.calls.map(([, init]) => init?.method ?? "GET")).toEqual(["POST"]);
  });

  it("does not post invalid URL values or cancelled requests", async () => {
    const cancelledHttp = fetchMock(async () => new Response(png));
    await expect(new HttpWorkflowSmartsheetWriteCapabilityPort(cancelledHttp).execute(definition, {
      ...request(), command: { ...request().command, fields: request().command.fields.map(field =>
        field.fieldType === "url" ? { ...field, value: "not a url" } : field) },
    })).resolves.toMatchObject({ success: false, errorCode: "INVALID_URL_VALUE" });
    expect(cancelledHttp).not.toHaveBeenCalled();
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
