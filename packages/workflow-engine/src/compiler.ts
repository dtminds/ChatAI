import {
  isWorkflowNodeExecutionConfig,
  normalizeWorkflowEntryPolicy,
  type WorkflowDraft,
  type WorkflowExecutionSpec,
  type WorkflowType,
} from "@chatai/contracts";
import {
  getWorkflowAggregateCapabilityRequirements,
  getWorkflowNodeCapabilityRequirements,
} from "./capability-requirements.js";
import { WorkflowCompilationError } from "./errors.js";
import { getWorkflowSourceOutletId, validateWorkflowGraph } from "./graph.js";
import { projectWorkflowNodeExecutionConfig } from "./node-contract-registry.js";
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
    if (!isWorkflowNodeExecutionConfig(node.data.kind, config)) {
      throw new WorkflowCompilationError([{
        code: "invalid-node-config",
        message: `Node projection does not match its execution schema: ${node.data.kind}`,
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
