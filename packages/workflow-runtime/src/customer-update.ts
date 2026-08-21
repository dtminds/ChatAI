import {
  isValidWorkflowLocalDate,
  isWorkflowNodeExecutionConfig,
  WorkflowCustomerUpdateCommandSchema,
  WorkflowCustomerUpdateResultSchema,
  type WorkflowCustomerFieldType,
  type WorkflowCustomerUpdateCommand,
  type WorkflowCustomerUpdateExecutionConfig,
  type WorkflowCustomerUpdateValue,
  type WorkflowVariableSelector,
} from "@chatai/contracts";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import type {
  WorkflowCapabilityCommandContext,
  WorkflowCapabilityExecutionBinding,
} from "./capability-port.js";
import { resolveWorkflowVariableSelector } from "./variable-content.js";

const UTC8_OFFSET_MILLISECONDS = 8 * 60 * 60 * 1000;
const CUSTOMER_LOCAL_DATE_PATTERN = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/;
const CUSTOMER_LOCAL_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/;
const CUSTOMER_OFFSET_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/i;

export const WORKFLOW_CUSTOMER_UPDATE_CAPABILITY_BINDING = {
  createCommand: createWorkflowCustomerUpdateCommand,
  definition: {
    capabilityKey: "customer.update",
    commandSchema: WorkflowCustomerUpdateCommandSchema,
    contractVersion: 1,
    kind: "action",
    resultSchema: WorkflowCustomerUpdateResultSchema,
  },
  nodeKind: "customer-update",
} satisfies WorkflowCapabilityExecutionBinding<
  typeof WorkflowCustomerUpdateCommandSchema,
  typeof WorkflowCustomerUpdateResultSchema,
  "action"
>;

export function createWorkflowCustomerUpdateCommand(input: {
  config: Record<string, unknown>;
  context: WorkflowCapabilityCommandContext;
}): WorkflowCustomerUpdateCommand {
  if (!isWorkflowNodeExecutionConfig("customer-update", input.config)) {
    throw customerUpdateCommandError("Customer Update execution config failed schema validation");
  }
  if (!input.context.identities.externalUserId) {
    throw customerUpdateCommandError("Customer Update recipient is unavailable in the Run context");
  }
  const config = input.config as WorkflowCustomerUpdateExecutionConfig;
  return {
    source: "workflow",
    updates: config.fields.flatMap(field => {
      const value = resolveCustomerFieldValue(field.fieldType, field.value, input.context);
      return value === null
        ? []
        : [{ fieldId: field.fieldId, fieldType: field.fieldType, value }];
    }),
  };
}

function resolveCustomerFieldValue(
  fieldType: WorkflowCustomerFieldType,
  configuredValue: WorkflowCustomerUpdateValue,
  context: WorkflowCapabilityCommandContext,
): number | string | null {
  const value = configuredValue.kind === "literal"
    ? configuredValue.value
    : readVariableValue(configuredValue.selector, context);

  if (fieldType === 11) {
    if (configuredValue.kind === "variable") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw customerUpdateCommandError("Customer number field resolved to a non-number value");
      }
      return value;
    }
    const parsed = Number(String(value).trim());
    if (!Number.isFinite(parsed)) {
      throw customerUpdateCommandError("Customer number field contains an invalid literal value");
    }
    return parsed;
  }

  if (fieldType === 4 || fieldType === 12) {
    return normalizeWorkflowCustomerDate(value);
  }

  if (typeof value !== "string") {
    throw customerUpdateCommandError("Customer text field resolved to an empty or non-string value");
  }
  const normalized = value.trim();
  if (!normalized) {
    if (configuredValue.kind === "variable") return null;
    throw customerUpdateCommandError("Customer text field resolved to an empty or non-string value");
  }
  return normalized;
}

function readVariableValue(
  selector: WorkflowVariableSelector,
  context: WorkflowCapabilityCommandContext,
) {
  const resolved = resolveWorkflowVariableSelector(selector, context);
  if (!resolved.available) {
    throw customerUpdateCommandError(
      `Customer Update node references unavailable data: ${selector.join(".")}`,
    );
  }
  return resolved.value;
}

export function normalizeWorkflowCustomerDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  const localDateMatch = CUSTOMER_LOCAL_DATE_PATTERN.exec(normalized);
  if (localDateMatch) {
    const localDate = [
      localDateMatch[1],
      localDateMatch[2]!.padStart(2, "0"),
      localDateMatch[3]!.padStart(2, "0"),
    ].join("-");
    return isValidWorkflowLocalDate(localDate) ? localDate : null;
  }
  const isLocalDateTime = CUSTOMER_LOCAL_DATE_TIME_PATTERN.test(normalized);
  const isOffsetDateTime = CUSTOMER_OFFSET_DATE_TIME_PATTERN.test(normalized);
  if ((!isLocalDateTime && !isOffsetDateTime)
    || !isValidWorkflowLocalDate(normalized.slice(0, 10))) {
    return null;
  }
  const timestamp = Date.parse(isLocalDateTime ? `${normalized}+08:00` : normalized);
  if (!Number.isFinite(timestamp)) return null;
  const utc8Date = new Date(timestamp + UTC8_OFFSET_MILLISECONDS);
  return [
    utc8Date.getUTCFullYear(),
    String(utc8Date.getUTCMonth() + 1).padStart(2, "0"),
    String(utc8Date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function customerUpdateCommandError(diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    "WORKFLOW_CUSTOMER_UPDATE_COMMAND_INVALID",
    "执行所需数据不可用，流程已停止",
    { diagnosticMessage },
  );
}
