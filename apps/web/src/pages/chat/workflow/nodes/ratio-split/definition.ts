import { HierarchySquare08Icon } from "@hugeicons/core-free-icons";
import {
  WORKFLOW_RATIO_SPLIT_GROUP_MAX,
  WORKFLOW_RATIO_SPLIT_GROUP_MIN,
  WORKFLOW_RATIO_SPLIT_TOTAL_BASIS_POINTS,
  getWorkflowRatioSplitBasisPointsTotal,
} from "@chatai/contracts";
import { WORKFLOW_BRANCH_NODE_WIDTH } from "../../constants";
import type { RatioSplitNodeData } from "../../types";
import type { WorkflowNodeDefinition } from "../definition-types";
import {
  createCatalogIssue,
  createDefaultTargetHandles,
  createNodeData,
  sourceNodeKinds,
  targetNodeKinds,
} from "../definition-shared";
import {
  WORKFLOW_RATIO_SPLIT_FIRST_HANDLE_TOP,
  WORKFLOW_RATIO_SPLIT_HANDLE_ROW_GAP,
  createDefaultRatioSplitGroups,
  createRatioSplitMetric,
  getWorkflowRatioSplitEstimatedHeight,
  getWorkflowRatioSplitGroups,
  isWorkflowRatioSplitLocallyComplete,
  normalizeWorkflowRatioSplitGroups,
} from "./groups";

export const ratioSplitNodeDefinition: WorkflowNodeDefinition<"ratio-split"> = {
  availableNextKinds: targetNodeKinds,
  availablePrevKinds: sourceNodeKinds,
  canDelete: true,
  canDuplicate: true,
  canInsertAfter: true,
  canRename: true,
  configSections: [],
  createDefaultData: () => createNodeData("ratio-split", {
    groups: createDefaultRatioSplitGroups(),
    label: "A/B 分流",
    metric: "2 个分组 · 合计 100%",
    title: "A/B 分流",
  }),
  description: "按比例将客户分流到不同分支，用于策略效果对比或逐步灰度放量",
  getEstimatedHeight: getWorkflowRatioSplitEstimatedHeight,
  getSourceHandles: (data) => getWorkflowRatioSplitGroups(data).map((group, index) => ({
    id: group.id,
    isDefault: index === 0 ? true : undefined,
    label: group.label || `${String.fromCharCode(65 + index)} 组`,
    outletKind: "outcome" as const,
    top: WORKFLOW_RATIO_SPLIT_FIRST_HANDLE_TOP + index * WORKFLOW_RATIO_SPLIT_HANDLE_ROW_GAP,
  })),
  getTargetHandles: createDefaultTargetHandles,
  insertable: true,
  kind: "ratio-split",
  layout: {
    estimatedHeight: 146,
    width: WORKFLOW_BRANCH_NODE_WIDTH,
  },
  paletteGroup: "flow",
  paletteLabel: "A/B 分流",
  sanitizeData: (data) => createSanitizedRatioSplitData(data),
  sort: 25,
  validate: (node) => {
    const issues = [];
    if (node.data.groups.length < WORKFLOW_RATIO_SPLIT_GROUP_MIN
      || node.data.groups.length > WORKFLOW_RATIO_SPLIT_GROUP_MAX) {
      issues.push(createCatalogIssue("ratio-split-group-count-invalid", "分组数量需为 2-5 个"));
    }
    if (node.data.groups.some(group => !group.label.trim())) {
      issues.push(createCatalogIssue("ratio-split-label-required", "分组名称不能为空"));
    }
    if (getWorkflowRatioSplitBasisPointsTotal(node.data.groups)
      !== WORKFLOW_RATIO_SPLIT_TOTAL_BASIS_POINTS) {
      issues.push(createCatalogIssue("ratio-split-allocation-invalid", "分组比例合计需为 100%"));
    }
    return issues;
  },
  visual: {
    accentClassName: "bg-violet-400 text-white",
    accentRgb: "139 92 246",
    icon: HierarchySquare08Icon,
    label: "A/B 分流",
  },
};

function createSanitizedRatioSplitData(data: RatioSplitNodeData): RatioSplitNodeData {
  const groups = normalizeWorkflowRatioSplitGroups(data.groups);
  return {
    ...data,
    groups,
    metric: createRatioSplitMetric(groups),
    status: isWorkflowRatioSplitLocallyComplete(groups) ? "ready" : "warning",
  };
}
