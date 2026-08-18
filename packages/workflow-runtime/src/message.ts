import {
  QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH,
  isWorkflowMessageExecutionConfigComplete,
  WorkflowMessageCommandSchema,
  WorkflowMessageResultSchema,
  type WorkflowMessageCommand,
  type WorkflowMessageExecutionConfig,
} from "@chatai/contracts";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import type {
  WorkflowCapabilityCommandContext,
  WorkflowCapabilityExecutionBinding,
} from "./capability-port.js";
import { readWorkflowChatAiAccountSelection } from "./chatai-action-context.js";
import {
  renderWorkflowVariableContent,
  requireWorkflowVariableValue,
} from "./variable-content.js";

export const WORKFLOW_MESSAGE_CAPABILITY_BINDING = {
  createCommand: createWorkflowMessageCommand,
  definition: {
    capabilityKey: "chatai.message.send",
    commandSchema: WorkflowMessageCommandSchema,
    contractVersion: 1,
    kind: "action",
    resultSchema: WorkflowMessageResultSchema,
  },
  nodeKind: "message",
} satisfies WorkflowCapabilityExecutionBinding<
  typeof WorkflowMessageCommandSchema,
  typeof WorkflowMessageResultSchema,
  "action"
>;

export function createWorkflowMessageCommand(input: {
  config: Record<string, unknown>;
  context: WorkflowCapabilityCommandContext;
}): WorkflowMessageCommand {
  if (!isWorkflowMessageExecutionConfigComplete(input.config)) {
    throw messageCommandError("Message execution config failed schema validation");
  }
  const config = input.config as WorkflowMessageExecutionConfig;
  const content = renderMessageContent(config, input.context);
  if (content.length > QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH) {
    throw messageCommandError("Rendered Message content exceeds the supported length");
  }
  if (!content.trim() && config.attachments.length === 0) {
    throw messageCommandError("Rendered Message command has no content or attachments");
  }
  const accountSelection = readWorkflowChatAiAccountSelection(input.context.workflow);
  if (accountSelection === null) {
    throw messageCommandError("Message account selection is unavailable in the Run context");
  }
  if (!input.context.subjectId.trim()) {
    throw messageCommandError("Message recipient is unavailable in the Run context");
  }
  return {
    accountSelection,
    attachments: config.attachments.map(attachment => ({
      content: structuredClone(attachment.content),
      materialCollectionId: attachment.materialCollectionId!,
      msgInfoId: attachment.msgInfoId!,
      ...(attachment.msgid ? { msgid: attachment.msgid } : {}),
      type: attachment.type,
    })),
    content: content.trim() ? content : "",
    recipient: {
      thirdExternalUserId: input.context.subjectId,
    },
    source: "workflow",
  };
}

function renderMessageContent(
  config: WorkflowMessageExecutionConfig,
  context: WorkflowCapabilityCommandContext,
) {
  if (config.contentMode === "node-output") {
    if (!config.outputSelector) {
      throw messageCommandError("Message node output selector is missing");
    }
    const value = requireWorkflowVariableValue(
      config.outputSelector,
      context,
      messageCommandError,
    );
    if (typeof value !== "string") {
      throw messageCommandError("Message node output did not resolve to text");
    }
    return value;
  }
  return renderWorkflowVariableContent(config.content, context, messageCommandError);
}

function messageCommandError(diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    "WORKFLOW_MESSAGE_COMMAND_INVALID",
    "执行所需数据不可用，流程已停止",
    { diagnosticMessage },
  );
}
