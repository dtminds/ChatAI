import { describe, expect, it } from "vitest";
import {
  addNodeOperation,
  connectNodesOperation,
  deleteNodeOperation,
  deleteNodesOperation,
  duplicateNodeOperation,
  insertNodeAfterOperation,
  insertNodeBetweenOperation,
  updateNodeDataOperation,
} from "@/pages/chat/ai-hosting/workflow/graph-operations";
import {
  createEdge,
  createInitialEdges,
  createInitialNodes,
} from "@/pages/chat/ai-hosting/workflow/graph";
import type { WorkflowDraft } from "@/pages/chat/ai-hosting/workflow/types";

function createDraft(): WorkflowDraft {
  return {
    edges: createInitialEdges(),
    nodes: createInitialNodes(),
  };
}

describe("workflow graph operations", () => {
  it("inserts a node after a branch handle by replacing the existing branch edge", () => {
    const operation = insertNodeAfterOperation(
      createDraft(),
      "branch-intent",
      "wait",
      "wait-low",
      "branch-high",
    );

    expect(operation.event).toBe("node:insert");
    expect(operation.result).toEqual({
      edgeId: "edge-branch-intent-branch-high-action-message",
      nodeId: "wait-low",
    });
    expect(operation.draft.edges.some((edge) => edge.id === "edge-branch-intent-branch-high-action-message"))
      .toBe(false);
    expect(operation.draft.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "branch-intent",
          sourceHandle: "branch-high",
          target: "wait-low",
        }),
        expect.objectContaining({
          source: "wait-low",
          target: "action-message",
        }),
      ]),
    );
    expect(operation.draft.nodes.find((node) => node.id === "action-message")?.position.x).toBe(1240);
  });

  it("inserts a node between an edge while preserving handle metadata", () => {
    const operation = insertNodeBetweenOperation(
      createDraft(),
      "edge-branch-intent-branch-high-action-message",
      "branch-intent",
      "action-message",
      "ai",
      "ai-high",
    );

    expect(operation.event).toBe("node:insert");
    expect(operation.meta).toEqual(expect.objectContaining({
      edgeId: "edge-branch-intent-branch-high-action-message",
      nodeId: "ai-high",
    }));
    expect(operation.draft.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "branch-intent",
          sourceHandle: "branch-high",
          target: "ai-high",
        }),
        expect.objectContaining({
          source: "ai-high",
          target: "action-message",
        }),
      ]),
    );
  });

  it("adds only insertable node kinds to the last action path", () => {
    expect(addNodeOperation(createDraft(), "trigger", "trigger-copy")).toBeUndefined();

    const operation = addNodeOperation(createDraft(), "ai", "ai-tail");

    expect(operation?.event).toBe("node:insert");
    expect(operation?.draft.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "action-message",
          target: "ai-tail",
        }),
        expect.objectContaining({
          source: "ai-tail",
          target: "goal",
        }),
      ]),
    );
  });

  it("connects valid nodes once and rejects invalid or duplicate connections", () => {
    const draft = createDraft();
    const operation = connectNodesOperation(draft, {
      source: "wait-2d",
      sourceHandle: null,
      target: "goal",
      targetHandle: null,
    });

    expect(operation?.event).toBe("edge:connect");
    expect(operation?.result?.edgeId).toBe("edge-wait-2d-goal");
    expect(connectNodesOperation(operation!.draft, {
      source: "wait-2d",
      sourceHandle: null,
      target: "goal",
      targetHandle: null,
    })).toBeUndefined();
    expect(connectNodesOperation(draft, {
      source: "wait-2d",
      sourceHandle: null,
      target: "wait-2d",
      targetHandle: null,
    })).toBeUndefined();
    expect(connectNodesOperation(draft, {
      source: "goal",
      sourceHandle: null,
      target: "wait-2d",
      targetHandle: null,
    })).toBeUndefined();
    expect(connectNodesOperation(draft, {
      source: "wait-2d",
      sourceHandle: null,
      target: "trigger",
      targetHandle: null,
    })).toBeUndefined();
  });

  it("rejects connections that would create cycles", () => {
    expect(connectNodesOperation(createDraft(), {
      source: "action-message",
      sourceHandle: null,
      target: "wait-2d",
      targetHandle: null,
    })).toBeUndefined();
  });

  it("deletes editable nodes with connected edges and keeps terminal nodes protected", () => {
    const operation = deleteNodeOperation(createDraft(), "action-message");

    expect(operation?.event).toBe("node:delete");
    expect(operation?.draft.nodes.some((node) => node.id === "action-message")).toBe(false);
    expect(operation?.draft.edges.some((edge) => edge.source === "action-message" || edge.target === "action-message"))
      .toBe(false);
    expect(deleteNodeOperation(createDraft(), "trigger")).toBeUndefined();
    expect(deleteNodeOperation(createDraft(), "goal")).toBeUndefined();
  });

  it("deletes multiple editable nodes in one operation and skips protected nodes", () => {
    const operation = deleteNodesOperation(createDraft(), ["trigger", "wait-2d", "action-message"]);

    expect(operation?.event).toBe("node:delete");
    expect(operation?.result?.nodeIds).toEqual(["wait-2d", "action-message"]);
    expect(operation?.draft.nodes.map((node) => node.id)).not.toContain("wait-2d");
    expect(operation?.draft.nodes.map((node) => node.id)).not.toContain("action-message");
    expect(operation?.draft.nodes.map((node) => node.id)).toContain("trigger");
    expect(operation?.draft.edges.some((edge) =>
      edge.source === "wait-2d"
      || edge.target === "wait-2d"
      || edge.source === "action-message"
      || edge.target === "action-message",
    )).toBe(false);
  });

  it("duplicates nodes with a unique title and without carrying selection runtime state", () => {
    const draft = createDraft();
    const operation = duplicateNodeOperation({
      ...draft,
      nodes: draft.nodes.map((node) =>
        node.id === "action-message"
          ? { ...node, selected: true, zIndex: 20 }
          : node,
      ),
    }, "action-message", "action-copy");

    const duplicatedNode = operation?.draft.nodes.find((node) => node.id === "action-copy");

    expect(operation?.event).toBe("node:duplicate");
    expect(duplicatedNode?.data.title).toBe("发送欢迎消息 (1)");
    expect(duplicatedNode?.selected).toBe(false);
    expect(duplicatedNode?.zIndex).toBeUndefined();
  });

  it("updates node config without changing unrelated nodes or edges", () => {
    const draft = createDraft();
    const operation = updateNodeDataOperation(draft, "wait-2d", {
      delayDays: 5,
      title: "等待 5 天",
    });

    expect(operation?.result).toEqual({ nodeId: "wait-2d" });
    expect(operation?.meta).toEqual({
      nodeId: "wait-2d",
      nodeTitle: "观察期",
    });
    expect(operation?.draft.edges).toBe(draft.edges);
    expect(operation?.draft.nodes.find((node) => node.id === "wait-2d")?.data.delayDays).toBe(5);
    expect(updateNodeDataOperation(draft, "missing", { title: "missing" })).toBeUndefined();
  });

  it("keeps branch handle identity when duplicate handle edges exist", () => {
    const draft = createDraft();
    const operation = connectNodesOperation({
      ...draft,
      edges: [
        ...draft.edges,
        createEdge("branch-intent", "action-message", "低意向", {
          sourceHandle: "branch-low",
        }),
      ],
    }, {
      source: "branch-intent",
      sourceHandle: "branch-low",
      target: "goal",
      targetHandle: null,
    });

    expect(operation).toBeUndefined();
  });
});
