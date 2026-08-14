import { Type, type Static } from "@sinclair/typebox";
import {
  WORKFLOW_ENTRY_MAX_ENTRIES,
  WORKFLOW_ENTRY_WINDOW_MAX_DAYS,
  WORKFLOW_ENTRY_WINDOW_MAX_HOURS,
} from "./retention.js";

export const WorkflowEntryEventTypeSchema = Type.Union([
  Type.Literal("contact.friend_added"),
  Type.Literal("contact.tag_added"),
  Type.Literal("message.received"),
]);

export const WorkflowEntryPolicySchema = Type.Union([
  Type.Object({ mode: Type.Literal("never") }, { additionalProperties: false }),
  Type.Object({
    maxEntries: Type.Integer({ minimum: 1, maximum: WORKFLOW_ENTRY_MAX_ENTRIES }),
    mode: Type.Literal("lifetime_limit"),
  }, { additionalProperties: false }),
  Type.Object({
    maxEntries: Type.Integer({ minimum: 1, maximum: WORKFLOW_ENTRY_MAX_ENTRIES }),
    mode: Type.Literal("rolling_window"),
    windowSize: Type.Integer({ minimum: 1, maximum: WORKFLOW_ENTRY_WINDOW_MAX_HOURS }),
    windowUnit: Type.Literal("hour"),
  }, { additionalProperties: false }),
  Type.Object({
    maxEntries: Type.Integer({ minimum: 1, maximum: WORKFLOW_ENTRY_MAX_ENTRIES }),
    mode: Type.Literal("rolling_window"),
    windowSize: Type.Integer({ minimum: 1, maximum: WORKFLOW_ENTRY_WINDOW_MAX_DAYS }),
    windowUnit: Type.Literal("day"),
  }, { additionalProperties: false }),
]);

const WorkflowTriggerStringSchema = Type.String({ maxLength: 128, minLength: 1 });

const WorkflowTriggerStringListSchema = Type.Array(
  WorkflowTriggerStringSchema,
  { maxItems: 100, uniqueItems: true },
);

const WorkflowRequiredTriggerStringListSchema = Type.Array(
  WorkflowTriggerStringSchema,
  { maxItems: 100, minItems: 1, uniqueItems: true },
);

const WorkflowContactFriendAddedTriggerSchema = Type.Object({
  sourceIds: WorkflowTriggerStringListSchema,
  type: Type.Literal("contact.friend_added"),
}, { additionalProperties: false });

const WorkflowContactTagAddedTriggerSchema = Type.Object({
  tagIds: Type.Array(Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }), {
    maxItems: 100,
    minItems: 1,
    uniqueItems: true,
  }),
  type: Type.Literal("contact.tag_added"),
}, { additionalProperties: false });

const WorkflowContactTagAddedDraftTriggerSchema = Type.Object({
  tagIds: Type.Array(Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }), {
    maxItems: 100,
    uniqueItems: true,
  }),
  type: Type.Literal("contact.tag_added"),
}, { additionalProperties: false });

const WorkflowMessageReceivedTriggerSchema = Type.Object({
  keywords: WorkflowRequiredTriggerStringListSchema,
  type: Type.Literal("message.received"),
}, { additionalProperties: false });

const WorkflowMessageReceivedDraftTriggerSchema = Type.Object({
  keywords: WorkflowTriggerStringListSchema,
  type: Type.Literal("message.received"),
}, { additionalProperties: false });

export const WorkflowStartTriggerSchema = Type.Union([
  WorkflowContactFriendAddedTriggerSchema,
  WorkflowContactTagAddedTriggerSchema,
  WorkflowMessageReceivedTriggerSchema,
]);

export const WorkflowChatAiStartTriggerSchema = Type.Union([
  WorkflowContactFriendAddedTriggerSchema,
  WorkflowContactTagAddedTriggerSchema,
  WorkflowMessageReceivedTriggerSchema,
]);

export const WorkflowWeComStartTriggerSchema = Type.Union([
  WorkflowContactFriendAddedTriggerSchema,
  WorkflowContactTagAddedTriggerSchema,
]);

const WorkflowChatAiStartDraftTriggerSchema = Type.Union([
  WorkflowContactFriendAddedTriggerSchema,
  WorkflowContactTagAddedDraftTriggerSchema,
  WorkflowMessageReceivedDraftTriggerSchema,
]);

