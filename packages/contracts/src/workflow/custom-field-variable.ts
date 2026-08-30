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
  if (Array.isArray(value)) {
    if (value.every(item => typeof item === "string")
      && getWorkflowCustomFieldVariableId(value) !== null) {
      return true;
    }
    return value.some(containsWorkflowCustomFieldVariableSelector);
  }

  if (!value || typeof value !== "object") return false;
  return Object.values(value).some(containsWorkflowCustomFieldVariableSelector);
}
