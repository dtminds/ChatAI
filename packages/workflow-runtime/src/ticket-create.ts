import {
  isWorkflowTicketCreateExecutionConfigComplete,
  WORKFLOW_TICKET_DESCRIPTION_MAX_LENGTH,
  WORKFLOW_TICKET_TITLE_MAX_LENGTH,
  WorkflowTicketCreateCommandSchema,
  WorkflowTicketCreateResultSchema,
  type WorkflowTicketCreateCommand,
  type WorkflowTicketCreateExecutionConfig,
} from "@chatai/contracts";
import type {
  WorkflowCapabilityCommandContext,
  WorkflowCapabilityExecutionBinding,
} from "./capability-port.js";
import { createCapabilityCommandError } from "./capability-command-error.js";
import { readWorkflowTriggerSeatId } from "./context-readers.js";
import { renderWorkflowVariableContent } from "./variable-content.js";

export const WORKFLOW_TICKET_CREATE_CAPABILITY_BINDING = {
  createCommand: createWorkflowTicketCreateCommand,
  definition: {
    capabilityKey: "chatai.ticket.create",
    commandSchema: WorkflowTicketCreateCommandSchema,
    contractVersion: 1,
    kind: "action",
    resultSchema: WorkflowTicketCreateResultSchema,
  },
  nodeKind: "ticket-create",
} satisfies WorkflowCapabilityExecutionBinding<
  typeof WorkflowTicketCreateCommandSchema,
  typeof WorkflowTicketCreateResultSchema,
  "action"
>;

export function createWorkflowTicketCreateCommand(input: {
  config: Record<string, unknown>;
  context: WorkflowCapabilityCommandContext;
}): WorkflowTicketCreateCommand {
  if (!isWorkflowTicketCreateExecutionConfigComplete(input.config)) {
    throw commandError("Ticket Create execution config failed schema validation");
  }
  const config = input.config as WorkflowTicketCreateExecutionConfig;
  const title = renderWorkflowVariableContent(config.ticketTitle, input.context, commandError).trim();
  const description = renderWorkflowVariableContent(
    config.description,
    input.context,
    commandError,
  ).trim();
  if (!title) throw commandError("Rendered Ticket Create title is empty");
  if (title.length > WORKFLOW_TICKET_TITLE_MAX_LENGTH) {
    throw commandError("Rendered Ticket Create title exceeds the supported length");
  }
  if (description.length > WORKFLOW_TICKET_DESCRIPTION_MAX_LENGTH) {
    throw commandError("Rendered Ticket Create description exceeds the supported length");
  }
  const seatId = readWorkflowTriggerSeatId(input.context.trigger);
  if (seatId === null) throw commandError("Ticket Create seat is unavailable in the Run context");
  const thirdExternalUserId = input.context.identities.thirdExternalUserId;
  if (!thirdExternalUserId) {
    throw commandError("Ticket Create recipient is unavailable in the Run context");
  }
  const anchorMessageId = readTriggerMessageId(input.context.trigger);
  return {
    ...(anchorMessageId === null ? {} : { anchorMessageId }),
    ...(description ? { description } : {}),
    priority: config.priority,
    recipient: { thirdExternalUserId },
    seatId,
    title,
  };
}

function readTriggerMessageId(trigger: Record<string, unknown>) {
  const projection = isRecord(trigger.projection) ? trigger.projection : null;
  const messageId = projection?.messageId;
  return typeof messageId === "number" && Number.isSafeInteger(messageId) && messageId > 0
    ? messageId
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const commandError = createCapabilityCommandError(
  "WORKFLOW_TICKET_CREATE_COMMAND_INVALID",
);
