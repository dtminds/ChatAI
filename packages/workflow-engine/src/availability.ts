import type {
  WorkflowCapabilityRequirement,
  WorkflowExecutionSpec,
  WorkflowNodeKind,
  WorkflowTypeEntitlementResult,
} from "@chatai/contracts";
import type { WorkflowDeploymentCapabilities } from "./deployment-capabilities.js";
import { hasWorkflowDeploymentCapability } from "./deployment-capabilities.js";
import { getWorkflowCapabilityIdentity } from "./capability-requirements.js";
import { isWorkflowRuntimeSupportedNodeKind } from "./runtime-support.js";

export type WorkflowProductionAvailabilityBlocker = {
  capabilityKey?: string;
  code:
    | "runtime-node-unsupported"
    | "deployment-capability-disabled"
    | "workflow-type-unentitled"
    | "business-resource-unavailable";
  contractVersion?: number;
  dimension: "runtime" | "deployment" | "entitlement" | "resource";
  nodeId?: string;
  nodeKind?: WorkflowNodeKind;
};

export type WorkflowResourceAvailabilityBlocker = {
  capabilityKey?: string;
  nodeId: string;
  nodeKind: WorkflowNodeKind;
};

export type WorkflowProductionAvailability = {
  available: boolean;
  blockers: WorkflowProductionAvailabilityBlocker[];
};

export function evaluateWorkflowProductionAvailability({
  deployment,
  entitlement,
  resourceBlockers = [],
  spec,
}: {
  deployment: WorkflowDeploymentCapabilities;
  entitlement: WorkflowTypeEntitlementResult;
  resourceBlockers?: readonly WorkflowResourceAvailabilityBlocker[];
  spec: WorkflowExecutionSpec;
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

    for (const requirement of node.requiredCapabilities) {
      if (!hasWorkflowDeploymentCapability(deployment, requirement)) {
        blockers.push(createDeploymentBlocker(requirement, node.id, node.kind));
      }
    }
  }

  const nodeRequirementIdentities = new Set(
    spec.nodes.flatMap((node) => node.requiredCapabilities.map(getWorkflowCapabilityIdentity)),
  );
  for (const requirement of spec.requiredCapabilities) {
    if (!nodeRequirementIdentities.has(getWorkflowCapabilityIdentity(requirement))
      && !hasWorkflowDeploymentCapability(deployment, requirement)) {
      blockers.push(createDeploymentBlocker(requirement));
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

function createDeploymentBlocker(
  requirement: WorkflowCapabilityRequirement,
  nodeId?: string,
  nodeKind?: WorkflowNodeKind,
): WorkflowProductionAvailabilityBlocker {
  return {
    capabilityKey: requirement.capabilityKey,
    code: "deployment-capability-disabled",
    contractVersion: requirement.contractVersion,
    dimension: "deployment",
    ...(nodeId ? { nodeId } : {}),
    ...(nodeKind ? { nodeKind } : {}),
  };
}

function deduplicateBlockers(
  blockers: WorkflowProductionAvailabilityBlocker[],
) {
  return [...new Map(blockers.map((blocker) => [
    JSON.stringify(blocker),
    blocker,
  ])).values()];
}
