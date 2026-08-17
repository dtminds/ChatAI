import { Type, type Static } from "@sinclair/typebox";
import {
  QUICK_REPLY_ATTACHMENT_MAX_COUNT,
  QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH,
} from "../chat/quick-reply-content.js";
import { WorkflowChatAiAccountSelectionSchema } from "./chatai-action.js";
import { WorkflowUtcInstantSchema } from "./utc-instant.js";

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
  accountSelection: WorkflowChatAiAccountSelectionSchema,
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
  sentAt: WorkflowUtcInstantSchema,
}, { additionalProperties: false });

export type WorkflowMessageCommand = Static<typeof WorkflowMessageCommandSchema>;
export type WorkflowMessageResult = Static<typeof WorkflowMessageResultSchema>;
