import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  buildPublishChecks,
  buildPublishChecklist,
  useWorkflowPublishChecks,
} from "@/pages/chat/ai-hosting/workflow/checks/publish-checks";
import {
  createEdge,
  createInitialEdges,
  createInitialNodes,
  createNodeFromKind,
} from "@/pages/chat/ai-hosting/workflow/graph";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/ai-hosting/workflow/constants";
import type { WorkflowNode } from "@/pages/chat/ai-hosting/workflow/types";
import {
  validateWorkflowDraft,
  validateWorkflowNodeConfig,
  validateWorkflowNodeGraphState,
} from "@/pages/chat/ai-hosting/workflow/validation/workflow-validation";

describe("buildPublishChecks", () => {
  it("returns only unresolved checklist items while keeping a readiness summary", () => {
    const checklist = buildPublishChecklist(createInitialNodes(), createInitialEdges());

    expect(checklist.summary.map((check) => [check.id, check.status])).toEqual([
      ["trigger", "ready"],
      ["connectivity", "warning"],
      ["config", "ready"],
      ["ai", "warning"],
      ["goal", "ready"],
    ]);
    expect(checklist.checks.map((check) => [check.id, check.category])).toEqual([
      ["connectivity", "connectivity"],
      ["ai", "strategy"],
      ["graph-branch-path-unconnected-branch-intent", "connectivity"],
    ]);
    expect(checklist.canPublish).toBe(false);
    expect(checklist.canRun).toBe(false);
    expect(checklist.runBlockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "graph-branch-path-unconnected-branch-intent",
        nodeId: "branch-intent",
      }),
    ]));
  });

  it("does not treat node display status as a publish config issue", () => {
    const nodes = createInitialNodes().map((node) =>
      node.id === "action-message"
        ? {
            ...node,
            data: {
              ...node.data,
              status: "warning" as const,
            },
          }
        : node,
    );
    const edges = createInitialEdges().filter((edge) => edge.target !== "action-message");
    const checks = buildPublishChecks(nodes, edges);

    expect(checks.find((check) => check.id === "connectivity")?.category).toBe("connectivity");
    expect(checks.find((check) => check.id === "config")).toBeUndefined();
    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blocksRun: true,
          id: "node-connectivity-action-message",
          nodeId: "action-message",
          status: "warning",
        }),
      ]),
    );
  });

  it("keeps validation issues structured for publish checklist routing", () => {
    const nodes = createInitialNodes().map((node) =>
      node.id === "branch-intent"
        ? {
            ...node,
            data: {
              ...node.data,
              branchRule: "",
            },
          }
        : node,
    );
    const edges = createInitialEdges().filter((edge) => edge.target !== "action-message");
    const validation = validateWorkflowDraft(nodes, edges);

    expect(validation.nodeIssues.find((item) => item.node.id === "branch-intent")?.issues).toEqual([
      {
        code: "branch-rule-required",
        message: "条件分支需要配置条件表达式",
        severity: "warning",
        source: "catalog",
      },
    ]);
    expect(validation.nodeIssues.find((item) => item.node.id === "action-message")?.issues).toEqual([
      {
        code: "node-disconnected",
        message: "节点未接入从触发节点开始的主链路",
        severity: "warning",
        source: "runtime",
      },
    ]);
  });

  it("uses catalog validation rules instead of only node status", () => {
    const nodes = createInitialNodes().map((node) =>
      node.id === "trigger"
        ? {
            ...node,
            data: {
              ...node.data,
              audience: "",
              status: "running" as const,
            },
          }
        : node,
    );
    const checks = buildPublishChecks(nodes, createInitialEdges());

    expect(checks.find((check) => check.id === "trigger")?.status).toBe("warning");
    expect(checks.find((check) => check.id === "trigger")?.blocksRun).toBe(true);
    expect(checks.find((check) => check.id === "trigger")?.description).toBe(
      "触发节点需要选择进入人群",
    );
  });

  it("rejects unsupported node option values and invalid numeric config", () => {
    const nodes = createInitialNodes();
    const actionNode = nodes.find((node) => node.id === "action-message")!;
    const aiNode = createNodeFromKind("ai", "ai-invalid-agent", nodes.length);
    const goalNode = nodes.find((node) => node.data.kind === "goal")!;

    expect(validateWorkflowNodeConfig({
      ...actionNode,
      data: {
        ...actionNode.data,
        actionType: "sms" as "message",
      },
    }, nodes, createInitialEdges())).toEqual([
      {
        code: "action-type-unsupported",
        message: "营销动作类型不受支持",
        severity: "warning",
        source: "catalog",
      },
    ]);
    expect(validateWorkflowNodeConfig({
      ...aiNode,
      data: {
        ...aiNode.data,
        agentName: "不存在的 Agent",
      },
    }, [...nodes, aiNode], createInitialEdges())).toEqual([
      {
        code: "ai-agent-unsupported",
        message: "AI 接待绑定的 Agent 不可用",
        severity: "warning",
        source: "catalog",
      },
    ]);
    expect(validateWorkflowNodeConfig({
      ...goalNode,
      data: {
        ...goalNode.data,
        conversion: Number.NaN,
      },
    }, nodes, createInitialEdges())).toEqual([
      {
        code: "goal-conversion-required",
        message: "目标节点需要配置有效转化指标",
        severity: "warning",
        source: "catalog",
      },
    ]);
  });

  it("validates branch path labels separately from the branch expression", () => {
    const nodes = createInitialNodes();
    const branchNode = nodes.find((node) => node.id === "branch-intent")!;

    expect(validateWorkflowNodeConfig({
      ...branchNode,
      data: {
        ...branchNode.data,
        branchPaths: [
          { id: "branch-high", label: "高意向客户", operator: "IF", title: "CASE 1" },
          { id: "branch-normal", label: "", operator: "ELIF", title: "CASE 2" },
          { id: "branch-default", isDefault: true, label: "默认路径", operator: "ELSE", title: "CASE 3" },
        ],
        branchRule: "按标签和会话意图拆分",
      },
    }, nodes, createInitialEdges())).toEqual([
      {
        code: "branch-path-label-required",
        message: "条件分支路径需要填写分支名称",
        severity: "warning",
        source: "catalog",
      },
    ]);
  });

  it("keeps node definition validation separate from graph state validation", () => {
    const nodes = createInitialNodes();
    const edges = createInitialEdges();
    const branchNode = nodes.find((node) => node.id === "branch-intent")!;
    const disconnectedNode = nodes.find((node) => node.id === "action-message")!;

    expect(validateWorkflowNodeConfig({
      ...branchNode,
      data: {
        ...branchNode.data,
        branchRule: "",
      },
    }, nodes, edges)).toEqual([
      {
        code: "branch-rule-required",
        message: "条件分支需要配置条件表达式",
        severity: "warning",
        source: "catalog",
      },
    ]);
    expect(validateWorkflowNodeConfig(disconnectedNode, nodes, [])).toEqual([]);
    expect(validateWorkflowNodeGraphState(disconnectedNode, [disconnectedNode], "trigger")).toEqual([
      {
        code: "node-disconnected",
        message: "节点未接入从触发节点开始的主链路",
        severity: "warning",
        source: "runtime",
      },
    ]);
  });

  it("marks AI strategy ready only when an AI node is configured", () => {
    const aiNode: WorkflowNode = {
      data: {
        actionType: "ai",
        agentName: "护肤小助理",
        kind: "ai",
        label: "AI 接待",
        metric: "知识库：护肤知识库",
        status: "ready",
        summary: "护肤小助理",
        title: "AI 接待",
      },
      id: "ai-node",
      position: { x: 1200, y: 120 },
      type: WORKFLOW_NODE_TYPE,
    };
    const nodes = [
      ...createInitialNodes(),
      aiNode,
    ];
    const edges = [
      ...createInitialEdges(),
      createEdge("action-message", "ai-node"),
    ];
    const checklist = buildPublishChecklist(nodes, edges);

    expect(checklist.summary.find((check) => check.id === "ai")?.status).toBe("ready");
    expect(checklist.checks.find((check) => check.id === "ai")).toBeUndefined();
  });

  it("treats nodes behind a detached chain as disconnected", () => {
    const nodes = createInitialNodes();
    const edges = createInitialEdges().map((edge) =>
      edge.source === "trigger"
        ? {
            ...edge,
            source: "detached-node",
          }
        : edge,
    );
    const checks = buildPublishChecks(nodes, edges);

    expect(checks.find((check) => check.id === "connectivity")?.status).toBe("warning");
  });

  it("surfaces graph structure issues in publish checks", () => {
    const checks = buildPublishChecks(createInitialNodes(), [
      ...createInitialEdges(),
      createEdge("action-message", "wait-2d"),
    ]);

    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: "connectivity",
        id: "graph-edge-cycle",
        title: "图结构",
      }),
      expect.objectContaining({
        category: "connectivity",
        id: "graph-node-multiple-incoming-wait-2d",
        nodeId: "wait-2d",
        title: "观察期",
      }),
    ]));
  });

  it("blocks run and publish when a branch path has no downstream node", () => {
    const checklist = buildPublishChecklist(createInitialNodes(), createInitialEdges());

    expect(checklist.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        blocksPublish: true,
        blocksRun: true,
        category: "connectivity",
        description: "条件分支存在未连接的出口",
        id: "graph-branch-path-unconnected-branch-intent",
        nodeId: "branch-intent",
        title: "意向判断",
      }),
    ]));
  });

  it("marks connectivity ready when every branch path is connected", () => {
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
    const checklist = buildPublishChecklist(nodes, edges);

    expect(checklist.summary.find((check) => check.id === "connectivity")?.status).toBe("ready");
    expect(checklist.checks.some((check) => check.id === "graph-branch-path-unconnected-branch-intent"))
      .toBe(false);
  });
});

describe("useWorkflowPublishChecks", () => {
  it("returns publish readiness summary with the checklist", () => {
    const { result } = renderHook(() =>
      useWorkflowPublishChecks(createInitialNodes(), createInitialEdges()),
    );

    expect(result.current.checks).toHaveLength(3);
    expect(result.current.summary).toHaveLength(5);
    expect(result.current.readyChecks).toBe(3);
    expect(result.current.totalChecks).toBe(5);
    expect(result.current.publishReady).toBe(false);
    expect(result.current.canRun).toBe(false);
    expect(result.current.runBlockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "graph-branch-path-unconnected-branch-intent",
      }),
    ]));
    expect(result.current.hasWarnings).toBe(true);
  });
});
