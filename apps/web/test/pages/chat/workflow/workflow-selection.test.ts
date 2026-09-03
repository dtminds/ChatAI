import { describe, expect, it } from "vitest";
import {
  createEdge,
  createInitialEdges,
  createInitialNodes,
} from "@/pages/chat/workflow/graph";
import {
  normalizeWorkflowSelection,
  resolveWorkflowSelectionDeleteTarget,
  selectWorkflowEdge,
  selectWorkflowNodes,
  toggleWorkflowNodeSelection,
} from "@/pages/chat/workflow/workflow-selection";

describe("workflow selection", () => {
  it("keeps edge selection exclusive from node selection", () => {
    expect(selectWorkflowEdge("edge-wait-2d-end")).toEqual({
      selectedEdgeId: "edge-wait-2d-end",
      selectedNodeIds: [],
    });
    expect(selectWorkflowNodes(["wait-2d", "wait-2d", "branch-intent"])).toEqual({
      selectedEdgeId: null,
      selectedNodeIds: ["wait-2d", "branch-intent"],
    });
    expect(toggleWorkflowNodeSelection({
      selectedEdgeId: "edge-wait-2d-end",
      selectedNodeIds: [],
    }, "wait-2d")).toEqual({
      selectedEdgeId: null,
      selectedNodeIds: ["wait-2d"],
    });
  });

  it("normalizes stale selection against the current graph", () => {
    const nodes = createInitialNodes();
    const edges = [
      createEdge("start", "wait-2d"),
      createEdge("wait-2d", "end"),
    ];

    expect(normalizeWorkflowSelection({
      defaultNodeId: "message-welcome",
      edges,
      nodes,
      selection: {
        selectedEdgeId: "edge-wait-2d-end",
        selectedNodeIds: ["start"],
      },
    })).toEqual({
      selectedEdgeId: "edge-wait-2d-end",
      selectedNodeIds: [],
    });

    expect(normalizeWorkflowSelection({
      defaultNodeId: "message-welcome",
      edges: createInitialEdges(),
      nodes: nodes.filter((node) => node.id !== "message-welcome"),
      selection: {
        selectedEdgeId: null,
        selectedNodeIds: ["message-welcome"],
      },
    })).toEqual({
      selectedEdgeId: null,
      selectedNodeIds: ["start"],
    });

    expect(normalizeWorkflowSelection({
      defaultNodeId: "message-welcome",
      edges,
      nodes,
      selection: {
        selectedEdgeId: "missing-edge",
        selectedNodeIds: [],
      },
    })).toEqual({
      selectedEdgeId: null,
      selectedNodeIds: [],
    });
  });

  it("resolves delete target with edge priority", () => {
    expect(resolveWorkflowSelectionDeleteTarget({
      selectedEdgeId: "edge-wait-2d-end",
      selectedNodeIds: ["wait-2d"],
    })).toEqual({
      edgeId: "edge-wait-2d-end",
      type: "edge",
    });
    expect(resolveWorkflowSelectionDeleteTarget({
      selectedEdgeId: null,
      selectedNodeIds: ["wait-2d", "branch-intent"],
    })).toEqual({
      nodeIds: ["wait-2d", "branch-intent"],
      type: "nodes",
    });
    expect(resolveWorkflowSelectionDeleteTarget({
      selectedEdgeId: null,
      selectedNodeIds: [],
    })).toEqual({ type: "none" });
  });
});
