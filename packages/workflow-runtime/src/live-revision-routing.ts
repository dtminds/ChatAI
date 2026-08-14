import type {
  WorkflowExecutionNode,
  WorkflowExecutionSpec,
  WorkflowFlowChangedReason,
  WorkflowNodeKind,
  WorkflowVariableSelector,
} from "@chatai/contracts";

export type WorkflowForwardRouteResult =
  | { kind: "flow-changed"; reason: WorkflowFlowChangedReason }
  | { kind: "success"; target: WorkflowExecutionNode };

export function resolveWorkflowForwardRoute(input: {
  context: Record<string, unknown>;
  currentNodeId: string;
  currentNodeKind: WorkflowNodeKind;
  latestSpec: WorkflowExecutionSpec;
  sourceOutletId: string;
}) : WorkflowForwardRouteResult {
  const currentNode = input.latestSpec.nodes.find(node => node.id === input.currentNodeId);
  if (!currentNode) {
    return { kind: "flow-changed", reason: "flow_changed_current_node_deleted" };
  }
  if (currentNode.kind !== input.currentNodeKind) {
    return { kind: "flow-changed", reason: "flow_changed_node_kind_changed" };
  }
  const edge = input.latestSpec.edges.find(candidate =>
    candidate.source === currentNode.id
    && candidate.sourceOutletId === input.sourceOutletId,
  );
  if (!edge) return { kind: "flow-changed", reason: "flow_changed_outlet_deleted" };
  const target = input.latestSpec.nodes.find(node => node.id === edge.target);
  if (!target) return { kind: "flow-changed", reason: "flow_changed_outlet_deleted" };
  if (!getRequiredContextSelectors(target).every(selector =>
    isWorkflowSelectorAvailable(selector, input.context))) {
    return { kind: "flow-changed", reason: "flow_changed_context_incompatible" };
  }
  return { kind: "success", target };
}

export function isWorkflowSelectorAvailable(
  selector: readonly string[],
  context: Record<string, unknown>,
) {
  const [scope, key, ...path] = selector;
  if (!scope || !key) return false;
  if (scope === "subject") return key === "id" && path.length === 0;
  if (scope === "trigger") return readPath(context.trigger, [key, ...path]).available;
  if (scope === "node") {
    const outputs = isRecord(context.outputs) ? context.outputs : null;
    return outputs ? readPath(outputs[key], path).available : false;
  }
  if (scope === "node-lifecycle") {
    const lifecycle = isRecord(context.nodeLifecycle) ? context.nodeLifecycle : null;
    return lifecycle ? readPath(lifecycle[key], path).available : false;
  }
  return scope === "current-node-lifecycle" || scope === "input";
}

function getRequiredContextSelectors(node: WorkflowExecutionNode): WorkflowVariableSelector[] {
  const config = isRecord(node.config) ? node.config : {};
  if (node.kind === "message") {
    return config.contentMode === "node-output"
      ? selectorFrom(config.outputSelector)
      : selectorsFromSegments(config.content);
  }
  if (node.kind === "handoff") {
    return [config.customerMessage, config.operatorMessage].flatMap(selectorsFromSegments);
  }
  if (node.kind === "llm") {
    return readArray(config.inputs).flatMap(parameter => {
      const value = isRecord(parameter) && isRecord(parameter.value) ? parameter.value : null;
      return value?.kind === "variable" ? selectorFrom(value.selector) : [];
    });
  }
  if (node.kind === "ai-intent") return selectorFrom(config.inputSelector);
  if (node.kind === "message-query") return selectorsFromTimeRange(config.timeRange);
  return [];
}

function selectorsFromSegments(value: unknown) {
  return readArray(value).flatMap(segment => {
    const record = isRecord(segment) ? segment : null;
    return record?.type === "variable" ? selectorFrom(record.selector) : [];
  });
}

function selectorsFromTimeRange(value: unknown): WorkflowVariableSelector[] {
  if (!isRecord(value) || value.mode !== "dynamic") return [];
  return [value.start, value.end].flatMap(reference => {
    if (!isRecord(reference)) return [];
    if (reference.kind === "workflow-trigger") return [["trigger", "occurredAt"]];
    if (reference.kind === "current-node-lifecycle") {
      return [["current-node-lifecycle", String(reference.field ?? "enteredAt")]];
    }
    if (reference.kind === "node-lifecycle" && typeof reference.nodeId === "string") {
      return [["node-lifecycle", reference.nodeId, String(reference.field ?? "enteredAt")]];
    }
    return reference.kind === "node-output" ? selectorFrom(reference.selector) : [];
  });
}

function selectorFrom(value: unknown): WorkflowVariableSelector[] {
  return Array.isArray(value)
    && value.length >= 2
    && value.length <= 4
    && value.every(part => typeof part === "string" && part.length > 0)
    ? [value as WorkflowVariableSelector]
    : [];
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readPath(value: unknown, path: readonly string[]) {
  let current = value;
  for (const part of path) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, part)) {
      return { available: false, value: undefined };
    }
    current = current[part];
  }
  return { available: true, value: current };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
