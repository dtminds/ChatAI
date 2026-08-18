import { Tag01Icon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";
import {
  getWorkflowTagQueryMetric,
  normalizeWorkflowTagQueryIds,
  normalizeWorkflowTagQueryMatchMode,
} from "./config";

const baseTagQueryNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-teal-600 text-white",
  accentRgb: "13 148 136",
  description: "检查客户身上是否有你指定的企微标签，通常接条件分支分流到不同的后续运营路径",
  icon: Tag01Icon,
  kind: "tag-query",
  label: "标签查询",
  metric: "待配置查询标签",
  paletteGroup: "data",
  sort: 70,
});

export const tagQueryNodeDefinition: WorkflowNodeDefinition<"tag-query"> = {
  ...baseTagQueryNodeDefinition,
  createDefaultData: () => ({
    ...baseTagQueryNodeDefinition.createDefaultData(),
    matchMode: "any",
    status: "warning",
    tagIds: [],
  }),
  getOutputVariables: () => [
    {
      description: "客户是否满足当前标签匹配条件",
      key: "matched",
      label: "是否匹配",
      usages: ["variable"],
      valueType: { kind: "boolean" },
    },
    {
      description: "实际匹配的标签名称，多个名称使用中文顿号分隔",
      key: "matchedTagNames",
      label: "匹配标签名",
      usages: ["variable", "message-content"],
      valueType: { kind: "string" },
    },
    {
      description: "实际匹配的标签数量",
      key: "matchedTagCount",
      label: "匹配标签数量",
      usages: ["variable"],
      valueType: { kind: "number" },
    },
  ],
  sanitizeData: (data) => {
    const matchMode = normalizeWorkflowTagQueryMatchMode(data.matchMode);
    const tagIds = normalizeWorkflowTagQueryIds(data.tagIds);
    return {
      ...data,
      matchMode,
      metric: getWorkflowTagQueryMetric(matchMode, tagIds),
      status: tagIds.length > 0 ? "ready" : "warning",
      tagIds,
    };
  },
  validate: (node) => normalizeWorkflowTagQueryIds(node.data.tagIds).length > 0
    ? []
    : [{
        code: "tag-query-selection-required",
        message: "需选择至少一个标签",
        severity: "warning",
        source: "config",
      }],
};
