import { describe, expect, it } from "vitest";
import {
  addNodeOperation,
  arrangeNodesOperation,
  connectNodesOperation,
  createInsertNodeBetweenConnections,
  deleteEdgesOperation,
  deleteNodeOperation,
  deleteNodesOperation,
  duplicateNodeOperation,
  insertNodeAfterOperation,
  insertNodeBetweenOperation,
  moveNodesOperation,
  pasteClipboardOperation,
  updateNodeDataOperation,
} from "@/pages/chat/workflow/graph-operations";
import { createWorkflowClipboardData } from "@/pages/chat/workflow/workflow-clipboard";
import { WORKFLOW_EDGE_TYPE } from "@/pages/chat/workflow/constants";
import {
  createEdge,
  createInitialDraft,
  createNodeFromKind,
} from "@/pages/chat/workflow/graph";
import type {
  WorkflowBranchPath,
  WorkflowDraft,
} from "@/pages/chat/workflow/types";

function createDraft(): WorkflowDraft {
  return createInitialDraft();
}

describe("workflow graph operations", () => {
  it("inserts a node after a branch handle by replacing the existing branch edge", () => {
    expect(insertNodeAfterOperation(
      createDraft(),
      "branch-intent",
      "wait",
      "wait-2d",
      "branch-high",
    )).toBeUndefined();

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

  it("inserts after an empty source handle without auto-connecting a downstream goal", () => {
    const operation = insertNodeAfterOperation(
      createDraft(),
      "branch-intent",
      "wait",
      "wait-normal",
      "branch-normal",
    );

    expect(operation).toBeDefined();
    expect(operation!.event).toBe("node:add");
    expect(operation!.result).toEqual({
      edgeId: undefined,
      nodeId: "wait-normal",
    });
    expect(operation!.draft.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: "branch-intent",
        sourceHandle: "branch-normal",
        target: "wait-normal",
      }),
    ]));
    expect(operation!.draft.edges.some((edge) =>
      edge.source === "wait-normal" && edge.target === "goal",
    )).toBe(false);
    expect(operation!.draft.edges.filter((edge) => edge.target === "goal")).toHaveLength(1);
  });

  it("replaces default-handle edges when inserting after imported null handles", () => {
    const draft = createDraft();
    const operation = insertNodeAfterOperation({
      ...draft,
      edges: draft.edges.map((edge) =>
        edge.source === "trigger" && edge.target === "wait-2d"
          ? { ...edge, sourceHandle: null, targetHandle: null }
          : edge,
      ),
    }, "trigger", "ai", "ai-entry");

    expect(operation?.event).toBe("node:insert");
    expect(operation?.draft.edges.some((edge) =>
      edge.source === "trigger" && edge.target === "wait-2d",
    )).toBe(false);
    expect(operation?.draft.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: "trigger",
        sourceHandle: undefined,
        target: "ai-entry",
      }),
      expect.objectContaining({
        source: "ai-entry",
        target: "wait-2d",
        targetHandle: undefined,
      }),
    ]));
  });

  it("inserts a node between an edge while preserving handle metadata", () => {
    expect(insertNodeBetweenOperation(
      createDraft(),
      "edge-branch-intent-branch-high-action-message",
      "branch-intent",
      "action-message",
      "ai",
      "wait-2d",
    )).toBeUndefined();

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
          targetHandle: undefined,
        }),
        expect.objectContaining({
          source: "ai-high",
          target: "action-message",
          targetHandle: undefined,
        }),
      ]),
    );
  });

  it("keeps split-edge source handles on incoming edges and target handles on outgoing edges", () => {
    expect(createInsertNodeBetweenConnections({
      source: "source-node",
      sourceHandle: "branch-high",
      target: "target-node",
      targetHandle: "target-custom",
    }, "inserted-node")).toEqual({
      incomingConnection: {
        source: "source-node",
        sourceHandle: "branch-high",
        target: "inserted-node",
        targetHandle: null,
      },
      outgoingConnection: {
        source: "inserted-node",
        sourceHandle: null,
        target: "target-node",
        targetHandle: "target-custom",
      },
    });
  });

  it("adds only insertable node kinds as unconnected floating nodes", () => {
    expect(addNodeOperation(createDraft(), "trigger", "trigger-copy")).toBeUndefined();
    expect(addNodeOperation(createDraft(), "ai", "wait-2d")).toBeUndefined();

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
      edges: draft.edges.filter((edge) =>
        edge.source !== "wait-2d" && edge.target !== "action-message",
      ),
    };
    const operation = connectNodesOperation(reconnectableDraft, {
      source: "wait-2d",
      sourceHandle: null,
      target: "action-message",
      targetHandle: null,
    });

    expect(operation?.event).toBe("edge:connect");
    expect(operation?.result?.edgeId).toBe("edge-wait-2d-action-message");
    expect(connectNodesOperation(operation!.draft, {
      source: "wait-2d",
      sourceHandle: null,
      target: "action-message",
      targetHandle: null,
    })).toBeUndefined();
    expect(connectNodesOperation(draft, {
      source: "branch-intent",
      sourceHandle: "branch-normal",
      target: "goal",
      targetHandle: null,
    })).toBeUndefined();

    const branchReconnectableDraft = {
      ...draft,
      edges: draft.edges.filter((edge) => edge.id !== "edge-branch-intent-branch-high-action-message"),
      nodes: [
        ...draft.nodes,
        createNodeFromKind("action", "action-normal", 10),
      ],
    };
    const branchOperation = connectNodesOperation(branchReconnectableDraft, {
      source: "branch-intent",
      sourceHandle: "branch-normal",
      target: "action-normal",
      targetHandle: null,
    });

    expect(branchOperation?.result?.edgeId).toBe("edge-branch-intent-branch-normal-action-normal");
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

  it("deletes one or more edges as a graph operation", () => {
    const draft = createDraft();
    const operation = deleteEdgesOperation(draft, [
      "edge-wait-2d-branch-intent",
      "edge-action-message-goal",
    ]);

    expect(operation?.event).toBe("edge:delete");
    expect(operation?.meta).toEqual({
      edgeId: undefined,
      nodeId: "wait-2d",
    });
    expect(operation?.result).toEqual({
      edgeId: "edge-wait-2d-branch-intent",
      nodeId: "wait-2d",
    });
    expect(operation?.draft.edges.some((edge) => edge.id === "edge-wait-2d-branch-intent")).toBe(false);
    expect(operation?.draft.edges.some((edge) => edge.id === "edge-action-message-goal")).toBe(false);
    expect(operation?.draft.edges.some((edge) => edge.id === "edge-branch-intent-branch-high-action-message"))
      .toBe(true);
    expect(deleteEdgesOperation(draft, [
      "edge-wait-2d-branch-intent",
      "missing-edge",
    ])).toBeUndefined();
    expect(deleteEdgesOperation(draft, ["missing-edge"])).toBeUndefined();
  });

  it("rejects insert commands that would create invalid graph edges", () => {
    const draft = createDraft();

    expect(insertNodeAfterOperation(
      draft,
      "wait-2d",
      "goal" as Parameters<typeof insertNodeAfterOperation>[2],
      "goal-extra",
    )).toBeUndefined();
    expect(insertNodeBetweenOperation(
      draft,
      "edge-wait-2d-branch-intent",
      "wait-2d",
      "branch-intent",
      "trigger" as Parameters<typeof insertNodeBetweenOperation>[4],
      "trigger-extra",
    )).toBeUndefined();
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

  it("deletes multiple editable nodes in one atomic operation", () => {
    const operation = deleteNodesOperation(createDraft(), ["wait-2d", "action-message"]);

    expect(operation?.event).toBe("node:delete");
    expect(operation?.result?.nodeIds).toEqual(["wait-2d", "action-message"]);
    expect(operation?.draft.nodes.map((node) => node.id)).not.toContain("wait-2d");
    expect(operation?.draft.nodes.map((node) => node.id)).not.toContain("action-message");
    expect(operation?.draft.edges.some((edge) =>
      edge.source === "wait-2d"
      || edge.target === "wait-2d"
      || edge.source === "action-message"
      || edge.target === "action-message",
    )).toBe(false);
  });

  it("rejects batched node deletion when any requested node is missing or protected", () => {
    expect(deleteNodesOperation(createDraft(), ["trigger", "wait-2d"])).toBeUndefined();
    expect(deleteNodesOperation(createDraft(), ["goal", "action-message"])).toBeUndefined();
    expect(deleteNodesOperation(createDraft(), ["missing-node", "action-message"])).toBeUndefined();
  });

  it("duplicates nodes with a unique title and without carrying selection runtime state", () => {
    const draft = createDraft();
    expect(duplicateNodeOperation(draft, "action-message", "wait-2d")).toBeUndefined();

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

  it("pastes clipboard nodes as a graph operation", () => {
    const draft = createDraft();
    const clipboardData = createWorkflowClipboardData(draft, ["action-message"])!;
    const operation = pasteClipboardOperation(draft, clipboardData, {
      nodeIdFactory: (kind, index) => `${kind}-paste-${index}`,
    });

    expect(operation?.event).toBe("node:paste");
    expect(operation?.result).toEqual({ nodeId: "action-paste-0" });
    expect(operation?.draft.nodes.some((node) => node.id === "action-paste-0")).toBe(true);
    expect(operation?.draft.nodes.find((node) => node.id === "action-paste-0")?.data.title)
      .toBe("发送欢迎消息 (1)");
  });

  it("moves one or more nodes as a graph operation", () => {
    const draft = createDraft();
    const operation = moveNodesOperation(draft, [
      { nodeId: "wait-2d", position: { x: 420, y: 120 } },
      { nodeId: "branch-intent", position: { x: 760, y: 180 } },
    ], "wait-2d");

    expect(operation?.event).toBe("node:move");
    expect(operation?.meta).toEqual({
      nodeId: "wait-2d",
      nodeTitle: "观察期",
    });
    expect(operation?.result).toEqual({ nodeId: "wait-2d" });
    expect(operation?.draft.nodes.find((node) => node.id === "wait-2d")?.position).toEqual({ x: 420, y: 120 });
    expect(operation?.draft.nodes.find((node) => node.id === "branch-intent")?.position).toEqual({ x: 760, y: 180 });
    expect(operation?.draft.nodes.find((node) => node.id === "trigger")?.position)
      .toEqual(draft.nodes.find((node) => node.id === "trigger")?.position);
  });

  it("does not create a move operation when positions are unchanged", () => {
    const draft = createDraft();
    const waitNode = draft.nodes.find((node) => node.id === "wait-2d")!;

    expect(moveNodesOperation(draft, [
      { nodeId: waitNode.id, position: waitNode.position },
    ], waitNode.id)).toBeUndefined();
  });

  it("rejects invalid move operations instead of partially applying them", () => {
    const draft = createDraft();
    const waitNode = draft.nodes.find((node) => node.id === "wait-2d")!;

    expect(moveNodesOperation(draft, [], waitNode.id)).toBeUndefined();
    expect(moveNodesOperation(draft, [
      { nodeId: "missing-node", position: { x: 420, y: 120 } },
    ], "missing-node")).toBeUndefined();
    expect(moveNodesOperation(draft, [
      { nodeId: waitNode.id, position: { x: 420, y: 120 } },
    ], "missing-primary")).toBeUndefined();
    expect(moveNodesOperation(draft, [
      { nodeId: waitNode.id, position: { x: 420, y: 120 } },
      { nodeId: waitNode.id, position: { x: 520, y: 220 } },
    ], waitNode.id)).toBeUndefined();
    expect(moveNodesOperation(draft, [
      { nodeId: waitNode.id, position: { x: Number.NaN, y: 120 } },
    ], waitNode.id)).toBeUndefined();
  });

  it("updates node config without changing unrelated nodes or edges", () => {
    const draft = createDraft();
    const operation = updateNodeDataOperation(draft, "wait-2d", {
      delayDays: 5,
      title: "等待 5 天",
    });

    expect(operation?.event).toBe("node:config-change");
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

    const positionById = new Map(operation!.draft.nodes.map((node) => [node.id, node.position]));

    expect(operation?.event).toBe("layout:organize");
    expect(positionById.get("trigger")?.x).toBeLessThan(positionById.get("wait-2d")?.x ?? 0);
    expect(positionById.get("wait-2d")?.x).toBeLessThan(positionById.get("ai-mid")?.x ?? 0);
    expect(positionById.get("ai-mid")?.x).toBeLessThan(positionById.get("branch-intent")?.x ?? 0);
    expect(positionById.get("branch-intent")?.x).toBeLessThan(positionById.get("action-message")?.x ?? 0);
  });

  it("skips auto arrange operations when the layout is already current", () => {
    const draft = createDraft();
    const arrangedOperation = arrangeNodesOperation(draft);

    expect(arrangedOperation).toBeDefined();
    expect(arrangeNodesOperation(arrangedOperation!.draft)).toBeUndefined();
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

    expect(operation).toBeDefined();
    const positionById = new Map(operation!.draft.nodes.map((node) => [node.id, node.position]));

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

    expect(operation).toBeDefined();
    const positionById = new Map(operation!.draft.nodes.map((node) => [node.id, node.position]));

    expect(positionById.get("action-first")?.y).toBeLessThan(positionById.get("action-second")?.y ?? 0);
    expect(positionById.get("action-second")?.y).toBeLessThan(positionById.get("action-fallback")?.y ?? 0);
  });

  it("prioritizes entry nodes by role during layout instead of a fixed node id", () => {
    const draft = createDraft();
    const entryNode = {
      ...draft.nodes.find((node) => node.id === "trigger")!,
      id: "entry-start",
      position: { x: 640, y: 0 },
    };
    const looseWaitNode = {
      ...createNodeFromKind("wait", "loose-wait", 1),
      position: { x: 0, y: 0 },
    };
    const operation = arrangeNodesOperation({
      edges: [],
      nodes: [looseWaitNode, entryNode],
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    const positionById = new Map(operation!.draft.nodes.map((node) => [node.id, node.position]));

    expect(positionById.get("entry-start")?.y).toBeLessThan(positionById.get("loose-wait")?.y ?? 0);
  });
});