const WorkflowWeComStartDraftTriggerSchema = Type.Union([
  WorkflowContactFriendAddedTriggerSchema,
  WorkflowContactTagAddedDraftTriggerSchema,
]);

export const WorkflowChatAiStartDraftConfigSchema = Type.Object({
  entryPolicy: WorkflowEntryPolicySchema,
  seatIds: Type.Array(Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }), {
    maxItems: 100,
    uniqueItems: true,
  }),
  triggers: Type.Array(WorkflowChatAiStartDraftTriggerSchema, { maxItems: 1 }),
}, { additionalProperties: false });

export const WorkflowWeComStartDraftConfigSchema = Type.Object({
  entryPolicy: WorkflowEntryPolicySchema,
  triggers: Type.Array(WorkflowWeComStartDraftTriggerSchema, { maxItems: 1 }),
  workUserIds: Type.Array(Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }), {
    maxItems: 100,
    uniqueItems: true,
  }),
}, { additionalProperties: false });

export const WorkflowStartDraftConfigSchema = Type.Union([
  WorkflowChatAiStartDraftConfigSchema,
  WorkflowWeComStartDraftConfigSchema,
]);

export const WorkflowChatAiStartConfigSchema = Type.Object({
  entryPolicy: WorkflowEntryPolicySchema,
  seatIds: Type.Array(Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }), {
    maxItems: 100,
    minItems: 1,
    uniqueItems: true,
  }),
  triggers: Type.Array(WorkflowChatAiStartTriggerSchema, { maxItems: 1, minItems: 1 }),
}, { additionalProperties: false });

export const WorkflowWeComStartConfigSchema = Type.Object({
  entryPolicy: WorkflowEntryPolicySchema,
  triggers: Type.Array(WorkflowWeComStartTriggerSchema, { maxItems: 1, minItems: 1 }),
  workUserIds: Type.Array(Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }), {
    maxItems: 100,
    minItems: 1,
    uniqueItems: true,
  }),
}, { additionalProperties: false });

export const WorkflowStartConfigSchema = Type.Union([
  WorkflowChatAiStartConfigSchema,
  WorkflowWeComStartConfigSchema,
]);

export const WorkflowTriggerBindingFilterSchema = Type.Union([
  Type.Object({
    entryPolicy: WorkflowEntryPolicySchema,
    eventType: Type.Literal("contact.friend_added"),
    sourceIds: WorkflowTriggerStringListSchema,
    workUserIds: Type.Array(Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }), {
      maxItems: 100,
      minItems: 1,
      uniqueItems: true,
    }),
  }, { additionalProperties: false }),
  Type.Object({
    entryPolicy: WorkflowEntryPolicySchema,
    eventType: Type.Literal("contact.tag_added"),
    tagIds: Type.Array(Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }), {
      maxItems: 100,
      minItems: 1,
      uniqueItems: true,
    }),
    workUserIds: Type.Array(Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }), {
      maxItems: 100,
      minItems: 1,
      uniqueItems: true,
    }),
  }, { additionalProperties: false }),
  Type.Object({
    entryPolicy: WorkflowEntryPolicySchema,
    eventType: Type.Literal("message.received"),
    keywords: WorkflowRequiredTriggerStringListSchema,
    seatIds: Type.Array(Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }), {
      maxItems: 100,
      minItems: 1,
      uniqueItems: true,
    }),
  }, { additionalProperties: false }),
]);

export const WORKFLOW_WAIT_DURATION_MAX_BY_UNIT = {
  day: 45,
  hour: 96,
  minute: 360,
} as const;
export const WORKFLOW_WAIT_DAY_OFFSET_MAX = 45;
export const WORKFLOW_WAIT_EVENT_COLLECT_WINDOW_SECONDS = 10;
export const WORKFLOW_WAIT_EVENT_TIMEOUT_MAX_BY_UNIT = {
  day: 15,
  hour: WORKFLOW_WAIT_DURATION_MAX_BY_UNIT.hour,
  minute: WORKFLOW_WAIT_DURATION_MAX_BY_UNIT.minute,
} as const;

