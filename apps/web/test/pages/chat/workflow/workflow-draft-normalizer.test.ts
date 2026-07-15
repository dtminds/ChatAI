import { describe, expect, it, vi } from "vitest";
import {
  WORKFLOW_EDGE_TYPE,
  WORKFLOW_NODE_TYPE,
} from "@/pages/chat/workflow/constants";
import {
  hydrateWorkflowDraft,
  isWorkflowDraftEqual,
  isWorkflowGraphEqual,
  sanitizeDraft,
} from "@/pages/chat/workflow/workflow-draft-normalizer";
import { DEFAULT_WORKFLOW_VIEWPORT } from "@/pages/chat/workflow/graph";
import { createEdge } from "@/pages/chat/workflow/graph";
import {
  createDefaultNodeData,
  getNodeDefinitionCore,
} from "@/pages/chat/workflow/node-definitions";
import type {
  WorkflowDraft,
  WorkflowEdge,
  WorkflowNode,
} from "@/pages/chat/workflow/types";

function createRuntimeDraft(index = 0): WorkflowDraft {
  const node: WorkflowNode = {
    data: {
      ...createDefaultNodeData("message"),
      insertMenuOpen: true,
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
      title: `发送消息 ${index}`,
      deliveryOptions: {
        _runtimePreview: "open",
        onPreview: vi.fn(),
        quietHours: ["22:00", "08:00"],
      },
      segments: [
        {
          _runtimeMatched: true,
          name: "高意向",
          onInspect: vi.fn(),
        },
      ],
      _connectedSourceHandleIds: ["source"],
      _runtimeStatus: "hovered",
    },
    id: "message-welcome",
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
      routeMeta: {
        _runtimeHovered: true,
        label: "分支",
        onInspect: vi.fn(),
      },
    },
    id: "edge-1",
    selected: true,
    source: "message-welcome",
    target: "end",
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
  it("clamps legacy rolling entry windows to 90 days during hydration", () => {
    const startData = createDefaultNodeData("start");
    const draft = hydrateWorkflowDraft({
      edges: [],
      nodes: [{
        data: {
          ...startData,
          entryPolicy: {
            maxEntries: 2,
            mode: "rolling_window",
            windowSize: 365,
            windowUnit: "day",
          },
        },
        id: "start",
        position: { x: 0, y: 0 },
      }],
      viewport: DEFAULT_WORKFLOW_VIEWPORT,
    });

    expect(draft.nodes[0]?.data).toMatchObject({
      entryPolicy: {
        maxEntries: 2,
        mode: "rolling_window",
        windowSize: 90,
        windowUnit: "day",
      },
    });
  });

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
    expect(sanitizedDraft.nodes[0].data.deliveryOptions).toEqual({
      quietHours: ["22:00", "08:00"],
    });
    expect(sanitizedDraft.nodes[0].data.segments).toEqual([
      {
        name: "高意向",
      },
    ]);
    expect(sanitizedDraft.edges[0].selected).toBe(false);
    expect(sanitizedDraft.edges[0].data?.highlightState).toBeUndefined();
    expect(sanitizedDraft.edges[0].data?.insertMenuOpen).toBeUndefined();
    expect(sanitizedDraft.edges[0].data?.onInsertBetween).toBeUndefined();
    expect(sanitizedDraft.edges[0].data?.onRuntimeInspect).toBeUndefined();
    expect(sanitizedDraft.edges[0].data?._runtimeEdgeState).toBeUndefined();
    expect(sanitizedDraft.edges[0].data?.routeMeta).toEqual({
      label: "分支",
    });
    expect(sanitizedDraft.viewport).toEqual({ x: 120, y: 240, zoom: 1.25 });
  });

  it("removes React Flow render-only fields from canonical draft records", () => {
    const sanitizedDraft = sanitizeDraft({
      edges: [
        {
          ...createRuntimeDraft().edges[0],
          animated: true,
          hidden: true,
          interactionWidth: 32,
          markerEnd: "arrow",
          style: { stroke: "red" },
        } as unknown as WorkflowEdge,
      ],
      nodes: [
        {
          ...createRuntimeDraft().nodes[0],
          dragging: true,
          measured: { height: 120, width: 240 },
          resizing: true,
          style: { opacity: 0.5 },
          width: 240,
        } as unknown as WorkflowNode,
      ],
      viewport: DEFAULT_WORKFLOW_VIEWPORT,
    });
    const sanitizedNode = sanitizedDraft.nodes[0] as WorkflowNode & Record<string, unknown>;
    const sanitizedEdge = sanitizedDraft.edges[0] as WorkflowEdge & Record<string, unknown>;

    expect(sanitizedNode).toEqual({
      data: expect.objectContaining({
        kind: "message",
        title: "发送消息 0",
      }),
      id: "message-welcome",
      position: { x: 0, y: 0 },
      selected: false,
      type: WORKFLOW_NODE_TYPE,
      zIndex: undefined,
    });
    expect(sanitizedNode.dragging).toBeUndefined();
    expect(sanitizedNode.measured).toBeUndefined();
    expect(sanitizedNode.resizing).toBeUndefined();
    expect(sanitizedNode.style).toBeUndefined();
    expect(sanitizedNode.width).toBeUndefined();
    expect(sanitizedEdge).toEqual({
      data: expect.objectContaining({
        label: "高意向",
      }),
      id: "edge-1",
      selected: false,
      source: "message-welcome",
      sourceHandle: undefined,
      target: "end",
      targetHandle: undefined,
      type: WORKFLOW_EDGE_TYPE,
    });
    expect(sanitizedEdge.animated).toBeUndefined();
    expect(sanitizedEdge.hidden).toBeUndefined();
    expect(sanitizedEdge.interactionWidth).toBeUndefined();
    expect(sanitizedEdge.markerEnd).toBeUndefined();
    expect(sanitizedEdge.style).toBeUndefined();
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

  it("hydrates untrusted workflow drafts before they enter the canvas", () => {
    const hydratedDraft = hydrateWorkflowDraft({
      edges: [
        {
          id: "edge-valid",
          selected: true,
          source: "wait-1",
          target: "message-1",
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
            duration: 7,
            kind: "wait",
            mode: "duration",
            selected: true,
            title: "外部等待节点",
            unit: "day",
          },
          id: "wait-1",
          position: { x: 10, y: 20 },
        },
        {
          data: {
            kind: "message",
            title: "外部消息节点",
          },
          id: "message-1",
          position: { x: 300, y: 20 },
        },
        {
          data: {
            kind: "unknown",
          },
          id: "unknown",
          position: { x: 0, y: 0 },
        },
      ],
    });

    expect(hydratedDraft.viewport).toEqual(DEFAULT_WORKFLOW_VIEWPORT);
    expect(hydratedDraft.nodes.map((node) => node.id)).toEqual(["wait-1", "message-1"]);
    expect(hydratedDraft.nodes[0]).toEqual(expect.objectContaining({
      selected: false,
      type: WORKFLOW_NODE_TYPE,
    }));
    expect(hydratedDraft.nodes[0].data).toEqual(expect.objectContaining({
      duration: 7,
      kind: "wait",
      label: "等待",
      mode: "duration",
      schemaVersion: 1,
      title: "外部等待节点",
    }));
    expect(hydratedDraft.nodes[0].data.selected).toBeUndefined();
    expect(hydratedDraft.edges).toEqual([
      expect.objectContaining({
        id: "edge-valid",
        selected: false,
        source: "wait-1",
        target: "message-1",
        type: WORKFLOW_EDGE_TYPE,
      }),
    ]);
  });

  it("keeps normalized message attachments in persisted workflow drafts", () => {
    const draft = hydrateWorkflowDraft({
      edges: [],
      nodes: [{
        data: {
          attachments: [
            {
              content: {
                alt: "商品图",
                fileUrl: "https://cdn.example.com/product.png",
                localUrl: undefined,
                preview: {
                  fallbackUrl: "blob:https://example.com/temporary-preview",
                },
              },
              localFile: { name: "should-not-survive.png" },
              materialCollectionId: "material-image-1",
              msgInfoId: "9001",
              type: "image",
            },
            { content: {}, type: "unsupported" },
          ],
          content: [{ type: "text", value: "查看商品图" }],
          contentMode: "node-output",
          kind: "message",
          outputSelector: ["node", "llm-copy", "text"],
          title: "外部消息节点",
        },
        id: "message-1",
        position: { x: 0, y: 0 },
      }],
      viewport: DEFAULT_WORKFLOW_VIEWPORT,
    });

    expect(draft.nodes[0]?.data).toMatchObject({
      attachments: [{
        content: {
          alt: "商品图",
          fileUrl: "https://cdn.example.com/product.png",
        },
        materialCollectionId: "material-image-1",
        msgInfoId: "9001",
        type: "image",
      }],
      content: [{ type: "text", value: "查看商品图" }],
      contentMode: "node-output",
      kind: "message",
      outputSelector: ["node", "llm-copy", "text"],
    });
    const messageNode = draft.nodes[0];
    expect(messageNode?.data.kind).toBe("message");
    if (messageNode?.data.kind === "message") {
      expect(messageNode.data.attachments[0]).not.toHaveProperty("localFile");
    }
  });

  it("keeps normalized message query time expressions in persisted drafts", () => {
    const draft = hydrateWorkflowDraft({
      edges: [],
      nodes: [{
        data: {
          kind: "message-query",
          limit: 99,
          timeRange: {
            end: { field: "enteredAt", kind: "current-node-lifecycle" },
            mode: "dynamic",
            start: {
              kind: "node-output",
              selector: ["node", "message-source", "sentAt"],
            },
          },
          take: "earliest",
          title: "查询邀约后的消息",
        },
        id: "message-query-1",
        position: { x: 0, y: 0 },
      }],
      viewport: DEFAULT_WORKFLOW_VIEWPORT,
    });

    expect(draft.nodes[0]?.data).toEqual(expect.objectContaining({
      kind: "message-query",
      limit: 50,
      metric: "最早 50 条消息",
      timeRange: {
        end: { field: "enteredAt", kind: "current-node-lifecycle" },
        mode: "dynamic",
        start: {
          kind: "node-output",
          selector: ["node", "message-source", "sentAt"],
        },
      },
      take: "earliest",
    }));
  });

  it("normalizes wait event type and timeout without persisting invalid values", () => {
    const draft = hydrateWorkflowDraft({
      edges: [],
      nodes: [{
        data: {
          event: { type: "unknown-event" },
          kind: "wait-event",
          timeout: { duration: 999, unit: "day" },
          title: "等待客户动作",
        },
        id: "wait-event-1",
        position: { x: 0, y: 0 },
      }],
      viewport: DEFAULT_WORKFLOW_VIEWPORT,
    });

    expect(draft.nodes[0]?.data).toEqual(expect.objectContaining({
      event: { type: "customer.message.received" },
      kind: "wait-event",
      metric: "等待新消息 · 最长 15 天",
      timeout: { duration: 15, unit: "day" },
    }));
  });

  it("does not downgrade node data created by a newer schema", () => {
    const hydratedDraft = hydrateWorkflowDraft({
      edges: [],
      nodes: [
        {
          data: {
            ...createDefaultNodeData("message"),
            futureConfig: {
              channel: "private-domain",
            },
            schemaVersion: 99,
          },
          id: "future-message",
          position: { x: 0, y: 0 },
          type: WORKFLOW_NODE_TYPE,
        },
      ],
    });

    expect(hydratedDraft.nodes[0]?.data).toEqual(expect.objectContaining({
      futureConfig: {
        channel: "private-domain",
      },
      schemaVersion: 99,
    }));
  });

  it("runs the registered node data migration before applying the current schema", () => {
    const definition = getNodeDefinitionCore("wait");
    const originalMigration = definition.migrateData;
    const migrateData = vi.fn(({ data }) => ({
      ...data,
      duration: 9,
      mode: "duration",
    }));
    definition.migrateData = migrateData;

    try {
      const hydratedDraft = hydrateWorkflowDraft({
        edges: [],
        nodes: [
          {
            data: {
              duration: 2,
              kind: "wait",
              mode: "duration",
              title: "待迁移节点",
            },
            id: "migrated-wait",
            position: { x: 0, y: 0 },
          },
        ],
      });

      expect(migrateData).toHaveBeenCalledWith({
        data: expect.objectContaining({
          duration: 2,
          kind: "wait",
          mode: "duration",
          title: "待迁移节点",
        }),
        fromVersion: 0,
        toVersion: 1,
      });
      expect(hydratedDraft.nodes[0]?.data).toEqual(expect.objectContaining({
        duration: 9,
        mode: "duration",
        schemaVersion: 1,
        title: "待迁移节点",
      }));
    }
    finally {
      if (originalMigration) {
        definition.migrateData = originalMigration;
      }
      else {
        delete definition.migrateData;
      }
    }
  });

  it("drops duplicate node ids before hydrating edges", () => {
    const hydratedDraft = hydrateWorkflowDraft({
      edges: [
        {
          id: "edge-valid",
          source: "wait-1",
          target: "message-1",
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
            kind: "message",
            title: "动作节点",
          },
          id: "message-1",
          position: { x: 300, y: 20 },
        } as WorkflowNode,
      ],
    });

    expect(hydratedDraft.nodes.map((node) => node.id)).toEqual(["wait-1", "message-1"]);
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
              {
                conditions: [{ id: "condition-1", operator: "equals", value: "" }],
                id: "branch-custom",
                label: "自定义分支",
                logic: "all",
              },
              {
                conditions: [{ id: "condition-1", operator: "equals", value: "" }],
                id: "branch-custom",
                label: "重复分支",
                logic: "all",
              },
            ],
          },
          id: "branch-1",
          position: { x: 10, y: 20 },
          type: WORKFLOW_NODE_TYPE,
        } as WorkflowNode,
        {
          data: {
            ...createDefaultNodeData("message"),
            branchPaths: [
              {
                conditions: [{ id: "condition-1", operator: "equals", value: "" }],
                id: "branch-leaked",
                label: "不应保留",
                logic: "all",
              },
            ],
          },
          id: "message-1",
          position: { x: 300, y: 20 },
          type: WORKFLOW_NODE_TYPE,
        } as WorkflowNode,
      ],
    });

    expect(hydratedDraft.nodes.find((node) => node.id === "branch-1")?.data.branchPaths)
      .toEqual([
        {
          conditions: [{ id: "condition-1", operator: "equals", selector: undefined, value: "" }],
          id: "branch-custom",
          isDefault: undefined,
          label: "如果",
          logic: "all",
        },
        {
          conditions: [{ id: "condition-1", operator: "equals", selector: undefined, value: "" }],
          id: "branch-2",
          isDefault: undefined,
          label: "否则如果",
          logic: "all",
        },
        {
          conditions: [],
          id: "branch-default",
          isDefault: true,
          label: "否则",
          logic: "all",
        },
      ]);
    expect(hydratedDraft.nodes.find((node) => node.id === "message-1")?.data.branchPaths)
      .toBeUndefined();
  });

  it("filters edges that violate the workflow connection policy while hydrating drafts", () => {
    const startNode = {
      data: {
        kind: "start",
        label: "触发",
        metric: "进入 1 人",
        status: "ready",
        title: "触发节点",
      },
      id: "start",
      position: { x: 0, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    };
    const waitNode = {
      data: {
        kind: "wait",
        label: "等待",
        metric: "等待 1 天",
        status: "ready",
        title: "等待节点",
      },
      id: "wait",
      position: { x: 300, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    };
    const messageNode = {
      data: {
        kind: "message",
        label: "发送消息",
        metric: "欢迎语",
        status: "ready",
        title: "消息节点",
      },
      id: "message",
      position: { x: 600, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    };
    const hydratedDraft = hydrateWorkflowDraft({
      edges: [
        createEdge("start", "wait"),
        createEdge("wait", "message"),
        createEdge("message", "wait"),
        createEdge("wait", "start"),
        createEdge("start", "wait"),
      ],
      nodes: [startNode, waitNode, messageNode],
      viewport: DEFAULT_WORKFLOW_VIEWPORT,
    });

    expect(hydratedDraft.edges.map((edge) => edge.id)).toEqual([
      "edge-start-wait",
      "edge-wait-message",
    ]);
  });

  it("filters edges whose handles are not declared by their source node", () => {
    const branchNode: WorkflowNode = {
      data: {
        ...createDefaultNodeData("branch"),
        branchPaths: [
          {
            conditions: [{ id: "condition-high", operator: "equals", value: "" }],
            id: "branch-high",
            label: "如果",
            logic: "all",
          },
          {
            conditions: [],
            id: "branch-default",
            isDefault: true,
            label: "否则",
            logic: "all",
          },
        ],
      },
      id: "branch",
      position: { x: 0, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    };
    const messageNode: WorkflowNode = {
      data: createDefaultNodeData("message"),
      id: "message",
      position: { x: 300, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    };
    const endNode: WorkflowNode = {
      data: createDefaultNodeData("end"),
      id: "end",
      position: { x: 600, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    };
    const hydratedDraft = hydrateWorkflowDraft({
      edges: [
        createEdge("branch", "message", "高意向客户", { sourceHandle: "branch-high" }),
        createEdge("branch", "end", "已删除分支", { sourceHandle: "branch-deleted" }),
        createEdge("message", "end", undefined, { sourceHandle: "branch-high" }),
        createEdge("message", "end", undefined, { targetHandle: "target-custom" }),
      ],
      nodes: [branchNode, messageNode, endNode],
      viewport: DEFAULT_WORKFLOW_VIEWPORT,
    });

    expect(hydratedDraft.edges.map((edge) => edge.id)).toEqual([
      "edge-branch-branch-high-message",
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
