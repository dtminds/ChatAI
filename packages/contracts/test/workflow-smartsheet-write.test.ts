import { describe, expect, it } from "vitest";
import {
  isWorkflowNodeDraftConfig,
  isValidSmartsheetWebhookUrl,
  parseSmartsheetSchema,
  parseSmartsheetSchemaFields,
  WORKFLOW_SMARTSHEET_WRITE_SCHEMA_MAX_LENGTH,
} from "../src/index.js";

describe("Smartsheet Write draft metadata and schema", () => {
  it("only accepts the HTTPS WeCom webhook endpoint with one nonempty key", () => {
    const base = "https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook";
    expect(isValidSmartsheetWebhookUrl(`${base}?key=test`)).toBe(true);
    for (const url of [base, `${base}?key=`, `${base}?key=%20`, `${base}?key=a&key=b`, `${base}?key=a#fragment`,
      `${base.replace("https:", "http:")}?key=a`, `${base.replace(".com", ".com:8443")}?key=a`,
      `${base.replace("https://", "https://user:pass@")}?key=a`, `${base.replace("qyapi.weixin.qq.com", "example.com")}?key=a`]) {
      expect(isValidSmartsheetWebhookUrl(url), url).toBe(false);
    }
  });
  it("allows an omitted, empty or populated table address without requiring field values", () => {
    const draft = { webhookUrl: "", schema: "", fieldMappings: [] };
    for (const metadata of [{}, { tableUrl: "" }, { tableUrl: "https://doc.weixin.qq.com/sheet/example" }]) {
      expect(isWorkflowNodeDraftConfig("smartsheet-write", { ...draft, ...metadata })).toBe(true);
    }
    expect(isWorkflowNodeDraftConfig("smartsheet-write", { ...draft, tableUrl: "x".repeat(2049) })).toBe(false);
  });

  it("retains unsupported fields for selection display without treating them as writable", () => {
    const schema = JSON.stringify({ schema: {
      f1: { title: "姓名", type: "text" },
      fCurrency: { title: "回款金额", type: "currency" },
      f2: { title: "附件", type: "attachment" },
    }, add_records: [] });
    expect(parseSmartsheetSchemaFields(schema)).toEqual({
      f1: { title: "姓名", type: "text" },
      fCurrency: { title: "回款金额", type: "currency" },
      f2: { title: "附件", type: "attachment" },
    });
    expect(parseSmartsheetSchema(schema)).toEqual({
      f1: { title: "姓名", type: "text" },
      fCurrency: { title: "回款金额", type: "currency" },
    });
    expect(parseSmartsheetSchemaFields('{"f2":{"title":"附件","type":"attachment"}}')).not.toBeNull();
  });

  it("rejects malformed and oversized schemas rather than creating partial mappings", () => {
    for (const schema of ["{", "[]", "{}", '{"f1":{"type":"text"}}', JSON.stringify({ ["x".repeat(129)]: { title: "姓名", type: "text" } }), " ".repeat(WORKFLOW_SMARTSHEET_WRITE_SCHEMA_MAX_LENGTH + 1)]) {
      expect(parseSmartsheetSchemaFields(schema)).toBeNull();
    }
  });
});
