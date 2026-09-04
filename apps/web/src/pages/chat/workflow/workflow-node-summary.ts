import type { WorkflowVariableDefinition } from "./types";
import { getWorkflowVariableDisplaySourceLabel } from "./workflow-variable-selector";

export type WorkflowNodeSummarySegmentKind =
  | "operator"
  | "source"
  | "text"
  | "value"
  | "variable";

export type WorkflowNodeSummarySegmentTone = "default" | "muted" | "warning";

export type WorkflowNodeSummarySegment = {
  kind: WorkflowNodeSummarySegmentKind;
  text: string;
  tone?: WorkflowNodeSummarySegmentTone;
};

export function getWorkflowNodeSummaryText(segments: WorkflowNodeSummarySegment[]) {
  return segments.map((segment) => segment.text).join("");
}

export function createWorkflowReferenceSummarySegments({
  source,
  tone,
  variable,
}: {
  source?: string;
  tone?: WorkflowNodeSummarySegmentTone;
  variable: string;
}): WorkflowNodeSummarySegment[] {
  const toneAttributes = tone ? { tone } : {};
  return [
    ...(source
      ? [
          { kind: "source" as const, text: source, ...toneAttributes },
          { kind: "text" as const, text: ".", tone: tone ?? "muted" },
        ]
      : []),
    { kind: "variable", text: variable, ...toneAttributes },
  ];
}

export function createWorkflowVariableReferenceSummarySegments(
  variable: WorkflowVariableDefinition,
  tone?: WorkflowNodeSummarySegmentTone,
) {
  return createWorkflowReferenceSummarySegments({
    source: getWorkflowVariableDisplaySourceLabel(variable),
    tone,
    variable: variable.label,
  });
}
