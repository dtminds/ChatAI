import { describe, expect, it } from "vitest";
import {
  createEdge,
  createInitialEdges,
  createInitialNodes,
  createNodeFromKind,
} from "@/pages/chat/ai-hosting/workflow/graph";
import {
  getValidWorkflowTreeNodes,
  validateWorkflowGraph,
} from "@/pages/chat/ai-hosting/workflow/validation/workflow-graph-validation";
import type {
  WorkflowEdge,
  WorkflowNode,
} from "@/pages/chat/ai-hosting/workflow/types";

describe("workflow graph validation", () => {
  it("returns reachable nodes and max depth from the trigger node", () => {
    const nodes = [
      ...createInitialNodes(),
      createNodeFromKind("wait", "detached-wait", 20),
    ];
    const result = getValidWorkflowTreeNodes(nodes, createInitialEdges(), "trigger");

    expect(result.validNodes.map((node) => node.id)).toEqual([
      "trigger",
      "wait-2d",
      "branch-intent",
      "action-message",
      "goal",
    ]);
    expect(result.reachableNodeIds.has("detached-wait")).toBe(false);
    expect(result.maxDepth).toBe(5);
  });

  it("flags disconnected nodes and unreachable goals", () => {
    const nodes = createInitialNodes();
    const edges = createInitialEdges().filter((edge) => edge.target !== "goal");
    const validation = validateWorkflowGraph(nodes, edges);

    expect(validation.graphIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "goal-unreachable",
        nodeId: "goal",
        severity: "warning",
        source: "graph",
      }),
      expect.objectContaining({
        code: "node-disconnected",
        nodeId: "goal",
        severity: "warning",
        source: "graph",
      }),
    ]));
  });

  it("detects cycles without infinite traversal", () => {
    const edges = [
      ...createInitialEdges(),
      createEdge("action-message", "wait-2d"),
    ];
    const validation = validateWorkflowGraph(createInitialNodes(), edges);

    expect(validation.hasCycle).toBe(true);
    expect(validation.graphIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "edge-cycle",
      }),
    ]));
  });

  it("flags multiple incoming edges and non-branch multiple outgoing edges", () => {
    const nodes = createInitialNodes();
    const edges = [
      ...createInitialEdges(),
      createEdge("trigger", "action-message"),
      createEdge("wait-2d", "action-message"),
      createEdge("wait-2d", "goal"),
    ];
    const validation = validateWorkflowGraph(nodes, edges);

    expect(validation.graphIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "node-multiple-incoming",
        nodeId: "action-message",
      }),
      expect.objectContaining({
        code: "node-multiple-outgoing",
        nodeId: "wait-2d",
      }),
    ]));
  });

  it("flags branch paths without downstream nodes", () => {
    const validation = validateWorkflowGraph(createInitialNodes(), createInitialEdges());

    expect(validation.graphIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "branch-path-unconnected",
        message: "条件分支存在未连接的出口",
        nodeId: "branch-intent",
        severity: "warning",
        source: "graph",
      }),
    ]));
  });

  it("accepts branch nodes only when every branch path has a downstream node", () => {
    const nodes = [
      ...createInitialNodes(),
      createNodeFromKind("action", "action-normal", 10),
      createNodeFromKind("action", "action-default", 11),
    ];
    const edges = [
      ...createInitialEdges(),
      createEdge("branch-intent", "action-normal", "普通客户", { sourceHandle: "branch-normal" }),
      createEdge("branch-intent", "action-default", "默认路径", { sourceHandle: "branch-default" }),
    ];
    const validation = validateWorkflowGraph(nodes, edges);

    expect(validation.graphIssues.some((issue) => issue.code === "branch-path-unconnected")).toBe(false);
  });

  it("flags graph depth over the configured limit", () => {
    const baseNodes = createInitialNodes();
    const trigger = baseNodes.find((node) => node.id === "trigger")!;
    const goal = baseNodes.find((node) => node.id === "goal")!;
    const chainNodes: WorkflowNode[] = Array.from({ length: 4 }, (_, index) => ({
      ...createNodeFromKind("wait", `wait-${index}`, index),
      position: { x: index * 300, y: 0 },
    }));
    const nodes = [trigger, ...chainNodes, goal];
    const edges: WorkflowEdge[] = [
      createEdge("trigger", "wait-0"),
      createEdge("wait-0", "wait-1"),
      createEdge("wait-1", "wait-2"),
      createEdge("wait-2", "wait-3"),
      createEdge("wait-3", "goal"),
    ];
    const validation = validateWorkflowGraph(nodes, edges, { maxDepth: 4 });

    expect(validation.maxDepth).toBe(6);
    expect(validation.graphIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "tree-depth-exceeded",
      }),
    ]));
  });

  it("requires trigger and goal nodes", () => {
    const nodes = createInitialNodes().filter((node) => node.data.kind !== "trigger" && node.data.kind !== "goal");
    const validation = validateWorkflowGraph(nodes, []);

    expect(validation.graphIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "missing-trigger" }),
      expect.objectContaining({ code: "missing-goal" }),
    ]));
    expect(validation.maxDepth).toBe(0);
  });
});
