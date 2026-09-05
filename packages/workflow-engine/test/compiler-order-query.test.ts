import type { WorkflowDraft, WorkflowNodeKind } from "@chatai/contracts";
import { describe, expect, it } from "vitest";

import { compileWorkflowDraft } from "../src/compiler.js";
import { WorkflowCompilationError } from "../src/errors.js";
import { projectWorkflowNodeExecutionConfig } from "../src/node-contract-registry.js";

describe("Order Query compiler validation", () => {
  it("projects complete customer order conditions into execution config", () => {
    const config = customerConditions();

    expect(projectWorkflowNodeExecutionConfig({
      data: { kind: "order-query", ...config },
      kind: "order-query",
    })).toEqual(config);

    const spec = compileWorkflowDraft({
      draft: createOrderQueryDraft(config),
      revision: 1,
      workflowId: "42",
      workflowType: "chatai_sop",
    });
    expect(spec.nodes.find(node => node.id === "order-query")?.config).toEqual(config);
  });

  it("accepts the default dynamic customer order time range", () => {
    const config = customerConditions({
      end: ["current-node-lifecycle", "enteredAt"],
      mode: "dynamic",
      start: ["trigger", "occurredAt"],
    });

    expect(() => compileWorkflowDraft({
      draft: createOrderQueryDraft(config),
      revision: 1,
      workflowId: "42",
      workflowType: "chatai_sop",
    })).not.toThrow();
  });

  it("rejects an unreachable order number selector", () => {
    expectCompilationIssue(
      { mode: "order-number", orderNumberSelector: ["node", "missing", "orderNo"] },
      "string",
    );
  });

  it("rejects an order number selector whose output type is incompatible", () => {
    expectCompilationIssue(
      { mode: "order-number", orderNumberSelector: ["node", "llm", "orderNo"] },
      "boolean",
    );
  });

  it("rejects unavailable or incompatible dynamic order time variables", () => {
    expectCustomerTimeCompilationIssue({
      end: ["current-node-lifecycle", "enteredAt"],
      mode: "dynamic",
      start: ["node-lifecycle", "missing", "enteredAt"],
    }, "Order Query node references unavailable time data");
    expectCustomerTimeCompilationIssue({
      end: ["current-node-lifecycle", "enteredAt"],
      mode: "dynamic",
      start: ["node", "llm", "orderNo"],
    }, "Order Query node references unavailable time data");
  });

  it("rejects a dynamic order time range that is reversed in the graph", () => {
    let error: unknown;
    try {
      compileWorkflowDraft({
        draft: createOrderQueryDraft(customerConditions({
          end: ["node-lifecycle", "llm", "exitedAt"],
          mode: "dynamic",
          start: ["node-lifecycle", "wait", "enteredAt"],
        }), "string", true),
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
      message: "Order Query node time range is causally reversed",
      nodeId: "order-query",
    });
  });
});

function expectCustomerTimeCompilationIssue(
  timeRange: Record<string, unknown>,
  message: string,
) {
  let error: unknown;
  try {
    compileWorkflowDraft({
      draft: createOrderQueryDraft(customerConditions(timeRange)),
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
    nodeId: "order-query",
  });
}

function expectCompilationIssue(
  config: Record<string, unknown>,
  llmFieldType: "boolean" | "string",
) {
  let error: unknown;
  try {
    compileWorkflowDraft({
      draft: createOrderQueryDraft(config, llmFieldType),
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
    message: "Order Query node references unavailable or incompatible order number data",
    nodeId: "order-query",
  });
}

function customerConditions(timeRange: Record<string, unknown> = {
  endAt: "2026-09-04T23:59",
  mode: "absolute",
  startAt: "2026-09-01T00:00",
}) {
  return {
    conditions: {
      amount: { max: 200, min: 100 },
      goodsName: "T恤",
      platformId: 2,
      shopIds: [11],
      timeField: "pay-time" as const,
      timeRange,
    },
    mode: "conditions" as const,
  };
}

function createOrderQueryDraft(
  config: Record<string, unknown>,
  llmFieldType: "boolean" | "string" = "string",
  includeWait = false,
): WorkflowDraft {
  return {
    edges: includeWait ? [
      { id: "start-llm", source: "start", target: "llm" },
      { id: "llm-wait", source: "llm", target: "wait" },
      { id: "wait-query", source: "wait", target: "order-query" },
      { id: "query-end", source: "order-query", target: "end" },
    ] : [
      { id: "start-llm", source: "start", target: "llm" },
      { id: "llm-query", source: "llm", target: "order-query" },
      { id: "query-end", source: "order-query", target: "end" },
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
        output: llmFieldType === "string"
          ? {
              field: { description: "", id: "orderNo", name: "orderNo", type: "string" },
              format: "text",
            }
          : {
              fields: [{ description: "", id: "orderNo", name: "orderNo", type: "boolean" }],
              format: "json",
            },
        systemPrompt: [{ type: "text", value: "Extract the order number" }],
        userPrompt: [{ type: "text", value: "order number" }],
      }),
      ...(includeWait ? [node("wait", "wait", { duration: 1, mode: "duration", unit: "day" })] : []),
      node("order-query", "order-query", config),
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
