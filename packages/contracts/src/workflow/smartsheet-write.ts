import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { isValidWorkflowLocalDate, isValidWorkflowLocalDateTime } from "./local-date-time.js";

export const WORKFLOW_SMARTSHEET_WRITE_FIELD_MAX_COUNT = 20;
export const WORKFLOW_SMARTSHEET_WRITE_WEBHOOK_URL_MAX_LENGTH = 1024;
export const WORKFLOW_SMARTSHEET_WRITE_SCHEMA_MAX_LENGTH = 100_000;
export const WORKFLOW_SMARTSHEET_WRITE_TABLE_URL_MAX_LENGTH = 2048;
export const WORKFLOW_SMARTSHEET_WRITE_VALUE_MAX_LENGTH = 10_000;

export const WorkflowSmartsheetFieldTypeSchema = Type.Union([
  Type.Literal("text"),
  Type.Literal("number"),
  Type.Literal("currency"),
  Type.Literal("date_time"),
  Type.Literal("single_select"),
  Type.Literal("checkbox"),
  Type.Literal("url"),
]);

export type WorkflowSmartsheetFieldType = Static<typeof WorkflowSmartsheetFieldTypeSchema>;

const WorkflowSmartsheetSelectorSchema = Type.Array(
  Type.String({ minLength: 1, maxLength: 128 }),
  { minItems: 2, maxItems: 4 },
);

const WorkflowSmartsheetValueTypeSchema = Type.Union([
  Type.Object({ kind: Type.Literal("boolean") }, { additionalProperties: false }),
  Type.Object({ kind: Type.Literal("datetime") }, { additionalProperties: false }),
  Type.Object({ kind: Type.Literal("number") }, { additionalProperties: false }),
  Type.Object({ kind: Type.Literal("string") }, { additionalProperties: false }),
]);

export const WorkflowSmartsheetFieldValueSchema = Type.Union([
  Type.Object({
    kind: Type.Literal("literal"),
    value: Type.String({ maxLength: WORKFLOW_SMARTSHEET_WRITE_VALUE_MAX_LENGTH }),
  }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal("variable"),
    selector: WorkflowSmartsheetSelectorSchema,
    valueType: WorkflowSmartsheetValueTypeSchema,
  }, { additionalProperties: false }),
]);

export type WorkflowSmartsheetFieldValue = Static<typeof WorkflowSmartsheetFieldValueSchema>;

export const WorkflowSmartsheetSchemaFieldSchema = Type.Object({
  title: Type.String({ maxLength: 256 }),
  type: WorkflowSmartsheetFieldTypeSchema,
  enum: Type.Optional(Type.Array(Type.String({ maxLength: 256 }))),
}, { additionalProperties: true });

export type WorkflowSmartsheetSchemaField = Static<typeof WorkflowSmartsheetSchemaFieldSchema>;

const SmartsheetSourceFieldSchema = Type.Object({
  title: Type.String({ maxLength: 256 }),
  type: Type.String({ minLength: 1, maxLength: 128 }),
}, { additionalProperties: true });

export type WorkflowSmartsheetSourceField = Static<typeof SmartsheetSourceFieldSchema>;

export function isSupportedSmartsheetSchemaField(
  field: WorkflowSmartsheetSourceField,
): field is WorkflowSmartsheetSchemaField {
  return Value.Check(WorkflowSmartsheetSchemaFieldSchema, field);
}

export const WorkflowSmartsheetFieldMappingSchema = Type.Object({
  fieldId: Type.String({ minLength: 1, maxLength: 128 }),
  fieldTitle: Type.String({ maxLength: 256 }),
  fieldType: WorkflowSmartsheetFieldTypeSchema,
  value: WorkflowSmartsheetFieldValueSchema,
  enumOptions: Type.Optional(Type.Array(Type.String({ maxLength: 256 }))),
}, { additionalProperties: false });

export type WorkflowSmartsheetFieldMapping = Static<typeof WorkflowSmartsheetFieldMappingSchema>;

export const WorkflowSmartsheetExecutionFieldMappingSchema = Type.Object({
  fieldId: Type.String({ minLength: 1, maxLength: 128 }),
  fieldType: WorkflowSmartsheetFieldTypeSchema,
  value: WorkflowSmartsheetFieldValueSchema,
  enumOptions: Type.Optional(Type.Array(Type.String({ maxLength: 256 }))),
}, { additionalProperties: false });

export type WorkflowSmartsheetExecutionFieldMapping = Static<
  typeof WorkflowSmartsheetExecutionFieldMappingSchema
