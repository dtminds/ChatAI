import type {
  WorkflowExecutionSpec,
  WorkflowLegacyExecutionSpec,
} from "@chatai/contracts";
import { describe, expect, it } from "vitest";
import {
  createWorkflowDeploymentCapabilities,
  evaluateWorkflowProductionAvailability,
  KNOWN_WORKFLOW_CAPABILITIES,
  normalizeWorkflowExecutionSpec,
  validateWorkflowTypePolicy,
  WORKFLOW_PRODUCTION_CAPABILITIES,
} from "../src/index.js";

describe("workflow production availability", () => {
  it("publishes the production capability registry with a stable fingerprint", () => {
    expect(WORKFLOW_PRODUCTION_CAPABILITIES.capabilities).toEqual([
      { capabilityKey: "event.contact.friend_added", contractVersion: 1 },
      { capabilityKey: "event.contact.tag_added", contractVersion: 1 },
      { capabilityKey: "event.message.received", contractVersion: 1 },
      { capabilityKey: "operation.chatai.message.query", contractVersion: 1 },
    ]);
    expect(WORKFLOW_PRODUCTION_CAPABILITIES.fingerprint)
      .toBe("fd47ea46d838e47ed1eef6b27accb8d0d57b54515e38ea9ac97c588bae6c4ee0");
    expect(KNOWN_WORKFLOW_CAPABILITIES).toEqual(expect.arrayContaining([
      { capabilityKey: "operation.intent.classify", contractVersion: 1 },
      { capabilityKey: "operation.llm.generate", contractVersion: 1 },
    ]));
    expect(WORKFLOW_PRODUCTION_CAPABILITIES.capabilities).not.toEqual(expect.arrayContaining([
      { capabilityKey: "operation.intent.classify", contractVersion: 1 },
      { capabilityKey: "operation.llm.generate", contractVersion: 1 },
    ]));
  });

  it("returns all runtime, deployment, and entitlement blockers together", () => {
    const spec = executionSpec();
    spec.nodes.splice(1, 0, {
      config: {},
      id: "message",
      kind: "message",
      nodeSchemaVersion: 1,
      requiredCapabilities: [],
    });

    expect(evaluateWorkflowProductionAvailability({
      deployment: createWorkflowDeploymentCapabilities([]),
      entitlement: {
        entitled: false,
        unentitledSince: "2026-08-01T00:00:00+08:00",
      },
      spec,
    })).toEqual({
      available: false,
      blockers: [
        {
          capabilityKey: "event.contact.friend_added",
          code: "deployment-capability-disabled",
          contractVersion: 1,
          dimension: "deployment",
          nodeId: "start",
          nodeKind: "start",
        },
        {
          code: "runtime-node-unsupported",
          dimension: "runtime",
          nodeId: "message",
          nodeKind: "message",
        },
        {
          code: "workflow-type-unentitled",
          dimension: "entitlement",
        },
      ],
    });
  });

  it("treats Wait Event as runtime-supported while keeping its deployment capability closed", () => {
    const spec = executionSpec();
    spec.nodes.splice(1, 0, {
      config: {
        event: {
          capabilityKey: "event.message.received",
          collectWindowSeconds: 10,
          contractVersion: 1,
          type: "message.received",
        },
        timeout: { duration: 15, unit: "minute" },
      },
      id: "wait-event",
      kind: "wait-event",
      nodeSchemaVersion: 1,
      requiredCapabilities: [
        { capabilityKey: "event.message.received", contractVersion: 1 },
      ],
    });
    spec.requiredCapabilities.push({
      capabilityKey: "event.message.received",
      contractVersion: 1,
    });

    expect(evaluateWorkflowProductionAvailability({
      deployment: createWorkflowDeploymentCapabilities([
        { capabilityKey: "event.contact.friend_added", contractVersion: 1 },
      ]),
      entitlement: { entitled: true, unentitledSince: null },
      spec,
    })).toEqual({
      available: false,
      blockers: [{
        capabilityKey: "event.message.received",
        code: "deployment-capability-disabled",
        contractVersion: 1,
        dimension: "deployment",
        nodeId: "wait-event",
        nodeKind: "wait-event",
      }],
    });
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

  it("derives deployment requirements when normalizing legacy execution specs", () => {
    const legacy: WorkflowLegacyExecutionSpec = {
      edges: [
        { id: "start-wait", source: "start", sourceOutletId: "default", target: "wait" },
        { id: "wait-end", source: "wait", sourceOutletId: "default", target: "end" },
      ],
      entryNodeId: "start",
      nodes: [
        {
          config: {
            entryPolicy: { mode: "never" },
            seatIds: [1],
            triggers: [{ sourceIds: [], type: "contact.friend_added" }],
          },
          id: "start",
          kind: "start",
          nodeSchemaVersion: 1,
        },
        { config: { duration: 46, unit: "day" }, id: "wait", kind: "wait", nodeSchemaVersion: 1 },
        { config: {}, id: "end", kind: "end", nodeSchemaVersion: 1 },
      ],
      revision: 1,
      schemaVersion: 1,
      terminalNodeId: "end",
      workflowId: "42",
    };

    expect(normalizeWorkflowExecutionSpec(legacy)).toMatchObject({
      nodes: [
        {
          id: "start",
          requiredCapabilities: [
            { capabilityKey: "event.contact.friend_added", contractVersion: 1 },
          ],
        },
        { config: { duration: 46, unit: "day" }, id: "wait", requiredCapabilities: [] },
        { id: "end", requiredCapabilities: [] },
      ],
      requiredCapabilities: [
        { capabilityKey: "event.contact.friend_added", contractVersion: 1 },
      ],
      schemaVersion: 2,
    });
  });
});

function executionSpec(): WorkflowExecutionSpec {
  const requiredCapability = {
    capabilityKey: "event.contact.friend_added",
    contractVersion: 1,
  };
  return {
    edges: [{ id: "start-end", source: "start", sourceOutletId: "default", target: "end" }],
    entryNodeId: "start",
    nodes: [
      {
        config: {},
        id: "start",
        kind: "start",
        nodeSchemaVersion: 1,
        requiredCapabilities: [requiredCapability],
      },
      {
        config: {},
        id: "end",
        kind: "end",
        nodeSchemaVersion: 1,
        requiredCapabilities: [],
      },
    ],
    requiredCapabilities: [requiredCapability],
    revision: 1,
    schemaVersion: 2,
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
