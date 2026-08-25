import type {
  WorkflowEntryEventType,
  WorkflowNodeKind,
} from "@chatai/contracts";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeValidationIssue,
  WorkflowPublishCheck,
  WorkflowPublishCheckSummaryItem,
} from "../types";
import {
  isFriendAddWaySelectionInvalid,
  type WorkflowFriendAddWayResource,
} from "../workflow-friend-add-way-resource";
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
  displayChecks: WorkflowPublishCheck[];
  publishBlockers: WorkflowPublishCheck[];
  readyChecks: number;
  summary: WorkflowPublishCheckSummaryItem[];
  totalSummaryChecks: number;
  validation: WorkflowValidationResult;
};

export type WorkflowValidationPolicy = {
  allowedEntryEventTypes: readonly WorkflowEntryEventType[];
  allowedNodeKinds: readonly WorkflowNodeKind[];
  resources?: WorkflowValidationResources;
  runtimeSupportedNodeKinds: readonly WorkflowNodeKind[];
};

export type WorkflowValidationResources = {
  friendAddWays?: Pick<WorkflowFriendAddWayResource, "groups" | "status">;
};

export function buildWorkflowValidationSummary(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  policy: WorkflowValidationPolicy,
): WorkflowValidationSummary {
  const validation = validateWorkflowDraft(nodes, edges);
  return buildWorkflowValidationSummaryFromResult(nodes, validation, policy);
}

export function buildWorkflowValidationSummaryFromResult(
  nodes: WorkflowNode[],
  validation: WorkflowValidationResult,
  policy: WorkflowValidationPolicy,
): WorkflowValidationSummary {
  const effectiveValidation = appendFriendAddWayResourceIssue(validation, policy.resources);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const startIssue = effectiveValidation.nodeIssues.find(
    (item) => item.node.id === effectiveValidation.startNode?.id,
  );
  const disconnectedIssues = effectiveValidation.nodeIssues
    .map(({ issues, node }) => ({
      issues: issues.filter((issue) => issue.source === "graph"),
      node,
    }))
    .filter((item) => item.issues.length > 0);
  const nodeConfigIssues = effectiveValidation.nodeIssues
    .filter((item) => item.node.id !== effectiveValidation.startNode?.id)
    .map(({ issues, node }) => ({
      issues: issues.filter((issue) => issue.source !== "graph"),
      node,
    }))
    .filter((item) => item.issues.length > 0);
  const allowedNodeKinds = new Set<WorkflowNodeKind>(policy.allowedNodeKinds);
  const runtimeSupportedNodeKinds = new Set<WorkflowNodeKind>(policy.runtimeSupportedNodeKinds);
  const unsupportedTypeNodeIssues: WorkflowValidationNodeIssue[] = nodes
    .filter((node) => !allowedNodeKinds.has(node.data.kind))
    .map((node) => ({
      issues: [{
        code: "workflow-type-node-unsupported",
        message: "当前流程类型不支持此节点",
        severity: "warning",
        source: "catalog",
      }],
      node,
    }));
  const unsupportedRuntimeNodeIssues: WorkflowValidationNodeIssue[] = nodes
    .filter((node) => !runtimeSupportedNodeKinds.has(node.data.kind))
    .map((node) => ({
      issues: [{
        code: "runtime-node-unsupported",
        message: "暂不支持发布",
        severity: "warning",
        source: "catalog",
      }],
      node,
    }));
  const publishConfigIssues = mergeNodeIssues(
    nodeConfigIssues,
    unsupportedTypeNodeIssues,
    unsupportedRuntimeNodeIssues,
  );
  const allowedEntryEventTypes = new Set(policy.allowedEntryEventTypes);
  const unsupportedEntryEventIssues = effectiveValidation.startNode?.data.kind === "start"
    ? effectiveValidation.startNode.data.triggers
        .filter((trigger) => !allowedEntryEventTypes.has(trigger.type))
        .map(() => ({
          code: "workflow-type-entry-event-unsupported",
          message: "当前流程类型不支持此触发事件",
          severity: "warning" as const,
          source: "catalog" as const,
        }))
    : [];
  const startConfigIssues = [
    ...startIssue?.issues.filter((issue) => issue.source !== "graph") ?? [],
    ...unsupportedEntryEventIssues,
  ];
  const hasDisconnectedNode = effectiveValidation.disconnectedNodes.length > 0 || disconnectedIssues.length > 0;
  const hasGraphStructureIssue = effectiveValidation.graphIssues.some((issue) =>
    issue.code !== "node-disconnected" && issue.code !== "end-unreachable",
  ) || disconnectedIssues.some(({ issues }) =>
    issues.some((issue) => issue.code !== "node-disconnected"),
  );
  const summary: WorkflowPublishCheckSummaryItem[] = [
    {
      ...getBlockingScope(),
      description: effectiveValidation.startNode && !startConfigIssues.length
        ? effectiveValidation.startNode.data.kind === "start"
          && effectiveValidation.startNode.data.entryMode === "audience-import"
          ? "通过导入人群进入"
          : `已配置 ${effectiveValidation.startNode.data.kind === "start" ? effectiveValidation.startNode.data.triggers.length : 0} 个触发条件`
        : startConfigIssues[0]?.message ?? "缺少开始节点",
      id: "start",
      status: effectiveValidation.startNode && !startConfigIssues.length ? "ready" : "warning",
      title: "进入方式",
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
      description: publishConfigIssues.length
        ? `${publishConfigIssues.length} 个节点存在发布阻断`
        : "所有节点已完成关键配置",
      id: "config",
      status: publishConfigIssues.length ? "warning" : "ready",
      title: "节点配置",
    },
    {
      ...getBlockingScope(),
      description: effectiveValidation.endNode ? "已配置结束节点" : "缺少结束节点",
      id: "end",
      status: effectiveValidation.endNode ? "ready" : "warning",
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
      messages: item.id === "start" && startConfigIssues.length
        ? startConfigIssues.map((issue) => issue.message)
        : [item.description],
      status: "warning",
      title: item.title,
    }));
  const graphIssueChecks: WorkflowPublishCheck[] = effectiveValidation.graphIssues
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
    ...publishConfigIssues.map(({ issues, node }) =>
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
  const displayChecks = buildWorkflowDisplayChecks(nodes, effectiveValidation, checks);
  const publishBlockers = checks.filter((check) => check.blocksPublish);

  return {
    canPublish: publishBlockers.length === 0,
    checks,
    displayChecks,
    publishBlockers,
    readyChecks: summary.filter((check) => check.status === "ready").length,
    summary,
    totalSummaryChecks: summary.length,
    validation: effectiveValidation,
  };
}

