import {
  getWorkflowCustomFieldVariableValueType,
  type WorkflowCustomFieldVariableRequirement,
} from "@chatai/contracts";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";

export type WorkflowCustomFieldValue = number | string;

export type WorkflowContactCustomFieldValue = {
  fieldId: number;
  fieldType: number;
  rawValue: string;
};

export interface WorkflowContactCustomFieldPort {
  getContactCustomFields(input: {
    externalUserId: number;
    fieldIds: readonly number[];
    signal?: AbortSignal;
    uid: number;
  }): Promise<WorkflowContactCustomFieldValue[]>;
}

export class WorkflowContactCustomFieldLookupError extends Error {
  readonly failureKind: "retryable" | "terminal";

  constructor(
    message = "Workflow contact custom field service is unavailable",
    options?: ErrorOptions & { failureKind?: "retryable" | "terminal" },
  ) {
    super(message, options);
    this.name = "WorkflowContactCustomFieldLookupError";
    this.failureKind = options?.failureKind ?? "retryable";
  }
}

export async function prepareWorkflowContactCustomFields(input: {
  externalUserId: number;
  port?: WorkflowContactCustomFieldPort;
  requirements: readonly WorkflowCustomFieldVariableRequirement[];
  signal?: AbortSignal;
  uid: number;
}): Promise<Record<string, WorkflowCustomFieldValue>> {
  if (input.requirements.length === 0) return {};
  if (!input.port) {
    throw customFieldLookupFailure(
      "Workflow contact custom field port is not configured",
    );
  }

  let fields: WorkflowContactCustomFieldValue[];
  try {
    fields = await input.port.getContactCustomFields({
      externalUserId: input.externalUserId,
      fieldIds: input.requirements.map(requirement => requirement.fieldId),
      signal: input.signal,
      uid: input.uid,
    });
  } catch (error) {
    if (error instanceof WorkflowCapabilityExecutionError) throw error;
    throw customFieldLookupFailure(
      error instanceof WorkflowContactCustomFieldLookupError
        ? error.message
        : "Workflow contact custom field lookup failed",
      error instanceof WorkflowContactCustomFieldLookupError
        ? error.failureKind
        : "retryable",
    );
  }

  return normalizeWorkflowContactCustomFieldValues(fields, input.requirements);
}

export function normalizeWorkflowContactCustomFieldValues(
  fields: readonly WorkflowContactCustomFieldValue[],
  requirements: readonly WorkflowCustomFieldVariableRequirement[],
): Record<string, WorkflowCustomFieldValue> {
  const byId = new Map<number, WorkflowContactCustomFieldValue>();
  for (const field of fields) {
    if (byId.has(field.fieldId)) {
      throw customFieldValueInvalid(`Duplicate Workflow custom field ${field.fieldId}`);
    }
    byId.set(field.fieldId, field);
  }

  const values: Record<string, WorkflowCustomFieldValue> = {};
  for (const requirement of requirements) {
    const { fieldId } = requirement;
    const field = byId.get(fieldId);
    if (!field) {
      throw new WorkflowCapabilityExecutionError(
        "terminal",
        "WORKFLOW_CONTACT_CUSTOM_FIELD_UNAVAILABLE",
        "客户自定义属性不可用，流程已停止",
        { diagnosticMessage: `Referenced Workflow custom field ${fieldId} is unavailable` },
      );
    }
    const valueType = getWorkflowCustomFieldVariableValueType(field.fieldType);
    if (!valueType) {
      throw customFieldValueInvalid(
        `Workflow custom field ${fieldId} has unsupported type ${field.fieldType}`,
      );
    }
    if (!requirement.valueTypes.includes(valueType.kind)) {
      throw customFieldValueInvalid(
        `Workflow custom field ${fieldId} type ${valueType.kind} does not match published node requirements`,
      );
    }
    if (field.rawValue.trim() === "") {
      values[String(fieldId)] = "";
      continue;
    }
    if (valueType.kind === "number") {
      const value = Number(field.rawValue);
      if (!Number.isFinite(value)) {
        throw customFieldValueInvalid(
          `Workflow custom field ${fieldId} raw value is not a finite number`,
        );
      }
      values[String(fieldId)] = value;
    } else {
      values[String(fieldId)] = field.rawValue;
    }
  }
  return values;
}

export function readWorkflowCustomFieldSnapshot(
  input: Record<string, unknown>,
  requirements: readonly WorkflowCustomFieldVariableRequirement[],
): Record<string, WorkflowCustomFieldValue> | null {
  if (requirements.length === 0) return {};
  const snapshot = input.customFields;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const record = snapshot as Record<string, unknown>;
  const values: Record<string, WorkflowCustomFieldValue> = {};
  for (const requirement of requirements) {
    const { fieldId } = requirement;
    const key = String(fieldId);
    if (!Object.prototype.hasOwnProperty.call(record, key)) return null;
    const value = record[key];
    if (value === "") {
      values[key] = value;
      continue;
    }
    if (typeof value === "string") {
      if (!requirement.valueTypes.includes("string")) {
        throw customFieldValueInvalid(
          `Workflow custom field ${fieldId} snapshot type string does not match published node requirements`,
        );
      }
      values[key] = value;
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    if (!requirement.valueTypes.includes("number")) {
      throw customFieldValueInvalid(
        `Workflow custom field ${fieldId} snapshot type number does not match published node requirements`,
      );
    }
    values[key] = value;
  }
  return values;
}

function customFieldLookupFailure(
  diagnosticMessage: string,
  failureKind: "retryable" | "terminal" = "retryable",
) {
  return new WorkflowCapabilityExecutionError(
    failureKind,
    failureKind === "terminal"
      ? "WORKFLOW_CONTACT_CUSTOM_FIELD_REJECTED"
      : "WORKFLOW_CONTACT_CUSTOM_FIELD_LOOKUP_FAILED",
    failureKind === "terminal"
      ? "客户自定义属性查询失败，流程已停止"
      : "客户自定义属性查询暂时失败",
    { diagnosticMessage },
  );
}

function customFieldValueInvalid(diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    "WORKFLOW_CONTACT_CUSTOM_FIELD_VALUE_INVALID",
    "客户自定义属性值异常，流程已停止",
    { diagnosticMessage },
  );
}
