import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_SMARTSHEET_WRITE_CAPABILITY_BINDING } from "@chatai/workflow-runtime";
import { HttpWorkflowSmartsheetWriteCapabilityPort } from "../src/smartsheet-write-capability-port.js";

const definition = WORKFLOW_SMARTSHEET_WRITE_CAPABILITY_BINDING.definition;
const webhookUrl = "https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook?key=test";
const urlValue = "https://example.com/orders/123";

function request() {
  return {
    command: { webhookUrl, fields: [
      { fieldId: "n", fieldType: "number" as const, value: 0 },
      { fieldId: "currency", fieldType: "currency" as const, value: 199.99 },
      { fieldId: "b", fieldType: "checkbox" as const, value: false },
      { fieldId: "s", fieldType: "single_select" as const, value: "known" },
      { fieldId: "i", fieldType: "url" as const, value: urlValue },
      { fieldId: "i2", fieldType: "url" as const, value: urlValue },
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
      n: 0, currency: 199.99, b: false, s: [{ text: "known" }],
      i: [{ link: urlValue, text: urlValue }],
      i2: [{ link: urlValue, text: urlValue }],
    } }] });
  });

  it("trims URL values before writing them", async () => {
    const http = fetchMock(async (_url, init) => new Response('{"errcode":0}', { status: 200 }));
    const result = await new HttpWorkflowSmartsheetWriteCapabilityPort(http).execute(definition, {
      ...request(),
      command: {
        ...request().command,
        fields: request().command.fields.map(field =>
          field.fieldType === "url" ? { ...field, value: `  ${field.value}  ` } : field),
      },
    });
    expect(result).toEqual({ success: true });
    expect(JSON.parse(String(http.mock.calls[0]![1]?.body)).add_records[0].values.i)
      .toEqual([{ link: urlValue, text: urlValue }]);
  });

  it("never downloads URL values and never retries an unknown POST outcome", async () => {
    const http = fetchMock(async (_url, init) => {
      throw new Error("connection reset after write");
    });
    await expect(new HttpWorkflowSmartsheetWriteCapabilityPort(http).execute(definition, request()))
      .resolves.toEqual({ success: false, errorCode: "WEBHOOK_REQUEST_FAILED" });
    expect(http.mock.calls.map(([, init]) => init?.method ?? "GET")).toEqual(["POST"]);
  });

  it("does not post invalid URL values or cancelled requests", async () => {
    const cancelledHttp = fetchMock(async () => new Response());
    await expect(new HttpWorkflowSmartsheetWriteCapabilityPort(cancelledHttp).execute(definition, {
      ...request(), command: { ...request().command, fields: request().command.fields.map(field =>
        field.fieldType === "url" ? { ...field, value: "not a url" } : field) },
    })).resolves.toMatchObject({ success: false, errorCode: "INVALID_URL_VALUE" });
    expect(cancelledHttp).not.toHaveBeenCalled();
    const http = fetchMock(async () => new Response());
    await expect(new HttpWorkflowSmartsheetWriteCapabilityPort(http).execute(definition, {
      ...request(),
      signal: AbortSignal.abort(),
    })).resolves.toEqual({ success: false, errorCode: "WEBHOOK_ABORTED" });
    expect(http).not.toHaveBeenCalled();
  });

  it("treats rejected and malformed responses as failures without retry", async () => {
    for (const body of ['{"errcode":40001}', '{"errcode":"0"}', '{}', 'not json']) {
      const http = fetchMock(async (_url, init) => {
        if ((init?.method ?? "GET") === "POST") return new Response(body, { status: 200 });
        return new Response();
      });
      await expect(new HttpWorkflowSmartsheetWriteCapabilityPort(http).execute(definition, request()))
        .resolves.toEqual({
          success: false,
          errorCode: body === '{"errcode":40001}'
            ? "WECOM_ERR_40001"
            : body === '{"errcode":"0"}'
              ? "WECOM_ERR_0"
              : "INVALID_WEBHOOK_RESPONSE",
        });
      expect(http.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    }
  });

  it("rejects webhook URLs that are not the WeCom smartsheet host", async () => {
    const http = fetchMock(async () => new Response());
    await expect(new HttpWorkflowSmartsheetWriteCapabilityPort(http).execute(definition, {
      ...request(),
      command: {
        ...request().command,
        webhookUrl: "https://example.com/cgi-bin/wedoc/smartsheet/webhook?key=test",
      },
    })).resolves.toEqual({ success: false, errorCode: "INVALID_REQUEST" });
    expect(http).not.toHaveBeenCalled();
  });

  it("returns WEBHOOK_TIMEOUT when the deadline aborts the request", async () => {
    vi.useFakeTimers();
    try {
      const http = fetchMock(async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }));
      const resultPromise = new HttpWorkflowSmartsheetWriteCapabilityPort(http).execute(definition, {
        ...request(),
        deadlineAt: new Date(Date.now() + 100),
      });
      await vi.advanceTimersByTimeAsync(100);
      await expect(resultPromise).resolves.toEqual({ success: false, errorCode: "WEBHOOK_TIMEOUT" });
      expect(http).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
