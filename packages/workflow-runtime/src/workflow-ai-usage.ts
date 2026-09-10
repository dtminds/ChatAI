import type {
  AiUsageCapability,
  AiUsageEvent,
  AiUsageModelToken,
  WorkflowNodeKind,
} from "@chatai/contracts";
import { AiUsageModelSchema, AiUsageModelTokenSchema } from "@chatai/contracts";
import { createAiUsageEvent } from "@chatai/llm";
import { Value } from "@sinclair/typebox/value";
import type { WorkflowInferenceUsage } from "./inference-port.js";

export const WORKFLOW_AI_COLLECT_MAX_INFERENCE_JOBS = 11;

export function isWorkflowInferenceUsage(value: unknown): value is WorkflowInferenceUsage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const usage = value as Partial<WorkflowInferenceUsage>;
  return Value.Check(AiUsageModelSchema, usage.billingModel)
    && Value.Check(AiUsageModelTokenSchema, usage.modelUsage);
}

export function createWorkflowNodeUsageEvent(input: {
  executionId: string;
  nodeId: string;
  nodeKind: WorkflowNodeKind;
  occurredAt: Date;
  runId: string;
  uid: number;
  usages: readonly WorkflowInferenceUsage[];
  workflowId: string;
}): AiUsageEvent | null {
  const capability = workflowUsageCapability(input.nodeKind);
  if (!capability || input.usages.length === 0) return null;
  const billingModel = input.usages[0]!.billingModel;
  if (input.usages.some(usage => !sameBillingModel(usage.billingModel, billingModel))) {
    throw new Error("Workflow node inference usages have inconsistent billing models");
  }
  const modelUsages = aggregateModelUsages(input.usages.map(usage => usage.modelUsage));
  const stableKey = `workflow-node-execution:${input.executionId}`;
  return createAiUsageEvent({
    billingKey: stableKey,
    billingModel,
    businessId: input.executionId,
    businessSnapshot: {
      nodeId: input.nodeId,
      nodeKind: input.nodeKind,
      runId: input.runId,
      workflowId: input.workflowId,
    },
    businessType: "workflow_node_execution",
    capability,
    eventKey: stableKey,
    modelUsages,
    occurredAt: input.occurredAt.toISOString(),
    uid: input.uid,
  });
}

function workflowUsageCapability(
  nodeKind: WorkflowNodeKind,
): Extract<AiUsageCapability, `workflow_${string}`> | null {
  if (nodeKind === "ai-intent") return "workflow_intent";
  if (nodeKind === "llm") return "workflow_llm";
  if (nodeKind === "ai-collect") return "workflow_ai_collect";
  return null;
}

function sameBillingModel(
  left: WorkflowInferenceUsage["billingModel"],
  right: WorkflowInferenceUsage["billingModel"],
) {
  return left.creditMultiplier === right.creditMultiplier
    && left.model === right.model
    && left.modelId === right.modelId;
}

function aggregateModelUsages(usages: readonly AiUsageModelToken[]): AiUsageModelToken[] {
  const aggregated = new Map<string, AiUsageModelToken>();
  for (const usage of usages) {
    const key = `${usage.provider}\u0000${usage.model}\u0000${usage.modelId ?? ""}`;
    const existing = aggregated.get(key);
    if (!existing) {
      aggregated.set(key, { ...usage });
      continue;
    }
    existing.inputTokens += usage.inputTokens;
    existing.outputTokens += usage.outputTokens;
    existing.requestCount += usage.requestCount;
  }
  return [...aggregated.values()];
}
