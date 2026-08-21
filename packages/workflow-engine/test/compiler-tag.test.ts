import type { WorkflowDraft, WorkflowNodeKind } from "@chatai/contracts";
import { describe, expect, it } from "vitest";

import { compileWorkflowDraft } from "../src/compiler.js";
import { WorkflowCompilationError } from "../src/errors.js";

describe("Tag compiler validation", () => {
  it("projects the selected operation and tags into execution config", () => {
    const compiled = compileWorkflowDraft({
      draft: createTagDraft({ operation: "remove", tagIds: [301, 302] }),
      revision: 1,
      workflowId: "42",
      workflowType: "chatai_sop",
    });

    expect(compiled.nodes.find(node => node.id === "tag")?.config).toEqual({
      operation: "remove",
      tagIds: [301, 302],
    });
  });

  it("rejects an empty tag selection before publication", () => {
    let error: unknown;
    try {
      compileWorkflowDraft({
        draft: createTagDraft({ operation: "add", tagIds: [] }),
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
      message: "Tag node requires an operation and at least one valid tag",
      nodeId: "tag",
    });
  });
});

function createTagDraft(config: Record<string, unknown>): WorkflowDraft {
  return {
    edges: [
      { id: "start-tag", source: "start", target: "tag" },
      { id: "tag-end", source: "tag", target: "end" },
    ],
    nodes: [
      node("start", "start", {
        entryPolicy: { mode: "never" },
        seatIds: [101],
        triggers: [{ sourceIds: [], type: "contact.friend_added" }],
      }),
      node("tag", "tag", config),
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
