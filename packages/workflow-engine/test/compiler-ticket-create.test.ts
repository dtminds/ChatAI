import type { WorkflowDraft, WorkflowNodeKind } from "@chatai/contracts";
import { describe, expect, it } from "vitest";

import { compileWorkflowDraft } from "../src/compiler.js";
import { WorkflowCompilationError } from "../src/errors.js";

describe("Ticket Create compiler validation", () => {
  it("compiles fixed and variable ticket content for ChatAI SOP", () => {
    const draft = createDraft({
      description: [
        { type: "text", value: "客户：" },
        { selector: ["subject", "id"], type: "variable" },
      ],
      priority: "high",
      ticketTitle: [{ type: "text", value: "跟进客户" }],
    });

    expect(compileWorkflowDraft({
      draft,
      revision: 1,
      workflowId: "42",
      workflowType: "chatai_sop",
    }).nodes.find(node => node.kind === "ticket-create")?.config).toEqual({
      description: draft.nodes[1]?.data.description,
      priority: "high",
      ticketTitle: draft.nodes[1]?.data.ticketTitle,
    });
  });

  it("rejects Ticket Create from WeCom SOP policy", () => {
    expectCompilationIssue(createDraft({
      description: [],
      priority: "medium",
      ticketTitle: [{ type: "text", value: "跟进客户" }],
    }, "wecom_sop"), {
      code: "type-policy-violation",
      message: "Workflow type policy rejected node-kind-not-allowed",
      nodeId: "ticket-create",
    }, "wecom_sop");
  });
});

function expectCompilationIssue(
  draft: WorkflowDraft,
  expectedIssue: WorkflowCompilationError["issues"][number],
  workflowType: "chatai_sop" | "wecom_sop",
) {
  let error: unknown;
  try {
    compileWorkflowDraft({ draft, revision: 1, workflowId: "42", workflowType });
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(WorkflowCompilationError);
  expect((error as WorkflowCompilationError).issues).toContainEqual(expectedIssue);
}

function createDraft(
  config: Record<string, unknown>,
  workflowType: "chatai_sop" | "wecom_sop" = "chatai_sop",
): WorkflowDraft {
  return {
    edges: [
      { id: "start-ticket", source: "start", target: "ticket-create" },
      { id: "ticket-end", source: "ticket-create", target: "end" },
    ],
    nodes: [
      node("start", "start", {
        entryPolicy: { mode: "never" },
        ...(workflowType === "chatai_sop" ? { seatIds: [101] } : { workUserIds: [201] }),
        triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
      }),
      node("ticket-create", "ticket-create", config),
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
      schemaVersion: 1,
      status: "ready" as const,
      title: kind,
    },
    id,
    position: { x: 0, y: 0 },
    type: "workflowNode" as const,
  };
}
