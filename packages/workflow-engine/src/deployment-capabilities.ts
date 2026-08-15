import { createHash } from "node:crypto";
import type { WorkflowCapabilityRequirement } from "@chatai/contracts";
import {
  canonicalizeWorkflowCapabilityRequirements,
  getWorkflowCapabilityIdentity,
  WORKFLOW_ENTRY_EVENT_CAPABILITIES,
  WORKFLOW_QUERY_CAPABILITIES,
} from "./capability-requirements.js";

export type WorkflowDeploymentCapabilities = {
  capabilities: WorkflowCapabilityRequirement[];
  fingerprint: string;
};

export function createWorkflowDeploymentCapabilities(
  requirements: readonly WorkflowCapabilityRequirement[],
): WorkflowDeploymentCapabilities {
  const capabilities = canonicalizeWorkflowCapabilityRequirements(requirements);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(capabilities))
    .digest("hex");
  return { capabilities, fingerprint };
}

export const WORKFLOW_PRODUCTION_CAPABILITIES = createWorkflowDeploymentCapabilities([
  ...Object.values(WORKFLOW_ENTRY_EVENT_CAPABILITIES),
  ...Object.values(WORKFLOW_QUERY_CAPABILITIES),
]);

export function hasWorkflowDeploymentCapability(
  deployment: WorkflowDeploymentCapabilities,
  requirement: WorkflowCapabilityRequirement,
) {
  const identity = getWorkflowCapabilityIdentity(requirement);
  return deployment.capabilities.some(
    (capability) => getWorkflowCapabilityIdentity(capability) === identity,
  );
}
