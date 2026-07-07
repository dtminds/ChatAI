import {
  AiChat02Icon,
  Clock01Icon,
  GitBranchIcon,
  Message01Icon,
  Rocket01Icon,
  Target01Icon,
} from "@hugeicons/core-free-icons";
import type {
  InsertableMarketingNodeKind,
  MarketingNodeData,
  MarketingNodeKind,
  MarketingNodeStatus,
  MarketingWorkflowNode,
  WorkflowNodeValidationContext,
  WorkflowNodeValidationIssue,
} from "./types";
import {
  defaultActionOption,
  defaultAgentOption,
} from "./node-options";
import type { NodeConfigSection } from "./node-config-types";

export type NodeVisual = {
  accentClassName: string;
  icon: typeof Rocket01Icon;
  label: string;
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

export type WorkflowNodeCatalogEntry = {
  availableNextKinds: MarketingNodeKind[];
  availablePrevKinds: MarketingNodeKind[];
  canDelete: boolean;
  canDuplicate: boolean;
  canInsertAfter: boolean;
  configSections: NodeConfigSection[];
  createDefaultData: () => MarketingNodeData;
  description?: string;
  insertable: boolean;
  kind: MarketingNodeKind;
  paletteLabel?: string;
  sort: number;
  validate?: (
    node: MarketingWorkflowNode,
    context: WorkflowNodeValidationContext,
  ) => WorkflowNodeValidationIssue[];
  visual: NodeVisual;
};

const sourceNodeKinds: MarketingNodeKind[] = ["trigger", "wait", "branch", "action", "ai"];
const targetNodeKinds: MarketingNodeKind[] = ["wait", "branch", "action", "ai", "goal"];

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

export const workflowNodeCatalog: Record<MarketingNodeKind, WorkflowNodeCatalogEntry> = {
  action: {
    availableNextKinds: targetNodeKinds,
    availablePrevKinds: sourceNodeKinds,
    canDelete: true,
    canDuplicate: true,
    canInsertAfter: true,
    configSections: [],
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
    sort: 30,
    validate: (node) => (
      hasText(node.data.actionType)
        ? []
        : [createCatalogIssue("action-type-required", "营销动作需要选择动作类型")]
    ),
    visual: nodeVisuals.action,
  },
  ai: {
    availableNextKinds: targetNodeKinds,
    availablePrevKinds: sourceNodeKinds,
    canDelete: true,
    canDuplicate: true,
    canInsertAfter: true,
    configSections: [],
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
    sort: 40,
    validate: (node) => (
      hasText(node.data.agentName)
        ? []
        : [createCatalogIssue("ai-agent-required", "AI 接待需要绑定 Agent")]
    ),
    visual: nodeVisuals.ai,
  },
  branch: {
    availableNextKinds: targetNodeKinds,
    availablePrevKinds: sourceNodeKinds,
    canDelete: true,
    canDuplicate: true,
    canInsertAfter: true,
    configSections: [
      {
        fields: [
          {
            getValue: (data) => data.branchRule ?? "",
            id: "workflow-branch-rule",
            kind: "textarea",
            label: "条件表达式",
            minRows: 5,
            toPatch: (value) => ({
              branchRule: value,
              metric: value ? "2 条分支" : "未配置分支",
              status: value ? "ready" : "warning",
            }),
          },
        ],
        id: "branch-rule",
        title: "分支条件",
      },
    ],
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
    sort: 20,
    validate: (node) => (
      hasText(node.data.branchRule)
        ? []
        : [createCatalogIssue("branch-rule-required", "条件分支需要配置条件表达式")]
    ),
    visual: nodeVisuals.branch,
  },
  goal: {
    availableNextKinds: [],
    availablePrevKinds: sourceNodeKinds,
    canDelete: false,
    canDuplicate: false,
    canInsertAfter: false,
    configSections: [
      {
        fields: [
          {
            getValue: (data) => data.conversion ?? 18.4,
            id: "workflow-conversion",
            kind: "number",
            label: "目标转化率",
            min: 0,
            suffix: "%",
            toPatch: (value) => ({
              conversion: value,
              metric: `目标 ${value}%`,
            }),
          },
        ],
        id: "goal",
        title: "目标设置",
      },
    ],
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
    sort: 100,
    validate: (node) => (
      typeof node.data.conversion === "number"
        ? []
        : [createCatalogIssue("goal-conversion-required", "目标节点需要配置转化指标")]
    ),
    visual: nodeVisuals.goal,
  },
  trigger: {
    availableNextKinds: targetNodeKinds,
    availablePrevKinds: [],
    canDelete: false,
    canDuplicate: false,
    canInsertAfter: true,
    configSections: [
      {
        fields: [
          {
            getValue: (data) => data.audience ?? "",
            id: "workflow-audience",
            kind: "text",
            label: "触发人群",
            toPatch: (value) => ({
              audience: value,
              metric: value ? "预计进入 124.8万人" : "未配置人群",
              status: value ? "running" : "warning",
            }),
          },
        ],
        id: "trigger",
        title: "进入规则",
      },
    ],
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
    sort: 0,
    validate: (node) => (
      hasText(node.data.audience)
        ? []
        : [createCatalogIssue("trigger-audience-required", "触发节点需要选择进入人群")]
    ),
    visual: nodeVisuals.trigger,
  },
  wait: {
    availableNextKinds: targetNodeKinds,
    availablePrevKinds: sourceNodeKinds,
    canDelete: true,
    canDuplicate: true,
    canInsertAfter: true,
    configSections: [
      {
        fields: [
          {
            getValue: (data) => data.delayDays ?? 2,
            id: "workflow-delay-days",
            kind: "number",
            label: "等待天数",
            min: 0,
            suffix: "天",
            toPatch: (value) => ({
              delayDays: value,
              metric: `${value} 天后唤醒`,
              summary: `等待 ${value} 天后继续触达`,
            }),
          },
        ],
        id: "wait",
        title: "等待时间",
      },
    ],
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
    sort: 10,
    validate: (node) => (
      typeof node.data.delayDays === "number" && node.data.delayDays >= 0
        ? []
        : [createCatalogIssue("wait-delay-required", "等待节点需要配置等待天数")]
    ),
    visual: nodeVisuals.wait,
  },
};

export const orderedWorkflowNodeCatalog = Object.values(workflowNodeCatalog).sort(
  (first, second) => first.sort - second.sort,
);

type InsertableWorkflowNodeCatalogEntry = WorkflowNodeCatalogEntry & {
  kind: InsertableMarketingNodeKind;
  paletteLabel: string;
};

export const insertableNodeKinds = orderedWorkflowNodeCatalog
  .filter(isInsertableWorkflowNodeCatalogEntry)
  .map((definition) => definition.kind);

export const paletteItems = insertableNodeKinds
  .map((kind) => workflowNodeCatalog[kind])
  .filter(isInsertableWorkflowNodeCatalogEntry)
  .map((definition) => ({
    description: definition.description ?? "",
    icon: definition.visual.icon,
    id: definition.kind,
    label: definition.paletteLabel,
  })) satisfies Array<{
  description: string;
  icon: typeof Rocket01Icon;
  id: InsertableMarketingNodeKind;
  label: string;
}>;

export function getAvailableNextNodeKinds(kind: MarketingNodeKind) {
  return getWorkflowNodeCatalogEntry(kind).availableNextKinds;
}

export function getAvailablePrevNodeKinds(kind: MarketingNodeKind) {
  return getWorkflowNodeCatalogEntry(kind).availablePrevKinds;
}

export function getInsertableNodeKindsForSource(
  sourceKind: MarketingNodeKind,
): InsertableMarketingNodeKind[] {
  const availableNextKinds = new Set(getAvailableNextNodeKinds(sourceKind));

  return insertableNodeKinds.filter((kind) => availableNextKinds.has(kind));
}

export function getInsertableNodeKindsBetween(
  sourceKind: MarketingNodeKind,
  targetKind: MarketingNodeKind,
): InsertableMarketingNodeKind[] {
  return getInsertableNodeKindsForSource(sourceKind).filter((kind) =>
    getAvailableNextNodeKinds(kind).includes(targetKind)
    && getAvailablePrevNodeKinds(targetKind).includes(kind),
  );
}

export function getPaletteItemsByKinds(kinds: InsertableMarketingNodeKind[]) {
  const kindSet = new Set(kinds);

  return paletteItems.filter((item) => kindSet.has(item.id));
}

export function getWorkflowNodeCatalogEntry(kind: MarketingNodeKind) {
  return workflowNodeCatalog[kind];
}

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

function isInsertableWorkflowNodeCatalogEntry(
  definition: WorkflowNodeCatalogEntry,
): definition is InsertableWorkflowNodeCatalogEntry {
  return definition.insertable
    && definition.paletteLabel !== undefined
    && definition.kind !== "goal"
    && definition.kind !== "trigger";
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function createCatalogIssue(
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