export const WorkflowWaitConfigSchema = Type.Union([
  Type.Object({
    duration: Type.Integer({ minimum: 1, maximum: WORKFLOW_WAIT_DURATION_MAX_BY_UNIT.minute }),
    mode: Type.Literal("duration"),
    unit: Type.Literal("minute"),
  }, { additionalProperties: false }),
  Type.Object({
    duration: Type.Integer({ minimum: 1, maximum: WORKFLOW_WAIT_DURATION_MAX_BY_UNIT.hour }),
    mode: Type.Literal("duration"),
    unit: Type.Literal("hour"),
  }, { additionalProperties: false }),
  Type.Object({
    duration: Type.Integer({ minimum: 1, maximum: WORKFLOW_WAIT_DURATION_MAX_BY_UNIT.day }),
    mode: Type.Literal("duration"),
    unit: Type.Literal("day"),
  }, { additionalProperties: false }),
  Type.Object({
    dayOffset: Type.Integer({ minimum: 1, maximum: WORKFLOW_WAIT_DAY_OFFSET_MAX }),
    mode: Type.Literal("fixed-time"),
    time: Type.String({ pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" }),
  }, { additionalProperties: false }),
]);

const WorkflowWaitEventTimeoutSchema = Type.Union([
  Type.Object({
    duration: Type.Integer({
      minimum: 1,
      maximum: WORKFLOW_WAIT_EVENT_TIMEOUT_MAX_BY_UNIT.minute,
    }),
    unit: Type.Literal("minute"),
  }, { additionalProperties: false }),
  Type.Object({
    duration: Type.Integer({
      minimum: 1,
      maximum: WORKFLOW_WAIT_EVENT_TIMEOUT_MAX_BY_UNIT.hour,
    }),
    unit: Type.Literal("hour"),
  }, { additionalProperties: false }),
  Type.Object({
    duration: Type.Integer({
      minimum: 1,
      maximum: WORKFLOW_WAIT_EVENT_TIMEOUT_MAX_BY_UNIT.day,
    }),
    unit: Type.Literal("day"),
  }, { additionalProperties: false }),
]);

export const WorkflowWaitEventDraftConfigSchema = Type.Object({
  event: Type.Object({
    type: Type.Literal("message.received"),
  }, { additionalProperties: false }),
  timeout: WorkflowWaitEventTimeoutSchema,
}, { additionalProperties: false });

export const WorkflowWaitEventConfigSchema = Type.Object({
  event: Type.Object({
    capabilityKey: Type.Literal("event.message.received"),
    collectWindowSeconds: Type.Literal(WORKFLOW_WAIT_EVENT_COLLECT_WINDOW_SECONDS),
    contractVersion: Type.Literal(1),
    type: Type.Literal("message.received"),
  }, { additionalProperties: false }),
  timeout: WorkflowWaitEventTimeoutSchema,
}, { additionalProperties: false });

export type WorkflowEntryEventType = Static<typeof WorkflowEntryEventTypeSchema>;
export type WorkflowEntryPolicy = Static<typeof WorkflowEntryPolicySchema>;
export type WorkflowChatAiStartDraftConfig = Static<typeof WorkflowChatAiStartDraftConfigSchema>;
export type WorkflowChatAiStartConfig = Static<typeof WorkflowChatAiStartConfigSchema>;
export type WorkflowWeComStartDraftConfig = Static<typeof WorkflowWeComStartDraftConfigSchema>;
export type WorkflowWeComStartConfig = Static<typeof WorkflowWeComStartConfigSchema>;
export type WorkflowStartDraftConfig = Static<typeof WorkflowStartDraftConfigSchema>;
export type WorkflowStartConfig = Static<typeof WorkflowStartConfigSchema>;
export type WorkflowStartTrigger = Static<typeof WorkflowStartTriggerSchema>;
export type WorkflowChatAiStartTrigger = Static<typeof WorkflowChatAiStartTriggerSchema>;
export type WorkflowWeComStartTrigger = Static<typeof WorkflowWeComStartTriggerSchema>;
export type WorkflowTriggerBindingFilter = Static<typeof WorkflowTriggerBindingFilterSchema>;
export type WorkflowWaitConfig = Static<typeof WorkflowWaitConfigSchema>;
export type WorkflowWaitEventDraftConfig = Static<typeof WorkflowWaitEventDraftConfigSchema>;
export type WorkflowWaitEventConfig = Static<typeof WorkflowWaitEventConfigSchema>;
