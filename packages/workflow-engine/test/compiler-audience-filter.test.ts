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
      message: "Audience Filter node requires a match mode and 1 to 3 unique audience groups",
      nodeId: "audience-filter",
    });
  });

  it("rejects duplicate audience group ids before publication", () => {
    let error: unknown;
    try {
      compileWorkflowDraft({
        draft: createDraft({
          groups: [
            { id: 301, name: "高价值客户" },
            { id: 301, name: "重复" },
          ],
          matchMode: "all",
        }),
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
      message: "Audience Filter node requires a match mode and 1 to 3 unique audience groups",
      nodeId: "audience-filter",
    });
  });

  it("compiles a downstream branch that reads 是否匹配", () => {
    const compiled = compileWorkflowDraft({
      draft: {
        edges: [
          { id: "start-filter", source: "start", target: "audience-filter" },
          { id: "filter-branch", source: "audience-filter", target: "branch" },
          { id: "branch-matched", source: "branch", sourceHandle: "matched", target: "end" },
          { id: "branch-default", source: "branch", sourceHandle: "default", target: "end" },
        ],
        nodes: [
          node("start", "start", {
            entryPolicy: { mode: "never" },
            seatIds: [101],
            triggers: [{ sourceIds: [], type: "contact.friend_added" }],
          }),
          node("audience-filter", "audience-filter", {
            groups: [{ id: 301, name: "高价值客户" }],
            matchMode: "any",
          }),
          node("branch", "branch", {
            branchPaths: [
              {
                conditions: [{
                  id: "condition-matched",
                  operator: "is-true",
                  selector: ["node", "audience-filter", "matched"],
                  valueType: "boolean",
                }],
                id: "matched",
                label: "如果",
                logic: "all",
              },
              { conditions: [], id: "default", isDefault: true, label: "否则", logic: "all" },
            ],
          }),
          node("end", "end"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      revision: 1,
      workflowId: "42",
      workflowType: "chatai_sop",
    });

    expect(compiled.nodes.find(node => node.id === "audience-filter")?.config).toEqual({
      groups: [{ id: 301, name: "高价值客户" }],
      matchMode: "any",
    });
    expect(compiled.edges).toEqual([
      expect.objectContaining({ source: "start", sourceOutletId: "default", target: "audience-filter" }),
      expect.objectContaining({ source: "audience-filter", sourceOutletId: "default", target: "branch" }),
      expect.objectContaining({ source: "branch", sourceOutletId: "matched", target: "end" }),
      expect.objectContaining({ source: "branch", sourceOutletId: "default", target: "end" }),
    ]);
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
