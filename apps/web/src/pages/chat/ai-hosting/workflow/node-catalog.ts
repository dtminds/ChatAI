import {
  AiChat02Icon,
  Clock01Icon,
  GitBranchIcon,
  Message01Icon,
  Rocket01Icon,
  Target01Icon,
} from "@hugeicons/core-free-icons";
import type {
  InsertableWorkflowNodeKind,
  WorkflowNodeData,
  WorkflowNodeKind,
  WorkflowNodeStatus,
  WorkflowNode,
  WorkflowNodeValidationContext,
  WorkflowNodeValidationIssue,
  WorkflowVariable,
} from "./types";
import {
  actionOptions,
  defaultActionOption,
  defaultAgentOption,
  agentOptions,
} from "./node-options";
import {
  createDefaultBranchPaths,
  getWorkflowBranchPaths,
} from "./branch-paths";
import type { NodeConfigSection } from "./node-config-types";

export type NodeVisual = {
  accentClassName: string;
  icon: typeof Rocket01Icon;
  label: string;
};

export type WorkflowNodePaletteGroupId = "engagement" | "flow" | "logic";

export type WorkflowNodePaletteGroup = {
  id: WorkflowNodePaletteGroupId;
  label: string;
  sort: number;
};

type NodeDataInput = {
  actionType?: WorkflowNodeData["actionType"];
  agentName?: string;
  audience?: string;
  branchPaths?: WorkflowNodeData["branchPaths"];
  branchRule?: string;
  conversion?: number;
  delayDays?: number;
  handoffRule?: string;
  label: string;
  metric: string;
  repeatEntryEnabled?: boolean;
  status?: WorkflowNodeStatus;
  summary: string;
  title: string;
};

export type WorkflowNodeCatalogEntry = {
  availableNextKinds: WorkflowNodeKind[];
  availablePrevKinds: WorkflowNodeKind[];
  canDelete: boolean;
  canDuplicate: boolean;
  canInsertAfter: boolean;
  configSections: NodeConfigSection[];
  createExecutionConfig: (data: WorkflowNodeData) => Record<string, unknown>;
  createDefaultData: () => WorkflowNodeData;
  description?: string;
  insertable: boolean;
  kind: WorkflowNodeKind;
  paletteLabel?: string;
  paletteGroup?: WorkflowNodePaletteGroupId;
  getOutputVariables?: (node: WorkflowNode) => WorkflowVariable[];
  sort: number;
  validate?: (
    node: WorkflowNode,
    context: WorkflowNodeValidationContext,
  ) => WorkflowNodeValidationIssue[];
  visual: NodeVisual;
};

const sourceNodeKinds: WorkflowNodeKind[] = ["trigger", "wait", "branch", "action", "ai"];
const targetNodeKinds: WorkflowNodeKind[] = ["wait", "branch", "action", "ai", "goal"];

export const workflowNodePaletteGroups = [
  {
    id: "flow",
    label: "流程控制",
    sort: 10,
  },
  {
    id: "logic",
    label: "条件逻辑",
    sort: 20,
  },
  {
    id: "engagement",
    label: "触达动作",
    sort: 30,
  },
] as const satisfies readonly WorkflowNodePaletteGroup[];

