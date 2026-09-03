import {
  isWorkflowNodeExecutionConfig,
  WorkflowTagCommandSchema,
  WorkflowTagResultSchema,
  type WorkflowTagCommand,
  type WorkflowTagExecutionConfig,
} from "@chatai/contracts";
import type {
  WorkflowCapabilityCommandContext,
  WorkflowCapabilityExecutionBinding,
} from "./capability-port.js";
import { createCapabilityCommandError } from "./capability-command-error.js";

export const WORKFLOW_TAG_CAPABILITY_BINDING = {
  createCommand: createWorkflowTagCommand,
  definition: {
    capabilityKey: "customer.tag.update",
    commandSchema: WorkflowTagCommandSchema,
    contractVersion: 1,
    kind: "action",
    resultSchema: WorkflowTagResultSchema,
  },
  nodeKind: "tag",
} satisfies WorkflowCapabilityExecutionBinding<
  typeof WorkflowTagCommandSchema,
  typeof WorkflowTagResultSchema,
  "action"
>;

export function createWorkflowTagCommand(input: {
  config: Record<string, unknown>;
  context: WorkflowCapabilityCommandContext;
}): WorkflowTagCommand {
  if (!isWorkflowNodeExecutionConfig("tag", input.config)) {
    throw tagCommandError("Tag execution config failed schema validation");
  }
  if (!input.context.identities.externalUserId) {
    throw tagCommandError("Tag recipient is unavailable in the Run context");
  }
  const config = input.config as WorkflowTagExecutionConfig;
  return {
    operation: config.operation,
    source: "workflow",
    tagIds: [...config.tagIds],
  };
}

const tagCommandError = createCapabilityCommandError(
  "WORKFLOW_TAG_COMMAND_INVALID",
);
