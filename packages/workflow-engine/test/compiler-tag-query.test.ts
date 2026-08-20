import type { WorkflowDraft, WorkflowNodeKind } from "@chatai/contracts";
import { describe, expect, it } from "vitest";

import { compileWorkflowDraft } from "../src/compiler.js";
import { WorkflowCompilationError } from "../src/errors.js";

describe("Tag Query compiler validation", () => {
  it("projects its match mode and selected tags", () => {
    const compiled = compileWorkflowDraft({
      draft: createDraft({ matchMode: "all", tagIds: [301, 302] }),
      revision: 1,
      workflowId: "42",
      workflowType: "chatai_sop",
    });

    expect(compiled.nodes.find(node => node.id === "tag-query")?.config).toEqual({
      matchMode: "all",
      tagIds: [301, 302],
    });
  });

  it("rejects an empty tag selection before publication", () => {
    let error: unknown;
    try {
      compileWorkflowDraft({
        draft: createDraft({ matchMode: "any", tagIds: [] }),
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
      message: "Tag Query node requires a match mode and at least one valid tag",
      nodeId: "tag-query",
    });
  });
});

function createDraft(config: Record<string, unknown>): WorkflowDraft {
  return {
    edges: [
      { id: "start-query", source: "start", target: "tag-query" },
      { id: "query-end", source: "tag-query", target: "end" },
    ],
    nodes: [
      node("start", "start", {
        entryPolicy: { mode: "never" },
        seatIds: [101],
        triggers: [{ sourceIds: [], type: "contact.friend_added" }],
      }),
      node("tag-query", "tag-query", config),
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
    type: "workflowNode" as const,
  };
}
