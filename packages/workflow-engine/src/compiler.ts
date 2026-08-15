import {
  getWorkflowContextVariableValueType,
  getWorkflowNodeOutputContracts,
  isWorkflowAiIntentExecutionConfigComplete,
  isWorkflowLlmExecutionConfigComplete,
  isWorkflowMessageQueryExecutionConfigComplete,
  isWorkflowOutputValueTypeEqual,
  normalizeWorkflowEntryPolicy,
  type WorkflowDraft,
  type WorkflowDynamicTimeReference,
  type WorkflowExecutionNode,
  type WorkflowExecutionSpec,
  type WorkflowNodeOutputUsage,
  type WorkflowOutputValueType,
  type WorkflowStartTrigger,
  type WorkflowType,
  type WorkflowVariableSelector,
} from "@chatai/contracts";
import {
  getWorkflowAggregateCapabilityRequirements,
  getWorkflowNodeCapabilityRequirements,
} from "./capability-requirements.js";
import { WorkflowCompilationError } from "./errors.js";
import {
  getWorkflowGuaranteedUpstreamNodeIds,
  getWorkflowSourceOutletId,
  isWorkflowOutputAvailableOnSourceOutlets,
  validateWorkflowGraph,
} from "./graph.js";
import {
  getWorkflowNodeExecutionConfigError,
  projectWorkflowNodeExecutionConfig,
} from "./node-contract-registry.js";
import { validateWorkflowTypePolicy } from "./type-policy.js";

export function compileWorkflowDraft({
  draft,
  revision,
  workflowId,
  workflowType,
}: {
  draft: WorkflowDraft;
  revision: number;
  workflowId: string;
  workflowType: WorkflowType;
}): WorkflowExecutionSpec {
  const normalizedDraft = normalizeWorkflowDraft(draft);
  const typePolicyIssues = validateWorkflowTypePolicy(workflowType, normalizedDraft);
  if (typePolicyIssues.length > 0) {
    throw new WorkflowCompilationError(typePolicyIssues.map((issue) => ({
      code: "type-policy-violation",
      message: `Workflow type policy rejected ${issue.code}`,
      nodeId: issue.nodeId,
    })));
  }
  const validation = validateWorkflowGraph(normalizedDraft);
  if (validation.issues.length > 0) {
    throw new WorkflowCompilationError(validation.issues);
  }

  const nodes = validation.topologicalNodeIds.map((nodeId) => {
    const node = normalizedDraft.nodes.find((item) => item.id === nodeId)!;
    const config = projectWorkflowNodeExecutionConfig({
      data: node.data,
      kind: node.data.kind,
      workflowType,
    });
    const executionConfigError = getWorkflowNodeExecutionConfigError(node.data.kind, config);
    if (executionConfigError) {
      throw new WorkflowCompilationError([{
        code: "invalid-node-config",
        message: executionConfigError,
        nodeId: node.id,
      }]);
    }
    return {
      config,
      id: node.id,
      kind: node.data.kind,
      nodeSchemaVersion: node.data.schemaVersion,
      requiredCapabilities: getWorkflowNodeCapabilityRequirements(node.data.kind, config),
    };
  });
  const referenceIssues = validateWorkflowNodeReferences(
    nodes,
    normalizedDraft.edges,
    workflowType,
  );
  if (referenceIssues.length > 0) {
    throw new WorkflowCompilationError(referenceIssues);
  }

  return {
    edges: normalizedDraft.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      sourceOutletId: getWorkflowSourceOutletId(edge),
      target: edge.target,
    })),
    entryNodeId: validation.entryNode.id,
    nodes,
    requiredCapabilities: getWorkflowAggregateCapabilityRequirements(nodes),
    revision,
    schemaVersion: 2,
    terminalNodeId: validation.terminalNode.id,
    workflowId,
  };
}

function validateWorkflowNodeReferences(
  nodes: WorkflowExecutionNode[],
  edges: WorkflowDraft["edges"],
  workflowType: WorkflowType,
) {
  const issues: Array<{
    code: "invalid-node-config";
    message: string;
    nodeId: string;
  }> = [];
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const nodeIds = nodes.map(node => node.id);
  const entryEventTypes = getWorkflowEntryEventTypes(nodes);

  for (const node of nodes) {
    if (node.kind === "llm" && isWorkflowLlmExecutionConfigComplete(node.config)) {
      const guaranteedUpstreamIds = getWorkflowGuaranteedUpstreamNodeIds(
        node.id,
        nodeIds,
        edges,
      );
      const valid = node.config.inputs.every(input =>
        input.value.kind === "literal"
        || validateWorkflowVariableSelector({
          edges,
          expectedValueType: input.value.valueType,
          guaranteedUpstreamIds,
          nodeById,
          selector: input.value.selector,
          targetNodeId: node.id,
          workflowType,
          entryEventTypes,
        }));
      if (!valid) {
        issues.push({
          code: "invalid-node-config",
          message: "LLM node references unavailable or changed input data",
          nodeId: node.id,
        });
      }
    }

    if (node.kind === "ai-intent"
      && isWorkflowAiIntentExecutionConfigComplete(node.config)
      && node.config.inputSelector) {
      const valid = validateWorkflowVariableSelector({
        edges,
        guaranteedUpstreamIds: getWorkflowGuaranteedUpstreamNodeIds(
          node.id,
          nodeIds,
          edges,
        ),
        nodeById,
        requiredUsage: "intent-input",
        selector: node.config.inputSelector,
        targetNodeId: node.id,
        workflowType,
        entryEventTypes,
      });
      if (!valid) {
        issues.push({
          code: "invalid-node-config",
          message: "AI Intent node references unavailable input data",
          nodeId: node.id,
        });
      }
    }

    if (node.kind === "message-query"
      && isWorkflowMessageQueryExecutionConfigComplete(node.config)
      && node.config.timeRange.mode === "dynamic") {
      const guaranteedUpstreamIds = getWorkflowGuaranteedUpstreamNodeIds(
        node.id,
        nodeIds,
        edges,
      );
      const valid = [node.config.timeRange.start, node.config.timeRange.end]
        .every(reference => validateWorkflowMessageQueryTimeReference({
          edges,
          guaranteedUpstreamIds,
          nodeById,
          reference,
          targetNodeId: node.id,
          workflowType,
          entryEventTypes,
        }));
      if (!valid) {
        issues.push({
          code: "invalid-node-config",
          message: "Message Query node references unavailable time data",
          nodeId: node.id,
        });
      }
    }
  }

  return issues;
}

