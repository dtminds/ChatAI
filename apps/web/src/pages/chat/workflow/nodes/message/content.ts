import type { WorkflowMessageContentSegment, WorkflowVariableDefinition } from "../../types";
import {
  getWorkflowVariableDisplayLabel,
  getWorkflowVariableSelectorKey,
} from "../../workflow-variable-selector";
import { workflowContextVariables } from "../../workflow-variable-registry";

export function normalizeMessageContent(segments: WorkflowMessageContentSegment[] | undefined) {
  const normalized: WorkflowMessageContentSegment[] = [];

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

export function messageContentEqual(
  left: WorkflowMessageContentSegment[] | undefined,
  right: WorkflowMessageContentSegment[] | undefined,
) {
  return JSON.stringify(normalizeMessageContent(left)) === JSON.stringify(normalizeMessageContent(right));
}

export function getMessageContentPreview(
  segments: WorkflowMessageContentSegment[] | undefined,
  variables: WorkflowVariableDefinition[] = workflowContextVariables,
) {
  const variableBySelector = new Map(variables.map((variable) => [
    getWorkflowVariableSelectorKey(variable.selector),
    variable,
  ]));

  return normalizeMessageContent(segments).map((segment) => {
    if (segment.type === "text") {
      return segment.value;
    }

    const variable = variableBySelector.get(getWorkflowVariableSelectorKey(segment.selector));
    return `{${variable ? getWorkflowVariableDisplayLabel(variable) : segment.selector.join(".")}}`;
  }).join("").trim();
}
