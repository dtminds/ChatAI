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
        triggers,
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
  return normalized.triggers.map(trigger => ({
    eventType: trigger.type,
    filter: createBindingFilter(normalized, trigger, options.resolvedWorkUserIds),
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
    if (typeof seatId !== "number" || !filter.seatIds.includes(seatId)) return false;
    if (filter.keywords.length === 0) return true;
    const text = projection.match.text;
    return typeof text === "string" && filter.keywords.some(keyword => text.includes(keyword));
  }
  const workUserId = projection.match.workUserId;
  if (typeof workUserId !== "number" || !filter.workUserIds.includes(workUserId)) return false;
  if (filter.eventType === "contact.friend_added") {
    if (filter.sourceIds.length === 0) return true;
    const sourceId = projection.match.sourceId;
    return typeof sourceId === "string" && filter.sourceIds.includes(sourceId);
  }
  const tagId = projection.match.tagId;
  return typeof tagId === "number" && filter.tagIds.includes(tagId);
}

function createBindingFilter(
  config: WorkflowStartConfig,
  trigger: WorkflowStartTrigger,
  resolvedWorkUserIds: number[] | undefined,
): WorkflowTriggerBindingFilter {
  if (trigger.type === "message.received") {
    if (!("seatIds" in config)) throw new Error("Message trigger requires ChatAI Start config");
    return {
      entryPolicy: structuredClone(config.entryPolicy),
      eventType: trigger.type,
      keywords: [...trigger.keywords],
      seatIds: [...config.seatIds],
    };
  }

  const workUserIds = "workUserIds" in config
    ? config.workUserIds
    : uniqueNumbers(resolvedWorkUserIds ?? []);
  if (workUserIds.length === 0) {
    throw new Error("Contact trigger requires resolved WeCom member identities");
  }
  if (trigger.type === "contact.friend_added") {
    return {
      entryPolicy: structuredClone(config.entryPolicy),
      eventType: trigger.type,
      sourceIds: [...trigger.sourceIds],
      workUserIds: [...workUserIds],
    };
  }

  return {
    entryPolicy: structuredClone(config.entryPolicy),
    eventType: trigger.type,
    tagIds: [...trigger.tagIds],
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
  return triggers.map((trigger) => {
    if (trigger.type === "contact.tag_added") {
      return { ...trigger, tagIds: uniqueNumbers(trigger.tagIds) };
    }
    if (trigger.type === "contact.friend_added") {
      return { ...trigger, sourceIds: uniqueStrings(trigger.sourceIds) };
    }
    return { ...trigger, keywords: uniqueStrings(trigger.keywords) };
  });
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function uniqueNumbers(values: number[]) {
  return unique(values.filter(value => Number.isSafeInteger(value) && value > 0));
}

function uniqueStrings(values: string[]) {
  return unique(values.map(value => value.trim()).filter(Boolean));
}
