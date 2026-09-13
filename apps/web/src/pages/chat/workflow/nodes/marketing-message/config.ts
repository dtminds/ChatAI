import {
  WORKFLOW_MARKETING_MESSAGE_WAIT_MAX_BY_UNIT,
  WORKFLOW_MARKETING_PLAN_NAME_MAX_LENGTH,
  type WorkflowMarketingMessageWait,
  type WorkflowMarketingPlanListItem,
  type WorkflowMarketingPlanSnapshot,
} from "@chatai/contracts";

export function normalizeMarketingPlan(value: unknown): WorkflowMarketingPlanSnapshot | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const name = typeof record.planName === "string" ? record.planName.trim() : "";
  return Number.isSafeInteger(record.planId) && Number(record.planId) > 0 && name
    ? { planId: Number(record.planId), planName: name.slice(0, WORKFLOW_MARKETING_PLAN_NAME_MAX_LENGTH) }
    : undefined;
}

export function toMarketingPlanSnapshot(
  plan: WorkflowMarketingPlanListItem,
): WorkflowMarketingPlanSnapshot {
  return { planId: plan.planId, planName: plan.name };
}

export function normalizeMarketingMessageWait(value: unknown): WorkflowMarketingMessageWait {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { duration: 1, unit: "hour" };
  }
  const record = value as Record<string, unknown>;
  const unit = record.unit === "minute" ? "minute" : "hour";
  const maximum = WORKFLOW_MARKETING_MESSAGE_WAIT_MAX_BY_UNIT[unit];
  const duration = typeof record.duration === "number" && Number.isInteger(record.duration)
    ? Math.min(maximum, Math.max(1, record.duration))
    : 1;
  return { duration, unit };
}

export function isMarketingMessageWait(value: unknown): value is WorkflowMarketingMessageWait {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.unit !== "minute" && record.unit !== "hour") return false;
  return typeof record.duration === "number"
    && Number.isInteger(record.duration)
    && record.duration >= 1
    && record.duration <= WORKFLOW_MARKETING_MESSAGE_WAIT_MAX_BY_UNIT[record.unit];
}

export function getMarketingMessageMetric(plan: WorkflowMarketingPlanSnapshot | undefined) {
  return plan ? plan.planName : "未选择触达任务";
}
