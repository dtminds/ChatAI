import {
  WORKFLOW_TAG_MAX_COUNT,
  type WorkflowTagOperation,
} from "@chatai/contracts";

export function normalizeWorkflowTagOperation(value: unknown): WorkflowTagOperation {
  return value === "remove" ? "remove" : "add";
}

export function normalizeWorkflowTagIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((tagId): tagId is number =>
    Number.isSafeInteger(tagId) && tagId > 0))].slice(0, WORKFLOW_TAG_MAX_COUNT);
}

export function getWorkflowTagMetric(operation: WorkflowTagOperation, tagIds: readonly number[]) {
  if (tagIds.length === 0) return "待配置标签";
  return `${operation === "add" ? "添加" : "移除"} ${tagIds.length} 个标签`;
}
