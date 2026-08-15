import { createHash } from "node:crypto";
import type { WorkflowCapabilityRequirement } from "@chatai/contracts";
import {
  canonicalizeWorkflowCapabilityRequirements,
  getWorkflowCapabilityIdentity,
  KNOWN_WORKFLOW_CAPABILITIES,
  WORKFLOW_QUERY_CAPABILITIES,
} from "./capability-requirements.js";

export type WorkflowDeploymentCapabilities = {
  capabilities: WorkflowCapabilityRequirement[];
  fingerprint: string;
};

const KNOWN_CAPABILITY_IDENTITIES = new Set(
  KNOWN_WORKFLOW_CAPABILITIES.map(getWorkflowCapabilityIdentity),
);
export const WORKFLOW_BUILT_IN_CAPABILITIES = [
  WORKFLOW_QUERY_CAPABILITIES["message-query"],
] as const satisfies readonly WorkflowCapabilityRequirement[];
const CAPABILITY_TOKEN_PATTERN = /^((?:event|operation)\.[a-z0-9]+(?:[._-][a-z0-9]+)*)@([1-9][0-9]*)$/;

export class WorkflowDeploymentCapabilityConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowDeploymentCapabilityConfigError";
  }
}

export function parseWorkflowDeploymentCapabilities(
  raw: string | undefined,
): WorkflowDeploymentCapabilities {
  if (raw === undefined || raw.trim() === "") {
    return createWorkflowDeploymentCapabilities([]);
  }

  const requirements = raw.split(",").map((rawToken) => {
    const token = rawToken.trim();
    const match = CAPABILITY_TOKEN_PATTERN.exec(token);
    if (!match) {
      throw new WorkflowDeploymentCapabilityConfigError(
        `Invalid workflow deployment capability: ${token || "<empty>"}`,
      );
    }
    const capabilityKey = match[1]!;
    const rawContractVersion = match[2]!;
    const requirement = {
      capabilityKey,
      contractVersion: Number(rawContractVersion),
    } satisfies WorkflowCapabilityRequirement;
    if (!KNOWN_CAPABILITY_IDENTITIES.has(getWorkflowCapabilityIdentity(requirement))) {
      throw new WorkflowDeploymentCapabilityConfigError(
        `Unknown workflow deployment capability: ${token}`,
      );
    }
    return requirement;
  });

  const identities = requirements.map(getWorkflowCapabilityIdentity);
  if (new Set(identities).size !== identities.length) {
    throw new WorkflowDeploymentCapabilityConfigError(
      "Workflow deployment capabilities must not contain duplicates",
    );
  }

  return createWorkflowDeploymentCapabilities(requirements);
}

export function createWorkflowDeploymentCapabilities(
  requirements: readonly WorkflowCapabilityRequirement[],
): WorkflowDeploymentCapabilities {
  const capabilities = canonicalizeWorkflowCapabilityRequirements([
    ...WORKFLOW_BUILT_IN_CAPABILITIES,
    ...requirements,
  ]);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(capabilities))
    .digest("hex");
  return { capabilities, fingerprint };
}

export function hasWorkflowDeploymentCapability(
  deployment: WorkflowDeploymentCapabilities,
  requirement: WorkflowCapabilityRequirement,
) {
  const identity = getWorkflowCapabilityIdentity(requirement);
  return deployment.capabilities.some(
    (capability) => getWorkflowCapabilityIdentity(capability) === identity,
  );
}
