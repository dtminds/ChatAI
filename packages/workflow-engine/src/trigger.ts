import type {
  WorkflowEntryEventType,
  WorkflowStartConfig,
  WorkflowStartTrigger,
  WorkflowSubjectType,
} from "@chatai/contracts";
import { normalizeWorkflowEntryPolicy } from "@chatai/contracts";
import type { WorkflowTriggerProjection } from "./event-catalog.js";

export type WorkflowTriggerBindingSpec = {
  eventType: WorkflowEntryEventType;
  filter: WorkflowStartConfig;
  subjectType: WorkflowSubjectType;
};

export function normalizeWorkflowStartConfig(config: WorkflowStartConfig): WorkflowStartConfig {
  return {
    accountIds: unique(config.accountIds.map(value => value.trim()).filter(Boolean)),
    entryPolicy: normalizeWorkflowEntryPolicy(config.entryPolicy),
    triggers: config.triggers.map(normalizeTrigger),
  };
}

export function getWorkflowTriggerBindings(
  config: WorkflowStartConfig,
  subjectType: WorkflowSubjectType,
): WorkflowTriggerBindingSpec[] {
  const normalized = normalizeWorkflowStartConfig(config);
  const eventTypes = unique(normalized.triggers.map(trigger => trigger.type));
  return eventTypes.map(eventType => ({
    eventType,
    filter: {
      ...structuredClone(normalized),
      triggers: normalized.triggers.filter(trigger => trigger.type === eventType),
    },
    subjectType,
  }));
}

export function matchWorkflowTrigger(
  config: WorkflowStartConfig,
  projection: WorkflowTriggerProjection,
) {
  const normalized = normalizeWorkflowStartConfig(config);
  const accountId = projection.match.accountId;
  if (typeof accountId !== "string" || !normalized.accountIds.includes(accountId)) return false;
  return normalized.triggers.some(trigger => matchTrigger(trigger, projection));
}

function normalizeTrigger(trigger: WorkflowStartTrigger): WorkflowStartTrigger {
  if (trigger.type === "contact.tag_added") {
    return { ...trigger, tagIds: unique(trigger.tagIds.map(value => value.trim()).filter(Boolean)) };
  }
  if (trigger.type === "message.received" && trigger.match === "keywords") {
    return { ...trigger, keywords: unique(trigger.keywords.map(value => value.trim()).filter(Boolean)) };
  }
  return structuredClone(trigger);
}

function matchTrigger(trigger: WorkflowStartTrigger, projection: WorkflowTriggerProjection) {
  if (trigger.type !== projection.eventType) return false;
  if (trigger.type === "contact.friend_added") return true;
  if (trigger.type === "contact.tag_added") {
    const tagId = projection.match.tagId;
    return typeof tagId === "string" && trigger.tagIds.includes(tagId);
  }
  if (trigger.match === "any") return true;
  if (projection.match.messageType !== "text" || typeof projection.match.text !== "string") {
    return false;
  }
  const text = projection.match.text.toLocaleLowerCase("en-US");
  return trigger.keywords.some(keyword => text.includes(keyword.toLocaleLowerCase("en-US")));
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}
