import { describe, expect, it } from "vitest";
import {
  createEdge,
  createInitialEdges,
  createInitialNodes,
} from "@/pages/chat/ai-hosting/workflow/graph";
import {
  normalizeWorkflowSelection,
  resolveWorkflowSelectionDeleteTarget,
  selectWorkflowEdge,
  selectWorkflowNodes,
  toggleWorkflowNodeSelection,
} from "@/pages/chat/ai-hosting/workflow/workflow-selection";

describe("workflow selection", () => {
  it("keeps edge selection exclusive from node selection", () => {
    expect(selectWorkflowEdge("edge-wait-2d-goal")).toEqual({
      selectedEdgeId: "edge-wait-2d-goal",
      selectedNodeIds: [],
    });
    expect(selectWorkflowNodes(["wait-2d", "wait-2d", "branch-intent"])).toEqual({
      selectedEdgeId: null,
      selectedNodeIds: ["wait-2d", "branch-intent"],
    });
    expect(toggleWorkflowNodeSelection({
      selectedEdgeId: "edge-wait-2d-goal",
      selectedNodeIds: [],
    }, "wait-2d")).toEqual({
      selectedEdgeId: null,
      selectedNodeIds: ["wait-2d"],
    });
  });

  it("normalizes stale selection against the current graph", () => {
    const nodes = createInitialNodes();
    const edges = [
      createEdge("trigger", "wait-2d"),
      createEdge("wait-2d", "goal"),
    ];

    expect(normalizeWorkflowSelection({
      defaultNodeId: "action-message",
      edges,
      nodes,
      selection: {
        selectedEdgeId: "edge-wait-2d-goal",
        selectedNodeIds: ["trigger"],
      },
    })).toEqual({
      selectedEdgeId: "edge-wait-2d-goal",
      selectedNodeIds: [],
    });

    expect(normalizeWorkflowSelection({
      defaultNodeId: "action-message",
      edges: createInitialEdges(),
      nodes: nodes.filter((node) => node.id !== "action-message"),
      selection: {
        selectedEdgeId: null,
        selectedNodeIds: ["action-message"],
      },
    })).toEqual({
      selectedEdgeId: null,
      selectedNodeIds: ["trigger"],
    });

    expect(normalizeWorkflowSelection({
      defaultNodeId: "action-message",
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
      selectedEdgeId: "edge-wait-2d-goal",
      selectedNodeIds: ["wait-2d"],
    })).toEqual({
      edgeId: "edge-wait-2d-goal",
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
