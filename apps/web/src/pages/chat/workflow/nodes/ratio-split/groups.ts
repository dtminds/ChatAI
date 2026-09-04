import {
  WORKFLOW_RATIO_SPLIT_GROUP_MAX,
  WORKFLOW_RATIO_SPLIT_GROUP_MIN,
  WORKFLOW_RATIO_SPLIT_TOTAL_BASIS_POINTS,
  getWorkflowRatioSplitBasisPointsTotal,
  type WorkflowRatioSplitDraftGroup,
} from "@chatai/contracts";
import type { RatioSplitNodeData } from "../../types";

export const WORKFLOW_RATIO_SPLIT_FIRST_HANDLE_TOP = 62;
export const WORKFLOW_RATIO_SPLIT_HANDLE_ROW_GAP = 42;
export const WORKFLOW_RATIO_SPLIT_NODE_BASE_HEIGHT = 62;

let ratioSplitGroupIdSequence = 0;

export function createDefaultRatioSplitGroups(): WorkflowRatioSplitDraftGroup[] {
  return [
    { basisPoints: 5_000, id: "ratio-a", label: "A 组" },
    { basisPoints: 5_000, id: "ratio-b", label: "B 组" },
  ];
}

export function getWorkflowRatioSplitGroups(
  data?: Pick<RatioSplitNodeData, "groups">,
) {
  return normalizeWorkflowRatioSplitGroups(data?.groups);
}

export function normalizeWorkflowRatioSplitGroups(value: unknown): WorkflowRatioSplitDraftGroup[] {
  if (!Array.isArray(value) || value.length === 0) return createDefaultRatioSplitGroups();
  const groups: WorkflowRatioSplitDraftGroup[] = [];
  const ids = new Set<string>();

  for (const [index, item] of value.entries()) {
    if (!isRecord(item) || groups.length >= WORKFLOW_RATIO_SPLIT_GROUP_MAX) continue;
    const rawId = typeof item.id === "string" ? item.id.trim() : "";
    const id = rawId && !ids.has(rawId) ? rawId : createNormalizedRatioSplitGroupId(index, ids);
    const basisPoints = Number.isInteger(item.basisPoints)
      ? Math.min(WORKFLOW_RATIO_SPLIT_TOTAL_BASIS_POINTS, Math.max(0, item.basisPoints as number))
      : 0;
    ids.add(id);
    groups.push({
      basisPoints,
      id,
      label: typeof item.label === "string" ? item.label : createRatioSplitGroupLabel(index),
    });
  }

  if (groups.length === 0) return createDefaultRatioSplitGroups();
  while (groups.length < WORKFLOW_RATIO_SPLIT_GROUP_MIN) {
    const index = groups.length;
    groups.push({
      basisPoints: Math.max(
        0,
        WORKFLOW_RATIO_SPLIT_TOTAL_BASIS_POINTS - getWorkflowRatioSplitBasisPointsTotal(groups),
      ),
      id: createNormalizedRatioSplitGroupId(
        index,
        new Set(groups.map(group => group.id)),
      ),
      label: createRatioSplitGroupLabel(index),
    });
  }
  return groups;
}

export function addWorkflowRatioSplitGroup(groups: WorkflowRatioSplitDraftGroup[]) {
  const normalized = normalizeWorkflowRatioSplitGroups(groups);
  if (normalized.length >= WORKFLOW_RATIO_SPLIT_GROUP_MAX) return normalized;
  return [
    ...normalized,
    {
      basisPoints: 0,
      id: createWorkflowRatioSplitGroupId(new Set(normalized.map(group => group.id))),
      label: createAvailableRatioSplitGroupLabel(normalized),
    },
  ];
}

export function removeWorkflowRatioSplitGroup(
  groups: WorkflowRatioSplitDraftGroup[],
  groupId: string,
) {
  const normalized = normalizeWorkflowRatioSplitGroups(groups);
  return normalized.length <= WORKFLOW_RATIO_SPLIT_GROUP_MIN
    ? normalized
    : normalized.filter(group => group.id !== groupId);
}

export function isWorkflowRatioSplitLocallyComplete(groups: WorkflowRatioSplitDraftGroup[]) {
  return groups.length >= WORKFLOW_RATIO_SPLIT_GROUP_MIN
    && groups.length <= WORKFLOW_RATIO_SPLIT_GROUP_MAX
    && groups.every(group => group.label.trim().length > 0)
    && new Set(groups.map(group => group.id)).size === groups.length
    && getWorkflowRatioSplitBasisPointsTotal(groups) === WORKFLOW_RATIO_SPLIT_TOTAL_BASIS_POINTS;
}

export function getWorkflowRatioSplitEstimatedHeight(data: Pick<RatioSplitNodeData, "groups">) {
  return WORKFLOW_RATIO_SPLIT_NODE_BASE_HEIGHT
    + getWorkflowRatioSplitGroups(data).length * WORKFLOW_RATIO_SPLIT_HANDLE_ROW_GAP;
}

export function createRatioSplitMetric(groups: WorkflowRatioSplitDraftGroup[]) {
  return `${groups.length} 个分组 · 合计 ${formatBasisPoints(getWorkflowRatioSplitBasisPointsTotal(groups))}`;
}

export function formatBasisPoints(basisPoints: number) {
  return `${Number((basisPoints / 100).toFixed(2))}%`;
}

function createWorkflowRatioSplitGroupId(existingIds: Set<string>) {
  let candidate = "";
  do {
    candidate = createWorkflowRatioSplitGroupIdCandidate();
  } while (existingIds.has(candidate));
  return candidate;
}

function createWorkflowRatioSplitGroupIdCandidate() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `ratio-${globalThis.crypto.randomUUID()}`;
  }
  ratioSplitGroupIdSequence += 1;
  return `ratio-${Date.now().toString(36)}-${ratioSplitGroupIdSequence.toString(36)}`;
}

function createNormalizedRatioSplitGroupId(index: number, existingIds: Set<string>) {
  const base = `ratio-${index + 1}`;
  let candidate = base;
  let suffix = 1;
  while (existingIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function createRatioSplitGroupLabel(index: number) {
  return `${String.fromCharCode(65 + index)} 组`;
}

function createAvailableRatioSplitGroupLabel(groups: WorkflowRatioSplitDraftGroup[]) {
  const labels = new Set(groups.map(group => group.label));
  for (let index = 0; index < WORKFLOW_RATIO_SPLIT_GROUP_MAX; index += 1) {
    const candidate = createRatioSplitGroupLabel(index);
    if (!labels.has(candidate)) return candidate;
  }
  return createRatioSplitGroupLabel(groups.length);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
