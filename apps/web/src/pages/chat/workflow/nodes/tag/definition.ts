import { TagsIcon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";
import {
  getWorkflowTagMetric,
  normalizeWorkflowTagIds,
  normalizeWorkflowTagOperation,
} from "./config";

const baseTagNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-emerald-500 text-white",
  accentRgb: "16 185 129",
  description: "为客户添加或移除企微标签",
  icon: TagsIcon,
  kind: "tag",
  label: "客户打标",
  metric: "待配置标签",
  paletteGroup: "operate",
  sort: 80,
});

export const tagNodeDefinition: WorkflowNodeDefinition<"tag"> = {
  ...baseTagNodeDefinition,
  createDefaultData: () => ({
    ...baseTagNodeDefinition.createDefaultData(),
    operation: "add",
    status: "warning",
    tagIds: [],
  }),
  sanitizeData: (data) => {
    const operation = normalizeWorkflowTagOperation(data.operation);
    const tagIds = normalizeWorkflowTagIds(data.tagIds);
    return {
      ...data,
      metric: getWorkflowTagMetric(operation, tagIds),
      operation,
      status: tagIds.length > 0 ? "ready" : "warning",
      tagIds,
    };
  },
  validate: (node) => normalizeWorkflowTagIds(node.data.tagIds).length > 0
    ? []
    : [{
        code: "tag-selection-required",
        message: "需选择至少一个标签",
        severity: "warning",
        source: "config",
      }],
};
