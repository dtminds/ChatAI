import type { WorkflowExecutionSpec } from "@chatai/contracts";
import { describe, expect, it } from "vitest";
import {
  EMPTY_WORKFLOW_EVENT_CATALOG,
  evaluateWorkflowProductionAvailability,
  validateWorkflowTypePolicy,
} from "../src/index.js";

describe("workflow production availability", () => {
  it("returns runtime, event catalog, and entitlement blockers together", () => {
    const spec = executionSpec();
    spec.nodes.splice(1, 0, {
      config: {},
      id: "llm",
      kind: "llm",
      nodeSchemaVersion: 1,
    });

    expect(evaluateWorkflowProductionAvailability({
      entitlement: {
        entitled: false,
      },
      eventCatalog: EMPTY_WORKFLOW_EVENT_CATALOG,
      spec,
      subjectType: "chatai_contact",
    })).toEqual({
      available: false,
      blockers: [
        {
          code: "event-type-unsupported",
          dimension: "event",
          eventType: "contact.friend_added",
          nodeId: "start",
          nodeKind: "start",
        },
        {
          code: "workflow-type-unentitled",
          dimension: "entitlement",
        },
      ],
    });
  });

  it("rejects a Wait Event when the Catalog does not support its Subject type", () => {
    const spec = executionSpec();
    spec.nodes.splice(1, 0, {
      config: {
        delay: { duration: 30, unit: "second" },
        event: {
          type: "message.received",
        },
        timeout: { duration: 15, unit: "minute" },
      },
      id: "wait-event",
      kind: "wait-event",
      nodeSchemaVersion: 1,
    });

    expect(evaluateWorkflowProductionAvailability({
      entitlement: { activeRunLimit: 10_000, entitled: true },
      spec,
      subjectType: "wecom_contact",
    })).toEqual({
      available: false,
      blockers: [{
        code: "event-type-unsupported",
        dimension: "event",
        eventType: "message.received",
        nodeId: "wait-event",
        nodeKind: "wait-event",
      }],
    });
  });

  it("accepts events implemented by the default Catalog", () => {
    expect(evaluateWorkflowProductionAvailability({
      entitlement: { activeRunLimit: 10_000, entitled: true },
      spec: executionSpec(),
      subjectType: "chatai_contact",
    })).toEqual({ available: true, blockers: [] });
  });

  it("enforces workflow type policy without treating runtime progress as product policy", () => {
    const draft = {
      edges: [],
      nodes: [draftNode("message", "message")],
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    expect(validateWorkflowTypePolicy("chatai_sop", draft)).toEqual([]);
    expect(validateWorkflowTypePolicy("wecom_sop", draft)).toEqual([{
      code: "node-kind-not-allowed",
      nodeId: "message",
      nodeKind: "message",
    }]);
    expect(validateWorkflowTypePolicy("member_sop", draft)).toEqual([{
      code: "workflow-type-unavailable",
    }]);
  });

});

function executionSpec(): WorkflowExecutionSpec {
  return {
    edges: [{ id: "start-end", source: "start", sourceOutletId: "default", target: "end" }],
    entryNodeId: "start",
    nodes: [
      {
        config: {
          entryPolicy: { mode: "never" },
          seatIds: [1],
          triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
        },
        id: "start",
        kind: "start",
        nodeSchemaVersion: 1,
      },
      {
        config: {},
        id: "end",
        kind: "end",
        nodeSchemaVersion: 1,
      },
    ],
    revision: 1,
    schemaVersion: 3,
    terminalNodeId: "end",
    workflowId: "42",
  };
}

function draftNode(id: string, kind: "message") {
  return {
    data: {
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
