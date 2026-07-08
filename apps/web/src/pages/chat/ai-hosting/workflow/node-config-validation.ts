import type {
  NodeConfigField,
  NodeConfigSection,
} from "./node-config-types";
import type {
  WorkflowNode,
  WorkflowNodeData,
  WorkflowNodeValidationIssue,
} from "./types";

export function validateNodeConfigSections(
  node: WorkflowNode,
  sections: NodeConfigSection[],
): WorkflowNodeValidationIssue[] {
  return sections.flatMap((section) =>
    section.fields.flatMap((field) => validateNodeConfigField(node.data, field)),
  );
}

function validateNodeConfigField(
  data: WorkflowNodeData,
  field: NodeConfigField,
): WorkflowNodeValidationIssue[] {
  const validationValue = getNodeConfigFieldValidationValue(data, field);
  const issues: WorkflowNodeValidationIssue[] = [];

  if (field.validation?.required && !hasRequiredConfigValue(validationValue)) {
    issues.push(createConfigIssue(field.validation.required));
  }

  if (field.kind === "number" && field.validation?.number) {
    const isValidNumber = typeof validationValue === "number"
      && Number.isFinite(validationValue)
      && (field.min === undefined || validationValue >= field.min);

    if (!isValidNumber) {
      issues.push(createConfigIssue(field.validation.number));
    }
  }

  return issues;
}

function getNodeConfigFieldValidationValue(
  data: WorkflowNodeData,
  field: NodeConfigField,
) {
  return field.getValidationValue
    ? field.getValidationValue(data)
    : field.getValue(data);
}

function hasRequiredConfigValue(value: unknown) {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return value !== null && value !== undefined;
}

function createConfigIssue(issue: {
  code: string;
  message: string;
}): WorkflowNodeValidationIssue {
  return {
    code: issue.code,
    message: issue.message,
    severity: "warning",
    source: "config",
  };
}
