import {
  WORKFLOW_TAG_QUERY_MAX_COUNT,
  type WorkflowTagQueryMatchMode,
} from "@chatai/contracts";

export function normalizeWorkflowTagQueryMatchMode(
  value: unknown,
): WorkflowTagQueryMatchMode {
  return value === "all" || value === "none" ? value : "any";
}

export function normalizeWorkflowTagQueryIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((tagId): tagId is number =>
    Number.isSafeInteger(tagId) && tagId > 0))].slice(0, WORKFLOW_TAG_QUERY_MAX_COUNT);
}

export function getWorkflowTagQueryMetric(
  matchMode: WorkflowTagQueryMatchMode,
  tagIds: readonly number[],
) {
  if (tagIds.length === 0) return "待配置查询标签";
  return `${getWorkflowTagQueryMatchModeLabel(matchMode)} · ${tagIds.length} 个标签`;
}

export function getWorkflowTagQueryMatchModeLabel(matchMode: WorkflowTagQueryMatchMode) {
  if (matchMode === "all") return "满足全部";
  if (matchMode === "none") return "均不包含";
  return "满足任一";
}
