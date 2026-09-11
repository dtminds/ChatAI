import type {
  AiUsageCapability,
  AiUsageEvent,
  AiUsageModel,
  WorkflowNodeKind,
} from "@chatai/contracts";
import { AiUsageModelSchema, AiUsageModelTokenSchema } from "@chatai/contracts";
import { createAiUsageEvent } from "@chatai/llm";
import { Value } from "@sinclair/typebox/value";
import type { WorkflowInferenceUsage } from "./inference-port.js";

export function isWorkflowInferenceUsage(value: unknown): value is WorkflowInferenceUsage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const usage = value as Partial<WorkflowInferenceUsage>;
  return Value.Check(AiUsageModelSchema, usage.billingModel)
    && Value.Check(AiUsageModelTokenSchema, usage.modelUsage);
}

export function createWorkflowNodeUsageEvent(input: {
  billingModel: AiUsageModel | null;
  executionId: string;
  nodeId: string;
  nodeKind: WorkflowNodeKind;
  occurredAt: Date;
  runId: string;
  uid: number;
  workflowId: string;
}): AiUsageEvent | null {
  const capability = workflowUsageCapability(input.nodeKind);
  if (!capability || !input.billingModel) return null;
  const stableKey = `workflow-node-execution:${input.executionId}`;
  return createAiUsageEvent({
    billingKey: stableKey,
    billingModel: input.billingModel,
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