function validateWorkflowMessageQueryTimeReference(input: {
  edges: WorkflowDraft["edges"];
  guaranteedUpstreamIds: Set<string>;
  nodeById: Map<string, WorkflowExecutionNode>;
  reference: WorkflowDynamicTimeReference;
  targetNodeId: string;
  workflowType: WorkflowType;
  entryEventTypes: readonly WorkflowStartTrigger["type"][];
}) {
  if (input.reference.kind === "workflow-trigger"
    || input.reference.kind === "current-node-lifecycle") {
    return true;
  }
  if (input.reference.kind === "node-lifecycle") {
    return input.guaranteedUpstreamIds.has(input.reference.nodeId);
  }
  return validateWorkflowVariableSelector({
    edges: input.edges,
    expectedValueType: { kind: "datetime" },
    guaranteedUpstreamIds: input.guaranteedUpstreamIds,
    nodeById: input.nodeById,
    requiredUsage: "time-reference",
    selector: input.reference.selector,
    targetNodeId: input.targetNodeId,
    workflowType: input.workflowType,
    entryEventTypes: input.entryEventTypes,
  });
}

function validateWorkflowVariableSelector(input: {
  edges: WorkflowDraft["edges"];
  expectedValueType?: WorkflowOutputValueType;
  guaranteedUpstreamIds: Set<string>;
  nodeById: Map<string, WorkflowExecutionNode>;
  requiredUsage?: WorkflowNodeOutputUsage;
  selector: WorkflowVariableSelector;
  targetNodeId: string;
  workflowType: WorkflowType;
  entryEventTypes: readonly WorkflowStartTrigger["type"][];
}) {
  const [scope, sourceId, outputKey, ...rest] = input.selector;
  if (scope === "subject" || scope === "trigger") {
    const valueType = getWorkflowContextVariableValueType(
      input.selector,
      input.workflowType,
      input.entryEventTypes,
    );
    return !input.requiredUsage
      && valueType !== null
      && (!input.expectedValueType
        || isWorkflowOutputValueTypeEqual(valueType, input.expectedValueType));
  }
  if (scope !== "node"
    || !sourceId
    || !outputKey
    || rest.length > 0
    || !input.guaranteedUpstreamIds.has(sourceId)) {
    return false;
  }

  const sourceNode = input.nodeById.get(sourceId);
  if (!sourceNode) return false;
  const output = getWorkflowNodeOutputContracts(sourceNode.kind, sourceNode.config)
    ?.find(candidate => candidate.key === outputKey);
  if (!output
    || input.requiredUsage && !output.usages.includes(input.requiredUsage)
    || input.expectedValueType
      && !isWorkflowOutputValueTypeEqual(output.valueType, input.expectedValueType)) {
    return false;
  }
  return !output.availableOnSourceOutlets
    || isWorkflowOutputAvailableOnSourceOutlets(
      sourceId,
      input.targetNodeId,
      output.availableOnSourceOutlets,
      input.edges,
    );
}

function getWorkflowEntryEventTypes(nodes: WorkflowExecutionNode[]) {
  const start = nodes.find(node => node.kind === "start");
  if (!start || !Array.isArray(start.config.triggers)) return [];
  return start.config.triggers.flatMap(trigger =>
    trigger && typeof trigger === "object" && "type" in trigger
      && (trigger.type === "contact.friend_added"
        || trigger.type === "contact.tag_added"
        || trigger.type === "message.received")
      ? [trigger.type]
      : []);
}

export function normalizeWorkflowDraft(draft: WorkflowDraft): WorkflowDraft {
  return {
    ...structuredClone(draft),
    nodes: draft.nodes.map((node) => {
      if (node.data.kind !== "start") return structuredClone(node);
      const data = node.data as typeof node.data & { entryPolicy?: unknown };
      return {
        ...structuredClone(node),
        data: {
          ...structuredClone(data),
          entryPolicy: normalizeWorkflowEntryPolicy(data.entryPolicy),
        },
      };
    }),
  } as WorkflowDraft;
}
