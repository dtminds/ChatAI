import {
  isWorkflowNodeExecutionConfig,
  WorkflowOrderBindCommandSchema,
  WorkflowOrderBindResultSchema,
  type WorkflowOrderBindCommand,
  type WorkflowOrderBindExecutionConfig,
} from "@chatai/contracts";
import type {
  WorkflowCapabilityCommandContext,
  WorkflowCapabilityExecutionBinding,
} from "./capability-port.js";
import { createCapabilityCommandError } from "./capability-command-error.js";
import { readWorkflowOrderNumber } from "./order-number.js";
import { requireWorkflowVariableValue } from "./variable-content.js";

export const WORKFLOW_ORDER_BIND_CAPABILITY_BINDING = {
  completeWithoutExecution: completeWorkflowOrderBindWithoutExecution,
  createCommand: createWorkflowOrderBindCommand,
  definition: {
    capabilityKey: "order.bind",
    commandSchema: WorkflowOrderBindCommandSchema,
    contractVersion: 1,
    kind: "action",
    resultSchema: WorkflowOrderBindResultSchema,
  },
  mapResult({ result }) {
    return { result: result.result };
  },
  nodeKind: "order-bind",
} satisfies WorkflowCapabilityExecutionBinding<
  typeof WorkflowOrderBindCommandSchema,
  typeof WorkflowOrderBindResultSchema,
  "action"
>;

export function createWorkflowOrderBindCommand(input: {
  config: Record<string, unknown>;
  context: WorkflowCapabilityCommandContext;
}): WorkflowOrderBindCommand {
  const prepared = prepareWorkflowOrderBindCommand(input);
  if (prepared === null) {
    throw orderBindCommandError("Order Bind order number did not resolve to usable text");
  }
  return prepared;
}

function completeWorkflowOrderBindWithoutExecution(input: {
  config: Record<string, unknown>;
  context: WorkflowCapabilityCommandContext;
}) {
  return prepareWorkflowOrderBindCommand(input) === null
    ? { result: false }
    : undefined;
}

function prepareWorkflowOrderBindCommand(input: {
  config: Record<string, unknown>;
  context: WorkflowCapabilityCommandContext;
}): WorkflowOrderBindCommand | null {
  if (!isWorkflowNodeExecutionConfig("order-bind", input.config)) {
    throw orderBindCommandError("Order Bind execution config failed schema validation");
  }
  if (!input.context.identities.externalUserId) {
    throw orderBindCommandError("Order Bind recipient is unavailable in the Run context");
  }
  const config = input.config as WorkflowOrderBindExecutionConfig;
  return readWorkflowOrderNumber(
    requireWorkflowVariableValue(
      config.orderNumberSelector,
      input.context,
      orderBindCommandError,
    ),
  );
}

const orderBindCommandError = createCapabilityCommandError(
  "WORKFLOW_ORDER_BIND_COMMAND_INVALID",
);
