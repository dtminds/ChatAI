import {
  WORKFLOW_SMARTSHEET_WRITE_FIELD_MAX_COUNT,
  WORKFLOW_SMARTSHEET_WRITE_SCHEMA_MAX_LENGTH,
  WORKFLOW_SMARTSHEET_WRITE_WEBHOOK_URL_MAX_LENGTH,
  WORKFLOW_SMARTSHEET_WRITE_TABLE_URL_MAX_LENGTH,
  isSmartsheetFieldMappingComplete,
  isSupportedSmartsheetSchemaField,
  isValidSmartsheetWebhookUrl,
  isWorkflowSmartsheetFieldValueTypeCompatible,
  parseSmartsheetSchema,
  parseSmartsheetSchemaFields,
  type WorkflowSmartsheetFieldMapping,
  type WorkflowSmartsheetFieldType,
  type WorkflowSmartsheetFieldValue,
  type WorkflowSmartsheetSchemaField,
  type WorkflowSmartsheetValueType,
} from "@chatai/contracts";
import type {
  SmartsheetWriteNodeData,
  WorkflowNodeStatus,
  WorkflowVariableSelector,
} from "../../types";

export type SmartsheetSourceConfig = Pick<
  SmartsheetWriteNodeData, "webhookUrl" | "tableUrl" | "schema" | "fieldMappings"
>;

export type SmartsheetFieldOption = {
  fieldId: string;
  title: string;
  type: string;
  mapping: WorkflowSmartsheetFieldMapping | null;
};

export function createSmartsheetFieldMapping(
  fieldId: string,
  field: WorkflowSmartsheetSchemaField,
  previous?: WorkflowSmartsheetFieldMapping,
): WorkflowSmartsheetFieldMapping {
  const enumOptions = field.enum;
  const value = previous && previous.fieldType === field.type
    ? previous.value
    : { kind: "literal" as const, value: "" };
  return {
    fieldId,
    fieldTitle: field.title,
    fieldType: field.type,
    value,
    ...(enumOptions ? { enumOptions } : {}),
  };
}

export function getSmartsheetFieldOptions(
  schemaJson: string,
  previousMappings: readonly WorkflowSmartsheetFieldMapping[] = [],
): SmartsheetFieldOption[] | null {
  const parsed = parseSmartsheetSchemaFields(schemaJson);
  if (!parsed) return null;
  const previousById = new Map(previousMappings.map(mapping => [mapping.fieldId, mapping]));
  return Object.entries(parsed).map(([fieldId, field]) => ({
    fieldId,
    title: field.title,
    type: field.type,
    mapping: isSupportedSmartsheetSchemaField(field)
      ? createSmartsheetFieldMapping(fieldId, field, previousById.get(fieldId))
      : null,
  }));
}

export function normalizeSmartsheetTableUrl(value: unknown): string {
  return typeof value === "string"
    ? value.trim().slice(0, WORKFLOW_SMARTSHEET_WRITE_TABLE_URL_MAX_LENGTH)
    : "";
}

export function isValidSmartsheetTableUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function normalizeSmartsheetWebhookUrl(value: unknown): string {
  return typeof value === "string"
    ? value.slice(0, WORKFLOW_SMARTSHEET_WRITE_WEBHOOK_URL_MAX_LENGTH)
    : "";
}

