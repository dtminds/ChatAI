import { describe, expect, it, vi } from "vitest";
import { createWorkflowSmartsheetWriteCommand, executeWorkflowCapability, resolveWorkflowForwardRoute, WORKFLOW_SMARTSHEET_WRITE_CAPABILITY_BINDING } from "../src/index.js";

const webhookUrl = "https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook?key=test";
const context = {
  customFields: {}, currentNodeLifecycle: {}, identities: {}, nodeLifecycle: {},
  outputs: { source: { zero: 0, unchecked: false, empty: "", blank: "   ", nil: null, choice: "unknown", badNumber: "42", date: "2026-09-07T00:00:00.000Z" } },
  subjectId: "1", trigger: {}, workflow: {},
};
function variable(fieldId: string, fieldType: string, key: string, kind: string) {
  return { fieldId, fieldType, value: { kind: "variable", selector: ["node", "source", key], valueType: { kind } } };
}

describe("smartsheet command projection", () => {
  it("rejects live-revision references absent from the old run context before scheduling the write", () => {
    const route = {
      currentNodeId: "start", currentNodeKind: "start" as const, sourceOutletId: "default",
      latestSpec: {
        workflowId: "1", revision: 2, schemaVersion: 3 as const, entryNodeId: "start", terminalNodeId: "end",
        edges: [{ id: "next", source: "start", sourceOutletId: "default", target: "sheet" }],
        nodes: [
          { id: "start", kind: "start" as const, nodeSchemaVersion: 1, config: {} },
          { id: "sheet", kind: "smartsheet-write" as const, nodeSchemaVersion: 1,
            config: { webhookUrl, fieldMappings: [variable("text", "text", "choice", "string")] } },
        ],
      },
    };
    expect(resolveWorkflowForwardRoute({ ...route, context: { outputs: {} } })).toEqual({ kind: "flow-changed", reason: "flow_changed_context_incompatible" });
    expect(resolveWorkflowForwardRoute({ ...route, context })).toMatchObject({ kind: "success", target: { id: "sheet" } });
  });
  it("preserves zero and false, skips empty and unknown options, and converts dates", () => {
    expect(createWorkflowSmartsheetWriteCommand({ context, config: { webhookUrl, fieldMappings: [
      variable("n", "number", "zero", "number"),
      variable("b", "checkbox", "unchecked", "boolean"),
      variable("e", "text", "empty", "string"),
      variable("nil", "text", "nil", "string"),
      { ...variable("s", "single_select", "choice", "string"), enumOptions: ["known"] },
      variable("d", "date_time", "date", "datetime"),
      { fieldId: "local", fieldType: "date_time", value: { kind: "literal", value: "2026-09-07T08:00" } },
      { fieldId: "url", fieldType: "url", value: { kind: "literal", value: "  https://example.com/orders/123  " } },
    ] } })).toEqual({ webhookUrl, fields: [
      { fieldId: "n", fieldType: "number", value: 0 },
      { fieldId: "b", fieldType: "checkbox", value: false },
      { fieldId: "d", fieldType: "date_time", value: "1788739200000" },
      { fieldId: "local", fieldType: "date_time", value: "2026-09-07 08:00:00" },
      { fieldId: "url", fieldType: "url", value: "https://example.com/orders/123" },
    ] });
  });

  it("fails locally for missing variables, type errors, and entirely empty rows", async () => {
    for (const fields of [
      [variable("x", "number", "badNumber", "number")],
      [variable("x", "text", "missing", "string")],
      [variable("x", "text", "empty", "string")],
      [variable("x", "url", "empty", "string")],
      [variable("x", "url", "blank", "string")],
      [{ fieldId: "x", fieldType: "url", value: { kind: "literal", value: "   " } }],
      [variable("x", "single_select", "choice", "string")],
      [{ fieldId: "text", fieldType: "text", value: { kind: "literal", value: "valid" } }, variable("x", "number", "badNumber", "number")],
    ]) {
      const execute = vi.fn();
      await expect(executeWorkflowCapability({
        binding: WORKFLOW_SMARTSHEET_WRITE_CAPABILITY_BINDING, commandContext: context,
        config: { webhookUrl, fieldMappings: fields }, deadlineAt: new Date(),
        execution: { nodeId: "sheet", revision: 1, runId: "1", sequence: 2, workflowId: "1" },
        executionKey: "9:1:sheet:2", port: { execute }, signal: new AbortController().signal,
        subjectId: "1", subjectType: "wecom_contact", uid: 9,
      })).resolves.toEqual({ success: false, errorCode: "INVALID_FIELD_VALUE" });
      expect(execute).not.toHaveBeenCalled();
    }
  });

  it("returns INVALID_URL_VALUE before execution for an invalid URL literal", async () => {
    const execute = vi.fn();
    await expect(executeWorkflowCapability({
      binding: WORKFLOW_SMARTSHEET_WRITE_CAPABILITY_BINDING, commandContext: context,
      config: { webhookUrl, fieldMappings: [
        { fieldId: "url", fieldType: "url", value: { kind: "literal", value: "not a url" } },
      ] }, deadlineAt: new Date(),
      execution: { nodeId: "sheet", revision: 1, runId: "1", sequence: 2, workflowId: "1" },
      executionKey: "9:1:sheet:2", port: { execute }, signal: new AbortController().signal,
      subjectId: "1", subjectType: "wecom_contact", uid: 9,
    })).resolves.toEqual({ success: false, errorCode: "INVALID_URL_VALUE" });
    expect(execute).not.toHaveBeenCalled();
  });
});
