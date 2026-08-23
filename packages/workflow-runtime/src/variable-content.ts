import type {
  WorkflowVariableContentSegment,
  WorkflowVariableSelector,
} from "@chatai/contracts";
import type { WorkflowCapabilityCommandContext } from "./capability-port.js";
import { renderWorkflowMessagesText } from "./workflow-messages.js";

export function renderWorkflowVariableContent(
  segments: WorkflowVariableContentSegment[],
  context: WorkflowCapabilityCommandContext,
  invalid: (diagnosticMessage: string) => Error,
) {
  return segments.map(segment => {
    if (segment.type === "text") return segment.value;
    return stringifyWorkflowVariable(
      requireWorkflowVariableValue(segment.selector, context, invalid),
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
  invalid: (diagnosticMessage: string) => Error,
) {
  if (typeof value === "string") return value;
  const messages = renderWorkflowMessagesText(value);
  if (messages !== null) return messages;
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw invalid("Workflow variable cannot be serialized");
  }
  return serialized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