export function maskSmartsheetWebhookUrl(webhookUrl: string): string {
  return webhookUrl.replace(/([?&]key=)([^&#]*)/i, (_match, prefix: string, rawKey: string) =>
    `${prefix}${maskSmartsheetWebhookKey(decodeQueryComponent(rawKey))}`);
}

function decodeQueryComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function maskSmartsheetWebhookKey(key: string): string {
  const chars = Array.from(key);
  if (chars.length <= 6) return "**";
  return `${chars.slice(0, 2).join("")}**${chars.slice(-4).join("")}`;
}

export function normalizeSmartsheetSchema(value: unknown): string {
  return typeof value === "string"
    ? value.slice(0, WORKFLOW_SMARTSHEET_WRITE_SCHEMA_MAX_LENGTH)
    : "";
}

export function normalizeSmartsheetFieldMappings(
  value: unknown,
): WorkflowSmartsheetFieldMapping[] {
  if (!Array.isArray(value)) return [];
  const mappings: WorkflowSmartsheetFieldMapping[] = [];
  const seenIds = new Set<string>();
  for (const item of value) {
    if (mappings.length >= WORKFLOW_SMARTSHEET_WRITE_FIELD_MAX_COUNT) break;
    const mapping = normalizeSmartsheetFieldMapping(item, seenIds);
    if (!mapping) continue;
    seenIds.add(mapping.fieldId);
    mappings.push(mapping);
  }
  return mappings;
}

export function getSmartsheetWriteMetric(
  data: Pick<SmartsheetWriteNodeData, "fieldMappings">,
): string {
  const count = normalizeSmartsheetFieldMappings(data.fieldMappings).length;
  return count > 0 ? `已设置 ${count} 个字段` : "未配置";
}

export function getSmartsheetWriteStatus(
  data: Pick<SmartsheetWriteNodeData, "webhookUrl" | "schema" | "fieldMappings">,
): WorkflowNodeStatus {
  return areSmartsheetWriteFieldsComplete(data) ? "ready" : "warning";
}

export function areSmartsheetWriteFieldsComplete(
  data: Pick<SmartsheetWriteNodeData, "webhookUrl" | "schema" | "fieldMappings">,
) {
  const webhookUrl = normalizeSmartsheetWebhookUrl(data.webhookUrl);
  const schema = normalizeSmartsheetSchema(data.schema);
  const fieldMappings = normalizeSmartsheetFieldMappings(data.fieldMappings);
  const fields = parseSmartsheetSchema(schema);
  return isValidSmartsheetWebhookUrl(webhookUrl)
    && fields !== null
    && fieldMappings.length > 0
    && fieldMappings.every(mapping => fields[mapping.fieldId]?.type === mapping.fieldType)
    && fieldMappings.every(isSmartsheetFieldMappingComplete);
}

export function getSmartsheetWriteNodePatch(
  data: SmartsheetSourceConfig,
): SmartsheetSourceConfig & Pick<SmartsheetWriteNodeData, "metric" | "status"> {
  const nextData = {
    webhookUrl: normalizeSmartsheetWebhookUrl(data.webhookUrl),
    tableUrl: normalizeSmartsheetTableUrl(data.tableUrl),
    schema: normalizeSmartsheetSchema(data.schema),
    fieldMappings: normalizeSmartsheetFieldMappings(data.fieldMappings),
  };
  return {
    ...nextData,
    metric: getSmartsheetWriteMetric(nextData),
    status: getSmartsheetWriteStatus(nextData),
  };
}

export function getCompatibleSmartsheetVariables<T extends { valueType: { kind: string } }>(
  fieldType: WorkflowSmartsheetFieldType,
  variables: T[],
) {
  return variables.filter(variable =>
    isWorkflowSmartsheetFieldValueTypeCompatible(fieldType, variable.valueType));
}

function normalizeSmartsheetFieldMapping(
  value: unknown,
  seenIds: Set<string>,
): WorkflowSmartsheetFieldMapping | null {
  if (!isRecord(value) || typeof value.fieldId !== "string" || !value.fieldId.trim()) {
    return null;
  }
  const fieldId = value.fieldId.trim().slice(0, 128);
  if (seenIds.has(fieldId) || !isSmartsheetFieldType(value.fieldType)) return null;
  const enumOptions = Array.isArray(value.enumOptions)
    ? value.enumOptions.filter((option): option is string => typeof option === "string")
    : undefined;
  return {
    fieldId,
    fieldTitle: typeof value.fieldTitle === "string" ? value.fieldTitle.slice(0, 256) : fieldId,
    fieldType: value.fieldType,
    value: normalizeSmartsheetFieldValue(value.value),
    ...(enumOptions && enumOptions.length > 0 ? { enumOptions } : {}),
  };
}

function normalizeSmartsheetFieldValue(value: unknown): WorkflowSmartsheetFieldValue {
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

function normalizeSelector(value: unknown): WorkflowVariableSelector | undefined {
  if (!Array.isArray(value)
    || value.length < 2
    || value.length > 4
    || value.some(part => typeof part !== "string" || !part)) {
    return undefined;
  }
  return value as WorkflowVariableSelector;
}

function normalizeValueType(value: unknown): WorkflowSmartsheetValueType | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === "boolean"
    || value.kind === "datetime"
    || value.kind === "number"
    || value.kind === "string") {
    return { kind: value.kind };
  }
  return undefined;
}

function isSmartsheetFieldType(value: unknown): value is WorkflowSmartsheetFieldType {
  return value === "text"
    || value === "number"
    || value === "currency"
    || value === "date_time"
    || value === "single_select"
    || value === "checkbox"
    || value === "url";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
