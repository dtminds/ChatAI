import {
  isWorkflowHandoffExecutionConfigComplete,
  WORKFLOW_HANDOFF_MESSAGE_MAX_LENGTH,
  WorkflowHandoffCommandSchema,
  WorkflowHandoffResultSchema,
  type WorkflowHandoffCommand,
  type WorkflowHandoffExecutionConfig,
} from "@chatai/contracts";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import type {
  WorkflowCapabilityCommandContext,
  WorkflowCapabilityExecutionBinding,
} from "./capability-port.js";
import { readWorkflowChatAiAccountSelection } from "./chatai-action-context.js";
import { renderWorkflowVariableContent } from "./variable-content.js";

export const WORKFLOW_HANDOFF_CAPABILITY_BINDING = {
  createCommand: createWorkflowHandoffCommand,
  definition: {
    capabilityKey: "chatai.conversation.handoff",
    commandSchema: WorkflowHandoffCommandSchema,
    contractVersion: 1,
    kind: "action",
    resultSchema: WorkflowHandoffResultSchema,
  },
  nodeKind: "handoff",
} satisfies WorkflowCapabilityExecutionBinding<
  typeof WorkflowHandoffCommandSchema,
  typeof WorkflowHandoffResultSchema,
  "action"
>;

export function createWorkflowHandoffCommand(input: {
  config: Record<string, unknown>;
  context: WorkflowCapabilityCommandContext;
}): WorkflowHandoffCommand {
  if (!isWorkflowHandoffExecutionConfigComplete(input.config)) {
    throw handoffCommandError("Handoff execution config failed schema validation");
  }
  const config = input.config as WorkflowHandoffExecutionConfig;
  const operatorMessage = renderWorkflowVariableContent(
    config.operatorMessage,
    input.context,
    handoffCommandError,
  );
  const customerMessage = renderWorkflowVariableContent(
    config.customerMessage,
    input.context,
    handoffCommandError,
  );
  if (!operatorMessage.trim()) {
    throw handoffCommandError("Rendered Handoff operator message is empty");
  }
  if (operatorMessage.length > WORKFLOW_HANDOFF_MESSAGE_MAX_LENGTH) {
    throw handoffCommandError("Rendered Handoff operator message exceeds the supported length");
  }
  if (customerMessage.length > WORKFLOW_HANDOFF_MESSAGE_MAX_LENGTH) {
    throw handoffCommandError("Rendered Handoff customer message exceeds the supported length");
  }
  const accountSelection = readWorkflowChatAiAccountSelection(input.context.workflow);
  if (accountSelection === null) {
    throw handoffCommandError("Handoff account selection is unavailable in the Run context");
  }
  const thirdExternalUserId = input.context.identities.thirdExternalUserId;
  if (!thirdExternalUserId) {
    throw handoffCommandError("Handoff recipient is unavailable in the Run context");
  }
  return {
    accountSelection,
    customerMessage: customerMessage.trim() ? customerMessage : "",
    operatorMessage,
    recipient: { thirdExternalUserId },
    source: "workflow",
  };
}

function handoffCommandError(diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    "WORKFLOW_HANDOFF_COMMAND_INVALID",
    "执行所需数据不可用，流程已停止",
    { diagnosticMessage },
  );
}
