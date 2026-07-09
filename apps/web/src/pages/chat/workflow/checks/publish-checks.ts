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
  const { canPublish, canRun, checks, readyChecks, runBlockers, summary, totalSummaryChecks } = checklist;

  return {
    canRun,
    checks,
    hasWarnings: checks.length > 0,
    publishReady: canPublish,
    readyChecks,
    runBlockers,
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
  canRun: boolean;
  readyChecks: number;
  runBlockers: WorkflowPublishCheck[];
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
