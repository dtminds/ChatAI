import { useMemo } from "react";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowPublishCheck,
} from "../types";
import { validateWorkflowDraft } from "../validation/workflow-validation";

export function useWorkflowPublishChecks(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
) {
  const checks = useMemo(() => buildPublishChecks(nodes, edges), [edges, nodes]);
  const readyChecks = useMemo(
    () => checks.filter((check) => check.status === "ready").length,
    [checks],
  );

  return {
    checks,
    hasWarnings: readyChecks !== checks.length,
    publishReady: readyChecks === checks.length,
    readyChecks,
    totalChecks: checks.length,
  };
}

export function buildPublishChecks(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowPublishCheck[] {
  const validation = validateWorkflowDraft(nodes, edges);
  const triggerIssue = validation.nodeIssues.find(
    (item) => item.node.id === validation.triggerNode?.id,
  );
  const disconnectedIssues = validation.nodeIssues
    .map(({ issues, node }) => ({
      issues: issues.filter((issue) => issue.code === "node-disconnected"),
      node,
    }))
    .filter((item) => item.issues.length > 0);
  const nodeConfigIssues = validation.nodeIssues
    .filter((item) => item.node.id !== validation.triggerNode?.id)
    .map(({ issues, node }) => ({
      issues: issues.filter((issue) => issue.code !== "node-disconnected"),
      node,
    }))
    .filter((item) => item.issues.length > 0);
  const triggerConfigIssues = triggerIssue?.issues.filter(
    (issue) => issue.code !== "node-disconnected",
  );
  const hasDisconnectedNode = validation.disconnectedNodes.length > 0;
  const hasAiAction = validation.configuredAiNodes.length > 0;
  const nodeIssueChecks = [
    ...disconnectedIssues.map(({ issues, node }) => ({
      description: issues[0]?.message ?? "节点仍需补全配置",
      id: `node-connectivity-${node.id}`,
      messages: issues.map((issue) => issue.message),
      nodeId: node.id,
      status: "warning" as const,
      title: node.data.title,
    })),
    ...nodeConfigIssues.map(({ issues, node }) => ({
      description: issues[0]?.message ?? "节点仍需补全配置",
      id: `node-config-${node.id}`,
      messages: issues.map((issue) => issue.message),
      nodeId: node.id,
      status: "warning" as const,
      title: node.data.title,
    })),
  ];

  return [
    {
      description: validation.triggerNode && !triggerIssue
        ? `当前人群：${validation.triggerNode.data.audience}`
        : triggerConfigIssues?.[0]?.message ?? "缺少触发节点",
      id: "trigger",
      status: validation.triggerNode && !triggerIssue ? "ready" : "warning",
      title: "触发人群",
    },
    {
      description: hasDisconnectedNode ? "存在未连接到主链路的节点" : "所有节点均接入主链路",
      id: "connectivity",
      status: hasDisconnectedNode ? "warning" : "ready",
      title: "链路连通性",
    },
    {
      description: nodeConfigIssues.length
        ? `${nodeConfigIssues.length} 个节点仍需补全配置`
        : "所有节点已完成关键配置",
      id: "config",
      status: nodeConfigIssues.length ? "warning" : "ready",
      title: "节点配置",
    },
    {
      description: hasAiAction
        ? "AI 接待动作已绑定 Agent 和知识库策略"
        : "当前流程没有启用 AI 接待动作",
      id: "ai",
      status: hasAiAction ? "ready" : "warning",
      title: "AI 接待策略",
    },
    {
      description: validation.goalNode ? "已配置退出目标和转化指标" : "缺少目标节点",
      id: "goal",
      status: validation.goalNode ? "ready" : "warning",
      title: "目标退出",
    },
    ...nodeIssueChecks,
  ];
}
