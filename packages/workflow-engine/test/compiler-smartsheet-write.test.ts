import {
  isWorkflowNodeExecutionConfig,
  type WorkflowDraft,
  type WorkflowNodeKind,
} from "@chatai/contracts";
import { describe, expect, it } from "vitest";

import { compileWorkflowDraft } from "../src/compiler.js";
import { WorkflowCompilationError } from "../src/errors.js";
import {
  getWorkflowNodeExecutionConfigError,
  projectWorkflowNodeExecutionConfig,
} from "../src/node-contract-registry.js";

const COMPLETE_WEBHOOK_URL = "https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook?key=test";
const COMPLETE_SCHEMA = '{"f1":{"title":"姓名","type":"text"}}';
const COMPLETE_FIELD = {
  fieldId: "f1",
  fieldTitle: "姓名",
  fieldType: "text",
  value: { kind: "literal", value: "张三" },
};

describe("Smartsheet Write compiler validation", () => {
  it("projects draft snapshots into execution config without display fields", () => {
    expect(projectWorkflowNodeExecutionConfig({
      data: {
        fieldMappings: [COMPLETE_FIELD],
        schema: COMPLETE_SCHEMA,
        webhookUrl: COMPLETE_WEBHOOK_URL,
        tableUrl: "https://doc.weixin.qq.com/sheet/example",
      },
      kind: "smartsheet-write",
    })).toEqual({
      fieldMappings: [{
        fieldId: "f1",
        fieldType: "text",
        value: { kind: "literal", value: "张三" },
      }],
      webhookUrl: COMPLETE_WEBHOOK_URL,
    });
    expect(getWorkflowNodeExecutionConfigError("smartsheet-write", {
      webhookUrl: "",
      fieldMappings: [],
    })).toBe("Smartsheet Write node requires a valid webhook URL and complete field mappings");
  });

  it("compiles a complete smart sheet node for publication", () => {
    const projected = projectWorkflowNodeExecutionConfig({
      data: {
        fieldMappings: [COMPLETE_FIELD],
        schema: COMPLETE_SCHEMA,
        webhookUrl: COMPLETE_WEBHOOK_URL,
      },
      kind: "smartsheet-write",
    });
    expect(isWorkflowNodeExecutionConfig("smartsheet-write", projected)).toBe(true);

    expect(() => {
      compileWorkflowDraft({
        draft: createDraft({
          fieldMappings: [COMPLETE_FIELD],
          schema: COMPLETE_SCHEMA,
          webhookUrl: COMPLETE_WEBHOOK_URL,
        }),
        revision: 1,
        workflowId: "42",
        workflowType: "chatai_sop",
      });
    }).not.toThrow();
  });

  it("preserves the execution config error for incomplete webhook and mappings", () => {
    for (const config of [
      { fieldMappings: [COMPLETE_FIELD], schema: COMPLETE_SCHEMA, webhookUrl: "" },
      { fieldMappings: [], schema: COMPLETE_SCHEMA, webhookUrl: COMPLETE_WEBHOOK_URL },
    ]) {
      try {
        compileWorkflowDraft({
          draft: createDraft(config),
          revision: 1,
          workflowId: "42",
          workflowType: "chatai_sop",
        });
        expect.fail("Expected Smartsheet Write compilation to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowCompilationError);
        expect((error as WorkflowCompilationError).issues).toContainEqual({
          code: "invalid-node-config",
          message: "Smartsheet Write node requires a valid webhook URL and complete field mappings",
          nodeId: "smartsheet-write",
        });
      }
    }
  });

  it("rejects unavailable and mismatched variable selectors before publication", () => {
    for (const value of [
      { kind: "variable", selector: ["node", "missing", "value"], valueType: { kind: "string" } },
      { kind: "variable", selector: ["subject", "id"], valueType: { kind: "number" } },
    ]) {
      expect(() => compileWorkflowDraft({
        draft: createDraft({ fieldMappings: [{ ...COMPLETE_FIELD, value }], schema: COMPLETE_SCHEMA, webhookUrl: COMPLETE_WEBHOOK_URL }),
        revision: 1, workflowId: "42", workflowType: "chatai_sop",
      })).toThrow(WorkflowCompilationError);
    }
  });

  it("rejects field mappings that no longer match the saved schema", () => {
    for (const fieldMappings of [
      [{ ...COMPLETE_FIELD, fieldId: "missing" }],
      [{ ...COMPLETE_FIELD, fieldType: "number", value: { kind: "literal", value: "1" } }],
    ]) {
      expect(() => compileWorkflowDraft({
        draft: createDraft({ fieldMappings, schema: COMPLETE_SCHEMA, webhookUrl: COMPLETE_WEBHOOK_URL }),
        revision: 1,
        workflowId: "42",
        workflowType: "chatai_sop",
      })).toThrow(WorkflowCompilationError);
    }
  });
});

function createDraft(config: Record<string, unknown>): WorkflowDraft {
  return {
    edges: [
      { id: "start-write", source: "start", target: "smartsheet-write" },
      { id: "write-end", source: "smartsheet-write", target: "end" },
    ],
    nodes: [
      node("start", "start", {
        entryPolicy: { mode: "never" },
        seatIds: [101],
        triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
      }),
      node("smartsheet-write", "smartsheet-write", config),
      node("end", "end"),
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function node(id: string, kind: WorkflowNodeKind, config: Record<string, unknown> = {}) {
  return {
    data: {
      ...config,
      kind,
      label: kind,
      metric: "",
      schemaVersion: 1,
      status: "ready" as const,
      title: kind,
    },
    id,
    position: { x: 0, y: 0 },
  };
}
