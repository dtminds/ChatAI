import type { WorkflowDraft, WorkflowNodeKind } from "@chatai/contracts";
import { describe, expect, it } from "vitest";

import { compileWorkflowDraft } from "../src/compiler.js";
import { WorkflowCompilationError } from "../src/errors.js";

describe("Handoff compiler validation", () => {
  it("compiles structured messages as renderable operator content", () => {
    const compiled = compileWorkflowDraft({
      draft: createHandoffDraft({
        customerMessage: [],
        operatorMessage: [{ selector: ["node", "query", "messages"], type: "variable" }],
      }),
      revision: 1,
      workflowId: "42",
      workflowType: "chatai_sop",
    });

    expect(compiled.nodes.find(node => node.id === "handoff")?.config).toMatchObject({
      customerMessage: [],
      operatorMessage: [{ selector: ["node", "query", "messages"], type: "variable" }],
    });
  });

  it("reports a specific error when the operator message is empty", () => {
    expectCompilationIssue(createHandoffDraft({
      customerMessage: [],
      operatorMessage: [],
    }), {
      code: "invalid-node-config",
      message: "Handoff node requires a valid operator message",
      nodeId: "handoff",
    });
  });

  it("compiles reachable variables into the Handoff execution config", () => {
    const compiled = compileWorkflowDraft({
      draft: createHandoffDraft({
        customerMessage: [{ selector: ["subject", "id"], type: "variable" }],
        operatorMessage: [
          { selector: ["node", "query", "messageCount"], type: "variable" },
          { type: "text", value: " 条消息待处理" },
        ],
      }),
      revision: 1,
      workflowId: "42",
      workflowType: "chatai_sop",
    });

    expect(compiled.nodes.find(node => node.id === "handoff")?.config).toEqual({
      customerMessage: [{ selector: ["subject", "id"], type: "variable" }],
      operatorMessage: [
        { selector: ["node", "query", "messageCount"], type: "variable" },
        { type: "text", value: " 条消息待处理" },
      ],
    });
  });
});

function expectCompilationIssue(
  draft: WorkflowDraft,
  expectedIssue: WorkflowCompilationError["issues"][number],
) {
  let error: unknown;
  try {
    compileWorkflowDraft({
      draft,
      revision: 1,
      workflowId: "42",
      workflowType: "chatai_sop",
    });
  } catch (caught) {
    error = caught;
  }

  expect(error).toBeInstanceOf(WorkflowCompilationError);
  expect((error as WorkflowCompilationError).issues).toContainEqual(expectedIssue);
}

function createHandoffDraft(handoffConfig: Record<string, unknown>): WorkflowDraft {
  return {
    edges: [
      { id: "start-query", source: "start", target: "query" },
      { id: "query-handoff", source: "query", target: "handoff" },
      { id: "handoff-end", source: "handoff", target: "end" },
    ],
    nodes: [
      node("start", "start", {
        entryPolicy: { mode: "never" },
        seatIds: [101],
        triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
      }),
      node("query", "message-query", {
        limit: 10,
        take: "latest",
        timeRange: {
          endAt: "2026-08-17T10:00",
          mode: "fixed",
          startAt: "2026-08-17T09:00",
        },
      }),
      node("handoff", "handoff", handoffConfig),
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
