import type { WorkflowDraft, WorkflowNodeKind } from "@chatai/contracts";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/runtime-support.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/runtime-support.js")>();
  return {
    ...actual,
    isWorkflowRuntimeSupportedNodeKind: (kind: WorkflowNodeKind) =>
      kind === "message" || actual.isWorkflowRuntimeSupportedNodeKind(kind),
  };
});

import { compileWorkflowDraft } from "../src/compiler.js";
import { WorkflowCompilationError } from "../src/errors.js";

describe("Message compiler validation", () => {
  it.each([
    [
      "node output without message-content string semantics",
      {
        attachments: [],
        content: [],
        contentMode: "node-output",
        outputSelector: ["node", "query", "messageCount"],
      },
    ],
    [
      "custom variable without variable semantics",
      {
        attachments: [],
        content: [{ selector: ["node", "query", "messageIds"], type: "variable" }],
        contentMode: "custom",
      },
    ],
  ])("rejects %s", (_scenario, config) => {
    expectCompilationIssue(createMessageDraft(config), {
      code: "invalid-node-config",
      message: "Message node references unavailable content data",
      nodeId: "message",
    });
  });

  it("reports a specific error for incomplete Message configuration", () => {
    expectCompilationIssue(createMessageDraft({
      attachments: [],
      content: [],
      contentMode: "custom",
    }), {
      code: "invalid-node-config",
      message: "Message node requires valid content, node output, or attachments",
      nodeId: "message",
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

function createMessageDraft(messageConfig: Record<string, unknown>): WorkflowDraft {
  return {
    edges: [
      { id: "start-query", source: "start", target: "query" },
      { id: "query-message", source: "query", target: "message" },
      { id: "message-end", source: "message", target: "end" },
    ],
    nodes: [
      node("start", "start", {
        entryPolicy: { mode: "never" },
        seatIds: [101],
        triggers: [{ sourceIds: [], type: "contact.friend_added" }],
      }),
      node("query", "message-query", {
        limit: 10,
        take: "latest",
        timeRange: {
          endAt: "2026-08-16T10:00",
          mode: "fixed",
          startAt: "2026-08-16T09:00",
        },
      }),
      node("message", "message", messageConfig, 2),
      node("end", "end"),
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function node(
  id: string,
  kind: WorkflowNodeKind,
  config: Record<string, unknown> = {},
  schemaVersion = 1,
) {
  return {
    data: {
      ...config,
      kind,
      label: kind,
      schemaVersion,
      status: "ready" as const,
      title: kind,
    },
    id,
    position: { x: 0, y: 0 },
    type: "workflowNode" as const,
  };
}
