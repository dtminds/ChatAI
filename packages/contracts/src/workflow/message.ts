import { Type, type Static } from "@sinclair/typebox";
import {
  QUICK_REPLY_ATTACHMENT_MAX_COUNT,
  QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH,
} from "../chat/quick-reply-content.js";
import { WorkflowPushAccountStrategySchema } from "./trigger.js";

const WorkflowUtcTimestampSchema = Type.String({
  pattern: "^\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d{1,9})?Z$",
});

const WorkflowMessageCommandAttachmentSchema = Type.Object({
  content: Type.Record(Type.String(), Type.Unknown()),
  materialCollectionId: Type.String({ maxLength: 128, minLength: 1 }),
  msgInfoId: Type.String({ maxLength: 128, minLength: 1 }),
  msgid: Type.Optional(Type.String({ maxLength: 128 })),
  type: Type.Union([
    Type.Literal("image"),
    Type.Literal("file"),
    Type.Literal("h5"),
    Type.Literal("weapp"),
    Type.Literal("sphfeed"),
  ]),
}, { additionalProperties: false });

export const WorkflowMessageCommandSchema = Type.Object({
  accountSelection: Type.Object({
    seatIds: Type.Array(
      Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
      { maxItems: 100, minItems: 1, uniqueItems: true },
    ),
    strategy: WorkflowPushAccountStrategySchema,
  }, { additionalProperties: false }),
  attachments: Type.Array(WorkflowMessageCommandAttachmentSchema, {
    maxItems: QUICK_REPLY_ATTACHMENT_MAX_COUNT,
  }),
  content: Type.String({ maxLength: QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH }),
  recipient: Type.Object({
    thirdExternalUserId: Type.String({ maxLength: 128, minLength: 1 }),
  }, { additionalProperties: false }),
  source: Type.Literal("workflow"),
}, { additionalProperties: false });

export const WorkflowMessageResultSchema = Type.Object({
  sentAt: WorkflowUtcTimestampSchema,
}, { additionalProperties: false });

export type WorkflowMessageCommand = Static<typeof WorkflowMessageCommandSchema>;
export type WorkflowMessageResult = Static<typeof WorkflowMessageResultSchema>;
