import {
  isWorkflowBranchConfigComplete,
  normalizeWorkflowEntryPolicy,
  WORKFLOW_WAIT_EVENT_COLLECT_WINDOW_SECONDS,
  type WorkflowDraft,
  type WorkflowExecutionSpec,
  type WorkflowNodeKind,
  type WorkflowType,
} from "@chatai/contracts";
import {
  getWorkflowAggregateCapabilityRequirements,
  getWorkflowNodeCapabilityRequirements,
} from "./capability-requirements.js";
import { WorkflowCompilationError } from "./errors.js";
import { getWorkflowSourceOutletId, validateWorkflowGraph } from "./graph.js";
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
    const config = createExecutionConfig(node.data.kind, node.data);
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

function createExecutionConfig(kind: WorkflowNodeKind, data: Record<string, unknown>) {
  if (kind === "start") {
    return cloneJsonValue({
      accountIds: data.accountIds,
      entryPolicy: data.entryPolicy,
      triggers: data.triggers,
    }) as Record<string, unknown>;
  }
  if (kind === "wait") {
    return data.mode === "fixed-time"
      ? cloneJsonValue({ dayOffset: data.dayOffset, mode: data.mode, time: data.time }) as Record<string, unknown>
      : cloneJsonValue({ duration: data.duration, mode: data.mode, unit: data.unit }) as Record<string, unknown>;
  }
  if (kind === "wait-event") {
    return cloneJsonValue({
      event: {
        capabilityKey: "event.message.received",
        collectWindowSeconds: WORKFLOW_WAIT_EVENT_COLLECT_WINDOW_SECONDS,
        contractVersion: 1,
        type: "message.received",
      },
      timeout: data.timeout,
    }) as Record<string, unknown>;
  }
  if (kind === "branch") {
    const config = cloneJsonValue({ branchPaths: data.branchPaths }) as Record<string, unknown>;
    if (!isWorkflowBranchConfigComplete(config)) {
      throw new WorkflowCompilationError([{
        code: "invalid-node-config",
        message: "Branch node requires complete ordered paths and conditions",
      }]);
    }
    return config;
  }
  if (kind === "end") return {};
  return {};
}

function cloneJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneJsonValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) =>
        typeof item === "function" ? [] : [[key, cloneJsonValue(item)]]),
    );
  }
  return value;
}
