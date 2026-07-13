import { Type, type Static } from "@sinclair/typebox";
import { WorkflowIdSchema } from "./dto.js";
import {
  WORKFLOW_ENTRY_WINDOW_MAX_DAYS,
  WORKFLOW_ENTRY_WINDOW_MAX_HOURS,
} from "./retention.js";

export const WorkflowEntryEventTypeSchema = Type.Union([
  Type.Literal("contact.friend_added"),
  Type.Literal("customer.tag_added"),
  Type.Literal("message.received"),
]);

export const WorkflowEntryPolicySchema = Type.Union([
  Type.Object({ mode: Type.Literal("never") }, { additionalProperties: false }),
  Type.Object({
    maxEntries: Type.Integer({ minimum: 1, maximum: 1_000 }),
    mode: Type.Literal("lifetime_limit"),
  }, { additionalProperties: false }),
  Type.Object({
    maxEntries: Type.Integer({ minimum: 1, maximum: 1_000 }),
    mode: Type.Literal("rolling_window"),
    windowSize: Type.Integer({ minimum: 1, maximum: WORKFLOW_ENTRY_WINDOW_MAX_HOURS }),
    windowUnit: Type.Literal("hour"),
  }, { additionalProperties: false }),
  Type.Object({
    maxEntries: Type.Integer({ minimum: 1, maximum: 1_000 }),
    mode: Type.Literal("rolling_window"),
    windowSize: Type.Integer({ minimum: 1, maximum: WORKFLOW_ENTRY_WINDOW_MAX_DAYS }),
    windowUnit: Type.Literal("day"),
  }, { additionalProperties: false }),
]);

export const WorkflowStartTriggerSchema = Type.Union([
  Type.Object({ type: Type.Literal("contact.friend_added") }, { additionalProperties: false }),
  Type.Object({
    tagIds: Type.Array(Type.String({ minLength: 1, maxLength: 128 }), {
      maxItems: 100,
      minItems: 1,
      uniqueItems: true,
    }),
    type: Type.Literal("customer.tag_added"),
  }, { additionalProperties: false }),
  Type.Object({
    match: Type.Literal("any"),
    type: Type.Literal("message.received"),
  }, { additionalProperties: false }),
  Type.Object({
    keywords: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), {
      maxItems: 100,
      minItems: 1,
      uniqueItems: true,
    }),
    match: Type.Literal("keywords"),
    type: Type.Literal("message.received"),
  }, { additionalProperties: false }),
]);

export const WorkflowStartConfigSchema = Type.Object({
  accountIds: Type.Array(Type.String({ minLength: 1, maxLength: 128 }), {
    maxItems: 100,
    minItems: 1,
    uniqueItems: true,
  }),
  entryPolicy: WorkflowEntryPolicySchema,
  triggers: Type.Array(WorkflowStartTriggerSchema, { maxItems: 100, minItems: 1 }),
}, { additionalProperties: false });

export const WorkflowWaitConfigSchema = Type.Object({
  duration: Type.Integer({ minimum: 1, maximum: 525_600 }),
  unit: Type.Union([
    Type.Literal("minute"),
    Type.Literal("hour"),
    Type.Literal("day"),
  ]),
}, { additionalProperties: false });

const WorkflowEntryCommandBaseSchema = Type.Object({
  accountId: Type.String({ minLength: 1, maxLength: 128 }),
  eventId: Type.String({ minLength: 1, maxLength: 128 }),
  occurredAt: Type.String({ minLength: 1, maxLength: 64 }),
  subjectId: Type.String({ minLength: 1, maxLength: 256 }),
  thirdUserId: Type.String({ minLength: 1, maxLength: 128 }),
  uid: WorkflowIdSchema,
});

export const WorkflowMessageTypeSchema = Type.Union([
  Type.Literal("text"),
  Type.Literal("image"),
  Type.Literal("voice"),
  Type.Literal("video"),
  Type.Literal("file"),
]);

export const WorkflowEntryCommandSchema = Type.Union([
  Type.Composite([
    WorkflowEntryCommandBaseSchema,
    Type.Object({
      eventType: Type.Literal("contact.friend_added"),
      triggerPayload: Type.Object({
        source: Type.Optional(Type.String({ maxLength: 128 })),
      }, { additionalProperties: false }),
    }),
  ]),
  Type.Composite([
    WorkflowEntryCommandBaseSchema,
    Type.Object({
      eventType: Type.Literal("customer.tag_added"),
      triggerPayload: Type.Object({
        tagId: Type.String({ minLength: 1, maxLength: 128 }),
      }, { additionalProperties: false }),
    }),
  ]),
  Type.Composite([
    WorkflowEntryCommandBaseSchema,
    Type.Object({
      eventType: Type.Literal("message.received"),
      triggerPayload: Type.Object({
        messageId: Type.String({ minLength: 1, maxLength: 128 }),
        messageType: WorkflowMessageTypeSchema,
        text: Type.Optional(Type.String({ maxLength: 20_000 })),
      }, { additionalProperties: false }),
    }),
  ]),
]);

export type WorkflowEntryCommand = Static<typeof WorkflowEntryCommandSchema>;
export type WorkflowEntryEventType = Static<typeof WorkflowEntryEventTypeSchema>;
export type WorkflowEntryPolicy = Static<typeof WorkflowEntryPolicySchema>;
export type WorkflowStartConfig = Static<typeof WorkflowStartConfigSchema>;
export type WorkflowStartTrigger = Static<typeof WorkflowStartTriggerSchema>;
export type WorkflowWaitConfig = Static<typeof WorkflowWaitConfigSchema>;
