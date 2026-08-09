import { useMemo } from "react";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowPublishCheck,
  WorkflowPublishCheckSummaryItem,
} from "../types";
import { buildWorkflowValidationSummary } from "../validation/workflow-validation-summary";

export function useWorkflowPublishChecks(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
) {
  const checklist = useMemo(() => buildPublishChecklist(nodes, edges), [edges, nodes]);
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
): {
  checks: WorkflowPublishCheck[];
  canPublish: boolean;
  publishBlockers: WorkflowPublishCheck[];
  readyChecks: number;
  summary: WorkflowPublishCheckSummaryItem[];
  totalSummaryChecks: number;
} {
  return buildWorkflowValidationSummary(nodes, edges);
}

export function buildPublishChecks(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowPublishCheck[] {
  return buildPublishChecklist(nodes, edges).checks;
}
