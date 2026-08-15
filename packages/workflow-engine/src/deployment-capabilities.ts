import { createHash } from "node:crypto";
import type { WorkflowCapabilityRequirement } from "@chatai/contracts";
import {
  canonicalizeWorkflowCapabilityRequirements,
  getWorkflowCapabilityIdentity,
  WORKFLOW_ENTRY_EVENT_CAPABILITIES,
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
  WORKFLOW_ENTRY_EVENT_CAPABILITIES["contact.friend_added"],
  WORKFLOW_ENTRY_EVENT_CAPABILITIES["contact.tag_added"],
  WORKFLOW_ENTRY_EVENT_CAPABILITIES["message.received"],
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
