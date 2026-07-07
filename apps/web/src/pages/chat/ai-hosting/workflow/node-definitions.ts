import {
  AiChat02Icon,
  Clock01Icon,
  GitBranchIcon,
  Message01Icon,
  Rocket01Icon,
  Target01Icon,
} from "@hugeicons/core-free-icons";
import type { ComponentType } from "react";
import type {
  InsertableMarketingNodeKind,
  MarketingNodeData,
  MarketingNodeKind,
  MarketingNodeStatus,
  MarketingWorkflowNode,
  WorkflowVariables,
} from "./types";
import {
  defaultActionOption,
  defaultAgentOption,
} from "./node-options";
import type { NodeBodyProps } from "./nodes/node-bodies";
import {
  BranchNodeBody,
  StandardNodeBody,
} from "./nodes/node-bodies";
import {
  ActionConfig,
  AiReceptionConfig,
  BranchConfig,
  GoalConfig,
  TriggerConfig,
  WaitConfig,
} from "./panels/node-settings";
import type { NodeSettingsProps } from "./panels/types";

export type NodeVisual = {
  accentClassName: string;
  icon: typeof Rocket01Icon;
  label: string;
};

type NodeDefinition = {
  body: ComponentType<NodeBodyProps>;
  canDelete: boolean;
  canDuplicate: boolean;
  canInsertAfter: boolean;
  createDefaultData: () => MarketingNodeData;
  description?: string;
  insertable: boolean;
  kind: MarketingNodeKind;
  paletteLabel?: string;
  settings: ComponentType<NodeSettingsProps>;
  sort: number;
  visual: NodeVisual;
};

type NodeDataInput = {
  actionType?: MarketingNodeData["actionType"];
  agentName?: string;
  audience?: string;
  branchRule?: string;
  conversion?: number;
  delayDays?: number;
  label: string;
  metric: string;
  status?: MarketingNodeStatus;
  summary: string;
  title: string;
};

export const nodeVisuals: Record<MarketingNodeKind, NodeVisual> = {
  action: {
    accentClassName: "bg-sky-500/12 text-sky-700 ring-sky-500/20",
    icon: Message01Icon,
    label: "动作",
  },
  ai: {
    accentClassName: "bg-violet-500/12 text-violet-700 ring-violet-500/20",
    icon: AiChat02Icon,
    label: "AI",
  },
  branch: {
    accentClassName: "bg-amber-500/12 text-amber-700 ring-amber-500/20",
    icon: GitBranchIcon,
    label: "条件",
  },
  goal: {
    accentClassName: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/20",
    icon: Target01Icon,
    label: "目标",
  },
  trigger: {
    accentClassName: "bg-rose-500/12 text-rose-700 ring-rose-500/20",
    icon: Rocket01Icon,
    label: "触发",
  },
  wait: {
    accentClassName: "bg-indigo-500/12 text-indigo-700 ring-indigo-500/20",
    icon: Clock01Icon,
    label: "等待",
  },
};

function createNodeData(
  kind: MarketingNodeKind,
  data: NodeDataInput,
): MarketingNodeData {
  return {
    ...data,
    kind,
    status: data.status ?? "ready",
  };
}

