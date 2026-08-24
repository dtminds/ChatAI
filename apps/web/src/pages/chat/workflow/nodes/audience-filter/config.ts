import type { WorkflowAudienceGroupSnapshot } from "@chatai/contracts";
import {
  WORKFLOW_AUDIENCE_GROUP_NAME_MAX_LENGTH,
} from "@chatai/contracts";

export const AUDIENCE_FILTER_MATCHED_HANDLE_ID = "matched";
export const AUDIENCE_FILTER_UNMATCHED_HANDLE_ID = "unmatched";

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

export function getWorkflowAudienceFilterMetric(
  group: WorkflowAudienceGroupSnapshot | undefined,
) {
  return group?.name ?? "未配置人群包";
}

export function isWorkflowAudienceFilterConfigured(
  group: WorkflowAudienceGroupSnapshot | undefined,
) {
  return group !== undefined;
}
