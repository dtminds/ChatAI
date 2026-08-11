import { PlayIcon } from "@hugeicons/core-free-icons";
import {
  WORKFLOW_ENTRY_WINDOW_MAX_DAYS,
  WORKFLOW_ENTRY_WINDOW_MAX_HOURS,
  type WorkflowType,
} from "@chatai/contracts";
import {
  getStartNodeSourceIds,
  isChatAiStartNodeData,
  isWeComStartNodeData,
  type ChatAiStartNodeData,
  type StartNodeData,
  type WeComStartNodeData,
} from "../../types";
import type { WorkflowNodeDefinition } from "../definition-types";
import {
  createCatalogIssue,
  createDefaultSourceHandles,
  createNoTargetHandles,
  createNodeData,
  standardNodeLayout,
  targetNodeKinds,
} from "../definition-shared";

export const startNodeDefinition: WorkflowNodeDefinition<"start"> = {
  availableNextKinds: targetNodeKinds,
  availablePrevKinds: [],
  canDelete: false,
  canDuplicate: false,
  canInsertAfter: true,
  canRename: false,
  configSections: [],
  createDefaultData: () => createStartNodeData("chatai_sop"),
  insertable: false,
  kind: "start",
  layout: standardNodeLayout,
  role: "entry",
  sanitizeData: (data) => {
    const sanitizedData = sanitizeStartSource(data);
    if (sanitizedData.entryPolicy.mode !== "rolling_window") return sanitizedData;
    const maxWindowSize = sanitizedData.entryPolicy.windowUnit === "hour"
      ? WORKFLOW_ENTRY_WINDOW_MAX_HOURS
      : WORKFLOW_ENTRY_WINDOW_MAX_DAYS;
    return {
      ...sanitizedData,
      entryPolicy: {
        ...sanitizedData.entryPolicy,
        windowSize: Math.min(
          maxWindowSize,
          Math.max(1, Math.trunc(sanitizedData.entryPolicy.windowSize)),
        ),
      },
    };
  },
  getSourceHandles: createDefaultSourceHandles,
  getTargetHandles: createNoTargetHandles,
  sort: 0,
  validate: (node) => {
    const issues = [];
    const sourceIds = getStartNodeSourceIds(node.data);
    if (sourceIds.length === 0) {
      issues.push(createCatalogIssue(
        "start-source-required",
        `开始节点需要选择${isChatAiStartNodeData(node.data) ? "席位" : "企微成员"}`,
      ));
    }
    if (node.data.triggers.length === 0) {
      issues.push(createCatalogIssue("start-trigger-required", "开始节点需要选择触发条件"));
    }
    if (node.data.triggers.some(trigger =>
      trigger.type === "contact.tag_added" && trigger.tagIds.length === 0,
    )) {
      issues.push(createCatalogIssue("start-tag-required", "标签触发需要选择至少一个标签"));
    }
    return issues;
  },
  visual: {
    accentClassName: "bg-blue-600 text-white ring-blue-600/20",
    accentRgb: "37 99 235",
    icon: PlayIcon,
    label: "开始",
  },
};

export function createStartNodeData(
  workflowType: "chatai_sop",
): ChatAiStartNodeData;
export function createStartNodeData(
  workflowType: "wecom_sop",
): WeComStartNodeData;
export function createStartNodeData(
  workflowType: Extract<WorkflowType, "chatai_sop" | "wecom_sop">,
): StartNodeData;
export function createStartNodeData(
  workflowType: Extract<WorkflowType, "chatai_sop" | "wecom_sop">,
): StartNodeData {
  const common = {
    entryPolicy: { maxEntries: 2, mode: "lifetime_limit" } as const,
    label: "开始",
    metric: "待配置触发条件",
    status: "warning" as const,
    title: "开始",
    triggers: [],
  };
  return workflowType === "chatai_sop"
    ? createNodeData("start", { ...common, seatIds: [] })
    : createNodeData("start", { ...common, workUserIds: [] });
}

function sanitizeStartSource(data: StartNodeData): StartNodeData {
  if (isWeComStartNodeData(data)) {
    const { seatIds: _seatIds, ...weComData } = data as StartNodeData & { seatIds?: unknown };
    return {
      ...weComData,
      workUserIds: sanitizePositiveIds(data.workUserIds),
    } as StartNodeData;
  }
  const chatAiStartData = isChatAiStartNodeData(data) ? data : createStartNodeData("chatai_sop");
  const { workUserIds: _workUserIds, ...chatAiData } = chatAiStartData as StartNodeData & {
    workUserIds?: unknown;
  };
  return {
    ...chatAiData,
    seatIds: sanitizePositiveIds(chatAiStartData.seatIds),
  } as StartNodeData;
}

function sanitizePositiveIds(ids: number[]) {
  return [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))];
}
