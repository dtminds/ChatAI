import { Type, type Static } from "@sinclair/typebox";
import { TicketPrioritySchema } from "../tickets/dto.js";

export const WORKFLOW_TICKET_TITLE_MAX_LENGTH = 120;
export const WORKFLOW_TICKET_DESCRIPTION_MAX_LENGTH = 2_000;

export const WorkflowTicketCreateCommandSchema = Type.Object({
  anchorMessageId: Type.Optional(Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 })),
  description: Type.Optional(Type.String({ maxLength: WORKFLOW_TICKET_DESCRIPTION_MAX_LENGTH })),
  priority: TicketPrioritySchema,
  recipient: Type.Object({
    thirdExternalUserId: Type.String({ maxLength: 128, minLength: 1 }),
  }, { additionalProperties: false }),
  seatId: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
  title: Type.String({ maxLength: WORKFLOW_TICKET_TITLE_MAX_LENGTH, minLength: 1 }),
}, { additionalProperties: false });

export const WorkflowTicketCreateResultSchema = Type.Object({}, { additionalProperties: false });

export type WorkflowTicketCreateCommand = Static<typeof WorkflowTicketCreateCommandSchema>;
export type WorkflowTicketCreateResult = Static<typeof WorkflowTicketCreateResultSchema>;
