import {
  isWorkflowSmartsheetWriteExecutionConfigComplete,
  isValidWorkflowLocalDate,
  isValidWorkflowLocalDateTime,
  isValidSmartsheetUrl,
  WorkflowSmartsheetWriteCommandSchema,
  WorkflowSmartsheetWriteResultSchema,
  WORKFLOW_SMARTSHEET_WRITE_VALUE_MAX_LENGTH,
  type WorkflowSmartsheetWriteCommand,
  type WorkflowSmartsheetExecutionFieldMapping,
} from "@chatai/contracts";
import type { WorkflowCapabilityCommandContext, WorkflowCapabilityExecutionBinding } from "./capability-port.js";
import { resolveWorkflowVariableSelector } from "./variable-content.js";

export const WORKFLOW_SMARTSHEET_WRITE_CAPABILITY_BINDING = {
  completeWithoutExecution: (input) => createWorkflowSmartsheetWriteCommand(input) === null
    ? { success: false, errorCode: "INVALID_FIELD_VALUE" } : undefined,
  createCommand: createWorkflowSmartsheetWriteCommand,
  definition: {
    capabilityKey: "smartsheet.write",
    commandSchema: WorkflowSmartsheetWriteCommandSchema,
    contractVersion: 1,
    kind: "action",
    resultSchema: WorkflowSmartsheetWriteResultSchema,
  },
  executionTimeoutMs: 60_000,
  nodeKind: "smartsheet-write",
} satisfies WorkflowCapabilityExecutionBinding<
  typeof WorkflowSmartsheetWriteCommandSchema,
  typeof WorkflowSmartsheetWriteResultSchema,
  "action"
>;

export function createWorkflowSmartsheetWriteCommand(input: {
  config: Record<string, unknown>;
  context: WorkflowCapabilityCommandContext;
}): WorkflowSmartsheetWriteCommand | null {
  if (!isWorkflowSmartsheetWriteExecutionConfigComplete(input.config)) return null;
  const fields: WorkflowSmartsheetWriteCommand["fields"] = [];
  for (const field of input.config.fieldMappings) {
    const resolved = field.value.kind === "literal"
      ? { available: true, value: field.value.value }
      : resolveWorkflowVariableSelector(field.value.selector, input.context);
    if (!resolved.available) return null;
    const value = resolved.value;
    if (value === null || value === "" || (typeof value === "string" && !value.trim())) continue;
    const converted = convertValue(field, value);
    if (converted === undefined) return null;
    if (converted !== null) fields.push({ fieldId: field.fieldId, fieldType: field.fieldType, value: converted });
  }
  return fields.length ? { webhookUrl: input.config.webhookUrl, fields } : null;
}

function convertValue(field: WorkflowSmartsheetExecutionFieldMapping, value: unknown) {
  if (field.fieldType === "number") {
    const number = field.value.kind === "literal" ? Number(value) : value;
    return typeof number === "number" && Number.isFinite(number) ? number : undefined;
  }
  if (field.fieldType === "checkbox") {
    if (typeof value === "boolean") return value;
    if (field.value.kind === "literal" && (value === "true" || value === "false")) return value === "true";
    return undefined;
  }
  if (field.fieldType === "date_time") return normalizeSmartsheetDateTime(value);
  if (typeof value !== "string" || value.length > WORKFLOW_SMARTSHEET_WRITE_VALUE_MAX_LENGTH) return undefined;
  if (field.fieldType === "url") return isValidSmartsheetUrl(value) ? value : undefined;
  if (field.fieldType === "single_select") return field.enumOptions?.includes(value) ? value : null;
  return value;
}

function normalizeSmartsheetDateTime(value: unknown): string | undefined {
  if (typeof value === "number") return Number.isFinite(value) && !Number.isNaN(new Date(value).getTime())
    ? String(value) : undefined;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (isValidWorkflowLocalDate(text)) return text;
  if (isValidWorkflowLocalDateTime(text)) return `${text.replace("T", " ")}:00`;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return normalizeSmartsheetDateTime(Number(text));
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i.test(text)
    || !isValidWorkflowLocalDate(text.slice(0, 10))) return undefined;
  return normalizeSmartsheetDateTime(Date.parse(text));
}
