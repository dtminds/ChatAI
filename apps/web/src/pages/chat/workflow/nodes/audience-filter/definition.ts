import { UserMultiple02Icon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";
import {
  getWorkflowAudienceFilterMetric,
  isWorkflowAudienceFilterConfigured,
  normalizeWorkflowAudienceFilterMatchMode,
  normalizeWorkflowAudienceGroups,
} from "./config";

const baseAudienceFilterNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-rose-500 text-white",
  accentRgb: "244 63 94",
  description: "检查客户是否在你指定的人群包中，通常接条件分支分流到不同的后续运营路径",
  icon: UserMultiple02Icon,
  kind: "audience-filter",
  label: "人群筛选",
  metric: "未配置人群包",
  paletteGroup: "flow",
  sort: 22,
});

export const audienceFilterNodeDefinition: WorkflowNodeDefinition<"audience-filter"> = {
  ...baseAudienceFilterNodeDefinition,
  createDefaultData: () => ({
    ...baseAudienceFilterNodeDefinition.createDefaultData(),
    groups: [],
    matchMode: "any",
    status: "warning",
  }),
  getOutputVariables: () => [
    {
      description: "客户是否满足当前人群包匹配条件",
      key: "matched",
      label: "是否匹配",
      usages: ["variable"],
      valueType: { kind: "boolean" },
    },
    {
      description: "实际匹配的人群包名称，多个名称使用中文顿号分隔",
      key: "matchedGroupNames",
      label: "匹配人群包名",
      usages: ["variable", "message-content"],
      valueType: { kind: "string" },
    },
    {
      description: "实际匹配的人群包数量",
      key: "matchedGroupCount",
      label: "匹配人群包数量",
      usages: ["variable"],
      valueType: { kind: "number" },
    },
  ],
  sanitizeData: (data) => {
    const groups = normalizeWorkflowAudienceGroups(data.groups);
    const matchMode = normalizeWorkflowAudienceFilterMatchMode(data.matchMode);
    return {
      ...data,
      groups,
      matchMode,
      metric: getWorkflowAudienceFilterMetric(matchMode, groups),
      status: isWorkflowAudienceFilterConfigured(groups) ? "ready" : "warning",
    };
  },
  validate: (node) => isWorkflowAudienceFilterConfigured(normalizeWorkflowAudienceGroups(node.data.groups))
    ? []
    : [{
        code: "audience-filter-group-required",
        message: "需选择人群包",
        severity: "warning",
        source: "config",
      }],
};
