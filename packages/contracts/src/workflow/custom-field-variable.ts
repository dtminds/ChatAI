import type {
  WorkflowOutputValueType,
  WorkflowVariableSelector,
} from "./node-contract.js";

const STRING_CUSTOM_FIELD_TYPES = new Set([1, 2, 4, 5, 6, 12]);

export function createWorkflowCustomFieldVariableSelector(
  fieldId: number,
): WorkflowVariableSelector {
  return ["subject", "customFields", String(fieldId)];
}

export function getWorkflowCustomFieldVariableId(
  selector: readonly string[],
): number | null {
  if (selector.length !== 3
    || selector[0] !== "subject"
    || selector[1] !== "customFields") {
    return null;
  }

  const fieldId = Number(selector[2]);
  return Number.isSafeInteger(fieldId)
    && fieldId > 0
    && String(fieldId) === selector[2]
    ? fieldId
    : null;
}

export function getWorkflowCustomFieldVariableValueType(
  fieldType: number,
): Extract<WorkflowOutputValueType, { kind: "number" | "string" }> | null {
  if (fieldType === 11) return { kind: "number" };
  return STRING_CUSTOM_FIELD_TYPES.has(fieldType) ? { kind: "string" } : null;
}

export function containsWorkflowCustomFieldVariableSelector(value: unknown): boolean {
  return getWorkflowCustomFieldVariableIds(value).length > 0;
}

export function getWorkflowCustomFieldVariableIds(value: unknown): number[] {
  const fieldIds = new Set<number>();
  collectWorkflowCustomFieldVariableIds(value, fieldIds);
  return [...fieldIds].sort((left, right) => left - right);
}

function collectWorkflowCustomFieldVariableIds(value: unknown, fieldIds: Set<number>) {
  if (Array.isArray(value)) {
    if (value.every(item => typeof item === "string")) {
      const fieldId = getWorkflowCustomFieldVariableId(value);
      if (fieldId !== null) {
        fieldIds.add(fieldId);
        return;
      }
    }
    value.forEach(item => collectWorkflowCustomFieldVariableIds(item, fieldIds));
    return;
  }

  if (!value || typeof value !== "object") return;
  Object.values(value).forEach(item => collectWorkflowCustomFieldVariableIds(item, fieldIds));
}
