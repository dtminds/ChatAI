import {
  isValidWorkflowLocalDate,
  isWorkflowCustomerFieldTypeSupported,
  isWorkflowCustomerFieldValueTypeCompatible,
  WORKFLOW_CUSTOMER_UPDATE_MAX_FIELD_COUNT,
  type WorkflowCustomerFieldSnapshot,
  type WorkflowCustomerUpdateDraftField,
  type WorkflowCustomerUpdateValue,
  type WorkflowOutputValueType,
  type WorkflowVariableSelector,
} from "@chatai/contracts";
import type { CustomerUpdateNodeData, WorkflowNodeStatus } from "../../types";

let customerUpdateFieldSequence = 0;

export function createCustomerUpdateDraftField(
  fields: readonly WorkflowCustomerUpdateDraftField[] = [],
): WorkflowCustomerUpdateDraftField {
  const existingIds = new Set(fields.map(field => field.id));
  let id: string;
  do {
    customerUpdateFieldSequence += 1;
    id = `field-${customerUpdateFieldSequence.toString(36)}`;
  } while (existingIds.has(id));
  return { id, value: { kind: "literal", value: "" } };
}

export function normalizeCustomerUpdateFields(value: unknown): WorkflowCustomerUpdateDraftField[] {
  const fields: WorkflowCustomerUpdateDraftField[] = [];
  const seenIds = new Set<string>();
  const rawFields = Array.isArray(value) ? value : [];
  for (const [index, rawField] of rawFields.entries()) {
    if (!isRecord(rawField) || fields.length >= WORKFLOW_CUSTOMER_UPDATE_MAX_FIELD_COUNT) continue;
    const id = normalizeFieldRowId(rawField.id, index, seenIds);
    seenIds.add(id);
    const field = normalizeCustomerFieldSnapshot(rawField.field);
    fields.push({
      ...(field ? { field } : {}),
      id,
      value: normalizeCustomerUpdateValue(rawField.value),
    });
  }
  return fields.length > 0 ? fields : [createCustomerUpdateDraftField()];
}

export function getCustomerUpdateMetric(fields: readonly WorkflowCustomerUpdateDraftField[]) {
  const configuredCount = normalizeCustomerUpdateFields(fields)
    .filter(field => field.field).length;
  return configuredCount > 0 ? `已设置 ${configuredCount} 个属性` : "待配置客户属性";
}

export function getCustomerUpdateStatus(
  fields: readonly WorkflowCustomerUpdateDraftField[],
): WorkflowNodeStatus {
  return areCustomerUpdateFieldsComplete(fields) ? "ready" : "warning";
}

export function areCustomerUpdateFieldsComplete(
  fields: readonly WorkflowCustomerUpdateDraftField[],
) {
  const normalized = normalizeCustomerUpdateFields(fields);
  const fieldIds = normalized.flatMap(field => field.field ? [field.field.id] : []);
  return normalized.length > 0
    && normalized.length <= WORKFLOW_CUSTOMER_UPDATE_MAX_FIELD_COUNT
    && fieldIds.length === normalized.length
    && new Set(fieldIds).size === fieldIds.length
    && normalized.every(field => field.field
      && isCustomerUpdateValueComplete(field.field.type, field.value));
}

export function getCompatibleCustomerUpdateVariables<T extends {
  valueType: WorkflowOutputValueType;
}>(field: WorkflowCustomerFieldSnapshot | undefined, variables: T[]) {
  return field
    ? variables.filter(variable =>
        isWorkflowCustomerFieldValueTypeCompatible(field.type, variable.valueType))
    : [];
}

export function getCustomerUpdateNodePatch(
  fields: WorkflowCustomerUpdateDraftField[],
): Pick<CustomerUpdateNodeData, "fields" | "metric" | "status"> {
  const normalized = normalizeCustomerUpdateFields(fields);
  return {
    fields: normalized,
    metric: getCustomerUpdateMetric(normalized),
    status: getCustomerUpdateStatus(normalized),
  };
}

function normalizeCustomerFieldSnapshot(value: unknown): WorkflowCustomerFieldSnapshot | undefined {
  if (!isRecord(value)
    || !Number.isSafeInteger(value.id)
    || Number(value.id) <= 0
    || typeof value.key !== "string"
    || typeof value.title !== "string"
    || !Number.isInteger(value.type)
    || !isWorkflowCustomerFieldTypeSupported(Number(value.type))) {
    return undefined;
  }
  return {
    id: Number(value.id),
    key: value.key.trim().slice(0, 128),
    title: value.title.trim().slice(0, 256),
    type: Number(value.type) as WorkflowCustomerFieldSnapshot["type"],
  };
}

function normalizeCustomerUpdateValue(value: unknown): WorkflowCustomerUpdateValue {
  if (isRecord(value) && value.kind === "variable") {
    const selector = normalizeSelector(value.selector);
    const valueType = normalizeValueType(value.valueType);
    if (selector && valueType) return { kind: "variable", selector, valueType };
  }
  return {
    kind: "literal",
    value: isRecord(value) && typeof value.value === "string" ? value.value : "",
  };
}

function isCustomerUpdateValueComplete(
  fieldType: WorkflowCustomerFieldSnapshot["type"],
  value: WorkflowCustomerUpdateValue,
) {
  if (value.kind === "variable") {
    return isWorkflowCustomerFieldValueTypeCompatible(fieldType, value.valueType);
  }
  const literal = value.value.trim();
  if (!literal) return false;
  if (fieldType === 11) return Number.isFinite(Number(literal));
  if (fieldType === 4 || fieldType === 12) return isValidWorkflowLocalDate(literal);
  return true;
}

function normalizeFieldRowId(value: unknown, index: number, seenIds: Set<string>) {
  const candidate = typeof value === "string" && value.trim()
    ? value.trim().slice(0, 128)
    : `field-${index + 1}`;
  if (!seenIds.has(candidate)) return candidate;
  let suffix = 2;
  while (seenIds.has(`${candidate}-${suffix}`)) suffix += 1;
  return `${candidate}-${suffix}`;
}

function normalizeSelector(value: unknown): WorkflowVariableSelector | undefined {
  if (!Array.isArray(value)
    || value.length < 2
    || value.length > 4
    || value.some(part => typeof part !== "string" || !part)) {
    return undefined;
  }
  return value as WorkflowVariableSelector;
}

function normalizeValueType(value: unknown): WorkflowOutputValueType | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === "string" || value.kind === "number" || value.kind === "datetime") {
    return { kind: value.kind };
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
