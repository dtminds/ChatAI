import { useMemo } from "react";
import type {
  MarketingWorkflowEdge,
  MarketingWorkflowNode,
  WorkflowPublishCheck,
} from "../types";

export function useWorkflowPublishChecks(
  nodes: MarketingWorkflowNode[],
  edges: MarketingWorkflowEdge[],
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
  nodes: MarketingWorkflowNode[],
  edges: MarketingWorkflowEdge[],
): WorkflowPublishCheck[] {
  const trigger = nodes.find((node) => node.data.kind === "trigger");
  const goal = nodes.find((node) => node.data.kind === "goal");
  const warningNodes = nodes.filter((node) => node.data.status === "warning");
  const hasDisconnectedNode = nodes.some(
    (node) =>
      node.data.kind !== "trigger" &&
      !edges.some((edge) => edge.target === node.id),
  );
  const hasAiAction = nodes.some((node) => node.data.kind === "ai" && node.data.agentName);

  return [
    {
      description: trigger?.data.audience
        ? `当前人群：${trigger.data.audience}`
        : "触发节点需要选择进入人群",
      id: "trigger",
      status: trigger?.data.audience ? "ready" : "warning",
      title: "触发人群",
    },
    {
      description: hasDisconnectedNode ? "存在未连接到主链路的节点" : "所有节点均接入主链路",
      id: "connectivity",
      status: hasDisconnectedNode ? "warning" : "ready",
      title: "链路连通性",
    },
    {
      description: warningNodes.length
        ? `${warningNodes.length} 个节点仍需补全配置`
        : "所有节点已完成关键配置",
      id: "config",
      status: warningNodes.length ? "warning" : "ready",
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
      description: goal ? "已配置退出目标和转化指标" : "缺少目标节点",
      id: "goal",
      status: goal ? "ready" : "warning",
      title: "目标退出",
    },
  ];
}
