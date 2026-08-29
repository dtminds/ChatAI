import {
  isWorkflowNodeExecutionConfig,
  WorkflowOrderConversionCommandSchema,
  WorkflowOrderConversionResultSchema,
  type WorkflowOrderConversionCommand,
  type WorkflowOrderConversionExecutionConfig,
} from "@chatai/contracts";
import type {
  WorkflowCapabilityCommandContext,
  WorkflowCapabilityExecutionBinding,
} from "./capability-port.js";
import { createCapabilityCommandError } from "./capability-command-error.js";
import { readWorkflowOrderNumber } from "./order-number.js";
import { requireWorkflowVariableValue } from "./variable-content.js";

export const WORKFLOW_ORDER_CONVERSION_CAPABILITY_BINDING = {
  completeWithoutExecution: completeWorkflowOrderConversionWithoutExecution,
  createCommand: createWorkflowOrderConversionCommand,
  definition: {
    capabilityKey: "mall.order.convert",
    commandSchema: WorkflowOrderConversionCommandSchema,
    contractVersion: 1,
    kind: "action",
    resultSchema: WorkflowOrderConversionResultSchema,
  },
  mapResult({ result }) {
    return { result: result.result };
  },
  nodeKind: "order-conversion",
} satisfies WorkflowCapabilityExecutionBinding<
  typeof WorkflowOrderConversionCommandSchema,
  typeof WorkflowOrderConversionResultSchema,
  "action"
>;

export function createWorkflowOrderConversionCommand(input: {
  config: Record<string, unknown>;
  context: WorkflowCapabilityCommandContext;
}): WorkflowOrderConversionCommand {
  const prepared = prepareWorkflowOrderConversionCommand(input);
  if (prepared === null) {
    throw orderConversionCommandError("Order Conversion order number did not resolve to usable text");
  }
  return prepared;
}

function completeWorkflowOrderConversionWithoutExecution(input: {
  config: Record<string, unknown>;
  context: WorkflowCapabilityCommandContext;
}) {
  return prepareWorkflowOrderConversionCommand(input) === null
    ? { result: false }
    : undefined;
}

function prepareWorkflowOrderConversionCommand(input: {
  config: Record<string, unknown>;
  context: WorkflowCapabilityCommandContext;
}): WorkflowOrderConversionCommand | null {
  if (!isWorkflowNodeExecutionConfig("order-conversion", input.config)) {
    throw orderConversionCommandError("Order Conversion execution config failed schema validation");
  }
  if (!input.context.identities.mallUserId) {
    throw orderConversionCommandError("Order Conversion recipient is unavailable in the Run context");
  }
  const config = input.config as WorkflowOrderConversionExecutionConfig;
  return readWorkflowOrderNumber(
    requireWorkflowVariableValue(
      config.orderNumberSelector,
      input.context,
      orderConversionCommandError,
    ),
  );
}

const orderConversionCommandError = createCapabilityCommandError(
  "WORKFLOW_ORDER_CONVERSION_COMMAND_INVALID",
);