function appendFriendAddWayResourceIssue(
  validation: WorkflowValidationResult,
  resources: WorkflowValidationResources | undefined,
): WorkflowValidationResult {
  const startNode = validation.startNode;
  const friendAddWays = resources?.friendAddWays;
  if (!friendAddWays || startNode?.data.kind !== "start" || startNode.data.entryMode === "audience-import") {
    return validation;
  }

  const trigger = startNode.data.triggers.find(item => item.type === "contact.friend_added");
  if (!trigger || trigger.type !== "contact.friend_added" || trigger.sourceIds.length === 0) {
    return validation;
  }

  let issue: WorkflowNodeValidationIssue | undefined;
  if (friendAddWays.status === "error") {
    issue = createFriendAddWayResourceIssue(
      "start-friend-source-unavailable",
      "添加好友来源加载失败",
    );
  } else if (friendAddWays.status !== "ready") {
    issue = createFriendAddWayResourceIssue(
      "start-friend-source-loading",
      "正在校验添加好友来源",
    );
  } else if (isFriendAddWaySelectionInvalid(friendAddWays.groups, trigger)) {
    issue = createFriendAddWayResourceIssue(
      "start-friend-source-invalid",
      "添加好友来源已失效",
    );
  }

  if (!issue) {
    return validation;
  }

  const existingStartIssue = validation.nodeIssues.find(item => item.node.id === startNode.id);
  return {
    ...validation,
    nodeIssues: existingStartIssue
      ? validation.nodeIssues.map(item => item.node.id === startNode.id
          ? { ...item, issues: [...item.issues, issue] }
          : item)
      : [...validation.nodeIssues, { issues: [issue], node: startNode }],
  };
}

function createFriendAddWayResourceIssue(
  code: string,
  message: string,
): WorkflowNodeValidationIssue {
  return {
    code,
    message,
    severity: "warning",
    source: "catalog",
  };
}

function mergeNodeIssues(
  ...groups: WorkflowValidationNodeIssue[][]
): WorkflowValidationNodeIssue[] {
  const issueByNodeId = new Map<string, WorkflowValidationNodeIssue>();

  for (const group of groups) {
    for (const item of group) {
      const existing = issueByNodeId.get(item.node.id);
      issueByNodeId.set(item.node.id, existing
        ? { issues: [...existing.issues, ...item.issues], node: item.node }
        : item);
    }
  }

  return [...issueByNodeId.values()];
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
    description: issues[0]?.message ?? "仍需补全配置",
    id,
    messages: issues.map((issue) => issue.message),
    nodeId: node.id,
    status: "warning",
    title: node.data.title,
  };
}

function buildWorkflowDisplayChecks(
  nodes: WorkflowNode[],
  validation: WorkflowValidationResult,
  checks: WorkflowPublishCheck[],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const groupedByNodeId = new Map<string, WorkflowPublishCheck>();
  const structureMessages: string[] = [];

  for (const check of checks) {
    if (check.id === "config" || check.id === "connectivity") continue;

    const node = check.nodeId
      ? nodeById.get(check.nodeId)
      : check.id === "start"
        ? validation.startNode
        : check.id === "end"
          ? validation.endNode
          : undefined;

    if (!node) {
      structureMessages.push(...(check.messages?.length ? check.messages : [check.description]));
      continue;
    }

    const current = groupedByNodeId.get(node.id);
    const messages = uniqueMessages([
      ...current?.messages ?? [],
      ...(check.messages?.length ? check.messages : [check.description]),
    ]);
    groupedByNodeId.set(node.id, {
      blocksPublish: current?.blocksPublish || check.blocksPublish,
      category: current?.category === "config" || check.category === "config"
        ? "config"
        : check.category,
      description: messages[0] ?? "仍需补全配置",
      id: `node-${node.id}`,
      messages,
      nodeId: node.id,
      nodeKind: node.data.kind,
      status: "warning",
      title: node.data.title,
    });
  }

  const displayChecks = nodes.flatMap((node) => {
    const check = groupedByNodeId.get(node.id);
    return check ? [check] : [];
  });
  const messages = uniqueMessages(structureMessages);
  if (messages.length) {
    displayChecks.push({
      ...getBlockingScope(),
      category: "connectivity",
      description: messages[0] ?? "流程结构仍需调整",
      id: "workflow-structure",
      messages,
      status: "warning",
      title: "流程结构",
    });
  }
  return displayChecks;
}

function uniqueMessages(messages: string[]) {
  return [...new Set(messages)];
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