>;

export const WorkflowSmartsheetWriteDraftConfigSchema = Type.Object({
  webhookUrl: Type.String({ maxLength: WORKFLOW_SMARTSHEET_WRITE_WEBHOOK_URL_MAX_LENGTH }),
  tableUrl: Type.Optional(Type.String({ maxLength: WORKFLOW_SMARTSHEET_WRITE_TABLE_URL_MAX_LENGTH })),
  schema: Type.String({ maxLength: WORKFLOW_SMARTSHEET_WRITE_SCHEMA_MAX_LENGTH }),
  fieldMappings: Type.Array(
    WorkflowSmartsheetFieldMappingSchema,
    { maxItems: WORKFLOW_SMARTSHEET_WRITE_FIELD_MAX_COUNT },
  ),
}, { additionalProperties: false });

export type WorkflowSmartsheetWriteDraftConfig = Static<typeof WorkflowSmartsheetWriteDraftConfigSchema>;

export const WorkflowSmartsheetWriteExecutionConfigSchema = Type.Object({
  webhookUrl: Type.String({ minLength: 1, maxLength: WORKFLOW_SMARTSHEET_WRITE_WEBHOOK_URL_MAX_LENGTH }),
  fieldMappings: Type.Array(
    WorkflowSmartsheetExecutionFieldMappingSchema,
    { minItems: 1, maxItems: WORKFLOW_SMARTSHEET_WRITE_FIELD_MAX_COUNT },
  ),
}, { additionalProperties: false });

export type WorkflowSmartsheetWriteExecutionConfig = Static<
  typeof WorkflowSmartsheetWriteExecutionConfigSchema
>;

export const WorkflowSmartsheetWriteCommandSchema = Type.Object({
  webhookUrl: Type.String({ minLength: 1, maxLength: WORKFLOW_SMARTSHEET_WRITE_WEBHOOK_URL_MAX_LENGTH }),
  fields: Type.Array(Type.Object({
    fieldId: Type.String({ minLength: 1, maxLength: 128 }),
    fieldType: WorkflowSmartsheetFieldTypeSchema,
    value: Type.Union([
      Type.String({ maxLength: WORKFLOW_SMARTSHEET_WRITE_VALUE_MAX_LENGTH }),
      Type.Number(),
      Type.Boolean(),
    ]),
  }, { additionalProperties: false }), { minItems: 1, maxItems: WORKFLOW_SMARTSHEET_WRITE_FIELD_MAX_COUNT }),
}, { additionalProperties: false });

export type WorkflowSmartsheetWriteCommand = Static<typeof WorkflowSmartsheetWriteCommandSchema>;
export const WorkflowSmartsheetWriteResultSchema = Type.Object({
  success: Type.Boolean(),
  errorCode: Type.Optional(Type.String({ maxLength: 128 })),
}, { additionalProperties: false });

export function isValidSmartsheetWebhookUrl(url: string): boolean {
  if (!url.trim()) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:"
      && !parsed.username && !parsed.password && !parsed.port && !parsed.hash
      && parsed.hostname === "qyapi.weixin.qq.com"
      && parsed.pathname === "/cgi-bin/wedoc/smartsheet/webhook"
      && parsed.searchParams.getAll("key").length === 1
      && Boolean(parsed.searchParams.get("key")?.trim());
  }
  catch {
    return false;
  }
}

export function isValidSmartsheetSchema(schemaJson: string): boolean {
  return parseSmartsheetSchema(schemaJson) !== null;
}

export function parseSmartsheetSchema(
  schemaJson: string,
): Record<string, WorkflowSmartsheetSchemaField> | null {
  const fields = parseSmartsheetSchemaFields(schemaJson);
  if (!fields) return null;
  const result = Object.fromEntries(Object.entries(fields).flatMap(([id, field]) =>
    isSupportedSmartsheetSchemaField(field) ? [[id, field]] : []));
  return Object.keys(result).length > 0 ? result : null;
}

export function parseSmartsheetSchemaFields(
  schemaJson: string,
): Record<string, WorkflowSmartsheetSourceField> | null {
  if (!schemaJson.trim() || schemaJson.length > WORKFLOW_SMARTSHEET_WRITE_SCHEMA_MAX_LENGTH) return null;
  try {
    const parsed = JSON.parse(schemaJson);
    if (!isJsonRecord(parsed)) return null;
    const fields = extractSmartsheetSchemaFields(parsed);
    if (!fields) return null;
    const entries = Object.entries(fields);
    if (entries.length === 0 || entries.some(([fieldId, field]) =>
      !fieldId.trim() || fieldId.length > 128 || !Value.Check(SmartsheetSourceFieldSchema, field))) {
      return null;
    }
    return Object.fromEntries(entries) as Record<string, WorkflowSmartsheetSourceField>;
  }
  catch {
    return null;
  }
}

