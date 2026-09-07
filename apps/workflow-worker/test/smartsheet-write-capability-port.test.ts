import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_SMARTSHEET_WRITE_CAPABILITY_BINDING } from "@chatai/workflow-runtime";
import { HttpWorkflowSmartsheetWriteCapabilityPort, SMARTSHEET_IMAGE_MAX_BYTES } from "../src/smartsheet-write-capability-port.js";
import { isSmartsheetPublicAddress, requestSmartsheetBytes, type SmartsheetHttpRequest } from "../src/smartsheet-http.js";

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const definition = WORKFLOW_SMARTSHEET_WRITE_CAPABILITY_BINDING.definition;
function request() {
  return {
    command: { webhookUrl: "https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook?key=test", fields: [
      { fieldId: "n", fieldType: "number" as const, value: 0 },
      { fieldId: "b", fieldType: "checkbox" as const, value: false },
      { fieldId: "s", fieldType: "single_select" as const, value: "known" },
      { fieldId: "i", fieldType: "image" as const, value: "https://example.com/image.png" },
      { fieldId: "i2", fieldType: "image" as const, value: "https://example.com/image.png" },
    ] },
    deadlineAt: new Date(Date.now() + 60_000), execution: { nodeId: "sheet", revision: 1, runId: "1", sequence: 2, workflowId: "1" },
    identities: {}, idempotencyKey: "9:1:sheet:2", signal: new AbortController().signal,
    subjectId: "1", subjectType: "wecom_contact" as const, uid: 9,
  };
}

describe("WeCom smartsheet adapter", () => {
  it("downloads unique images once and posts one typed record with Base64 images", async () => {
    const http = vi.fn(async (input: SmartsheetHttpRequest) => input.method === "GET" ? png : Buffer.from('{"errcode":0,"add_records":[]}'));
    await expect(new HttpWorkflowSmartsheetWriteCapabilityPort(http).execute(definition, request())).resolves.toEqual({ success: true });
    expect(http).toHaveBeenCalledTimes(2);
    expect(http.mock.calls[0]![0]).toMatchObject({ method: "GET", maxBytes: SMARTSHEET_IMAGE_MAX_BYTES });
    expect(JSON.parse(http.mock.calls[1]![0].body!)).toEqual({ add_records: [{ values: {
      n: 0, b: false, s: [{ text: "known" }],
      i: [{ title: "image.png", image_base64: png.toString("base64") }],
      i2: [{ title: "image.png", image_base64: png.toString("base64") }],
    } }] });
  });

  it("retries a failed download once but never retries an unknown POST outcome", async () => {
    let downloads = 0;
    const http = vi.fn(async (input: SmartsheetHttpRequest) => {
      if (input.method === "POST") throw new Error("connection reset after write");
      if (downloads++ === 0) throw new Error("temporary download error");
      return png;
    });
    await expect(new HttpWorkflowSmartsheetWriteCapabilityPort(http).execute(definition, request())).resolves.toEqual({ success: false });
    expect(http.mock.calls.map(([input]) => input.method)).toEqual(["GET", "GET", "POST"]);
  });

  it("does not post when image download fails, content is not an image, or request is cancelled", async () => {
    for (const content of [null, Buffer.from("<html>not an image</html>")]) {
      const http = vi.fn(async () => { if (content === null) throw new Error("unavailable"); return content; });
      await expect(new HttpWorkflowSmartsheetWriteCapabilityPort(http).execute(definition, request())).resolves.toEqual({ success: false });
      expect(http).toHaveBeenCalledTimes(content === null ? 2 : 1);
    }
    const http = vi.fn();
    await expect(new HttpWorkflowSmartsheetWriteCapabilityPort(http).execute(definition, { ...request(), signal: AbortSignal.abort() })).resolves.toEqual({ success: false });
    expect(http).not.toHaveBeenCalled();
  });

  it("treats rejected and malformed responses as failures without retry", async () => {
    for (const body of ['{"errcode":40001}', '{"errcode":"0"}', '{}', 'not json']) {
      const http = vi.fn(async (input: SmartsheetHttpRequest) => input.method === "GET" ? png : Buffer.from(body));
      await expect(new HttpWorkflowSmartsheetWriteCapabilityPort(http).execute(definition, request())).resolves.toEqual({ success: false });
      expect(http.mock.calls.filter(([input]) => input.method === "POST")).toHaveLength(1);
    }
  });

  it("rejects private, mapped, metadata, multicast and reserved addresses", async () => {
    for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.0.1", "169.254.169.254", "100.100.100.200", "0.0.0.0", "224.0.0.1", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "2002:7f00:1::", "2001:db8::1"]) {
      expect(isSmartsheetPublicAddress(ip), ip).toBe(false);
    }
    expect(isSmartsheetPublicAddress("8.8.8.8")).toBe(true);
    expect(isSmartsheetPublicAddress("2606:4700:4700::1111")).toBe(true);
    for (const url of ["http://127.1/a", "http://[::ffff:127.0.0.1]/", "file:///etc/passwd", "https://user:pass@example.com/", "https://example.com:8443/"]) {
      await expect(requestSmartsheetBytes({ url, method: "GET", maxBytes: 100, signal: new AbortController().signal })).rejects.toThrow();
    }
  });
});
