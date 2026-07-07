import { branchHandleOptions, WORKFLOW_LAYOUT_X_GAP, WORKFLOW_LAYOUT_Y_GAP } from "./constants";
import type {
  InsertableMarketingNodeKind,
  MarketingWorkflowEdge,
  MarketingWorkflowNode,
  WorkflowPublishCheck,
} from "./types";

export function createInitialNodes(): MarketingWorkflowNode[] {
  return [
    {
      data: {
        audience: "近 30 天新入会且未首购客户",
        kind: "trigger",
        label: "触发",
        metric: "预计进入 124.8万人",
        status: "running",
        summary: "客户入会后立即进入新人转化旅程",
        title: "新人入会触发",
      },
      id: "trigger",
      position: { x: 0, y: 0 },
      type: "marketing",
    },
    {
      data: {
        delayDays: 2,
        kind: "wait",
        label: "等待",
        metric: "2 天后唤醒",
        status: "ready",
        summary: "等待 2 天后继续触达",
        title: "观察期",
      },
      id: "wait-2d",
      position: { x: 310, y: 0 },
      type: "marketing",
    },
    {
      data: {
        branchRule: "最近 7 天浏览活动页 >= 2 次，或咨询过商品功效",
        kind: "branch",
        label: "条件",
        metric: "2 条分支",
        status: "ready",
        summary: "按活动兴趣和咨询意图拆分路径",
        title: "意向判断",
      },
      id: "branch-intent",
      position: { x: 620, y: 0 },
      type: "marketing",
    },
    {
      data: {
        actionType: "message",
        kind: "action",
        label: "发送消息",
        metric: "欢迎语 + 活动卡片",
        status: "ready",
        summary: "发送欢迎语和活动权益卡片",
        title: "发送欢迎消息",
      },
      id: "action-message",
      position: { x: 930, y: -94 },
      type: "marketing",
    },
    {
      data: {
        conversion: 18.4,
        kind: "goal",
        label: "目标",
        metric: "目标 18.4%",
        status: "ready",
        summary: "完成首单或领取新人券后退出",
        title: "首单转化",
      },
      id: "goal",
      position: { x: 1240, y: 0 },
      type: "marketing",
    },
  ];
}

export function createInitialEdges(): MarketingWorkflowEdge[] {
  return [
    createEdge("trigger", "wait-2d"),
    createEdge("wait-2d", "branch-intent"),
    createEdge("branch-intent", "action-message", "高意向", {
      sourceHandle: "branch-high",
    }),
    createEdge("action-message", "goal"),
  ];
}

export function createNodeFromKind(
  kind: InsertableMarketingNodeKind,
  id: string,
  index: number,
): MarketingWorkflowNode {
  const commonPosition = {
    x: 300 + index * 310,
    y: index % 2 === 0 ? -94 : 94,
  };

  if (kind === "ai") {
    return {
      data: {
        actionType: "ai",
        agentName: "护肤小助理",
        kind: "ai",
        label: "AI 接待",
        metric: "护肤知识库、活动政策",
        status: "ready",
        summary: "护肤小助理",
        title: "AI 接待",
      },
      id,
      position: commonPosition,
      type: "marketing",
    };
  }

  if (kind === "wait") {
    return {
      data: {
        delayDays: 1,
        kind: "wait",
        label: "等待",
        metric: "1 天后唤醒",
        status: "ready",
        summary: "等待 1 天后继续触达",
        title: "等待",
      },
      id,
      position: commonPosition,
      type: "marketing",
    };
  }

  if (kind === "branch") {
    return {
      data: {
        branchRule: "",
        kind: "branch",
        label: "条件",
        metric: "未配置分支",
        status: "warning",
        summary: "按客户标签、行为或会话意图拆分路径",
        title: "条件分支",
      },
      id,
      position: commonPosition,
      type: "marketing",
    };
  }

  return {
    data: {
      actionType: "coupon",
      kind: "action",
      label: "营销动作",
      metric: "新人券 · 满 199 减 30",
      status: "ready",
      summary: "发放新人专属优惠券",
      title: "发优惠券",
    },
    id,
    position: commonPosition,
    type: "marketing",
  };
}

export function createEdge(
  source: string,
  target: string,
  label?: string,
  handles: {
    sourceHandle?: string | null;
    targetHandle?: string | null;
  } = {},
): MarketingWorkflowEdge {
  const sourceHandle = handles.sourceHandle ?? undefined;
  const targetHandle = handles.targetHandle ?? undefined;
  const edgeIdParts = ["edge", source, sourceHandle, target, targetHandle].filter(Boolean);

  return {
    data: label ? { label } : undefined,
    id: edgeIdParts.join("-"),
    source,
    sourceHandle,
    target,
    targetHandle,
    type: "marketing",
  };
}

export function findLastActionNodeId(nodes: MarketingWorkflowNode[], edges: MarketingWorkflowEdge[]) {
  const edgeToGoal = edges.find((edge) => edge.target === "goal");

  if (edgeToGoal) {
    return edgeToGoal.source;
  }

  const nonGoalNodes = nodes.filter((node) => node.id !== "goal");
  return nonGoalNodes[nonGoalNodes.length - 1]?.id ?? "trigger";
}