export const nodeVisuals: Record<WorkflowNodeKind, NodeVisual> = {
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

export const workflowNodeCatalog: Record<WorkflowNodeKind, WorkflowNodeCatalogEntry> = {
  action: {
    availableNextKinds: targetNodeKinds,
    availablePrevKinds: sourceNodeKinds,
    canDelete: true,
    canDuplicate: true,
    canInsertAfter: true,
    configSections: [
      {
        fields: [
          {
            columns: 2,
            getOptions: () =>
              actionOptions.map((option) => ({
                description: option.summary,
                icon: option.icon,
                label: option.label,
                value: option.type,
              })),
            getValidationValue: (data) => data.actionType,
            getValue: (data) => data.actionType ?? defaultActionOption.type,
            id: "workflow-action-type",
            kind: "option-cards",
            label: "动作类型",
            toPatch: (value, _data, option) => ({
              actionType: value as WorkflowNodeData["actionType"],
              label: option.label,
              metric: option.description ?? "",
              status: "ready",
              summary: option.description ?? "",
              title: option.label,
            }),
            validation: {
              required: {
                code: "action-type-required",
                message: "营销动作需要选择动作类型",
              },
            },
          },
        ],
        id: "action-type",
        title: "动作类型",
      },
    ],
    createDefaultData: () =>
      createNodeData("action", {
        actionType: defaultActionOption.type,
        label: "营销动作",
        metric: defaultActionOption.summary,
        summary: "发放新人专属优惠券",
        title: defaultActionOption.label,
      }),
    createExecutionConfig: (data) => pickDefinedWorkflowConfig({
      actionType: data.actionType,
    }),
    description: "发送私域消息、优惠券或打标签",
    insertable: true,
    kind: "action",
    paletteGroup: "engagement",
    paletteLabel: "营销动作",
    getOutputVariables: createDefaultOutputVariables,
    sort: 30,
    validate: validateActionNode,
    visual: nodeVisuals.action,
  },
  ai: {
    availableNextKinds: targetNodeKinds,
    availablePrevKinds: sourceNodeKinds,
    canDelete: true,
    canDuplicate: true,
    canInsertAfter: true,
    configSections: [
      {
        fields: [
          {
            columns: 1,
            getOptions: () =>
              agentOptions.map((agent) => ({
                description: agent.description,
                label: agent.name,
                value: agent.name,
              })),
            getValidationValue: (data) => data.agentName,
            getValue: (data) => data.agentName ?? defaultAgentOption.name,
            id: "workflow-agent",
            kind: "option-cards",
            label: "接待 Agent",
            toPatch: (value) => {
              const agent = agentOptions.find((option) => option.name === value) ?? defaultAgentOption;

              return {
                actionType: "ai",
                agentName: agent.name,
                label: "AI 接待",
                metric: agent.knowledge,
                status: "ready",
                summary: agent.name,
              };
            },
            validation: {
              required: {
                code: "ai-agent-required",
                message: "AI 接待需要绑定 Agent",
              },
            },
          },
          {
            getValue: (data) => data.handoffRule ?? "",
            id: "workflow-handoff-rule",
            kind: "textarea",
            label: "转人工条件",
            minRows: 4,
            toPatch: (value) => ({ handoffRule: value }),
          },
        ],
        id: "ai-reception",
        title: "AI 接待策略",
      },
    ],
    createDefaultData: () =>
      createNodeData("ai", {
        actionType: "ai",
        agentName: defaultAgentOption.name,
        handoffRule: "客户要求人工、投诉升级、识别到价格异议",
        label: "AI 接待",
        metric: defaultAgentOption.knowledge,
        summary: defaultAgentOption.name,
        title: "AI 接待",
      }),
    createExecutionConfig: (data) => pickDefinedWorkflowConfig({
      agentName: data.agentName,
      handoffRule: data.handoffRule,
    }),
    description: "启用指定 Agent，接管后续会话",
    insertable: true,
    kind: "ai",
    paletteGroup: "engagement",
    paletteLabel: "AI 接待",
    getOutputVariables: createDefaultOutputVariables,
    sort: 40,
    validate: validateAiNode,
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
            validation: {
              required: {
                code: "branch-rule-required",
                message: "条件分支需要配置条件表达式",
              },
            },
          },
        ],
        id: "branch-rule",
        title: "分支条件",
      },
    ],
    createDefaultData: () =>
      createNodeData("branch", {
        branchPaths: createDefaultBranchPaths(),
        branchRule: "",
        label: "条件",
        metric: "未配置分支",
        status: "warning",
        summary: "按客户标签、行为或会话意图拆分路径",
        title: "条件分支",
      }),
    createExecutionConfig: (data) => pickDefinedWorkflowConfig({
      branchPaths: data.branchPaths,
      branchRule: data.branchRule,
    }),
    description: "按标签、行为、会话意图分支",
    insertable: true,
    kind: "branch",
    paletteGroup: "logic",
    paletteLabel: "条件分支",
    getOutputVariables: createDefaultOutputVariables,
    sort: 20,
    validate: validateBranchNode,
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
            validation: {
              number: {
                code: "goal-conversion-required",
                message: "目标节点需要配置有效转化指标",
              },
            },
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
    createExecutionConfig: (data) => pickDefinedWorkflowConfig({
      conversion: data.conversion,
    }),
    insertable: false,
    kind: "goal",
    getOutputVariables: createDefaultOutputVariables,
    sort: 100,
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
            validation: {
              required: {
                code: "trigger-audience-required",
                message: "触发节点需要选择进入人群",
              },
            },
          },
          {
            description: "同一客户 7 天内最多进入一次",
            getValue: (data) => data.repeatEntryEnabled ?? true,
            id: "workflow-repeat-entry",
            kind: "switch",
            label: "允许重复进入",
            toPatch: (value) => ({ repeatEntryEnabled: value }),
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
        repeatEntryEnabled: true,
        status: "running",
        summary: "客户入会后立即进入新人转化旅程",
        title: "新人入会触发",
      }),
    createExecutionConfig: (data) => pickDefinedWorkflowConfig({
      audience: data.audience,
      repeatEntryEnabled: data.repeatEntryEnabled,
    }),
    insertable: false,
    kind: "trigger",
    getOutputVariables: createDefaultOutputVariables,
    sort: 0,
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
            validation: {
              number: {
                code: "wait-delay-required",
                message: "等待节点需要配置等待天数",
              },
            },
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
    createExecutionConfig: (data) => pickDefinedWorkflowConfig({
      delayDays: data.delayDays,
    }),
    description: "按天、小时或固定窗口延迟触达",
    insertable: true,
    kind: "wait",
    paletteGroup: "flow",
    paletteLabel: "等待",
    getOutputVariables: createDefaultOutputVariables,
    sort: 10,
    visual: nodeVisuals.wait,
  },
};

