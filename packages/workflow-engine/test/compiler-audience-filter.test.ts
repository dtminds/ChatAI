import type { WorkflowDraft, WorkflowNodeKind } from "@chatai/contracts";
import { describe, expect, it } from "vitest";

import { compileWorkflowDraft } from "../src/compiler.js";
import { WorkflowCompilationError } from "../src/errors.js";

describe("Audience Filter compiler validation", () => {
  it("projects its match mode and selected groups", () => {
    const compiled = compileWorkflowDraft({
      draft: createDraft({
        groups: [
          { id: 301, name: "高价值客户" },
          { id: 302, name: "沉默客户" },
        ],
        matchMode: "all",
      }),
      revision: 1,
      workflowId: "42",
      workflowType: "chatai_sop",
    });

    expect(compiled.nodes.find(node => node.id === "audience-filter")?.config).toEqual({
      groups: [
        { id: 301, name: "高价值客户" },
        { id: 302, name: "沉默客户" },
      ],
      matchMode: "all",
    });
  });

  it("rejects an empty group selection before publication", () => {
    let error: unknown;
    try {
      compileWorkflowDraft({
        draft: createDraft({ groups: [], matchMode: "any" }),
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
      message: "Audience Filter node requires a match mode and 1 to 3 audience groups",
      nodeId: "audience-filter",
    });
  });
});

function createDraft(config: Record<string, unknown>): WorkflowDraft {
  return {
    edges: [
      { id: "start-filter", source: "start", target: "audience-filter" },
      { id: "filter-end", source: "audience-filter", target: "end" },
    ],
    nodes: [
      node("start", "start", {
        entryPolicy: { mode: "never" },
        seatIds: [101],
        triggers: [{ sourceIds: [], type: "contact.friend_added" }],
      }),
      node("audience-filter", "audience-filter", config),
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