export const nodeDefinitions = {
  action: {
    body: StandardNodeBody,
    canDelete: true,
    canDuplicate: true,
    canInsertAfter: true,
    createDefaultData: () =>
      createNodeData("action", {
        actionType: defaultActionOption.type,
        label: "营销动作",
        metric: defaultActionOption.summary,
        summary: "发放新人专属优惠券",
        title: defaultActionOption.label,
      }),
    description: "发送私域消息、优惠券或打标签",
    insertable: true,
    kind: "action",
    paletteLabel: "营销动作",
    settings: ActionConfig,
    sort: 30,
    visual: nodeVisuals.action,
  },
  ai: {
    body: StandardNodeBody,
    canDelete: true,
    canDuplicate: true,
    canInsertAfter: true,
    createDefaultData: () =>
      createNodeData("ai", {
        actionType: "ai",
        agentName: defaultAgentOption.name,
        label: "AI 接待",
        metric: defaultAgentOption.knowledge,
        summary: defaultAgentOption.name,
        title: "AI 接待",
      }),
    description: "启用指定 Agent，接管后续会话",
    insertable: true,
    kind: "ai",
    paletteLabel: "AI 接待",
    settings: AiReceptionConfig,
    sort: 40,
    visual: nodeVisuals.ai,
  },
  branch: {
    body: BranchNodeBody,
    canDelete: true,
    canDuplicate: true,
    canInsertAfter: true,
    createDefaultData: () =>
      createNodeData("branch", {
        branchRule: "",
        label: "条件",
        metric: "未配置分支",
        status: "warning",
        summary: "按客户标签、行为或会话意图拆分路径",
        title: "条件分支",
      }),
    description: "按标签、行为、会话意图分支",
    insertable: true,
    kind: "branch",
    paletteLabel: "条件分支",
    settings: BranchConfig,
    sort: 20,
    visual: nodeVisuals.branch,
  },
  goal: {
    body: StandardNodeBody,
    canDelete: false,
    canDuplicate: false,
    canInsertAfter: false,
    createDefaultData: () =>
      createNodeData("goal", {
        conversion: 18.4,
        label: "目标",
        metric: "目标 18.4%",
        summary: "完成首单或领取新人券后退出",
        title: "首单转化",
      }),
    insertable: false,
    kind: "goal",
    settings: GoalConfig,
    sort: 100,
    visual: nodeVisuals.goal,
  },
  trigger: {
    body: StandardNodeBody,
    canDelete: false,
    canDuplicate: false,
    canInsertAfter: true,
    createDefaultData: () =>
      createNodeData("trigger", {
        audience: "近 30 天新入会且未首购客户",
        label: "触发",
        metric: "预计进入 124.8万人",
        status: "running",
        summary: "客户入会后立即进入新人转化旅程",
        title: "新人入会触发",
      }),
    insertable: false,
    kind: "trigger",
    settings: TriggerConfig,
    sort: 0,
    visual: nodeVisuals.trigger,
  },
  wait: {
    body: StandardNodeBody,
    canDelete: true,
    canDuplicate: true,
    canInsertAfter: true,
    createDefaultData: () =>
      createNodeData("wait", {
        delayDays: 1,
        label: "等待",
        metric: "1 天后唤醒",
        summary: "等待 1 天后继续触达",
        title: "等待",
      }),
    description: "按天、小时或固定窗口延迟触达",
    insertable: true,
    kind: "wait",
    paletteLabel: "等待",
    settings: WaitConfig,
    sort: 10,
    visual: nodeVisuals.wait,
  },
} as const satisfies Record<MarketingNodeKind, NodeDefinition>;

export const orderedNodeDefinitions = Object.values(nodeDefinitions).sort(
  (first, second) => first.sort - second.sort,
);

export function getNodeDefinition(kind: MarketingNodeKind) {
  return nodeDefinitions[kind];
}

export function canDeleteNodeKind(kind: MarketingNodeKind) {
  return getNodeDefinition(kind).canDelete;
}

export function canDuplicateNodeKind(kind: MarketingNodeKind) {
  return getNodeDefinition(kind).canDuplicate;
}

export function canInsertAfterNodeKind(kind: MarketingNodeKind) {
  return getNodeDefinition(kind).canInsertAfter;
}

export function canInsertNodeKind(kind: MarketingNodeKind): kind is InsertableMarketingNodeKind {
  return getNodeDefinition(kind).insertable;
}

export function createDefaultNodeData(kind: MarketingNodeKind): MarketingNodeData {
  return getNodeDefinition(kind).createDefaultData();
}

export const insertableNodeKinds: InsertableMarketingNodeKind[] = ["wait", "branch", "action", "ai"];

export const paletteItems = insertableNodeKinds
  .map((kind) => nodeDefinitions[kind])
  .map((definition) => ({
    description: definition.description ?? "",
    icon: definition.visual.icon,
    id: definition.kind as InsertableMarketingNodeKind,
    label: definition.paletteLabel,
  })) satisfies Array<{
  description: string;
  icon: typeof Rocket01Icon;
  id: InsertableMarketingNodeKind;
  label: string;
}>;

export function getNodeVariables(node: MarketingWorkflowNode): WorkflowVariables {
  return {
    inputs: [
      {
        name: "customer.profile",
        type: "object",
        value: node.data.audience ?? "上游客户画像",
      },
      {
        name: "journey.currentNode",
        type: "string",
        value: node.data.title,
      },
    ],
    outputs: [
      {
        name: `${node.data.kind}.result`,
        type: "object",
        value: node.data.metric,
      },
      {
        name: "journey.next",
        type: "string",
        value: node.data.kind === "goal" ? "退出旅程" : "进入下一节点",
      },
    ],
  };
}