export function getBranchHandleIndex(sourceHandle?: string) {
  const index = branchHandleOptions.findIndex((branch) => branch.id === sourceHandle);

  return index >= 0 ? index : 0;
}

export function getBranchHandleLabel(sourceHandle?: string) {
  return branchHandleOptions.find((branch) => branch.id === sourceHandle)?.label;
}

export function getBranchInsertY(nodeY: number, sourceHandle?: string) {
  return nodeY + (getBranchHandleIndex(sourceHandle) - 1) * 96;
}

export function getAfterNodesInSameBranch(
  nodes: MarketingWorkflowNode[],
  edges: MarketingWorkflowEdge[],
  nodeId: string,
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const result: MarketingWorkflowNode[] = [];
  const visitedNodeIds = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const currentNodeId = queue.shift();

    if (!currentNodeId || visitedNodeIds.has(currentNodeId)) {
      continue;
    }

    visitedNodeIds.add(currentNodeId);
    const currentNode = nodeById.get(currentNodeId);

    if (currentNode) {
      result.push(currentNode);
    }

    edges.forEach((edge) => {
      if (edge.source === currentNodeId && !visitedNodeIds.has(edge.target)) {
        queue.push(edge.target);
      }
    });
  }

  return result;
}

export function getNodeIdSet(nodes: MarketingWorkflowNode[]) {
  return new Set(nodes.map((node) => node.id));
}

export function shiftNodesRight(
  nodes: MarketingWorkflowNode[],
  shiftedNodeIds: Set<string>,
) {
  if (shiftedNodeIds.size === 0) {
    return nodes;
  }

  return nodes.map((node) =>
    shiftedNodeIds.has(node.id)
      ? {
          ...node,
          position: {
            ...node.position,
            x: node.position.x + WORKFLOW_LAYOUT_X_GAP,
          },
        }
      : node,
  );
}

export function arrangeWorkflowNodes(
  nodes: MarketingWorkflowNode[],
  edges: MarketingWorkflowEdge[],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const originalIndexById = new Map(nodes.map((node, index) => [node.id, index]));
  const incomingCountById = new Map(nodes.map((node) => [node.id, 0]));
  const outgoingById = new Map(nodes.map((node) => [node.id, [] as string[]]));

  edges.forEach((edge) => {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) {
      return;
    }

    outgoingById.get(edge.source)?.push(edge.target);
    incomingCountById.set(edge.target, (incomingCountById.get(edge.target) ?? 0) + 1);
  });

  const depthById = new Map(nodes.map((node) => [node.id, 0]));
  const queue = nodes
    .filter((node) => incomingCountById.get(node.id) === 0)
    .sort(compareNodesForLayout(originalIndexById));
  const arrangedIds = new Set<string>();

  while (queue.length > 0) {
    const node = queue.shift();

    if (!node || arrangedIds.has(node.id)) {
      continue;
    }

    arrangedIds.add(node.id);

    (outgoingById.get(node.id) ?? []).forEach((targetId) => {
      depthById.set(
        targetId,
        Math.max(depthById.get(targetId) ?? 0, (depthById.get(node.id) ?? 0) + 1),
      );
      incomingCountById.set(targetId, (incomingCountById.get(targetId) ?? 1) - 1);

      if (incomingCountById.get(targetId) === 0) {
        const targetNode = nodeById.get(targetId);

        if (targetNode) {
          queue.push(targetNode);
          queue.sort(compareNodesForLayout(originalIndexById));
        }
      }
    });
  }

  nodes.forEach((node) => {
    if (!arrangedIds.has(node.id)) {
      depthById.set(node.id, Math.max(0, Math.round(node.position.x / WORKFLOW_LAYOUT_X_GAP)));
    }
  });

  const nodesByDepth = new Map<number, MarketingWorkflowNode[]>();

  nodes.forEach((node) => {
    const depth = depthById.get(node.id) ?? 0;
    nodesByDepth.set(depth, [...(nodesByDepth.get(depth) ?? []), node]);
  });

  const yById = new Map<string, number>();

  nodesByDepth.forEach((nodesInDepth) => {
    const sortedNodes = [...nodesInDepth].sort(compareNodesForLayout(originalIndexById));

    if (sortedNodes.length === 1) {
      yById.set(sortedNodes[0].id, sortedNodes[0].position.y);
      return;
    }

    sortedNodes.forEach((node, index) => {
      yById.set(
        node.id,
        (index - (sortedNodes.length - 1) / 2) * WORKFLOW_LAYOUT_Y_GAP,
      );
    });
  });

  return nodes.map((node) => ({
    ...node,
    position: {
      x: (depthById.get(node.id) ?? 0) * WORKFLOW_LAYOUT_X_GAP,
      y: yById.get(node.id) ?? node.position.y,
    },
  }));
}

function compareNodesForLayout(originalIndexById: Map<string, number>) {
  return (first: MarketingWorkflowNode, second: MarketingWorkflowNode) => {
    if (first.id === "trigger") {
      return -1;
    }

    if (second.id === "trigger") {
      return 1;
    }

    return first.position.y - second.position.y
      || first.position.x - second.position.x
      || (originalIndexById.get(first.id) ?? 0) - (originalIndexById.get(second.id) ?? 0);
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

