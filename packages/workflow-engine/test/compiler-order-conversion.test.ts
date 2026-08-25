import type { WorkflowDraft, WorkflowNodeKind } from "@chatai/contracts";
import { describe, expect, it } from "vitest";

import { compileWorkflowDraft } from "../src/compiler.js";
import { WorkflowCompilationError } from "../src/errors.js";
import {
  getWorkflowNodeExecutionConfigError,
  projectWorkflowNodeExecutionConfig,
} from "../src/node-contract-registry.js";

describe("Order Conversion compiler validation", () => {
  it("projects the selected order number into execution config", () => {
    expect(projectWorkflowNodeExecutionConfig({
      data: {
        kind: "order-conversion",
        orderNumberSelector: ["node", "llm", "orderNo"],
      },
      kind: "order-conversion",
    })).toEqual({
      orderNumberSelector: ["node", "llm", "orderNo"],
    });
    expect(getWorkflowNodeExecutionConfigError("order-conversion", {})).toBe(
      "Order Conversion node requires an order number variable",
    );
  });

  it("rejects incomplete configuration and unreachable order numbers", () => {
    expectCompilationIssue(
      {},
      "Order Conversion node requires an order number variable",
    );
    expectCompilationIssue(
      { orderNumberSelector: ["node", "missing", "orderNo"] },
      "Order Conversion node references unavailable order number data",
    );
  });

  it("compiles when the selected order number is reachable", () => {
    const spec = compileWorkflowDraft({
      draft: createOrderConversionDraft({
        orderNumberSelector: ["node", "llm", "orderNo"],
      }),
      revision: 1,
      workflowId: "42",
      workflowType: "chatai_sop",
    });

    expect(spec.nodes.find(node => node.id === "order-conversion")).toEqual({
      config: {
        orderNumberSelector: ["node", "llm", "orderNo"],
      },
      id: "order-conversion",
      kind: "order-conversion",
      nodeSchemaVersion: 1,
    });
  });
});

function expectCompilationIssue(config: Record<string, unknown>, message: string) {
  let error: unknown;
  try {
    compileWorkflowDraft({
      draft: createOrderConversionDraft(config),
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
    nodeId: "order-conversion",
  });
}

function createOrderConversionDraft(config: Record<string, unknown>): WorkflowDraft {
  return {
    edges: [
      { id: "start-llm", source: "start", target: "llm" },
      { id: "llm-conversion", source: "llm", target: "order-conversion" },
      { id: "conversion-end", source: "order-conversion", target: "end" },
    ],
    nodes: [
      node("start", "start", {
        entryPolicy: { mode: "never" },
        seatIds: [101],
        triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
      }),
      node("llm", "llm", {
        inputs: [],
        modelId: "model-1",
        reasoningEffort: "medium",
        output: {
          field: { description: "", id: "orderNo", name: "orderNo", type: "string" },
          format: "text",
        },
        systemPrompt: [{ type: "text", value: "Extract the order number" }],
        userPrompt: [{ type: "text", value: "order number" }],
      }),
      node("order-conversion", "order-conversion", config),
      node("end", "end"),
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function node(
  id: string,
  kind: WorkflowNodeKind,
  config: Record<string, unknown> = {},
) {
  return {
    data: {
      ...config,
      kind,
      label: kind,
      schemaVersion: 1,
      status: "ready" as const,
      title: kind,
    },
    id,
    position: { x: 0, y: 0 },
    type: "workflowNode" as const,
  };
}