export const orderedWorkflowNodeCatalog = Object.values(workflowNodeCatalog).sort(
  (first, second) => first.sort - second.sort,
);

type InsertableWorkflowNodeCatalogEntry = WorkflowNodeCatalogEntry & {
  kind: InsertableWorkflowNodeKind;
  paletteGroup: WorkflowNodePaletteGroupId;
  paletteLabel: string;
};

export type WorkflowPaletteItem = {
  description: string;
  groupId: WorkflowNodePaletteGroupId;
  icon: typeof Rocket01Icon;
  id: InsertableWorkflowNodeKind;
  label: string;
  searchText: string;
  sort: number;
};

export type WorkflowPaletteItemGroup = WorkflowNodePaletteGroup & {
  items: WorkflowPaletteItem[];
};

export const insertableNodeKinds = orderedWorkflowNodeCatalog
  .filter(isInsertableWorkflowNodeCatalogEntry)
  .map((definition) => definition.kind);

export const paletteItems = insertableNodeKinds
  .map((kind) => workflowNodeCatalog[kind])
  .filter(isInsertableWorkflowNodeCatalogEntry)
  .map(createPaletteItem) satisfies WorkflowPaletteItem[];

export function getAvailableNextNodeKinds(kind: WorkflowNodeKind) {
  return getWorkflowNodeCatalogEntry(kind).availableNextKinds;
}

export function getAvailablePrevNodeKinds(kind: WorkflowNodeKind) {
  return getWorkflowNodeCatalogEntry(kind).availablePrevKinds;
}

export function getInsertableNodeKindsForSource(
  sourceKind: WorkflowNodeKind,
): InsertableWorkflowNodeKind[] {
  const availableNextKinds = new Set(getAvailableNextNodeKinds(sourceKind));

  return insertableNodeKinds.filter((kind) => availableNextKinds.has(kind));
}

export function getInsertableNodeKindsBetween(
  sourceKind: WorkflowNodeKind,
  targetKind: WorkflowNodeKind,
): InsertableWorkflowNodeKind[] {
  return getInsertableNodeKindsForSource(sourceKind).filter((kind) =>
    getAvailableNextNodeKinds(kind).includes(targetKind)
    && getAvailablePrevNodeKinds(targetKind).includes(kind),
  );
}

export function getPaletteItemsByKinds(kinds: InsertableWorkflowNodeKind[]) {
  return filterWorkflowPaletteItems({ kinds });
}

