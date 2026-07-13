import { PlayIcon } from "@hugeicons/core-free-icons";
import {
  WORKFLOW_ENTRY_WINDOW_MAX_DAYS,
  WORKFLOW_ENTRY_WINDOW_MAX_HOURS,
} from "@chatai/contracts";
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
  createDefaultData: () =>
    createNodeData("start", 1, {
      accountIds: [],
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      label: "开始",
      metric: "待配置触发条件",
      status: "warning",
      summary: "配置客户进入营销旅程的触发条件",
      title: "开始",
      triggers: [],
    }),
  createExecutionConfig: (data) => ({
    accountIds: [...data.accountIds],
    entryPolicy: structuredClone(data.entryPolicy),
    triggers: structuredClone(data.triggers),
  }),
  insertable: false,
  kind: "start",
  layout: standardNodeLayout,
  role: "entry",
  sanitizeData: (data) => {
    if (data.entryPolicy.mode !== "rolling_window") return data;
    const maxWindowSize = data.entryPolicy.windowUnit === "hour"
      ? WORKFLOW_ENTRY_WINDOW_MAX_HOURS
      : WORKFLOW_ENTRY_WINDOW_MAX_DAYS;
    return {
      ...data,
      entryPolicy: {
        ...data.entryPolicy,
        windowSize: Math.min(maxWindowSize, Math.max(1, Math.trunc(data.entryPolicy.windowSize))),
      },
    };
  },
  schemaVersion: 1,
  getSourceHandles: createDefaultSourceHandles,
  getTargetHandles: createNoTargetHandles,
  sort: 0,
  validate: (node) => {
    const issues = [];
    if (node.data.accountIds.length === 0) {
      issues.push(createCatalogIssue("start-account-required", "开始节点需要选择托管账号"));
    }
    if (node.data.triggers.length === 0) {
      issues.push(createCatalogIssue("start-trigger-required", "开始节点需要选择触发条件"));
    }
    if (node.data.triggers.some(trigger =>
      trigger.type === "customer.tag_added" && trigger.tagIds.length === 0,
    )) {
      issues.push(createCatalogIssue("start-tag-required", "标签触发需要选择至少一个标签"));
    }
    if (node.data.triggers.some(trigger =>
      trigger.type === "message.received"
      && trigger.match === "keywords"
      && trigger.keywords.length === 0,
    )) {
      issues.push(createCatalogIssue("start-keyword-required", "关键词触发需要填写至少一个关键词"));
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
