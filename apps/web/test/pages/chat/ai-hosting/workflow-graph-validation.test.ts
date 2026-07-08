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

  it("derives incoming capability from target handle definitions", () => {
    const validation = validateWorkflowGraph(createInitialNodes(), [
      ...createInitialEdges(),
      createEdge("wait-2d", "trigger"),
    ]);

    expect(validation.graphIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "node-multiple-incoming",
        nodeId: "trigger",
      }),
    ]));
  });

  it("derives multiple outgoing capability from source handle definitions", () => {
    const nodes = [
      ...createInitialNodes(),
      createNodeFromKind("action", "action-normal", 10),
      createNodeFromKind("action", "action-default", 11),
    ];
    const edges = [
      ...createInitialEdges(),
      createEdge("branch-intent", "action-normal", "普通客户", { sourceHandle: "branch-normal" }),
      createEdge("branch-intent", "action-default", "默认路径", { sourceHandle: "branch-default" }),
      createEdge("wait-2d", "goal"),
    ];
    const validation = validateWorkflowGraph(nodes, edges);

    expect(validation.graphIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "node-multiple-outgoing",
        nodeId: "wait-2d",
      }),
    ]));
    expect(validation.graphIssues.some((issue) =>
      issue.code === "node-multiple-outgoing" && issue.nodeId === "branch-intent",
    )).toBe(false);
  });

  it("flags outgoing edges on nodes without source handles through the same cardinality rule", () => {
    const nodes = [
      ...createInitialNodes(),
      createNodeFromKind("action", "action-after-goal", 10),
    ];
    const validation = validateWorkflowGraph(nodes, [
      ...createInitialEdges(),
      createEdge("goal", "action-after-goal"),
      createEdge("goal", "wait-2d"),
    ]);

    expect(validation.graphIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "node-multiple-outgoing",
        nodeId: "goal",
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

  it("flags default source handles without downstream nodes", () => {
    const edges = createInitialEdges().filter((edge) => edge.source !== "wait-2d");
    const validation = validateWorkflowGraph(createInitialNodes(), edges);

    expect(validation.graphIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "source-handle-unconnected",
        message: "节点存在未连接的出口",
        nodeId: "wait-2d",
        severity: "warning",
        source: "graph",
      }),
    ]));
  });

  it("does not treat branch edges to missing nodes as connected outlets", () => {
    const edges = [
      ...createInitialEdges(),
      {
        ...createEdge("branch-intent", "missing-node", "普通客户", { sourceHandle: "branch-normal" }),
        id: "edge-branch-intent-branch-normal-missing-node",
      },
      {
        ...createEdge("branch-intent", "goal", "默认路径", { sourceHandle: "branch-default" }),
      },
    ];
    const validation = validateWorkflowGraph(createInitialNodes(), edges);

    expect(validation.graphIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "branch-path-unconnected",
        nodeId: "branch-intent",
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

  it("flags edges whose handle metadata is rejected by the connection policy", () => {
    const edges = [
      ...createInitialEdges(),
      createEdge("branch-intent", "goal", "未知路径", { sourceHandle: "branch-missing" }),
    ];
    const validation = validateWorkflowGraph(createInitialNodes(), edges);

    expect(validation.graphIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "edge-invalid-connection",
        message: "连线使用了当前节点不支持的连接桩",
        nodeId: "branch-intent",
      }),
    ]));
  });

  it("flags single outgoing edges from nodes without source handles", () => {
    const edges = [
      ...createInitialEdges(),
      createEdge("goal", "action-message"),
    ];
    const validation = validateWorkflowGraph(createInitialNodes(), edges);

    expect(validation.graphIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "edge-invalid-connection",
        message: "连线不符合当前节点连接规则",
        nodeId: "goal",
      }),
    ]));
  });

  it("flags duplicate downstream edges from the same source handle", () => {
    const nodes = [
      ...createInitialNodes(),
      createNodeFromKind("action", "action-high-extra", 10),
    ];
    const edges = [
      ...createInitialEdges(),
      createEdge("branch-intent", "action-high-extra", "高意向客户", { sourceHandle: "branch-high" }),
    ];
    const validation = validateWorkflowGraph(nodes, edges);
    const sourceHandleIssues = validation.graphIssues.filter(
      (issue) => issue.code === "source-handle-multiple-outgoing" && issue.nodeId === "branch-intent",
    );

    expect(validation.graphIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "source-handle-multiple-outgoing",
        message: "同一个出口只能连接一条下游连线",
        nodeId: "branch-intent",
      }),
    ]));
    expect(sourceHandleIssues).toHaveLength(1);
    expect(sourceHandleIssues[0]?.edgeIds).toHaveLength(2);
  });

  it("groups null and undefined default source handles as one duplicate outlet", () => {
    const nodes = createInitialNodes();
    const edges: WorkflowEdge[] = [
      ...createInitialEdges(),
      {
        ...createEdge("wait-2d", "goal"),
        id: "edge-wait-2d-null-default-goal",
        sourceHandle: null,
        targetHandle: null,
      },
    ];
    const validation = validateWorkflowGraph(nodes, edges);
    const sourceHandleIssues = validation.graphIssues.filter(
      (issue) => issue.code === "source-handle-multiple-outgoing" && issue.nodeId === "wait-2d",
    );

    expect(sourceHandleIssues).toHaveLength(1);
    expect(sourceHandleIssues[0]?.edgeIds).toEqual(expect.arrayContaining([
      "edge-wait-2d-branch-intent",
      "edge-wait-2d-null-default-goal",
    ]));
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