function extractSmartsheetSchemaFields(parsed: Record<string, unknown>) {
  const nested = parsed.schema;
  if (isJsonRecord(nested)) return nested;
  if ("schema" in parsed || "add_records" in parsed) return null;
  return parsed;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export type WorkflowSmartsheetValueType = Static<typeof WorkflowSmartsheetValueTypeSchema>;

export function getWorkflowSmartsheetFieldValueType(
  fieldType: WorkflowSmartsheetFieldType,
): WorkflowSmartsheetValueType {
  if (isSmartsheetNumberFieldType(fieldType)) return { kind: "number" };
  if (fieldType === "date_time") return { kind: "datetime" };
  if (fieldType === "checkbox") return { kind: "boolean" };
  return { kind: "string" };
}

export function isWorkflowSmartsheetFieldValueTypeCompatible(
  fieldType: WorkflowSmartsheetFieldType,
  valueType: { kind: string },
) {
  if (isSmartsheetNumberFieldType(fieldType)) return valueType.kind === "number";
  if (fieldType === "date_time") return valueType.kind === "datetime" || valueType.kind === "number";
  if (fieldType === "checkbox") return valueType.kind === "boolean";
  return valueType.kind === "string";
}

export function isSmartsheetFieldMappingComplete(
  mapping: Pick<WorkflowSmartsheetFieldMapping, "fieldId" | "fieldType" | "value" | "enumOptions">,
): boolean {
  if (!mapping.fieldId.trim()) return false;
  if (mapping.value.kind === "variable") {
    return isWorkflowSmartsheetFieldValueTypeCompatible(mapping.fieldType, mapping.value.valueType);
  }

  const literal = mapping.value.value.trim();
  if (!literal) return false;
  if (isSmartsheetNumberFieldType(mapping.fieldType)) {
    return Number.isFinite(Number(literal));
  }
  if (mapping.fieldType === "date_time") {
    return isValidSmartsheetDateTimeLiteral(literal);
  }
  if (mapping.fieldType === "url") {
    return isValidSmartsheetUrl(literal);
  }
  if (mapping.fieldType === "checkbox") {
    return literal === "true" || literal === "false";
  }
  if (mapping.fieldType === "single_select" && mapping.enumOptions) {
    return mapping.enumOptions.includes(literal);
  }
  return true;
}

function isSmartsheetNumberFieldType(fieldType: WorkflowSmartsheetFieldType) {
  return fieldType === "number" || fieldType === "currency";
}

export function isValidSmartsheetDateTimeLiteral(value: string): boolean {
  return isValidWorkflowLocalDateTime(value)
    || isValidWorkflowLocalDate(value)
    || (value.trim() !== "" && Number.isFinite(Number(value)));
}

export function isValidSmartsheetUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isWorkflowSmartsheetWriteExecutionConfigComplete(
  value: unknown,
): value is WorkflowSmartsheetWriteExecutionConfig {
  if (!Value.Check(WorkflowSmartsheetWriteExecutionConfigSchema, value)) return false;
  if (!isValidSmartsheetWebhookUrl(value.webhookUrl)) return false;
  if (!value.fieldMappings.every(isSmartsheetFieldMappingComplete)) return false;
  const fieldIds = value.fieldMappings.map(mapping => mapping.fieldId);
  return new Set(fieldIds).size === fieldIds.length;
}

export function isWorkflowSmartsheetWriteDraftConfigComplete(
  value: unknown,
): value is WorkflowSmartsheetWriteDraftConfig {
  if (!Value.Check(WorkflowSmartsheetWriteDraftConfigSchema, value)) return false;
  const fields = parseSmartsheetSchema(value.schema);
  if (!fields || !isValidSmartsheetWebhookUrl(value.webhookUrl)) return false;
  if (value.fieldMappings.length === 0
    || !value.fieldMappings.every(mapping =>
      fields[mapping.fieldId]?.type === mapping.fieldType
      && isSmartsheetFieldMappingComplete(mapping))) {
    return false;
  }
  const fieldIds = value.fieldMappings.map(mapping => mapping.fieldId);
  return new Set(fieldIds).size === fieldIds.length;
}
