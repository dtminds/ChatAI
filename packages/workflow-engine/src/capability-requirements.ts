import type {
  WorkflowCapabilityRequirement,
  WorkflowEntryEventType,
  WorkflowExecutionNode,
  WorkflowNodeKind,
} from "@chatai/contracts";

export const WORKFLOW_ENTRY_EVENT_CAPABILITIES = {
  "contact.friend_added": {
    capabilityKey: "event.contact.friend_added",
    contractVersion: 1,
  },
  "contact.tag_added": {
    capabilityKey: "event.contact.tag_added",
    contractVersion: 1,
  },
  "message.received": {
    capabilityKey: "event.message.received",
    contractVersion: 1,
  },
} as const satisfies Record<WorkflowEntryEventType, WorkflowCapabilityRequirement>;

export const KNOWN_WORKFLOW_CAPABILITIES = canonicalizeWorkflowCapabilityRequirements(
  Object.values(WORKFLOW_ENTRY_EVENT_CAPABILITIES),
);

export function getWorkflowNodeCapabilityRequirements(
  kind: WorkflowNodeKind,
  config: Record<string, unknown>,
): WorkflowCapabilityRequirement[] {
  if (kind === "wait-event") {
    const event = config.event;
    if (!event || typeof event !== "object" || !("type" in event)) return [];
    return typeof event.type === "string" && event.type in WORKFLOW_ENTRY_EVENT_CAPABILITIES
      ? [WORKFLOW_ENTRY_EVENT_CAPABILITIES[event.type as WorkflowEntryEventType]]
      : [];
  }

  if (kind !== "start" || !Array.isArray(config.triggers)) return [];

  return canonicalizeWorkflowCapabilityRequirements(config.triggers.flatMap((trigger) => {
    if (!trigger || typeof trigger !== "object" || !("type" in trigger)) {
      return [];
    }
    const eventType = trigger.type;
    return typeof eventType === "string" && eventType in WORKFLOW_ENTRY_EVENT_CAPABILITIES
      ? [WORKFLOW_ENTRY_EVENT_CAPABILITIES[eventType as WorkflowEntryEventType]]
      : [];
  }));
}

export function getWorkflowAggregateCapabilityRequirements(
  nodes: readonly Pick<WorkflowExecutionNode, "requiredCapabilities">[],
): WorkflowCapabilityRequirement[] {
  return canonicalizeWorkflowCapabilityRequirements(
    nodes.flatMap((node) => node.requiredCapabilities),
  );
}

export function canonicalizeWorkflowCapabilityRequirements(
  requirements: readonly WorkflowCapabilityRequirement[],
): WorkflowCapabilityRequirement[] {
  const byIdentity = new Map<string, WorkflowCapabilityRequirement>();
  for (const requirement of requirements) {
    byIdentity.set(getWorkflowCapabilityIdentity(requirement), { ...requirement });
  }
  return [...byIdentity.values()].sort((left, right) =>
    getWorkflowCapabilityIdentity(left).localeCompare(getWorkflowCapabilityIdentity(right)),
  );
}

export function getWorkflowCapabilityIdentity(
  requirement: WorkflowCapabilityRequirement,
) {
  return `${requirement.capabilityKey}@${requirement.contractVersion}`;
}
