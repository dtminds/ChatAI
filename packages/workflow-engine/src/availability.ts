import type {
  WorkflowExecutionSpec,
  WorkflowNodeKind,
  WorkflowSubjectType,
  WorkflowTypeEntitlementResult,
} from "@chatai/contracts";
import {
  WORKFLOW_EVENT_CATALOG,
  type WorkflowEventCatalog,
} from "./event-catalog.js";
import { isWorkflowRuntimeSupportedNodeKind } from "./runtime-support.js";

export type WorkflowProductionAvailabilityBlocker = {
  code:
    | "runtime-node-unsupported"
    | "event-type-unsupported"
    | "workflow-type-unentitled"
    | "business-resource-unavailable";
  dimension: "runtime" | "event" | "entitlement" | "resource";
  eventType?: string;
  nodeId?: string;
  nodeKind?: WorkflowNodeKind;
};

export type WorkflowResourceAvailabilityBlocker = {
  nodeId: string;
  nodeKind: WorkflowNodeKind;
};

export type WorkflowProductionAvailability = {
  available: boolean;
  blockers: WorkflowProductionAvailabilityBlocker[];
};

export function evaluateWorkflowProductionAvailability({
  entitlement,
  eventCatalog = WORKFLOW_EVENT_CATALOG,
  resourceBlockers = [],
  spec,
  subjectType,
}: {
  entitlement: WorkflowTypeEntitlementResult;
  eventCatalog?: WorkflowEventCatalog;
  resourceBlockers?: readonly WorkflowResourceAvailabilityBlocker[];
  spec: WorkflowExecutionSpec;
  subjectType: WorkflowSubjectType;
}): WorkflowProductionAvailability {
  const blockers: WorkflowProductionAvailabilityBlocker[] = [];

  for (const node of spec.nodes) {
    if (!isWorkflowRuntimeSupportedNodeKind(node.kind)) {
      blockers.push({
        code: "runtime-node-unsupported",
        dimension: "runtime",
        nodeId: node.id,
        nodeKind: node.kind,
      });
    }

    for (const eventType of getRequiredEventTypes(node)) {
      if (!eventCatalog.supports(eventType, subjectType)) {
        blockers.push({
          code: "event-type-unsupported",
          dimension: "event",
          eventType,
          nodeId: node.id,
          nodeKind: node.kind,
        });
      }
    }
  }

  if (!entitlement.entitled) {
    blockers.push({
      code: "workflow-type-unentitled",
      dimension: "entitlement",
    });
  }

  for (const blocker of resourceBlockers) {
    blockers.push({
      ...blocker,
      code: "business-resource-unavailable",
      dimension: "resource",
    });
  }

  const uniqueBlockers = deduplicateBlockers(blockers);
  return { available: uniqueBlockers.length === 0, blockers: uniqueBlockers };
}

function deduplicateBlockers(
  blockers: WorkflowProductionAvailabilityBlocker[],
) {
  return [...new Map(blockers.map((blocker) => [
    JSON.stringify(blocker),
    blocker,
  ])).values()];
}

function getRequiredEventTypes(
  node: WorkflowExecutionSpec["nodes"][number],
): string[] {
  if (node.kind === "start") {
    return Array.isArray(node.config.triggers)
      ? node.config.triggers.flatMap((trigger) =>
        isRecord(trigger) && typeof trigger.type === "string" ? [trigger.type] : [])
      : [];
  }
  if (node.kind === "wait-event" && isRecord(node.config.event)
    && typeof node.config.event.type === "string") {
    return [node.config.event.type];
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
