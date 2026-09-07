import { describe, expect, it } from "vitest";
import { extractWorkflowNodeDraftConfig, isWorkflowNodeDraftConfig } from "@chatai/contracts";
import { createDefaultNodeData } from "@/pages/chat/workflow/node-definitions";
import { hydrateWorkflowDraft, sanitizeDraft } from "@/pages/chat/workflow/workflow-draft-normalizer";
import {
  getSmartsheetFieldOptions,
  getSmartsheetWriteNodePatch,
  maskSmartsheetWebhookUrl,
} from "@/pages/chat/workflow/nodes/smartsheet-write/config";

const webhookUrl = "https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook?key=test";

describe("Smartsheet Write configuration", () => {
  it("preserves the optional table address and selected subset through draft serialization", () => {
    const schema = JSON.stringify({ f1: { title: "姓名", type: "text" }, f2: { title: "金额", type: "number" } });
    const fieldMappings = [getSmartsheetFieldOptions(schema)![1].mapping!];
    const data = { ...createDefaultNodeData("smartsheet-write"), ...getSmartsheetWriteNodePatch({
      webhookUrl, schema, fieldMappings, tableUrl: "https://doc.weixin.qq.com/sheet/example",
    }) };
    expect(isWorkflowNodeDraftConfig("smartsheet-write", extractWorkflowNodeDraftConfig("smartsheet-write", data))).toBe(true);
    const draft = hydrateWorkflowDraft({ nodes: [{ id: "write", position: { x: 0, y: 0 }, data }], edges: [] });
    const reloaded = hydrateWorkflowDraft(JSON.parse(JSON.stringify(sanitizeDraft(draft))));
    expect(reloaded.nodes[0].data).toMatchObject({ tableUrl: data.tableUrl, schema, fieldMappings });
    expect(getSmartsheetFieldOptions(schema)).toHaveLength(2);
  });

  it("masks the webhook key for settings display", () => {
    expect(maskSmartsheetWebhookUrl(
      "https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook?key=4pABCDEFGHdmr1",
    )).toBe("https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook?key=4p**dmr1");
    expect(maskSmartsheetWebhookUrl(webhookUrl)).toBe(
      "https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook?key=**",
    );
    expect(maskSmartsheetWebhookUrl("")).toBe("");
  });

  it("does not consider field mappings from another schema ready", () => {
    const patch = getSmartsheetWriteNodePatch({
      webhookUrl,
      schema: '{"f2":{"title":"金额","type":"number"}}',
      fieldMappings: [{ fieldId: "f1", fieldTitle: "姓名", fieldType: "text", value: { kind: "literal", value: "张三" } }],
    });
    expect(patch.status).toBe("warning");
  });
});
