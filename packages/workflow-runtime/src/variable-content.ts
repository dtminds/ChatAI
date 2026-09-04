import type {
  WorkflowExecutionSpec,
  WorkflowVariableContentSegment,
  WorkflowVariableSelector,
} from "@chatai/contracts";
import { getWorkflowNodeOutputContracts } from "@chatai/contracts";
import type { WorkflowCapabilityCommandContext } from "./capability-port.js";
import {
  renderWorkflowMessageText,
  renderWorkflowMessagesText,
} from "./workflow-messages.js";
import { formatWorkflowDateTime } from "./workflow-date.js";

const BUILT_IN_DATETIME_SELECTORS = new Set([
  "trigger.occurredAt",
  "current-node-lifecycle.enteredAt",
  "current-node-lifecycle.exitedAt",
]);

export function getWorkflowDatetimeVariableSelectors(spec: WorkflowExecutionSpec) {
  const selectors = new Set(BUILT_IN_DATETIME_SELECTORS);
  for (const node of spec.nodes) {
    selectors.add(`node-lifecycle.${node.id}.enteredAt`);
    selectors.add(`node-lifecycle.${node.id}.exitedAt`);
    for (const output of getWorkflowNodeOutputContracts(node.kind, node.config) ?? []) {
      if (output.valueType.kind === "datetime") {
        selectors.add(`node.${node.id}.${output.key}`);
      }
    }
  }
  return selectors;
}

export function renderWorkflowVariableContent(
  segments: WorkflowVariableContentSegment[],
  context: WorkflowCapabilityCommandContext,
  invalid: (diagnosticMessage: string) => Error,
) {
  return segments.map(segment => {
    if (segment.type === "text") return segment.value;
    return stringifyWorkflowVariable(
      requireWorkflowVariableValue(segment.selector, context, invalid),
      segment.selector,
      context,
      invalid,
    );
  }).join("");
}

export function requireWorkflowVariableValue(
  selector: WorkflowVariableSelector,
  context: WorkflowCapabilityCommandContext,
  invalid: (diagnosticMessage: string) => Error,
) {
  const resolved = resolveWorkflowVariableSelector(selector, context);
  if (!resolved.available) {
    throw invalid(`Workflow node references unavailable data: ${selector.join(".")}`);
  }
  return resolved.value;
}

export function resolveWorkflowVariableSelector(
  selector: WorkflowVariableSelector,
  context: WorkflowCapabilityCommandContext,
) {
  const [scope, key, ...path] = selector;
  if (!scope || !key) return { available: false, value: undefined };
  if (scope === "subject" && key === "id" && path.length === 0) {
    return { available: true, value: context.subjectId };
  }
  if (scope === "subject" && key === "customFields" && path.length === 1) {
    return readPath(context.customFields, path);
  }
  if (scope === "trigger") return readPath(context.trigger, [key, ...path]);
  if (scope === "node") return readPath(context.outputs[key], path);
  if (scope === "node-lifecycle") return readPath(context.nodeLifecycle[key], path);
  if (scope === "current-node-lifecycle") {
    return readPath(context.currentNodeLifecycle, [key, ...path]);
  }
  return { available: false, value: undefined };
}

function readPath(value: unknown, path: readonly string[]) {
  if (value === undefined) return { available: false, value: undefined };
  let current: unknown = value;
  for (const part of path) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, part)) {
      return { available: false, value: undefined };
    }
    current = current[part];
  }
  return { available: true, value: current };
}

function stringifyWorkflowVariable(
  value: unknown,
  selector: WorkflowVariableSelector,
  context: WorkflowCapabilityCommandContext,
  invalid: (diagnosticMessage: string) => Error,
) {
  if (typeof value === "string") {
    const selectorKey = selector.join(".");
    return isBuiltInDatetimeSelector(selector, selectorKey)
      || context.datetimeVariableSelectors?.has(selectorKey)
      ? formatWorkflowDateTime(value)
      : value;
  }
  const message = renderWorkflowMessageText(value);
  if (message !== null) return message;
  const messages = renderWorkflowMessagesText(value);
  if (messages !== null) return messages;
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw invalid("Workflow variable cannot be serialized");
  }
  return serialized;
}

function isBuiltInDatetimeSelector(
  selector: WorkflowVariableSelector,
  selectorKey: string,
) {
  if (BUILT_IN_DATETIME_SELECTORS.has(selectorKey)) return true;
  return selector[0] === "node-lifecycle"
    && selector.length === 3
    && (selector[2] === "enteredAt" || selector[2] === "exitedAt");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
