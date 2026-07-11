import type {
  WorkflowEntryCommand,
  WorkflowEntryEventType,
  WorkflowStartConfig,
  WorkflowStartTrigger,
} from "@chatai/contracts";

export type WorkflowTriggerBindingSpec = {
  eventType: WorkflowEntryEventType;
  filter: WorkflowStartConfig;
};

export function normalizeWorkflowStartConfig(config: WorkflowStartConfig): WorkflowStartConfig {
  return {
    accountIds: unique(config.accountIds.map(value => value.trim()).filter(Boolean)),
    entryPolicy: structuredClone(config.entryPolicy),
    triggers: config.triggers.map(normalizeTrigger),
  };
}

export function getWorkflowTriggerBindings(config: WorkflowStartConfig): WorkflowTriggerBindingSpec[] {
  const normalized = normalizeWorkflowStartConfig(config);
  const eventTypes = unique(normalized.triggers.map(trigger => trigger.type));
  return eventTypes.map(eventType => ({
    eventType,
    filter: {
      ...structuredClone(normalized),
      triggers: normalized.triggers.filter(trigger => trigger.type === eventType),
    },
  }));
}

export function matchWorkflowTrigger(
  config: WorkflowStartConfig,
  command: WorkflowEntryCommand,
) {
  const normalized = normalizeWorkflowStartConfig(config);
  if (!normalized.accountIds.includes(command.thirdUserId)) return false;
  return normalized.triggers.some(trigger => matchTrigger(trigger, command));
}

function normalizeTrigger(trigger: WorkflowStartTrigger): WorkflowStartTrigger {
  if (trigger.type === "customer.tag_added") {
    return { ...trigger, tagIds: unique(trigger.tagIds.map(value => value.trim()).filter(Boolean)) };
  }
  if (trigger.type === "message.received" && trigger.match === "keywords") {
    return { ...trigger, keywords: unique(trigger.keywords.map(value => value.trim()).filter(Boolean)) };
  }
  return structuredClone(trigger);
}

function matchTrigger(trigger: WorkflowStartTrigger, command: WorkflowEntryCommand) {
  if (trigger.type !== command.eventType) return false;
  if (trigger.type === "contact.friend_added") return true;
  if (trigger.type === "customer.tag_added" && command.eventType === "customer.tag_added") {
    return trigger.tagIds.includes(command.triggerPayload.tagId);
  }
  if (trigger.type !== "message.received" || command.eventType !== "message.received") return false;
  if (trigger.match === "any") return true;
  if (command.triggerPayload.messageType !== "text" || !command.triggerPayload.text) return false;
  const text = command.triggerPayload.text.toLocaleLowerCase("en-US");
  return trigger.keywords.some(keyword => text.includes(keyword.toLocaleLowerCase("en-US")));
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}
