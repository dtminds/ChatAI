import type {
  WorkflowAudienceFilterMatchMode,
  WorkflowAudienceGroupSnapshot,
} from "@chatai/contracts";
import {
  WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE_MAX,
  WORKFLOW_AUDIENCE_GROUP_MAX_COUNT,
  WORKFLOW_AUDIENCE_GROUP_NAME_MAX_LENGTH,
} from "@chatai/contracts";

export function normalizeWorkflowAudienceFilterMatchMode(
  value: unknown,
): WorkflowAudienceFilterMatchMode {
  return value === "all" || value === "none" ? value : "any";
}

export function normalizeWorkflowAudienceGroup(
  value: unknown,
): WorkflowAudienceGroupSnapshot | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const id = record.id;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!Number.isSafeInteger(id) || Number(id) < 1 || !name) return undefined;
  return {
    id: Number(id),
    name: name.slice(0, WORKFLOW_AUDIENCE_GROUP_NAME_MAX_LENGTH),
  };
}

export function normalizeWorkflowAudienceGroups(value: unknown): WorkflowAudienceGroupSnapshot[] {
  return uniqueAudienceGroups(value, WORKFLOW_AUDIENCE_GROUP_MAX_COUNT);
}

export function normalizeWorkflowAudienceGroupCatalog(
  value: unknown,
): WorkflowAudienceGroupSnapshot[] {
  return uniqueAudienceGroups(value, WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE_MAX);
}

function uniqueAudienceGroups(value: unknown, maxItems: number): WorkflowAudienceGroupSnapshot[] {
  if (!Array.isArray(value)) return [];
  const groups: WorkflowAudienceGroupSnapshot[] = [];
  const seen = new Set<number>();
  for (const item of value) {
    const group = normalizeWorkflowAudienceGroup(item);
    if (!group || seen.has(group.id)) continue;
    seen.add(group.id);
    groups.push(group);
    if (groups.length >= maxItems) break;
  }
  return groups;
}

export function getWorkflowAudienceFilterMatchModeLabel(
  matchMode: WorkflowAudienceFilterMatchMode,
) {
  if (matchMode === "all") return "满足全部";
  if (matchMode === "none") return "均不包含";
  return "满足任一";
}

export function getWorkflowAudienceFilterMetric(
  matchMode: WorkflowAudienceFilterMatchMode,
  groups: readonly WorkflowAudienceGroupSnapshot[],
) {
  if (groups.length === 0) return "未配置人群包";
  return `${getWorkflowAudienceFilterMatchModeLabel(matchMode)} · ${groups.length} 个人群包`;
}

export function isWorkflowAudienceFilterConfigured(
  groups: readonly WorkflowAudienceGroupSnapshot[],
) {
  return groups.length > 0;
}
