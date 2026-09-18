import {
  getWorkflowCapabilityProfile,
  type WorkflowDraft,
  type WorkflowNodeKind,
  type WorkflowType,
} from "@chatai/contracts";

export type WorkflowTypePolicyIssue = {
  code:
    | "workflow-type-unavailable"
    | "node-kind-not-allowed"
    | "entry-event-not-allowed"
    | "start-source-not-allowed";
  eventType?: string;
  nodeId?: string;
  nodeKind?: WorkflowNodeKind;
};

export function validateWorkflowTypePolicy(
  workflowType: WorkflowType,
  draft: WorkflowDraft,
): WorkflowTypePolicyIssue[] {
  const profile = getWorkflowCapabilityProfile(workflowType);
  if (profile.availability !== "enabled") {
    return [{ code: "workflow-type-unavailable" }];
  }

  const allowedNodeKinds = new Set<WorkflowNodeKind>(profile.allowedNodeKinds);
  const allowedEntryEventTypes = new Set<string>(profile.allowedEntryEventTypes);
  const issues: WorkflowTypePolicyIssue[] = [];

  for (const node of draft.nodes) {
    if (!allowedNodeKinds.has(node.data.kind)) {
      issues.push({
        code: "node-kind-not-allowed",
        nodeId: node.id,
        nodeKind: node.data.kind,
      });
      continue;
    }
    if (node.data.kind !== "start") continue;

    const sourceMatchesType = workflowType === "chatai_sop"
      ? Array.isArray((node.data as Record<string, unknown>).seatIds)
        && !("workUserIds" in node.data)
      : workflowType === "wecom_sop"
        ? Array.isArray((node.data as Record<string, unknown>).workUserIds)
          && !("seatIds" in node.data)
        : false;
    if (!sourceMatchesType) {
      issues.push({
        code: "start-source-not-allowed",
        nodeId: node.id,
        nodeKind: node.data.kind,
      });
    }

    const triggers = (node.data as Record<string, unknown>).triggers;
    if (!Array.isArray(triggers)) continue;
    for (const trigger of triggers) {
      if (!trigger || typeof trigger !== "object" || !("type" in trigger)
        || typeof trigger.type !== "string") {
        continue;
      }
      if (!allowedEntryEventTypes.has(trigger.type)) {
        issues.push({
          code: "entry-event-not-allowed",
          eventType: trigger.type,
          nodeId: node.id,
          nodeKind: node.data.kind,
        });
      }
    }
  }

  return issues;
}
