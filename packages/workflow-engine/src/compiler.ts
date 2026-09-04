import {
  getWorkflowCustomFieldVariableIds,
  getWorkflowCustomFieldVariableId,
  getWorkflowCustomFieldVariableValueType,
  getWorkflowContextVariableValueType,
  getWorkflowNodeOutputContracts,
  isWorkflowAiCollectExecutionConfigComplete,
  isWorkflowAiIntentExecutionConfigComplete,
  isWorkflowBranchConfigComplete,
  isWorkflowCustomerUpdateExecutionConfigComplete,
  isWorkflowHandoffExecutionConfigComplete,
  isWorkflowLlmExecutionConfigComplete,
  isWorkflowMessageExecutionConfigComplete,
  isWorkflowMessageQueryExecutionConfigComplete,
  isWorkflowOrderQueryExecutionConfigComplete,
  isWorkflowOutputValueTypeEqual,
  normalizeWorkflowEntryPolicy,
  type WorkflowDraft,
  type CustomFieldItem,
  type WorkflowExecutionNode,
  type WorkflowExecutionSpec,
  type WorkflowNodeOutputUsage,
  type WorkflowOutputValueType,
  type WorkflowStartTrigger,
  type WorkflowType,
  type WorkflowVariableSelector,
} from "@chatai/contracts";
import { WorkflowCompilationError } from "./errors.js";
import {
  getWorkflowGuaranteedUpstreamNodeIds,
  getWorkflowSourceOutletId,
  isWorkflowDynamicTimeRangeProvablyInvalidInGraph,
  isWorkflowOutputAvailableOnSourceOutlets,
  validateWorkflowGraph,
} from "./graph.js";
import {
  getWorkflowNodeExecutionConfigError,
  projectWorkflowNodeExecutionConfig,
} from "./node-contract-registry.js";
import { validateWorkflowTypePolicy } from "./type-policy.js";

export function compileWorkflowDraft({
  customFields = [],
  draft,
  revision,
  workflowId,
  workflowType,
}: {
  customFields?: readonly CustomFieldItem[];
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
    };
  });
  const referenceIssues = validateWorkflowNodeReferences(
    nodes,
    normalizedDraft.edges,
    workflowType,
    customFields,
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
    revision,
    schemaVersion: 3,
    terminalNodeId: validation.terminalNode.id,
    workflowId,
  };
}

