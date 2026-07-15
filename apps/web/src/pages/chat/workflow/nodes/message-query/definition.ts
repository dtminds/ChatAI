import { MessageSearch01Icon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import {
  compactNodeLayout,
  createCatalogIssue,
  createDefaultSourceHandles,
  createDefaultTargetHandles,
  createNodeData,
  sourceNodeKinds,
  targetNodeKinds,
} from "../definition-shared";
import {
  createDefaultMessageQueryTimeRange,
  getMessageQueryMetric,
  MESSAGE_QUERY_LIMIT_MAX,
  MESSAGE_QUERY_LIMIT_MIN,
  normalizeMessageQueryLimit,
  normalizeMessageQueryTake,
  normalizeMessageQueryTimeRange,
} from "./config";

export const messageQueryNodeDefinition: WorkflowNodeDefinition<"message-query"> = {
  availableNextKinds: targetNodeKinds,
  availablePrevKinds: sourceNodeKinds,
  canDelete: true,
  canDuplicate: true,
  canInsertAfter: true,
  canRename: true,
  configSections: [],
  createDefaultData: () => createNodeData("message-query", 1, {
    label: "消息查询",
    limit: 10,
    metric: "最新 10 条消息",
    take: "latest",
    timeRange: createDefaultMessageQueryTimeRange(),
    title: "消息查询",
  }),
  createExecutionConfig: (data) => ({
    limit: normalizeMessageQueryLimit(data.limit),
    take: normalizeMessageQueryTake(data.take),
    timeRange: normalizeMessageQueryTimeRange(data.timeRange),
  }),
  description: "查询当前客户在指定时间范围内的历史消息",
  getOutputVariables: () => [
    {
      key: "messageIds",
      label: "消息列表",
      type: "message-id-list",
      usages: ["intent-input"],
    },
    {
      key: "textContent",
      label: "文本内容",
      type: "string",
      usages: ["intent-input", "message-content", "variable"],
    },
    {
      key: "messageCount",
      label: "消息数量",
      type: "number",
      usages: ["variable"],
    },
    {
      key: "rangeStart",
      label: "查询开始时间",
      type: "datetime",
      usages: ["time-reference", "variable"],
    },
    {
      key: "rangeEnd",
      label: "查询结束时间",
      type: "datetime",
      usages: ["time-reference", "variable"],
    },
  ],
  getSourceHandles: createDefaultSourceHandles,
  getTargetHandles: createDefaultTargetHandles,
  insertable: true,
  kind: "message-query",
  layout: compactNodeLayout,
  paletteGroup: "message",
  paletteLabel: "消息查询",
  sanitizeData: (data) => {
    const limit = normalizeMessageQueryLimit(data.limit);
    const take = normalizeMessageQueryTake(data.take);

    return {
      ...data,
      limit,
      metric: getMessageQueryMetric({ limit, take }),
      take,
      timeRange: normalizeMessageQueryTimeRange(data.timeRange),
    };
  },
  schemaVersion: 1,
  sort: 105,
  validate: (node) => {
    const issues = [];
    if (
      !Number.isInteger(node.data.limit)
      || node.data.limit < MESSAGE_QUERY_LIMIT_MIN
      || node.data.limit > MESSAGE_QUERY_LIMIT_MAX
    ) {
      issues.push(createCatalogIssue(
        "message-query-limit-invalid",
        `消息查询数量需要为 ${MESSAGE_QUERY_LIMIT_MIN}-${MESSAGE_QUERY_LIMIT_MAX} 条`,
      ));
    }

    const timeRange = normalizeMessageQueryTimeRange(node.data.timeRange);
    if (timeRange.mode === "fixed") {
      for (const [field, value] of [
        ["start", timeRange.startAt],
        ["end", timeRange.endAt],
      ] as const) {
        if (isValidLocalDateTime(value)) continue;
        issues.push(createCatalogIssue(
          `message-query-${field}-time-required`,
          `${field === "start" ? "开始" : "结束"}时间需要选择固定时间`,
        ));
      }
    }

    return issues;
  },
  visual: {
    accentClassName: "bg-orange-500 text-white ring-orange-500/20",
    accentRgb: "249 115 22",
    icon: MessageSearch01Icon,
    label: "消息查询",
  },
};

function isValidLocalDateTime(value: string) {
  return /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}
