import { UserMultiple02Icon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import {
  createCatalogIssue,
  createDefaultTargetHandles,
  createNodeData,
  sourceNodeKinds,
  targetNodeKinds,
} from "../definition-shared";
import {
  AUDIENCE_FILTER_MATCHED_HANDLE_ID,
  AUDIENCE_FILTER_UNMATCHED_HANDLE_ID,
  getWorkflowAudienceFilterMetric,
  isWorkflowAudienceFilterConfigured,
  normalizeWorkflowAudienceGroup,
} from "./config";

export const audienceFilterNodeDefinition: WorkflowNodeDefinition<"audience-filter"> = {
  availableNextKinds: targetNodeKinds,
  availablePrevKinds: sourceNodeKinds,
  canDelete: true,
  canDuplicate: true,
  canInsertAfter: true,
  canRename: true,
  configSections: [],
  createDefaultData: () => createNodeData("audience-filter", {
    label: "人群筛选",
    metric: "未配置人群包",
    status: "warning",
    title: "人群筛选",
  }),
  description: "按人群包判断当前客户是否符合条件，并分流到符合或不符合后续路径",
  getSourceHandles: () => [
    {
      id: AUDIENCE_FILTER_MATCHED_HANDLE_ID,
      isDefault: true,
      label: "符合",
      outletKind: "outcome",
      top: 122,
    },
    {
      id: AUDIENCE_FILTER_UNMATCHED_HANDLE_ID,
      label: "不符合",
      outletKind: "outcome",
      top: 164,
    },
  ],
  getTargetHandles: createDefaultTargetHandles,
  insertable: true,
  kind: "audience-filter",
  layout: {
    estimatedHeight: 220,
    width: 320,
  },
  paletteGroup: "flow",
  paletteLabel: "人群筛选",
  sanitizeData: (data) => {
    const group = normalizeWorkflowAudienceGroup(data.group);
    return {
      ...data,
      group,
      metric: getWorkflowAudienceFilterMetric(group),
      status: isWorkflowAudienceFilterConfigured(group) ? "ready" : "warning",
    };
  },
  sort: 22,
  validate: (node) => isWorkflowAudienceFilterConfigured(normalizeWorkflowAudienceGroup(node.data.group))
    ? []
    : [createCatalogIssue("audience-filter-group-required", "需选择人群包")],
  visual: {
    accentClassName: "bg-rose-500 text-white",
    accentRgb: "244 63 94",
    icon: UserMultiple02Icon,
    label: "人群筛选",
  },
};