function validateWorkflowNodeReferences(
  nodes: WorkflowExecutionNode[],
  edges: WorkflowDraft["edges"],
  workflowType: WorkflowType,
  customFields: readonly CustomFieldItem[],
) {
  const issues: Array<{
    code: "invalid-node-config";
    message: string;
    nodeId: string;
  }> = [];
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const nodeIds = nodes.map(node => node.id);
  const entryEventTypes = getWorkflowEntryEventTypes(nodes);
  const customFieldById = new Map(customFields.map(field => [field.id, field]));

  for (const node of nodes) {
    const customFieldReferencesAvailable = getWorkflowCustomFieldVariableIds(node.config)
      .every((fieldId) => {
        const field = customFieldById.get(fieldId);
        return field !== undefined
          && getWorkflowCustomFieldVariableValueType(field.type) !== null;
      });
    if (!customFieldReferencesAvailable) {
      issues.push({
        code: "invalid-node-config",
        message: `${node.kind} node references unavailable customer custom fields`,
        nodeId: node.id,
      });
      continue;
    }

    if (node.kind === "branch" && isWorkflowBranchConfigComplete(node.config)) {
      const referencesMatchCurrentTypes = node.config.branchPaths.every(path =>
        path.conditions.every((condition) => {
          const fieldId = condition.selector
            ? getWorkflowCustomFieldVariableId(condition.selector)
            : null;
          if (fieldId === null) return true;
          const field = customFieldById.get(fieldId);
          const valueType = field
            ? getWorkflowCustomFieldVariableValueType(field.type)
            : null;
          return valueType?.kind === condition.valueType;
        }));
      if (!referencesMatchCurrentTypes) {
        issues.push({
          code: "invalid-node-config",
          message: "Branch node references changed customer custom field data",
          nodeId: node.id,
        });
      }
    }

    if (node.kind === "message" && isWorkflowMessageExecutionConfigComplete(node.config)) {
      const guaranteedUpstreamIds = getWorkflowGuaranteedUpstreamNodeIds(
        node.id,
        nodeIds,
        edges,
      );
      const selectors = node.config.contentMode === "node-output"
        ? node.config.outputSelector ? [node.config.outputSelector] : []
        : node.config.content.flatMap(segment =>
          segment.type === "variable" ? [segment.selector] : []);
      const referencesAvailable = selectors.every(selector =>
        validateWorkflowVariableSelector({
          allowedSourceKinds: node.config.contentMode === "node-output"
            ? ["node-output"]
            : undefined,
          edges,
          expectedValueType: node.config.contentMode === "node-output"
            ? { kind: "string" }
            : undefined,
          guaranteedUpstreamIds,
          customFieldById,
          nodeById,
          requiredUsage: node.config.contentMode === "node-output"
            ? "message-content"
            : "variable",
          selector,
          targetNodeId: node.id,
          workflowType,
          entryEventTypes,
        }));
      if (!referencesAvailable) {
        issues.push({
          code: "invalid-node-config",
          message: "Message node references unavailable content data",
          nodeId: node.id,
        });
      }
    }

    if (node.kind === "handoff" && isWorkflowHandoffExecutionConfigComplete(node.config)) {
      const guaranteedUpstreamIds = getWorkflowGuaranteedUpstreamNodeIds(
        node.id,
        nodeIds,
        edges,
      );
      const selectors = [node.config.operatorMessage, node.config.customerMessage]
        .flatMap(segments => segments.flatMap(segment =>
          segment.type === "variable" ? [segment.selector] : []));
      const referencesAvailable = selectors.every(selector =>
        validateWorkflowVariableSelector({
          edges,
          guaranteedUpstreamIds,
          customFieldById,
          nodeById,
          requiredUsage: "variable",
          selector,
          targetNodeId: node.id,
          workflowType,
          entryEventTypes,
        }));
      if (!referencesAvailable) {
        issues.push({
          code: "invalid-node-config",
          message: "Handoff node references unavailable message data",
          nodeId: node.id,
        });
      }
    }

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
          customFieldById,
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

    if (node.kind === "customer-update"
      && isWorkflowCustomerUpdateExecutionConfigComplete(node.config)) {
      const guaranteedUpstreamIds = getWorkflowGuaranteedUpstreamNodeIds(
        node.id,
        nodeIds,
        edges,
      );
      const valid = node.config.fields.every(field =>
        field.value.kind === "literal"
        || validateWorkflowVariableSelector({
          edges,
          expectedValueType: field.value.valueType,
          guaranteedUpstreamIds,
          customFieldById,
          nodeById,
          selector: field.value.selector,
          targetNodeId: node.id,
          workflowType,
          entryEventTypes,
        }));
      if (!valid) {
        issues.push({
          code: "invalid-node-config",
          message: "Customer Update node references unavailable or changed field data",
          nodeId: node.id,
        });
      }
    }

    if ((node.kind === "order-conversion"
      || node.kind === "order-bind"
      || node.kind === "order-query" && node.config.mode === "order-number")
      && Array.isArray(node.config.orderNumberSelector)) {
      const selectorInput = {
        customFieldById,
        edges,
        guaranteedUpstreamIds: getWorkflowGuaranteedUpstreamNodeIds(
          node.id,
          nodeIds,
          edges,
        ),
        nodeById,
        requiredUsage: "variable" as const,
        selector: node.config.orderNumberSelector as WorkflowVariableSelector,
        targetNodeId: node.id,
        workflowType,
        entryEventTypes,
      };
      const valid = validateWorkflowVariableSelector({
        ...selectorInput,
        expectedValueType: { kind: "string" },
      }) || validateWorkflowVariableSelector({
        ...selectorInput,
        expectedValueType: { kind: "number" },
      });
      if (!valid) {
        const label = node.kind === "order-conversion"
          ? "Order Conversion"
          : node.kind === "order-bind" ? "Order Bind" : "Order Query";
        issues.push({
          code: "invalid-node-config",
          message: `${label} node references unavailable or incompatible order number data`,
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
        customFieldById,
        nodeById,
        allowedSourceKinds: ["node-output"],
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

    if (node.kind === "ai-collect"
      && isWorkflowAiCollectExecutionConfigComplete(node.config)
      && node.config.inputSelector) {
      const valid = validateWorkflowVariableSelector({
        edges,
        guaranteedUpstreamIds: getWorkflowGuaranteedUpstreamNodeIds(
          node.id,
          nodeIds,
          edges,
        ),
        customFieldById,
        nodeById,
        allowedSourceKinds: ["node-output"],
        requiredUsage: "intent-input",
        selector: node.config.inputSelector,
        targetNodeId: node.id,
        workflowType,
        entryEventTypes,
      });
      if (!valid) {
        issues.push({
          code: "invalid-node-config",
          message: "AI Collect node references unavailable input data",
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
      const referencesAvailable = [node.config.timeRange.start, node.config.timeRange.end]
        .every(selector => validateWorkflowVariableSelector({
          allowedSourceKinds: [
            "context",
            "current-node-lifecycle",
            "node-lifecycle",
            "node-output",
          ],
          edges,
          expectedValueType: { kind: "datetime" },
          guaranteedUpstreamIds,
          customFieldById,
          nodeById,
          requiredUsage: "time-reference",
          selector,
          targetNodeId: node.id,
          workflowType,
          entryEventTypes,
        }));
      const rangeInvalid = isWorkflowDynamicTimeRangeProvablyInvalidInGraph({
        edges,
        end: node.config.timeRange.end,
        nodeIds,
        start: node.config.timeRange.start,
      });
      if (!referencesAvailable || rangeInvalid) {
        issues.push({
          code: "invalid-node-config",
          message: rangeInvalid
            ? "Message Query node time range is causally reversed"
            : "Message Query node references unavailable time data",
          nodeId: node.id,
        });
      }
    }

    if (node.kind === "order-query"
      && isWorkflowOrderQueryExecutionConfigComplete(node.config)
      && node.config.mode === "conditions"
      && node.config.conditions.timeRange.mode === "dynamic") {
      const guaranteedUpstreamIds = getWorkflowGuaranteedUpstreamNodeIds(
        node.id,
        nodeIds,
        edges,
      );
      const { timeRange } = node.config.conditions;
      const referencesAvailable = [timeRange.start, timeRange.end]
        .every(selector => validateWorkflowVariableSelector({
          allowedSourceKinds: [
            "context",
            "current-node-lifecycle",
            "node-lifecycle",
            "node-output",
          ],
          edges,
          expectedValueType: { kind: "datetime" },
          guaranteedUpstreamIds,
          customFieldById,
          nodeById,
          requiredUsage: "time-reference",
          selector,
          targetNodeId: node.id,
          workflowType,
          entryEventTypes,
        }));
      const rangeInvalid = isWorkflowDynamicTimeRangeProvablyInvalidInGraph({
        edges,
        end: timeRange.end,
        nodeIds,
        start: timeRange.start,
      });
      if (!referencesAvailable || rangeInvalid) {
        issues.push({
          code: "invalid-node-config",
          message: rangeInvalid
            ? "Order Query node time range is causally reversed"
            : "Order Query node references unavailable time data",
          nodeId: node.id,
        });
      }
    }
  }

  return issues;
}

function validateWorkflowVariableSelector(input: {
  allowedSourceKinds?: readonly WorkflowVariableSourceKind[];
  edges: WorkflowDraft["edges"];
  expectedValueType?: WorkflowOutputValueType;
  guaranteedUpstreamIds: Set<string>;
  customFieldById: ReadonlyMap<number, CustomFieldItem>;
  nodeById: Map<string, WorkflowExecutionNode>;
  requiredUsage?: WorkflowNodeOutputUsage;
  selector: WorkflowVariableSelector;
  targetNodeId: string;
  workflowType: WorkflowType;
  entryEventTypes: readonly WorkflowStartTrigger["type"][];
}) {
  const [scope, sourceId, outputKey, ...rest] = input.selector;
  if (scope === "subject" || scope === "trigger") {
    if (!allowsVariableSource(input.allowedSourceKinds, "context")) return false;
    const customFieldId = getWorkflowCustomFieldVariableId(input.selector);
    if (customFieldId !== null) {
      if (input.requiredUsage && input.requiredUsage !== "variable"
        && input.requiredUsage !== "message-content") return false;
      const customField = input.customFieldById.get(customFieldId);
      const valueType = customField
        ? getWorkflowCustomFieldVariableValueType(customField.type)
        : null;
      if (!valueType) return false;
      return !input.expectedValueType
        || isWorkflowOutputValueTypeEqual(valueType, input.expectedValueType);
    }
    const valueType = getWorkflowContextVariableValueType(
      input.selector,
      input.workflowType,
      input.entryEventTypes,
    );
    return valueType !== null
      && (!input.expectedValueType
        || isWorkflowOutputValueTypeEqual(valueType, input.expectedValueType));
  }
  if (scope === "current-node-lifecycle") {
    return allowsVariableSource(input.allowedSourceKinds, "current-node-lifecycle")
      && sourceId === "enteredAt"
      && outputKey === undefined
      && rest.length === 0
      && (!input.expectedValueType
        || isWorkflowOutputValueTypeEqual({ kind: "datetime" }, input.expectedValueType));
  }
  if (scope === "node-lifecycle") {
    return allowsVariableSource(input.allowedSourceKinds, "node-lifecycle")
      && sourceId !== undefined
      && (outputKey === "enteredAt" || outputKey === "exitedAt")
      && rest.length === 0
      && input.guaranteedUpstreamIds.has(sourceId)
      && (!input.expectedValueType
        || isWorkflowOutputValueTypeEqual({ kind: "datetime" }, input.expectedValueType));
  }
  if (scope !== "node"
    || !allowsVariableSource(input.allowedSourceKinds, "node-output")
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

type WorkflowVariableSourceKind =
  | "context"
  | "current-node-lifecycle"
  | "node-lifecycle"
  | "node-output";

function allowsVariableSource(
  allowedSourceKinds: readonly WorkflowVariableSourceKind[] | undefined,
  sourceKind: WorkflowVariableSourceKind,
) {
  return !allowedSourceKinds || allowedSourceKinds.includes(sourceKind);
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
  const normalized = structuredClone(draft);
  for (const node of normalized.nodes) {
    if (node.data.kind !== "start") continue;
    const data = node.data as Record<string, unknown>;
    data.entryPolicy = normalizeWorkflowEntryPolicy(data.entryPolicy);
    if (Array.isArray(data.workUserIds)) {
      delete data.messageSendingWindow;
      delete data.seatIds;
    } else if (Array.isArray(data.seatIds)) {
      delete data.workUserIds;
    }
  }
  return normalized;
}
