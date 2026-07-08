import { describe, expect, it } from "vitest";
import {
  addNodeOperation,
  arrangeNodesOperation,
  connectNodesOperation,
  deleteNodeOperation,
  deleteNodesOperation,
  duplicateNodeOperation,
  insertNodeAfterOperation,
  insertNodeBetweenOperation,
  updateNodeDataOperation,
} from "@/pages/chat/ai-hosting/workflow/graph-operations";
import { WORKFLOW_EDGE_TYPE } from "@/pages/chat/ai-hosting/workflow/constants";
import {
  createEdge,
  createInitialDraft,
  createNodeFromKind,
} from "@/pages/chat/ai-hosting/workflow/graph";
import type {
  WorkflowBranchPath,
  WorkflowDraft,
} from "@/pages/chat/ai-hosting/workflow/types";

function createDraft(): WorkflowDraft {
  return createInitialDraft();
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

    expect(operation).toBeDefined();
    expect(operation!.event).toBe("node:insert");
    expect(operation!.result).toEqual({
      edgeId: "edge-branch-intent-branch-high-action-message",
      nodeId: "wait-low",
    });
    expect(operation!.draft.edges.some((edge) => edge.id === "edge-branch-intent-branch-high-action-message"))
      .toBe(false);
    expect(operation!.draft.edges).toEqual(
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
    expect(operation!.draft.nodes.find((node) => node.id === "action-message")?.position.x).toBe(1240);
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

    expect(operation).toBeDefined();
    expect(operation!.event).toBe("node:insert");
    expect(operation!.meta).toEqual(expect.objectContaining({
      edgeId: "edge-branch-intent-branch-high-action-message",
      nodeId: "ai-high",
    }));
    expect(operation!.draft.edges).toEqual(
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

  it("adds only insertable node kinds as unconnected floating nodes", () => {
    expect(addNodeOperation(createDraft(), "trigger", "trigger-copy")).toBeUndefined();

    const draft = createDraft();
    const operation = addNodeOperation(draft, "ai", "ai-tail");

    expect(operation?.event).toBe("node:add");
    expect(operation?.draft.edges.map((edge) => edge.id)).toEqual(draft.edges.map((edge) => edge.id));
    expect(operation?.draft.edges.some((edge) => edge.source === "ai-tail" || edge.target === "ai-tail"))
      .toBe(false);
    expect(operation?.draft.nodes.find((node) => node.id === "ai-tail")?.position)
      .toEqual({ x: 395, y: -293 });
  });

  it("connects valid handles once and rejects invalid or occupied handles", () => {
    const draft = createDraft();
    expect(connectNodesOperation(draft, {
      source: "wait-2d",
      sourceHandle: null,
      target: "goal",
      targetHandle: null,
    })).toBeUndefined();

    const reconnectableDraft = {
      ...draft,
      edges: draft.edges.filter((edge) => edge.source !== "wait-2d"),
    };
    const operation = connectNodesOperation(reconnectableDraft, {
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
    const branchOperation = connectNodesOperation(draft, {
      source: "branch-intent",
      sourceHandle: "branch-normal",
      target: "goal",
      targetHandle: null,
    });

    expect(branchOperation?.result?.edgeId).toBe("edge-branch-intent-branch-normal-goal");
    expect(connectNodesOperation(branchOperation!.draft, {
      source: "branch-intent",
      sourceHandle: "branch-normal",
      target: "action-message",
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
    expect(connectNodesOperation(draft, {
      source: "branch-intent",
      sourceHandle: "branch-missing",
      target: "goal",
      targetHandle: null,
    })).toBeUndefined();
    expect(connectNodesOperation(draft, {
      source: "wait-2d",
      sourceHandle: "branch-high",
      target: "goal",
      targetHandle: null,
    })).toBeUndefined();
    expect(connectNodesOperation(draft, {
      source: "wait-2d",
      sourceHandle: null,
      target: "goal",
      targetHandle: "target-custom",
    })).toBeUndefined();
  });

  it("rejects insert commands that would create invalid graph edges", () => {
    const draft = createDraft();

    expect(insertNodeAfterOperation(
      draft,
      "missing-node",
      "wait",
      "wait-missing",
    )).toBeUndefined();
    expect(insertNodeAfterOperation(
      draft,
      "goal",
      "wait",
      "wait-after-goal",
    )).toBeUndefined();
    expect(insertNodeAfterOperation(
      draft,
      "wait-2d",
      "ai",
      "ai-extra",
      "branch-high",
    )).toBeUndefined();
    expect(insertNodeBetweenOperation(
      draft,
      "missing-edge",
      "wait-2d",
      "goal",
      "ai",
      "ai-missing-edge",
    )).toBeUndefined();
    expect(insertNodeBetweenOperation(
      draft,
      "edge-wait-2d-branch-intent",
      "trigger",
      "branch-intent",
      "ai",
      "ai-mismatch",
    )).toBeUndefined();
  });

  it("removes edges for deleted branch paths when updating branch node data", () => {
    const operation = updateNodeDataOperation(createDraft(), "branch-intent", {
      branchPaths: [
        { id: "branch-normal", label: "普通客户", operator: "IF", title: "CASE 1" },
        { id: "branch-default", isDefault: true, label: "默认路径", operator: "ELSE", title: "CASE 2" },
      ],
    });

    expect(operation?.draft.nodes.find((node) => node.id === "branch-intent")?.data.branchPaths)
      .toEqual([
        { id: "branch-normal", isDefault: undefined, label: "普通客户", operator: "IF", title: "CASE 1" },
        { id: "branch-default", isDefault: true, label: "默认路径", operator: "ELSE", title: "CASE 2" },
      ]);
    expect(operation?.draft.edges.some((edge) =>
      edge.source === "branch-intent" && edge.sourceHandle === "branch-high",
    )).toBe(false);
  });

  it("keeps branch edge labels aligned with renamed branch paths", () => {
    const operation = updateNodeDataOperation(createDraft(), "branch-intent", {
      branchPaths: [
        { id: "branch-high", label: "高价值客户", operator: "IF", title: "CASE 1" },
        { id: "branch-normal", label: "普通客户", operator: "ELIF", title: "CASE 2" },
        { id: "branch-default", isDefault: true, label: "默认路径", operator: "ELSE", title: "CASE 3" },
      ],
    });

    expect(operation?.draft.edges.find((edge) =>
      edge.source === "branch-intent" && edge.sourceHandle === "branch-high",
    )?.data?.label).toBe("高价值客户");
  });

  it("canonicalizes operation drafts by preserving viewport, removing bad edges, and deduping edge ids", () => {
    const draft = createDraft();
    const operation = updateNodeDataOperation({
      ...draft,
      edges: [
        ...draft.edges,
        createEdge("wait-2d", "goal"),
        createEdge("wait-2d", "goal"),
        {
          ...createEdge("missing", "goal"),
          id: "edge-missing-goal",
        },
      ],
      viewport: {
        x: 100,
        y: 200,
        zoom: 1.2,
      },
    }, "wait-2d", {
      title: "等待确认",
    });

    expect(operation?.draft.viewport).toEqual({ x: 100, y: 200, zoom: 1.2 });
    expect(operation?.draft.edges.some((edge) => edge.id === "edge-wait-2d-goal")).toBe(false);
    expect(operation?.draft.edges.some((edge) => edge.id === "edge-missing-goal")).toBe(false);
    expect(operation?.draft.edges.every((edge) => edge.type === WORKFLOW_EDGE_TYPE)).toBe(true);
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
    expect(operation?.draft.edges).toEqual(draft.edges.map((edge) => ({
      ...edge,
      selected: false,
    })));
    expect(operation?.draft.nodes.find((node) => node.id === "wait-2d")?.data.delayDays).toBe(5);
    expect(updateNodeDataOperation(draft, "missing", { title: "missing" })).toBeUndefined();
    expect(updateNodeDataOperation(draft, "wait-2d", {
      delayDays: draft.nodes.find((node) => node.id === "wait-2d")?.data.delayDays,
    })).toBeUndefined();
  });

  it("keeps node kind immutable when applying config patches", () => {
    const draft = createDraft();
    const operation = updateNodeDataOperation(draft, "wait-2d", {
      kind: "goal",
      title: "仍然是等待节点",
    } as unknown as Parameters<typeof updateNodeDataOperation>[2]);

    const updatedNode = operation?.draft.nodes.find((node) => node.id === "wait-2d");

    expect(updatedNode?.data.kind).toBe("wait");
    expect(updatedNode?.data.title).toBe("仍然是等待节点");
    expect(operation?.draft.edges).toEqual(draft.edges.map((edge) => ({
      ...edge,
      selected: false,
    })));
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

  it("arranges nodes by graph topology instead of node creation order", () => {
    const draft = createDraft();
    const insertedNode = createNodeFromKind("ai", "ai-mid", 99);
    const operation = arrangeNodesOperation({
      ...draft,
      edges: [
        createEdge("trigger", "wait-2d"),
        createEdge("wait-2d", "ai-mid"),
        createEdge("ai-mid", "branch-intent"),
        createEdge("branch-intent", "action-message", "高意向", {
          sourceHandle: "branch-high",
        }),
        createEdge("action-message", "goal"),
      ],
      nodes: [...draft.nodes, insertedNode],
    });

    const positionById = new Map(operation.draft.nodes.map((node) => [node.id, node.position]));

    expect(operation.event).toBe("layout:organize");
    expect(positionById.get("trigger")?.x).toBeLessThan(positionById.get("wait-2d")?.x ?? 0);
    expect(positionById.get("wait-2d")?.x).toBeLessThan(positionById.get("ai-mid")?.x ?? 0);
    expect(positionById.get("ai-mid")?.x).toBeLessThan(positionById.get("branch-intent")?.x ?? 0);
    expect(positionById.get("branch-intent")?.x).toBeLessThan(positionById.get("action-message")?.x ?? 0);
  });

  it("arranges branch targets by their source handle order", () => {
    const draft = createDraft();
    const normalNode = createNodeFromKind("action", "action-normal", 10);
    const defaultNode = createNodeFromKind("action", "action-default", 11);
    const operation = arrangeNodesOperation({
      ...draft,
      edges: [
        createEdge("trigger", "wait-2d"),
        createEdge("wait-2d", "branch-intent"),
        createEdge("branch-intent", "action-default", "默认路径", {
          sourceHandle: "branch-default",
        }),
        createEdge("branch-intent", "action-message", "高意向", {
          sourceHandle: "branch-high",
        }),
        createEdge("branch-intent", "action-normal", "普通客户", {
          sourceHandle: "branch-normal",
        }),
      ],
      nodes: [...draft.nodes, defaultNode, normalNode],
    });

    const positionById = new Map(operation.draft.nodes.map((node) => [node.id, node.position]));

    expect(positionById.get("action-message")?.x).toBe(positionById.get("action-normal")?.x);
    expect(positionById.get("action-normal")?.x).toBe(positionById.get("action-default")?.x);
    expect(positionById.get("action-message")?.y).toBeLessThan(positionById.get("action-normal")?.y ?? 0);
    expect(positionById.get("action-normal")?.y).toBeLessThan(positionById.get("action-default")?.y ?? 0);
  });

  it("arranges branch targets by branch path order from node data", () => {
    const draft = createDraft();
    const firstNode = createNodeFromKind("action", "action-first", 10);
    const secondNode = createNodeFromKind("action", "action-second", 11);
    const fallbackNode = createNodeFromKind("action", "action-fallback", 12);
    const branchPaths: WorkflowBranchPath[] = [
      { id: "branch-first", label: "第一路径", operator: "IF", title: "CASE 1" },
      { id: "branch-second", label: "第二路径", operator: "ELIF", title: "CASE 2" },
      { id: "branch-fallback", isDefault: true, label: "兜底", operator: "ELSE", title: "CASE 3" },
    ];
    const operation = arrangeNodesOperation({
      ...draft,
      edges: [
        createEdge("trigger", "wait-2d"),
        createEdge("wait-2d", "branch-intent"),
        createEdge("branch-intent", "action-fallback", "兜底", {
          sourceHandle: "branch-fallback",
        }),
        createEdge("branch-intent", "action-second", "第二路径", {
          sourceHandle: "branch-second",
        }),
        createEdge("branch-intent", "action-first", "第一路径", {
          sourceHandle: "branch-first",
        }),
      ],
      nodes: [
        ...draft.nodes.map((node) =>
          node.id === "branch-intent"
            ? {
                ...node,
                data: {
                  ...node.data,
                  branchPaths,
                },
              }
            : node,
        ),
        fallbackNode,
        secondNode,
        firstNode,
      ],
    });

    const positionById = new Map(operation.draft.nodes.map((node) => [node.id, node.position]));

    expect(positionById.get("action-first")?.y).toBeLessThan(positionById.get("action-second")?.y ?? 0);
    expect(positionById.get("action-second")?.y).toBeLessThan(positionById.get("action-fallback")?.y ?? 0);
  });
});
