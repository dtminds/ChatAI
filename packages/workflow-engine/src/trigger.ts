import type {
  WorkflowChatAiStartConfig,
  WorkflowEntryEventType,
  WorkflowStartConfig,
  WorkflowStartTrigger,
  WorkflowSubjectType,
  WorkflowTriggerBindingFilter,
  WorkflowWeComStartConfig,
} from "@chatai/contracts";
import { normalizeWorkflowEntryPolicy } from "@chatai/contracts";
import type { WorkflowTriggerProjection } from "./event-catalog.js";

export type WorkflowTriggerBindingSpec = {
  eventType: WorkflowEntryEventType;
  filter: WorkflowTriggerBindingFilter;
  subjectType: WorkflowSubjectType;
};

export function normalizeWorkflowStartConfig(config: WorkflowStartConfig): WorkflowStartConfig {
  const triggers = normalizeTriggers(config.triggers);
  return "seatIds" in config
    ? {
        entryPolicy: normalizeWorkflowEntryPolicy(config.entryPolicy),
        seatIds: uniqueNumbers(config.seatIds),
        triggers,
      } as WorkflowChatAiStartConfig
    : {
        entryPolicy: normalizeWorkflowEntryPolicy(config.entryPolicy),
        triggers: triggers.filter(trigger => trigger.type !== "message.received"),
        workUserIds: uniqueNumbers(config.workUserIds),
      } as WorkflowWeComStartConfig;
}

export function getWorkflowTriggerBindings(
  config: WorkflowStartConfig,
  subjectType: WorkflowSubjectType,
  options: { resolvedWorkUserIds?: number[] } = {},
): WorkflowTriggerBindingSpec[] {
  const normalized = normalizeWorkflowStartConfig(config);
  assertStartConfigMatchesSubjectType(normalized, subjectType);
  const eventTypes = unique(normalized.triggers.map(trigger => trigger.type));
  return eventTypes.map(eventType => ({
    eventType,
    filter: createBindingFilter(normalized, eventType, options.resolvedWorkUserIds),
    subjectType,
  }));
}

export function matchWorkflowTrigger(
  filter: WorkflowTriggerBindingFilter,
  projection: WorkflowTriggerProjection,
) {
  if (filter.eventType !== projection.eventType) return false;
  if (filter.eventType === "message.received") {
    const seatId = projection.match.seatId;
    return typeof seatId === "number" && filter.seatIds.includes(seatId);
  }
  const workUserId = projection.match.workUserId;
  if (typeof workUserId !== "number" || !filter.workUserIds.includes(workUserId)) return false;
  if (filter.eventType === "contact.friend_added") return true;
  const tagId = projection.match.tagId;
  return typeof tagId === "number" && filter.tagIds.includes(tagId);
}

function createBindingFilter(
  config: WorkflowStartConfig,
  eventType: WorkflowEntryEventType,
  resolvedWorkUserIds: number[] | undefined,
): WorkflowTriggerBindingFilter {
  if (eventType === "message.received") {
    if (!("seatIds" in config)) throw new Error("Message trigger requires ChatAI Start config");
    return {
      entryPolicy: structuredClone(config.entryPolicy),
      eventType,
      match: "any",
      seatIds: [...config.seatIds],
    };
  }

  const workUserIds = "workUserIds" in config
    ? config.workUserIds
    : uniqueNumbers(resolvedWorkUserIds ?? []);
  if (workUserIds.length === 0) {
    throw new Error("Contact trigger requires resolved WeCom member identities");
  }
  if (eventType === "contact.friend_added") {
    return {
      entryPolicy: structuredClone(config.entryPolicy),
      eventType,
      workUserIds: [...workUserIds],
    };
  }

  const tagIds = uniqueNumbers(config.triggers.flatMap(trigger =>
    trigger.type === "contact.tag_added" ? trigger.tagIds : []));
  return {
    entryPolicy: structuredClone(config.entryPolicy),
    eventType,
    tagIds,
    workUserIds: [...workUserIds],
  };
}

function assertStartConfigMatchesSubjectType(
  config: WorkflowStartConfig,
  subjectType: WorkflowSubjectType,
) {
  if (subjectType === "chatai_contact" && "seatIds" in config) return;
  if (subjectType === "wecom_contact" && "workUserIds" in config) return;
  throw new Error(`Start configuration does not match Workflow Subject Type: ${subjectType}`);
}

function normalizeTriggers(triggers: WorkflowStartTrigger[]): WorkflowStartTrigger[] {
  return triggers.map((trigger) => trigger.type === "contact.tag_added"
    ? { ...trigger, tagIds: uniqueNumbers(trigger.tagIds) }
    : structuredClone(trigger));
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function uniqueNumbers(values: number[]) {
  return unique(values.filter(value => Number.isSafeInteger(value) && value > 0));
}
