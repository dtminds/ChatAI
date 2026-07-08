import { describe, expect, it, vi } from "vitest";
import {
  WORKFLOW_EDGE_TYPE,
  WORKFLOW_NODE_TYPE,
} from "@/pages/chat/ai-hosting/workflow/constants";
import {
  hydrateWorkflowDraft,
  isWorkflowDraftEqual,
  isWorkflowGraphEqual,
  sanitizeDraft,
} from "@/pages/chat/ai-hosting/workflow/workflow-draft-normalizer";
import { DEFAULT_WORKFLOW_VIEWPORT } from "@/pages/chat/ai-hosting/workflow/graph";
import { createEdge } from "@/pages/chat/ai-hosting/workflow/graph";
import { createDefaultNodeData } from "@/pages/chat/ai-hosting/workflow/node-definitions";
import type {
  WorkflowDraft,
  WorkflowEdge,
  WorkflowNode,
} from "@/pages/chat/ai-hosting/workflow/types";

function createRuntimeDraft(index = 0): WorkflowDraft {
  const node: WorkflowNode = {
    data: {
      insertMenuOpen: true,
      kind: "action",
      label: "营销动作",
      metric: "已发送",
      onRuntimeInspect: vi.fn(),
      onDelete: vi.fn(),
      onDuplicate: vi.fn(),
      onInsertAfter: vi.fn(),
      onSelect: vi.fn(),
      onToggleInsertMenu: vi.fn(),
      selected: true,
      status: "ready",
      summary: "发送消息",
      title: `发送消息 ${index}`,
      _connectedSourceHandleIds: ["source"],
      _runtimeStatus: "hovered",
    },
    id: "action-message",
    position: { x: index, y: 0 },
    selected: true,
    type: WORKFLOW_NODE_TYPE,
    zIndex: 20,
  };
  const edge: WorkflowEdge = {
    data: {
      highlightState: "connected",
      insertMenuOpen: true,
      label: "高意向",
      onInsertBetween: vi.fn(),
      onRuntimeInspect: vi.fn(),
      onToggleInsertMenu: vi.fn(),
      _runtimeEdgeState: "selected",
    },
    id: "edge-1",
    selected: true,
    source: "action-message",
    target: "goal",
    type: WORKFLOW_EDGE_TYPE,
  };

  return {
    edges: [edge],
    nodes: [node],
    viewport: {
      x: 120,
      y: 240,
      zoom: 1.25,
    },
  };
}

