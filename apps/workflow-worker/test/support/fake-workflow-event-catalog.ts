import { Type } from "@sinclair/typebox";
import { createWorkflowEventCatalog } from "@chatai/workflow-engine";

export function createFakeWorkflowEventCatalog() {
  return createWorkflowEventCatalog([
    {
      eventType: "contact.friend_added",
      payloadSchema: Type.Object({
        accountId: Type.String({ minLength: 1 }),
      }, { additionalProperties: false }),
      payloadVersion: 1,
      project: event => ({
        match: { accountId: event.payload.accountId },
        variables: {},
      }),
      subjectTypes: ["chatai_contact", "wecom_contact"],
    },
    {
      eventType: "contact.tag_added",
      payloadSchema: Type.Object({
        accountId: Type.String({ minLength: 1 }),
        tagId: Type.String({ minLength: 1 }),
      }, { additionalProperties: false }),
      payloadVersion: 1,
      project: event => ({
        match: {
          accountId: event.payload.accountId,
          tagId: event.payload.tagId,
        },
        variables: {},
      }),
      subjectTypes: ["chatai_contact", "wecom_contact"],
    },
    {
      eventType: "message.received",
      payloadSchema: Type.Object({
        accountId: Type.String({ minLength: 1 }),
        messageId: Type.Integer({ minimum: 1 }),
        messageType: Type.Union([Type.Literal("image"), Type.Literal("text")]),
        text: Type.Optional(Type.String()),
      }, { additionalProperties: false }),
      payloadVersion: 1,
      project: event => ({
        match: {
          accountId: event.payload.accountId,
          messageType: event.payload.messageType,
          ...(event.payload.text === undefined ? {} : { text: event.payload.text }),
        },
        variables: {
          messageId: event.payload.messageId,
          messageType: event.payload.messageType,
          ...(event.payload.text === undefined ? {} : { text: event.payload.text }),
        },
      }),
      subjectTypes: ["chatai_contact"],
    },
  ]);
}
