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

export type WorkflowCustomFieldVariableValueType = "number" | "string";

export type WorkflowCustomFieldVariableRequirement = {
  fieldId: number;
  valueTypes: readonly WorkflowCustomFieldVariableValueType[];
};

export function getWorkflowCustomFieldVariableRequirements(
  value: unknown,
): WorkflowCustomFieldVariableRequirement[] {
  const requirements = new Map<number, Set<WorkflowCustomFieldVariableValueType>>();
  collectWorkflowCustomFieldVariableRequirements(value, requirements);
  return [...requirements.entries()]
    .sort(([left], [right]) => left - right)
    .map(([fieldId, valueTypes]) => ({
      fieldId,
      valueTypes: [...valueTypes].sort(),
    }));
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

function collectWorkflowCustomFieldVariableRequirements(
  value: unknown,
  requirements: Map<number, Set<WorkflowCustomFieldVariableValueType>>,
) {
  if (Array.isArray(value)) {
    if (value.every(item => typeof item === "string")) {
      const fieldId = getWorkflowCustomFieldVariableId(value);
      if (fieldId !== null && !requirements.has(fieldId)) {
        requirements.set(fieldId, new Set(["number", "string"]));
        return;
      }
    }
    value.forEach(item => collectWorkflowCustomFieldVariableRequirements(item, requirements));
    return;
  }

  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.selector)
    && record.selector.every((item): item is string => typeof item === "string")) {
    const fieldId = getWorkflowCustomFieldVariableId(record.selector);
    if (fieldId !== null && Object.prototype.hasOwnProperty.call(record, "valueType")) {
      constrainWorkflowCustomFieldValueTypes(
        requirements,
        fieldId,
        readWorkflowCustomFieldExpectedValueTypes(record.valueType),
      );
    }
  }
  Object.values(record).forEach(item =>
    collectWorkflowCustomFieldVariableRequirements(item, requirements));
}

function readWorkflowCustomFieldExpectedValueTypes(
  value: unknown,
): readonly WorkflowCustomFieldVariableValueType[] {
  if (value === "number" || value === "string") return [value];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const kind = (value as Record<string, unknown>).kind;
    if (kind === "number" || kind === "string") return [kind];
  }
  return [];
}

function constrainWorkflowCustomFieldValueTypes(
  requirements: Map<number, Set<WorkflowCustomFieldVariableValueType>>,
  fieldId: number,
  allowed: readonly WorkflowCustomFieldVariableValueType[],
) {
  const current = requirements.get(fieldId) ?? new Set(["number", "string"] as const);
  requirements.set(fieldId, new Set([...current].filter(valueType => allowed.includes(valueType))));
}
