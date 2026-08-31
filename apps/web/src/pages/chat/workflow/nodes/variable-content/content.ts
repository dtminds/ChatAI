import { getWorkflowCustomFieldVariableId } from "@chatai/contracts";
import type { WorkflowVariableContentSegment, WorkflowVariableDefinition } from "../../types";
import {
  getWorkflowVariableDisplayLabel,
  getWorkflowVariableSelectorKey,
} from "../../workflow-variable-selector";
import { workflowContextVariables } from "../../workflow-variable-registry";
import {
  createWorkflowVariableReferenceSummarySegments,
  type WorkflowNodeSummarySegment,
} from "../../workflow-node-summary";

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
    return `{${variable
      ? getWorkflowVariableDisplayLabel(variable)
      : getUnavailableWorkflowVariableLabel(segment.selector)}}`;
  }).join("");
}

export function getVariableContentPreview(
  segments: WorkflowVariableContentSegment[] | undefined,
  variables: WorkflowVariableDefinition[] = workflowContextVariables,
) {
  return getVariableContentText(segments, variables).trim();
}

export function getVariableContentSummarySegments(
  segments: WorkflowVariableContentSegment[] | undefined,
  variables: WorkflowVariableDefinition[] = workflowContextVariables,
) {
  const variableBySelector = new Map(variables.map((variable) => [
    getWorkflowVariableSelectorKey(variable.selector),
    variable,
  ]));
  const summary = normalizeVariableContent(segments).flatMap<WorkflowNodeSummarySegment>((segment) => {
    if (segment.type === "text") {
      return [{ kind: "text", text: segment.value }];
    }

    const variable = variableBySelector.get(getWorkflowVariableSelectorKey(segment.selector));
    return variable
      ? createWorkflowVariableReferenceSummarySegments(variable)
      : [{
          kind: "variable",
          text: getUnavailableWorkflowVariableLabel(segment.selector),
          tone: "warning",
        }];
  });

  trimSummaryText(summary);
  return summary;
}

export function downgradeVariableContentSelector(
  segments: WorkflowVariableContentSegment[] | undefined,
  selector: string[],
  fallbackText: string,
) {
  const selectorKey = getWorkflowVariableSelectorKey(selector);

  return normalizeVariableContent((segments ?? []).map((segment) =>
    segment.type === "variable"
      && getWorkflowVariableSelectorKey(segment.selector) === selectorKey
      ? { type: "text" as const, value: fallbackText }
      : segment));
}

function trimSummaryText(summary: WorkflowNodeSummarySegment[]) {
  const first = summary[0];
  if (first?.kind === "text") first.text = first.text.trimStart();
  const last = summary[summary.length - 1];
  if (last?.kind === "text") last.text = last.text.trimEnd();
  while (summary[0]?.text === "") summary.shift();
  while (summary[summary.length - 1]?.text === "") summary.pop();
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
    const label = variable
      ? getWorkflowVariableDisplayLabel(variable)
      : getUnavailableWorkflowVariableLabel(segment.selector);
    const length = label.length + 2;
    if (length > remaining) break;
    truncated.push({ selector: [...segment.selector], type: "variable" });
    remaining -= length;
  }

  return normalizeVariableContent(truncated);
}

export function getUnavailableWorkflowVariableLabel(selector: readonly string[]) {
  return getWorkflowCustomFieldVariableId(selector) !== null
    ? "原变量不可用"
    : selector.join(".");
}
