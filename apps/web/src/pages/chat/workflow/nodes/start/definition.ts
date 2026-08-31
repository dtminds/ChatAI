import { LogoutCircle01Icon } from "@hugeicons/core-free-icons";
import {
  DEFAULT_WORKFLOW_MESSAGE_SENDING_WINDOW,
  isWorkflowMessageSendingWindowValid,
  WORKFLOW_ENTRY_WINDOW_MAX_DAYS,
  WORKFLOW_ENTRY_WINDOW_MAX_HOURS,
  WORKFLOW_FRIEND_SOURCE_MAX_SELECTED,
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
    const sanitizedData = sanitizeStartTriggers(sanitizeStartSource(data));
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
    const entryMode = node.data.entryMode ?? "event";
    const sourceIds = getStartNodeSourceIds(node.data);
    if (sourceIds.length === 0) {
      issues.push(createCatalogIssue(
        "start-source-required",
        `未指定${isChatAiStartNodeData(node.data) ? "托管账号" : "企微成员"}`,
      ));
    }
    if (entryMode === "event" && node.data.triggers.length === 0) {
      issues.push(createCatalogIssue("start-trigger-required", "未配置触发条件"));
    }
    if (entryMode === "event" && node.data.triggers.some(trigger =>
      trigger.type === "contact.friend_added" && trigger.sourceIds.length === 0,
    )) {
      issues.push(createCatalogIssue("start-friend-source-required", "未选择添加好友来源"));
    }
    if (entryMode === "event" && node.data.triggers.some(trigger =>
      trigger.type === "contact.tag_added" && trigger.tagIds.length === 0,
    )) {
      issues.push(createCatalogIssue("start-tag-required", "标签触发未选择标签"));
    }
    if (entryMode === "event" && node.data.triggers.some(trigger =>
      trigger.type === "message.received" && trigger.keywords.length === 0,
    )) {
      issues.push(createCatalogIssue(
        "start-message-keywords-required",
        "消息触发未填写关键词",
      ));
    }
    if (isChatAiStartNodeData(node.data)
      && !isWorkflowMessageSendingWindowValid(
        node.data.messageSendingWindow ?? DEFAULT_WORKFLOW_MESSAGE_SENDING_WINDOW,
      )) {
      issues.push(createCatalogIssue(
        "start-message-sending-window-invalid",
        "消息发送时段的结束时间需晚于开始时间",
      ));
    }
    return issues;
  },
  visual: {
    accentClassName: "bg-blue-500 text-white",
    accentRgb: "37 99 235",
    icon: LogoutCircle01Icon,
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
    entryMode: "event" as const,
    entryPolicy: { maxEntries: 1, mode: "lifetime_limit" } as const,
    label: "开始",
    metric: "待配置进入方式",
    status: "warning" as const,
    title: "开始",
    triggers: [],
  };
  return workflowType === "chatai_sop"
    ? createNodeData("start", {
        ...common,
        messageSendingWindow: DEFAULT_WORKFLOW_MESSAGE_SENDING_WINDOW,
        seatIds: [],
      })
    : createNodeData("start", { ...common, workUserIds: [] });
}

function sanitizeStartSource(data: StartNodeData): StartNodeData {
  if (isWeComStartNodeData(data)) {
    const {
      messageSendingWindow: _messageSendingWindow,
      seatIds: _seatIds,
      ...weComData
    } = data as StartNodeData & {
      messageSendingWindow?: unknown;
      seatIds?: unknown;
    };
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

function sanitizeStartTriggers(data: StartNodeData): StartNodeData {
  if (data.entryMode !== "event") {
    return { ...data, triggers: [] } as StartNodeData;
  }
  const triggers = data.triggers.slice(0, 1).map((trigger) => {
    if (trigger.type === "contact.tag_added") {
      return { ...trigger, tagIds: sanitizePositiveIds(trigger.tagIds) };
    }
    if (trigger.type === "contact.friend_added") {
      const addWayKey = trigger.addWayKey?.trim();
      const sourceMatchMode = trigger.sourceMatchMode === "any" || trigger.sourceMatchMode === "all"
        ? trigger.sourceMatchMode
        : undefined;
      return {
        type: trigger.type,
        sourceIds: sanitizeStrings(trigger.sourceIds).slice(0, WORKFLOW_FRIEND_SOURCE_MAX_SELECTED),
        ...(addWayKey ? { addWayKey } : {}),
        ...(sourceMatchMode ? { sourceMatchMode } : {}),
      };
    }
    return { ...trigger, keywords: sanitizeStrings(trigger.keywords) };
  });
  return { ...data, triggers } as StartNodeData;
}

function sanitizeStrings(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}