describe("workflow draft normalizer", () => {
  it("removes runtime-only node and edge state from persistable drafts", () => {
    const sanitizedDraft = sanitizeDraft(createRuntimeDraft());

    expect(sanitizedDraft.nodes[0].selected).toBe(false);
    expect(sanitizedDraft.nodes[0].zIndex).toBeUndefined();
    expect(sanitizedDraft.nodes[0].data.selected).toBeUndefined();
    expect(sanitizedDraft.nodes[0].data.onDelete).toBeUndefined();
    expect(sanitizedDraft.nodes[0].data.onDuplicate).toBeUndefined();
    expect(sanitizedDraft.nodes[0].data.onInsertAfter).toBeUndefined();
    expect(sanitizedDraft.nodes[0].data.onToggleInsertMenu).toBeUndefined();
    expect(sanitizedDraft.nodes[0].data.onRuntimeInspect).toBeUndefined();
    expect(sanitizedDraft.nodes[0].data._connectedSourceHandleIds).toBeUndefined();
    expect(sanitizedDraft.nodes[0].data._runtimeStatus).toBeUndefined();
    expect(sanitizedDraft.edges[0].selected).toBe(false);
    expect(sanitizedDraft.edges[0].data?.highlightState).toBeUndefined();
    expect(sanitizedDraft.edges[0].data?.insertMenuOpen).toBeUndefined();
    expect(sanitizedDraft.edges[0].data?.onInsertBetween).toBeUndefined();
    expect(sanitizedDraft.edges[0].data?.onRuntimeInspect).toBeUndefined();
    expect(sanitizedDraft.edges[0].data?._runtimeEdgeState).toBeUndefined();
    expect(sanitizedDraft.viewport).toEqual({ x: 120, y: 240, zoom: 1.25 });
  });

  it("normalizes missing or invalid viewport values to the workflow default", () => {
    expect(sanitizeDraft({
      ...createRuntimeDraft(),
      viewport: {
        x: Number.NaN,
        y: Number.POSITIVE_INFINITY,
        zoom: undefined as unknown as number,
      },
    }).viewport).toEqual(DEFAULT_WORKFLOW_VIEWPORT);
  });

  it("hydrates legacy and untrusted workflow drafts before they enter the canvas", () => {
    const hydratedDraft = hydrateWorkflowDraft({
      edges: [
        {
          id: "edge-valid",
          selected: true,
          source: "wait-1",
          target: "action-1",
        } as WorkflowEdge,
        {
          id: "edge-missing-target",
          source: "wait-1",
          target: "missing",
        } as WorkflowEdge,
      ],
      nodes: [
        {
          data: {
            kind: "wait",
            title: "旧等待节点",
          },
          id: "wait-1",
          position: { x: 10, y: 20 },
        } as WorkflowNode,
        {
          data: {
            kind: "action",
            title: "旧动作节点",
          },
          id: "action-1",
          position: { x: 300, y: 20 },
        } as WorkflowNode,
        {
          data: {
            kind: "unknown",
          },
          id: "unknown",
          position: { x: 0, y: 0 },
        } as unknown as WorkflowNode,
      ],
    });

    expect(hydratedDraft.viewport).toEqual(DEFAULT_WORKFLOW_VIEWPORT);
    expect(hydratedDraft.nodes.map((node) => node.id)).toEqual(["wait-1", "action-1"]);
    expect(hydratedDraft.nodes[0]).toEqual(expect.objectContaining({
      selected: false,
      type: WORKFLOW_NODE_TYPE,
    }));
    expect(hydratedDraft.nodes[0].data).toEqual(expect.objectContaining({
      delayDays: 1,
      kind: "wait",
      label: "等待",
      title: "旧等待节点",
    }));
    expect(hydratedDraft.edges).toEqual([
      expect.objectContaining({
        id: "edge-valid",
        selected: false,
        source: "wait-1",
        target: "action-1",
        type: WORKFLOW_EDGE_TYPE,
      }),
    ]);
  });

  it("drops duplicate node ids before hydrating edges", () => {
    const hydratedDraft = hydrateWorkflowDraft({
      edges: [
        {
          id: "edge-valid",
          source: "wait-1",
          target: "action-1",
        } as WorkflowEdge,
      ],
      nodes: [
        {
          data: {
            kind: "wait",
            title: "保留的等待节点",
          },
          id: "wait-1",
          position: { x: 10, y: 20 },
        } as WorkflowNode,
        {
          data: {
            kind: "wait",
            title: "重复等待节点",
          },
          id: "wait-1",
          position: { x: 999, y: 999 },
        } as WorkflowNode,
        {
          data: {
            kind: "action",
            title: "动作节点",
          },
          id: "action-1",
          position: { x: 300, y: 20 },
        } as WorkflowNode,
      ],
    });

    expect(hydratedDraft.nodes.map((node) => node.id)).toEqual(["wait-1", "action-1"]);
    expect(hydratedDraft.nodes.find((node) => node.id === "wait-1")?.data.title)
      .toBe("保留的等待节点");
    expect(hydratedDraft.edges.map((edge) => edge.id)).toEqual(["edge-valid"]);
  });

  it("normalizes branch paths at the draft boundary", () => {
    const hydratedDraft = hydrateWorkflowDraft({
      edges: [],
      nodes: [
        {
          data: {
            ...createDefaultNodeData("branch"),
            branchPaths: [
              { id: "branch-custom", label: "自定义分支", operator: "ELIF", title: "错误标题" },
              { id: "branch-custom", label: "重复分支", operator: "ELIF", title: "重复标题" },
            ],
          },
          id: "branch-1",
          position: { x: 10, y: 20 },
          type: WORKFLOW_NODE_TYPE,
        } as WorkflowNode,
        {
          data: {
            ...createDefaultNodeData("action"),
            branchPaths: [
              { id: "branch-leaked", label: "不应保留", operator: "IF", title: "CASE 1" },
            ],
          },
          id: "action-1",
          position: { x: 300, y: 20 },
          type: WORKFLOW_NODE_TYPE,
        } as WorkflowNode,
      ],
    });

    expect(hydratedDraft.nodes.find((node) => node.id === "branch-1")?.data.branchPaths)
      .toEqual([
        { id: "branch-custom", isDefault: undefined, label: "自定义分支", operator: "IF", title: "CASE 1" },
        { id: "branch-default", isDefault: true, label: "默认路径", operator: "ELSE", title: "CASE 2" },
      ]);
    expect(hydratedDraft.nodes.find((node) => node.id === "action-1")?.data.branchPaths)
      .toBeUndefined();
  });

  it("filters edges that violate the workflow connection policy while hydrating drafts", () => {
    const triggerNode: WorkflowNode = {
      data: {
        kind: "trigger",
        label: "触发",
        metric: "进入 1 人",
        status: "ready",
        summary: "进入流程",
        title: "触发节点",
      },
      id: "trigger",
      position: { x: 0, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    };
    const waitNode: WorkflowNode = {
      data: {
        kind: "wait",
        label: "等待",
        metric: "等待 1 天",
        status: "ready",
        summary: "等待后继续",
        title: "等待节点",
      },
      id: "wait",
      position: { x: 300, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    };
    const actionNode: WorkflowNode = {
      data: {
        actionType: "message",
        kind: "action",
        label: "发送消息",
        metric: "欢迎语",
        status: "ready",
        summary: "发送欢迎语",
        title: "动作节点",
      },
      id: "action",
      position: { x: 600, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    };
    const hydratedDraft = hydrateWorkflowDraft({
      edges: [
        createEdge("trigger", "wait"),
        createEdge("wait", "action"),
        createEdge("action", "wait"),
        createEdge("wait", "trigger"),
        createEdge("trigger", "wait"),
      ],
      nodes: [triggerNode, waitNode, actionNode],
      viewport: DEFAULT_WORKFLOW_VIEWPORT,
    });

    expect(hydratedDraft.edges.map((edge) => edge.id)).toEqual([
      "edge-trigger-wait",
      "edge-wait-action",
    ]);
  });

  it("filters edges whose handles are not declared by their source node", () => {
    const branchNode: WorkflowNode = {
      data: {
        ...createDefaultNodeData("branch"),
        branchPaths: [
          { id: "branch-high", label: "高意向客户", operator: "IF", title: "CASE 1" },
          { id: "branch-default", isDefault: true, label: "默认路径", operator: "ELSE", title: "CASE 2" },
        ],
      },
      id: "branch",
      position: { x: 0, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    };
    const actionNode: WorkflowNode = {
      data: createDefaultNodeData("action"),
      id: "action",
      position: { x: 300, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    };
    const goalNode: WorkflowNode = {
      data: createDefaultNodeData("goal"),
      id: "goal",
      position: { x: 600, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    };
    const hydratedDraft = hydrateWorkflowDraft({
      edges: [
        createEdge("branch", "action", "高意向客户", { sourceHandle: "branch-high" }),
        createEdge("branch", "goal", "已删除分支", { sourceHandle: "branch-deleted" }),
        createEdge("action", "goal", undefined, { sourceHandle: "branch-high" }),
        createEdge("action", "goal", undefined, { targetHandle: "target-custom" }),
      ],
      nodes: [branchNode, actionNode, goalNode],
      viewport: DEFAULT_WORKFLOW_VIEWPORT,
    });

    expect(hydratedDraft.edges.map((edge) => edge.id)).toEqual([
      "edge-branch-branch-high-action",
    ]);
  });

  it("compares normalized workflow draft snapshots by graph content", () => {
    expect(isWorkflowDraftEqual(sanitizeDraft(createRuntimeDraft()), sanitizeDraft(createRuntimeDraft()))).toBe(true);
    expect(isWorkflowDraftEqual(sanitizeDraft(createRuntimeDraft()), sanitizeDraft(createRuntimeDraft(10)))).toBe(false);
  });

  it("compares graph history content separately from viewport state", () => {
    const firstDraft = sanitizeDraft(createRuntimeDraft());
    const secondDraft = {
      ...firstDraft,
      viewport: { x: 420, y: 160, zoom: 0.8 },
    };

    expect(isWorkflowDraftEqual(firstDraft, secondDraft)).toBe(false);
    expect(isWorkflowGraphEqual(firstDraft, secondDraft)).toBe(true);
    expect(isWorkflowGraphEqual(firstDraft, sanitizeDraft(createRuntimeDraft(10)))).toBe(false);
  });
});
