import type { WorkflowVariableContentSegment, WorkflowVariableDefinition } from "../../types";
import {
  getWorkflowVariableDisplayLabel,
  getWorkflowVariableSelectorKey,
} from "../../workflow-variable-selector";
import { workflowContextVariables } from "../../workflow-variable-registry";

export function normalizeVariableContent(segments: WorkflowVariableContentSegment[] | undefined) {
  const normalized: WorkflowVariableContentSegment[] = [];

  for (const segment of segments ?? []) {
    if (segment.type === "variable") {
      normalized.push({ selector: [...segment.selector], type: "variable" });
      continue;
    }

    if (!segment.value) {
      continue;
    }

    const previous = normalized[normalized.length - 1];
    if (previous?.type === "text") {
      previous.value += segment.value;
    }
    else {
      normalized.push({ type: "text", value: segment.value });
    }
  }

  return normalized;
}

export function variableContentEqual(
  left: WorkflowVariableContentSegment[] | undefined,
  right: WorkflowVariableContentSegment[] | undefined,
) {
  return JSON.stringify(normalizeVariableContent(left)) === JSON.stringify(normalizeVariableContent(right));
}

export function getVariableContentText(
  segments: WorkflowVariableContentSegment[] | undefined,
  variables: WorkflowVariableDefinition[] = workflowContextVariables,
) {
  const variableBySelector = new Map(variables.map((variable) => [
    getWorkflowVariableSelectorKey(variable.selector),
    variable,
  ]));

  return normalizeVariableContent(segments).map((segment) => {
    if (segment.type === "text") {
      return segment.value;
    }

    const variable = variableBySelector.get(getWorkflowVariableSelectorKey(segment.selector));
    return `{${variable ? getWorkflowVariableDisplayLabel(variable) : segment.selector.join(".")}}`;
  }).join("");
}

export function getVariableContentPreview(
  segments: WorkflowVariableContentSegment[] | undefined,
  variables: WorkflowVariableDefinition[] = workflowContextVariables,
) {
  return getVariableContentText(segments, variables).trim();
}

export function truncateVariableContent(
  segments: WorkflowVariableContentSegment[] | undefined,
  variables: WorkflowVariableDefinition[],
  maxLength: number,
) {
  const normalized = normalizeVariableContent(segments);
  const variableBySelector = new Map(variables.map((variable) => [
    getWorkflowVariableSelectorKey(variable.selector),
    variable,
  ]));
  const truncated: WorkflowVariableContentSegment[] = [];
  let remaining = Math.max(0, maxLength);

  for (const segment of normalized) {
    if (remaining <= 0) break;

    if (segment.type === "text") {
      const value = segment.value.slice(0, remaining);
      if (value) truncated.push({ type: "text", value });
      remaining -= value.length;
      continue;
    }

    const variable = variableBySelector.get(getWorkflowVariableSelectorKey(segment.selector));
    const label = variable ? getWorkflowVariableDisplayLabel(variable) : segment.selector.join(".");
    const length = label.length + 2;
    if (length > remaining) break;
    truncated.push({ selector: [...segment.selector], type: "variable" });
    remaining -= length;
  }

  return normalizeVariableContent(truncated);
}