export function filterWorkflowPaletteItems({
  kinds,
  query = "",
}: {
  kinds?: InsertableWorkflowNodeKind[];
  query?: string;
} = {}) {
  const kindSet = kinds ? new Set(kinds) : null;
  const normalizedQuery = normalizePaletteSearchText(query);

  return paletteItems.filter((item) => {
    if (kindSet && !kindSet.has(item.id)) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return item.searchText.includes(normalizedQuery);
  });
}

export function getWorkflowPaletteItemGroups({
  kinds,
  query = "",
}: {
  kinds?: InsertableWorkflowNodeKind[];
  query?: string;
} = {}): WorkflowPaletteItemGroup[] {
  const items = filterWorkflowPaletteItems({ kinds, query });
  const itemsByGroupId = new Map<WorkflowNodePaletteGroupId, WorkflowPaletteItem[]>();

  items.forEach((item) => {
    itemsByGroupId.set(item.groupId, [...itemsByGroupId.get(item.groupId) ?? [], item]);
  });

  return workflowNodePaletteGroups
    .map((group) => ({
      ...group,
      items: [...itemsByGroupId.get(group.id) ?? []].sort((first, second) => first.sort - second.sort),
    }))
    .filter((group) => group.items.length > 0);
}

export function getWorkflowNodeCatalogEntry(kind: WorkflowNodeKind) {
  return workflowNodeCatalog[kind];
}

export function isWorkflowNodeKind(value: unknown): value is WorkflowNodeKind {
  return typeof value === "string" && value in workflowNodeCatalog;
}

export function createWorkflowNodeExecutionConfig(data: WorkflowNodeData) {
  return getWorkflowNodeCatalogEntry(data.kind).createExecutionConfig(data);
}

function createNodeData(
  kind: WorkflowNodeKind,
  data: NodeDataInput,
): WorkflowNodeData {
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
    && definition.paletteGroup !== undefined
    && definition.paletteLabel !== undefined
    && definition.kind !== "goal"
    && definition.kind !== "trigger";
}

function createPaletteItem(definition: InsertableWorkflowNodeCatalogEntry): WorkflowPaletteItem {
  const description = definition.description ?? "";
  const group = workflowNodePaletteGroups.find((item) => item.id === definition.paletteGroup);
  const label = definition.paletteLabel;

  return {
    description,
    groupId: definition.paletteGroup,
    icon: definition.visual.icon,
    id: definition.kind,
    label,
    searchText: normalizePaletteSearchText([
      definition.kind,
      definition.visual.label,
      label,
      description,
      group?.label ?? "",
    ].join(" ")),
    sort: definition.sort,
  };
}

function normalizePaletteSearchText(value: string) {
  return value.trim().toLowerCase();
}

function pickDefinedWorkflowConfig(config: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined),
  );
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateActionNode(node: WorkflowNode): WorkflowNodeValidationIssue[] {
  if (!hasText(node.data.actionType)) {
    return [];
  }

  if (!actionOptions.some((option) => option.type === node.data.actionType)) {
    return [createCatalogIssue("action-type-unsupported", "营销动作类型不受支持")];
  }

  return [];
}

function validateAiNode(node: WorkflowNode): WorkflowNodeValidationIssue[] {
  if (!hasText(node.data.agentName)) {
    return [];
  }

  if (!agentOptions.some((agent) => agent.name === node.data.agentName)) {
    return [createCatalogIssue("ai-agent-unsupported", "AI 接待绑定的 Agent 不可用")];
  }

  return [];
}

function validateBranchNode(node: WorkflowNode): WorkflowNodeValidationIssue[] {
  const issues: WorkflowNodeValidationIssue[] = [];
  const branchPaths = getWorkflowBranchPaths(node.data);

  if (branchPaths.some((path) => !hasText(path.label))) {
    issues.push(createCatalogIssue("branch-path-label-required", "条件分支路径需要填写分支名称"));
  }

  return issues;
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

function createDefaultOutputVariables(node: WorkflowNode): WorkflowVariable[] {
  return [
    {
      name: "result",
      type: "object",
      value: node.data.metric,
    },
    {
      name: "journey.next",
      type: "string",
      value: node.data.kind === "goal" ? "退出旅程" : "进入下一节点",
    },
  ];
}
