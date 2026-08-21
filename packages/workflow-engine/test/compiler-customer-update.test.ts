import {
  isWorkflowNodeExecutionConfig,
  type WorkflowDraft,
} from "@chatai/contracts";
import { describe, expect, it } from "vitest";

import { compileWorkflowDraft } from "../src/compiler.js";
import { WorkflowCompilationError } from "../src/errors.js";
import { projectWorkflowNodeExecutionConfig } from "../src/node-contract-registry.js";

describe("Customer Update compiler validation", () => {
  it("projects field snapshots into one typed execution config", () => {
    const compiled = compileWorkflowDraft({
      draft: createDraft([
        {
          field: { id: 101, key: "remark", title: "客户备注", type: 1 },
          id: "field-1",
          value: { kind: "literal", value: "重点客户" },
        },
        {
          field: { id: 102, key: "birthday", title: "生日", type: 12 },
          id: "field-2",
          value: {
            kind: "variable",
            selector: ["current-node-lifecycle", "enteredAt"],
            valueType: { kind: "datetime" },
          },
        },
      ]),
      revision: 1,
      workflowId: "42",
      workflowType: "chatai_sop",
    });

    expect(compiled.nodes.find(node => node.id === "customer-update")?.config).toEqual({
      fields: [
        { fieldId: 101, fieldType: 1, value: { kind: "literal", value: "重点客户" } },
        {
          fieldId: 102,
          fieldType: 12,
          value: {
            kind: "variable",
            selector: ["current-node-lifecycle", "enteredAt"],
            valueType: { kind: "datetime" },
          },
        },
      ],
    });
  });

  it("rejects incomplete fields and unavailable variable references", () => {
    expectCompilationIssue([{
      id: "field-1",
      value: { kind: "literal", value: "" },
    }], "Customer Update node requires complete unique fields and values");

    const unavailableField = {
      field: { id: 101, key: "remark", title: "客户备注", type: 1 },
      id: "field-1",
      value: {
        kind: "variable",
        selector: ["trigger", "occurredAt"],
        valueType: { kind: "string" },
      },
    };
    const projected = projectWorkflowNodeExecutionConfig({
      data: { fields: [unavailableField] },
      kind: "customer-update",
      workflowType: "chatai_sop",
    });
    expect(isWorkflowNodeExecutionConfig("customer-update", projected)).toBe(true);
    expectCompilationIssue(
      [unavailableField],
      "Customer Update node references unavailable or changed field data",
    );
  });
});

function expectCompilationIssue(fields: Record<string, unknown>[], message: string) {
  let error: unknown;
  try {
    compileWorkflowDraft({
      draft: createDraft(fields),
      revision: 1,
      workflowId: "42",
      workflowType: "chatai_sop",
    });
  } catch (caught) {
    error = caught;
  }

  expect(error).toBeInstanceOf(WorkflowCompilationError);
  expect((error as WorkflowCompilationError).issues).toContainEqual({
    code: "invalid-node-config",
    message,
    nodeId: "customer-update",
  });
}

function createDraft(fields: Record<string, unknown>[]): WorkflowDraft {
  return {
    edges: [
      { id: "start-update", source: "start", target: "customer-update" },
      { id: "update-end", source: "customer-update", target: "end" },
    ],
    nodes: [
      node("start", "start", {
        entryPolicy: { mode: "never" },
        seatIds: [101],
        triggers: [{ sourceIds: [], type: "contact.friend_added" }],
      }),
      node("customer-update", "customer-update", { fields }),
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
    type: "workflowNode",
  };
}
