import {
  getWorkflowNodeOutputContracts,
  type WorkflowExecutionNode,
  type WorkflowExecutionSpec,
  type WorkflowFlowChangedReason,
  type WorkflowNodeKind,
  type WorkflowVariableSelector,
} from "@chatai/contracts";
import {
  getWorkflowGuaranteedUpstreamNodeIds,
  isWorkflowOutputAvailableOnSourceOutlets,
} from "@chatai/workflow-engine";
import { hasWorkflowChatAiRunContext } from "./chatai-action-context.js";

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
  if ((target.kind === "message" || target.kind === "handoff")
    && (!isRecord(input.context.workflow)
      || !hasWorkflowChatAiRunContext(input.context.workflow))) {
    return { kind: "flow-changed", reason: "flow_changed_context_incompatible" };
  }
  if (!getRequiredContextSelectors(target, input.latestSpec).every(selector =>
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

function getRequiredContextSelectors(
  node: WorkflowExecutionNode,
  spec: WorkflowExecutionSpec,
): WorkflowVariableSelector[] {
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
  if (node.kind === "branch") return requiredBranchSelectors(node, spec);
  return [];
}

function requiredBranchSelectors(
  node: WorkflowExecutionNode,
  spec: WorkflowExecutionSpec,
): WorkflowVariableSelector[] {
  const config = isRecord(node.config) ? node.config : {};
  const selectors = readArray(config.branchPaths).flatMap(path => {
    if (!isRecord(path)) return [];
    return readArray(path.conditions).flatMap(condition =>
      isRecord(condition) ? selectorFrom(condition.selector) : []);
  });
  const guaranteedUpstreamIds = getWorkflowGuaranteedUpstreamNodeIds(
    node.id,
    spec.nodes.map(candidate => candidate.id),
    spec.edges,
  );
  const graphEdges = spec.edges.map(edge => ({
    source: edge.source,
    sourceHandle: edge.sourceOutletId,
    target: edge.target,
  }));

  return selectors.filter(selector => {
    const [scope, sourceId, outputKey, ...rest] = selector;
    if (scope === "subject") return sourceId === "id" && !outputKey;
    if (scope === "trigger") return true;
    if (scope === "current-node-lifecycle") {
      return !outputKey && (sourceId === "enteredAt" || sourceId === "exitedAt");
    }
    if (scope === "node-lifecycle") {
      return Boolean(sourceId
        && guaranteedUpstreamIds.has(sourceId)
        && rest.length === 0
        && (outputKey === "enteredAt" || outputKey === "exitedAt"));
    }
    if (scope !== "node"
      || !sourceId
      || !outputKey
      || rest.length > 0
      || !guaranteedUpstreamIds.has(sourceId)) return false;

    const sourceNode = spec.nodes.find(candidate => candidate.id === sourceId);
    const output = sourceNode
      ? getWorkflowNodeOutputContracts(sourceNode.kind, sourceNode.config)
        ?.find(candidate => candidate.key === outputKey)
      : null;
    return Boolean(output
      && output.usages.includes("variable")
      && (!output.availableOnSourceOutlets
        || isWorkflowOutputAvailableOnSourceOutlets(
          sourceId,
          node.id,
          output.availableOnSourceOutlets,
          graphEdges,
        )));
  });
}

function selectorsFromSegments(value: unknown) {
  return readArray(value).flatMap(segment => {
    const record = isRecord(segment) ? segment : null;
    return record?.type === "variable" ? selectorFrom(record.selector) : [];
  });
}

function selectorsFromTimeRange(value: unknown): WorkflowVariableSelector[] {
  if (!isRecord(value) || value.mode !== "dynamic") return [];
  return [value.start, value.end].flatMap(selectorFrom);
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
