import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowPublishCheck,
  WorkflowPublishCheckSummaryItem,
} from "../types";
import {
  validateWorkflowDraft,
} from "./workflow-validation";
import type {
  WorkflowValidationNodeIssue,
  WorkflowValidationResult,
} from "./workflow-validation";

type WorkflowCheckBlockingScope = {
  blocksPublish: boolean;
};

export type WorkflowValidationSummary = {
  canPublish: boolean;
  checks: WorkflowPublishCheck[];
  publishBlockers: WorkflowPublishCheck[];
  readyChecks: number;
  summary: WorkflowPublishCheckSummaryItem[];
  totalSummaryChecks: number;
  validation: WorkflowValidationResult;
};

export function buildWorkflowValidationSummary(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowValidationSummary {
  const validation = validateWorkflowDraft(nodes, edges);
  return buildWorkflowValidationSummaryFromResult(nodes, validation);
}

export function buildWorkflowValidationSummaryFromResult(
  nodes: WorkflowNode[],
  validation: WorkflowValidationResult,
): WorkflowValidationSummary {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const startIssue = validation.nodeIssues.find(
    (item) => item.node.id === validation.startNode?.id,
  );
  const disconnectedIssues = validation.nodeIssues
    .map(({ issues, node }) => ({
      issues: issues.filter((issue) => issue.source === "graph"),
      node,
    }))
    .filter((item) => item.issues.length > 0);
  const nodeConfigIssues = validation.nodeIssues
    .filter((item) => item.node.id !== validation.startNode?.id)
    .map(({ issues, node }) => ({
      issues: issues.filter((issue) => issue.source !== "graph"),
      node,
    }))
    .filter((item) => item.issues.length > 0);
  const startConfigIssues = startIssue?.issues.filter(
    (issue) => issue.source !== "graph",
  ) ?? [];
  const hasDisconnectedNode = validation.disconnectedNodes.length > 0 || disconnectedIssues.length > 0;
  const hasGraphStructureIssue = validation.graphIssues.some((issue) =>
    issue.code !== "node-disconnected" && issue.code !== "end-unreachable",
  ) || disconnectedIssues.some(({ issues }) =>
    issues.some((issue) => issue.code !== "node-disconnected"),
  );
  const summary: WorkflowPublishCheckSummaryItem[] = [
    {
      ...getBlockingScope(),
      description: validation.startNode && !startConfigIssues.length
        ? `已配置 ${validation.startNode.data.kind === "start" ? validation.startNode.data.triggers.length : 0} 个触发条件`
        : startConfigIssues[0]?.message ?? "缺少开始节点",
      id: "start",
      status: validation.startNode && !startConfigIssues.length ? "ready" : "warning",
      title: "触发条件",
    },
    {
      ...getBlockingScope(),
      description: hasGraphStructureIssue
        ? "图结构存在未连接出口、循环或深度超限"
        : hasDisconnectedNode
          ? "存在未连接到主链路的节点"
          : "所有节点均接入主链路",
      id: "connectivity",
      status: hasDisconnectedNode || hasGraphStructureIssue ? "warning" : "ready",
      title: "链路连通性",
    },
    {
      ...getBlockingScope(),
      description: nodeConfigIssues.length
        ? `${nodeConfigIssues.length} 个节点仍需补全配置`
        : "所有节点已完成关键配置",
      id: "config",
      status: nodeConfigIssues.length ? "warning" : "ready",
      title: "节点配置",
    },
    {
      ...getBlockingScope(),
      description: validation.endNode ? "已配置结束节点" : "缺少结束节点",
      id: "end",
      status: validation.endNode ? "ready" : "warning",
      title: "旅程结束",
    },
  ];
  const globalChecks: WorkflowPublishCheck[] = summary
    .filter((item) => item.status === "warning" && item.blocksPublish)
    .map((item) => ({
      blocksPublish: item.blocksPublish,
      category: getSummaryCheckCategory(item.id),
      description: item.description,
      id: item.id,
      messages: [item.description],
      status: "warning",
      title: item.title,
    }));
  const graphIssueChecks: WorkflowPublishCheck[] = validation.graphIssues
    .filter((issue) => shouldExposeGraphIssueAsPublishCheck(issue.code))
    .map((issue) => {
      const node = issue.nodeId ? nodeById.get(issue.nodeId) : undefined;

      return {
        blocksPublish: true,
        category: "connectivity" as const,
        description: issue.message,
        id: `graph-${issue.code}${issue.nodeId ? `-${issue.nodeId}` : ""}`,
        messages: [issue.message],
        nodeId: issue.nodeId,
        status: "warning" as const,
        title: node?.data.title ?? "图结构",
      };
    });
  const nodeIssueChecks: WorkflowPublishCheck[] = [
    ...disconnectedIssues.map(({ issues, node }) =>
      createNodeIssueCheck("connectivity", `node-connectivity-${node.id}`, node, issues, {
        blocksPublish: true,
      }),
    ),
    ...nodeConfigIssues.map(({ issues, node }) =>
      createNodeIssueCheck("config", `node-config-${node.id}`, node, issues, {
        blocksPublish: true,
      }),
    ),
  ];
  const checks = [
    ...globalChecks,
    ...graphIssueChecks,
    ...nodeIssueChecks,
  ];
  const publishBlockers = checks.filter((check) => check.blocksPublish);

  return {
    canPublish: publishBlockers.length === 0,
    checks,
    publishBlockers,
    readyChecks: summary.filter((check) => check.status === "ready").length,
    summary,
    totalSummaryChecks: summary.length,
    validation,
  };
}

function createNodeIssueCheck(
  category: WorkflowPublishCheck["category"],
  id: string,
  node: WorkflowNode,
  issues: WorkflowValidationNodeIssue["issues"],
  blocking: WorkflowCheckBlockingScope,
): WorkflowPublishCheck {
  return {
    ...blocking,
    category,
    description: issues[0]?.message ?? "节点仍需补全配置",
    id,
    messages: issues.map((issue) => issue.message),
    nodeId: node.id,
    status: "warning",
    title: node.data.title,
  };
}

function getBlockingScope(): WorkflowCheckBlockingScope {
  return {
    blocksPublish: true,
  };
}

function shouldExposeGraphIssueAsPublishCheck(
  code: WorkflowValidationResult["graphIssues"][number]["code"],
) {
  return code !== "node-disconnected"
    && code !== "missing-start"
    && code !== "missing-end"
    && code !== "end-unreachable";
}

function getSummaryCheckCategory(
  id: WorkflowPublishCheckSummaryItem["id"],
): WorkflowPublishCheck["category"] {
  switch (id) {
    case "start":
      return "start";
    case "connectivity":
      return "connectivity";
    case "config":
      return "config";
    case "end":
      return "end";
  }
}
