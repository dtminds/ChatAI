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
  renameNodeOperation,
  updateNodeDataOperation,
} from "@/pages/chat/workflow/graph-operations";
import { createWorkflowClipboardData } from "@/pages/chat/workflow/workflow-clipboard";
import {
  WORKFLOW_EDGE_TYPE,
  WORKFLOW_LAYOUT_X_GAP,
} from "@/pages/chat/workflow/constants";
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
  it("does not add or delete the unique start and end kinds", () => {
    const draft = createDraft();

    expect(addNodeOperation(draft, "start", "another-start")).toBeUndefined();
    expect(addNodeOperation(draft, "end", "another-end")).toBeUndefined();
    expect(deleteNodeOperation(draft, "start")).toBeUndefined();
    expect(deleteNodeOperation(draft, "end")).toBeUndefined();
  });

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
      edgeId: "edge-branch-intent-branch-high-message-welcome",
      nodeId: "wait-low",
    });
    expect(operation!.draft.edges.some((edge) => edge.id === "edge-branch-intent-branch-high-message-welcome"))
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
          target: "message-welcome",
        }),
      ]),
    );
    expect(operation!.draft.nodes.find((node) => node.id === "message-welcome")?.position.x)
      .toBe(WORKFLOW_LAYOUT_X_GAP * 3 + WORKFLOW_LAYOUT_X_GAP);
  });

  it("inserts after an empty source handle without auto-connecting a downstream end", () => {
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
      edge.source === "wait-normal" && edge.target === "end",
    )).toBe(false);
    expect(operation!.draft.edges.filter((edge) => edge.target === "end")).toHaveLength(1);
  });

  it("replaces default-handle edges when inserting after imported null handles", () => {
    const draft = createDraft();
    const operation = insertNodeAfterOperation({
      ...draft,
      edges: draft.edges.map((edge) =>
        edge.source === "start" && edge.target === "wait-2d"
          ? { ...edge, sourceHandle: null, targetHandle: null }
          : edge,
      ),
    }, "start", "handoff", "handoff-entry");

    expect(operation?.event).toBe("node:insert");
    expect(operation?.draft.edges.some((edge) =>
      edge.source === "start" && edge.target === "wait-2d",
    )).toBe(false);
    expect(operation?.draft.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: "start",
        sourceHandle: undefined,
        target: "handoff-entry",
      }),
      expect.objectContaining({
        source: "handoff-entry",
        target: "wait-2d",
        targetHandle: undefined,
      }),
    ]));
  });

  it("inserts a node between an edge while preserving handle metadata", () => {
    expect(insertNodeBetweenOperation(
      createDraft(),
      "edge-branch-intent-branch-high-message-welcome",
      "branch-intent",
      "message-welcome",
      "handoff",
      "wait-2d",
    )).toBeUndefined();

    const operation = insertNodeBetweenOperation(
      createDraft(),
      "edge-branch-intent-branch-high-message-welcome",
      "branch-intent",
      "message-welcome",
      "handoff",
      "handoff-high",
    );

    expect(operation).toBeDefined();
    expect(operation!.event).toBe("node:insert");
    expect(operation!.meta).toEqual(expect.objectContaining({
      edgeId: "edge-branch-intent-branch-high-message-welcome",
      nodeId: "handoff-high",
    }));
    expect(operation!.draft.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "branch-intent",
          sourceHandle: "branch-high",
          target: "handoff-high",
          targetHandle: undefined,
        }),
        expect.objectContaining({
          source: "handoff-high",
          target: "message-welcome",
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
    expect(addNodeOperation(createDraft(), "start", "start-copy")).toBeUndefined();
    expect(addNodeOperation(createDraft(), "handoff", "wait-2d")).toBeUndefined();

    const draft = createDraft();
    const operation = addNodeOperation(draft, "handoff", "handoff-tail");

    expect(operation?.event).toBe("node:add");
    expect(operation?.draft.edges.map((edge) => edge.id)).toEqual(draft.edges.map((edge) => edge.id));
    expect(operation?.draft.edges.some((edge) => edge.source === "handoff-tail" || edge.target === "handoff-tail"))
      .toBe(false);
    expect(operation?.draft.nodes.find((node) => node.id === "handoff-tail")?.position)
      .toEqual({ x: 395, y: -293 });
  });

  it("connects valid handles once and rejects invalid or occupied handles", () => {
    const draft = createDraft();
    expect(connectNodesOperation(draft, {
      source: "wait-2d",
      sourceHandle: null,
      target: "end",
      targetHandle: null,
    })).toBeUndefined();

    const reconnectableDraft = {
      ...draft,
      edges: draft.edges.filter((edge) =>
        edge.source !== "wait-2d" && edge.target !== "message-welcome",
      ),
    };
    const operation = connectNodesOperation(reconnectableDraft, {
      source: "wait-2d",
      sourceHandle: null,
      target: "message-welcome",
      targetHandle: null,
    });

    expect(operation?.event).toBe("edge:connect");
    expect(operation?.result?.edgeId).toBe("edge-wait-2d-message-welcome");
    expect(connectNodesOperation(operation!.draft, {
      source: "wait-2d",
      sourceHandle: null,
      target: "message-welcome",
      targetHandle: null,
    })).toBeUndefined();
    const endMergeOperation = connectNodesOperation(draft, {
      source: "branch-intent",
      sourceHandle: "branch-normal",
      target: "end",
      targetHandle: null,
    });
    expect(endMergeOperation?.result?.edgeId).toBe("edge-branch-intent-branch-normal-end");

    const branchReconnectableDraft = {
      ...draft,
      edges: draft.edges.filter((edge) => edge.id !== "edge-branch-intent-branch-high-message-welcome"),
      nodes: [
        ...draft.nodes,
        createNodeFromKind("message", "message-normal", 10),
      ],
    };
    const branchOperation = connectNodesOperation(branchReconnectableDraft, {
      source: "branch-intent",
      sourceHandle: "branch-normal",
      target: "message-normal",
      targetHandle: null,
    });

    expect(branchOperation?.result?.edgeId).toBe("edge-branch-intent-branch-normal-message-normal");
    expect(connectNodesOperation(branchOperation!.draft, {
      source: "branch-intent",
      sourceHandle: "branch-normal",
      target: "message-welcome",
      targetHandle: null,
    })).toBeUndefined();
    expect(connectNodesOperation(draft, {
      source: "wait-2d",
      sourceHandle: null,
      target: "wait-2d",
      targetHandle: null,
    })).toBeUndefined();
    expect(connectNodesOperation(draft, {
      source: "end",
      sourceHandle: null,
      target: "wait-2d",
      targetHandle: null,
    })).toBeUndefined();
    expect(connectNodesOperation(draft, {
      source: "wait-2d",
      sourceHandle: null,
      target: "start",
      targetHandle: null,
    })).toBeUndefined();
    expect(connectNodesOperation(draft, {
      source: "branch-intent",
      sourceHandle: "branch-missing",
      target: "end",
      targetHandle: null,
    })).toBeUndefined();
    expect(connectNodesOperation(draft, {
      source: "wait-2d",
      sourceHandle: "branch-high",
      target: "end",
      targetHandle: null,
    })).toBeUndefined();
    expect(connectNodesOperation(draft, {
      source: "wait-2d",
      sourceHandle: null,
      target: "end",
      targetHandle: "target-custom",
    })).toBeUndefined();
  });

  it("deletes one or more edges as a graph operation", () => {
    const draft = createDraft();
    const operation = deleteEdgesOperation(draft, [
      "edge-wait-2d-branch-intent",
      "edge-message-welcome-end",
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
    expect(operation?.draft.edges.some((edge) => edge.id === "edge-message-welcome-end")).toBe(false);
    expect(operation?.draft.edges.some((edge) => edge.id === "edge-branch-intent-branch-high-message-welcome"))
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
      "end" as Parameters<typeof insertNodeAfterOperation>[2],
      "end-extra",
    )).toBeUndefined();
    expect(insertNodeBetweenOperation(
      draft,
      "edge-wait-2d-branch-intent",
      "wait-2d",
      "branch-intent",
      "start" as Parameters<typeof insertNodeBetweenOperation>[4],
      "start-extra",
    )).toBeUndefined();
    expect(insertNodeAfterOperation(
      draft,
      "missing-node",
      "wait",
      "wait-missing",
    )).toBeUndefined();
    expect(insertNodeAfterOperation(
      draft,
      "end",
      "wait",
      "wait-after-end",
    )).toBeUndefined();
    expect(insertNodeAfterOperation(
      draft,
      "wait-2d",
      "handoff",
      "handoff-extra",
      "branch-high",
    )).toBeUndefined();
    expect(insertNodeBetweenOperation(
      draft,
      "missing-edge",
      "wait-2d",
      "end",
      "handoff",
      "handoff-missing-edge",
    )).toBeUndefined();
    expect(insertNodeBetweenOperation(
      draft,
      "edge-wait-2d-branch-intent",
      "start",
      "branch-intent",
      "handoff",
      "handoff-mismatch",
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
        createEdge("wait-2d", "end"),
        createEdge("wait-2d", "end"),
        {
          ...createEdge("missing", "end"),
          id: "edge-missing-end",
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
    expect(operation?.draft.edges.some((edge) => edge.id === "edge-wait-2d-end")).toBe(false);
    expect(operation?.draft.edges.some((edge) => edge.id === "edge-missing-end")).toBe(false);
    expect(operation?.draft.edges.every((edge) => edge.type === WORKFLOW_EDGE_TYPE)).toBe(true);
  });

  it("rejects connections that would create cycles", () => {
    expect(connectNodesOperation(createDraft(), {
      source: "message-welcome",
      sourceHandle: null,
      target: "wait-2d",
      targetHandle: null,
    })).toBeUndefined();
  });

  it("deletes editable nodes with connected edges and keeps terminal nodes protected", () => {
    const operation = deleteNodeOperation(createDraft(), "message-welcome");

    expect(operation?.event).toBe("node:delete");
    expect(operation?.draft.nodes.some((node) => node.id === "message-welcome")).toBe(false);
    expect(operation?.draft.edges.some((edge) => edge.source === "message-welcome" || edge.target === "message-welcome"))
      .toBe(false);
    expect(deleteNodeOperation(createDraft(), "start")).toBeUndefined();
    expect(deleteNodeOperation(createDraft(), "end")).toBeUndefined();
  });

  it("deletes multiple editable nodes in one atomic operation", () => {
    const operation = deleteNodesOperation(createDraft(), ["wait-2d", "message-welcome"]);

    expect(operation?.event).toBe("node:delete");
    expect(operation?.result?.nodeIds).toEqual(["wait-2d", "message-welcome"]);
    expect(operation?.draft.nodes.map((node) => node.id)).not.toContain("wait-2d");
    expect(operation?.draft.nodes.map((node) => node.id)).not.toContain("message-welcome");
    expect(operation?.draft.edges.some((edge) =>
      edge.source === "wait-2d"
      || edge.target === "wait-2d"
      || edge.source === "message-welcome"
      || edge.target === "message-welcome",
    )).toBe(false);
  });

  it("rejects batched node deletion when any requested node is missing or protected", () => {
    expect(deleteNodesOperation(createDraft(), ["start", "wait-2d"])).toBeUndefined();
    expect(deleteNodesOperation(createDraft(), ["end", "message-welcome"])).toBeUndefined();
    expect(deleteNodesOperation(createDraft(), ["missing-node", "message-welcome"])).toBeUndefined();
  });

  it("duplicates nodes with a unique title and without carrying selection runtime state", () => {
    const draft = createDraft();
    expect(duplicateNodeOperation(draft, "message-welcome", "wait-2d")).toBeUndefined();

    const operation = duplicateNodeOperation({
      ...draft,
      nodes: draft.nodes.map((node) =>
        node.id === "message-welcome"
          ? { ...node, selected: true, zIndex: 20 }
          : node,
      ),
    }, "message-welcome", "message-copy");

    const duplicatedNode = operation?.draft.nodes.find((node) => node.id === "message-copy");

    expect(operation?.event).toBe("node:duplicate");
    expect(duplicatedNode?.data.title).toBe("发送欢迎消息 (1)");
    expect(duplicatedNode?.selected).toBe(false);
    expect(duplicatedNode?.zIndex).toBeUndefined();
  });

  it("pastes clipboard nodes as a graph operation", () => {
    const draft = createDraft();
    const clipboardData = createWorkflowClipboardData(draft, ["message-welcome"])!;
    const operation = pasteClipboardOperation(draft, clipboardData, {
      nodeIdFactory: (kind, index) => `${kind}-paste-${index}`,
    });

    expect(operation?.event).toBe("node:paste");
    expect(operation?.result).toEqual({ nodeId: "message-paste-0" });
    expect(operation?.draft.nodes.some((node) => node.id === "message-paste-0")).toBe(true);
    expect(operation?.draft.nodes.find((node) => node.id === "message-paste-0")?.data.title)
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
    expect(operation?.draft.nodes.find((node) => node.id === "start")?.position)
      .toEqual(draft.nodes.find((node) => node.id === "start")?.position);
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
      duration: 5,
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
    expect(operation?.draft.nodes.find((node) => node.id === "wait-2d")?.data.duration).toBe(5);
    expect(updateNodeDataOperation(draft, "missing", { title: "missing" })).toBeUndefined();
    expect(updateNodeDataOperation(draft, "wait-2d", {
      duration: draft.nodes.find((node) => node.id === "wait-2d")?.data.duration,
    })).toBeUndefined();
  });

  it("renames editable nodes and rejects protected or empty names", () => {
    const draft = createDraft();
    const operation = renameNodeOperation(draft, "wait-2d", "  等待复购  ");

    expect(operation?.event).toBe("node:rename");
    expect(operation?.draft.nodes.find((node) => node.id === "wait-2d")?.data.title)
      .toBe("等待复购");
    expect(renameNodeOperation(draft, "start", "新的开始")).toBeUndefined();
    expect(renameNodeOperation(draft, "end", "新的结束")).toBeUndefined();
    expect(renameNodeOperation(draft, "wait-2d", "   ")).toBeUndefined();
  });

  it("does not rename protected nodes through generic config patches", () => {
    const draft = createDraft();

    expect(updateNodeDataOperation(draft, "start", { title: "新的开始" }))
      .toBeUndefined();
    expect(updateNodeDataOperation(draft, "end", { title: "新的结束" }))
      .toBeUndefined();
  });

  it("keeps node kind and schema version immutable when applying config patches", () => {
    const draft = createDraft();
    const operation = updateNodeDataOperation(draft, "wait-2d", {
      kind: "end",
      schemaVersion: 999,
      title: "仍然是等待节点",
    } as unknown as Parameters<typeof updateNodeDataOperation>[2]);

    const updatedNode = operation?.draft.nodes.find((node) => node.id === "wait-2d");

    expect(updatedNode?.data.kind).toBe("wait");
    expect(updatedNode?.data.schemaVersion).toBe(1);
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
        createEdge("branch-intent", "message-welcome", "低意向", {
          sourceHandle: "branch-low",
        }),
      ],
    }, {
      source: "branch-intent",
      sourceHandle: "branch-low",
      target: "end",
      targetHandle: null,
    });

    expect(operation).toBeUndefined();
  });

  it("arranges nodes by graph topology instead of node creation order", () => {
    const draft = createDraft();
    const insertedNode = createNodeFromKind("handoff", "handoff-mid", 99);
    const operation = arrangeNodesOperation({
      ...draft,
      edges: [
        createEdge("start", "wait-2d"),
        createEdge("wait-2d", "handoff-mid"),
        createEdge("handoff-mid", "branch-intent"),
        createEdge("branch-intent", "message-welcome", "高意向", {
          sourceHandle: "branch-high",
        }),
        createEdge("message-welcome", "end"),
      ],
      nodes: [...draft.nodes, insertedNode],
    });

    const positionById = new Map(operation!.draft.nodes.map((node) => [node.id, node.position]));

    expect(operation?.event).toBe("layout:organize");
    expect(positionById.get("start")?.x).toBeLessThan(positionById.get("wait-2d")?.x ?? 0);
    expect(positionById.get("wait-2d")?.x).toBeLessThan(positionById.get("handoff-mid")?.x ?? 0);
    expect(positionById.get("handoff-mid")?.x).toBeLessThan(positionById.get("branch-intent")?.x ?? 0);
    expect(positionById.get("branch-intent")?.x).toBeLessThan(positionById.get("message-welcome")?.x ?? 0);
  });

  it("skips auto arrange operations when the layout is already current", () => {
    const draft = createDraft();
    const arrangedOperation = arrangeNodesOperation(draft);

    expect(arrangedOperation).toBeDefined();
    expect(arrangeNodesOperation(arrangedOperation!.draft)).toBeUndefined();
  });

  it("arranges branch targets by their source handle order", () => {
    const draft = createDraft();
    const normalNode = createNodeFromKind("message", "message-normal", 10);
    const defaultNode = createNodeFromKind("message", "message-default", 11);
    const operation = arrangeNodesOperation({
      ...draft,
      edges: [
        createEdge("start", "wait-2d"),
        createEdge("wait-2d", "branch-intent"),
        createEdge("branch-intent", "message-default", "默认路径", {
          sourceHandle: "branch-default",
        }),
        createEdge("branch-intent", "message-welcome", "高意向", {
          sourceHandle: "branch-high",
        }),
        createEdge("branch-intent", "message-normal", "普通客户", {
          sourceHandle: "branch-normal",
        }),
      ],
      nodes: [...draft.nodes, defaultNode, normalNode],
    });

    expect(operation).toBeDefined();
    const positionById = new Map(operation!.draft.nodes.map((node) => [node.id, node.position]));

    expect(positionById.get("message-welcome")?.x).toBe(positionById.get("message-normal")?.x);
    expect(positionById.get("message-normal")?.x).toBe(positionById.get("message-default")?.x);
    expect(positionById.get("message-welcome")?.y).toBeLessThan(positionById.get("message-normal")?.y ?? 0);
    expect(positionById.get("message-normal")?.y).toBeLessThan(positionById.get("message-default")?.y ?? 0);
  });

  it("arranges branch targets by branch path order from node data", () => {
    const draft = createDraft();
    const firstNode = createNodeFromKind("message", "message-first", 10);
    const secondNode = createNodeFromKind("message", "message-second", 11);
    const fallbackNode = createNodeFromKind("message", "message-fallback", 12);
    const branchPaths: WorkflowBranchPath[] = [
      { id: "branch-first", label: "第一路径", operator: "IF", title: "CASE 1" },
      { id: "branch-second", label: "第二路径", operator: "ELIF", title: "CASE 2" },
      { id: "branch-fallback", isDefault: true, label: "兜底", operator: "ELSE", title: "CASE 3" },
    ];
    const operation = arrangeNodesOperation({
      ...draft,
      edges: [
        createEdge("start", "wait-2d"),
        createEdge("wait-2d", "branch-intent"),
        createEdge("branch-intent", "message-fallback", "兜底", {
          sourceHandle: "branch-fallback",
        }),
        createEdge("branch-intent", "message-second", "第二路径", {
          sourceHandle: "branch-second",
        }),
        createEdge("branch-intent", "message-first", "第一路径", {
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

    expect(positionById.get("message-first")?.y).toBeLessThan(positionById.get("message-second")?.y ?? 0);
    expect(positionById.get("message-second")?.y).toBeLessThan(positionById.get("message-fallback")?.y ?? 0);
  });

  it("prioritizes entry nodes by role during layout instead of a fixed node id", () => {
    const draft = createDraft();
    const entryNode = {
      ...draft.nodes.find((node) => node.id === "start")!,
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
