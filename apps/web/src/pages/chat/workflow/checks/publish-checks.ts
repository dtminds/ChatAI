import { useMemo } from "react";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowPublishCheck,
  WorkflowPublishCheckSummaryItem,
} from "../types";
import { buildWorkflowValidationSummary } from "../validation/workflow-validation-summary";
import type { WorkflowValidationPolicy } from "../validation/workflow-validation-summary";

export function useWorkflowPublishChecks(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  policy: WorkflowValidationPolicy,
) {
  const checklist = useMemo(
    () => buildPublishChecklist(nodes, edges, policy),
    [edges, nodes, policy],
  );
  const { canPublish, checks, readyChecks, summary, totalSummaryChecks } = checklist;

  return {
    checks,
    hasWarnings: checks.length > 0,
    publishReady: canPublish,
    readyChecks,
    summary,
    totalChecks: totalSummaryChecks,
    totalSummaryChecks,
  };
}

export function buildPublishChecklist(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  policy: WorkflowValidationPolicy,
): {
  checks: WorkflowPublishCheck[];
  canPublish: boolean;
  publishBlockers: WorkflowPublishCheck[];
  readyChecks: number;
  summary: WorkflowPublishCheckSummaryItem[];
  totalSummaryChecks: number;
} {
  return buildWorkflowValidationSummary(nodes, edges, policy);
}

export function buildPublishChecks(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  policy: WorkflowValidationPolicy,
): WorkflowPublishCheck[] {
  return buildPublishChecklist(nodes, edges, policy).checks;
}
