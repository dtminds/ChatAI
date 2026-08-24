import {
  isWorkflowNodeExecutionConfig,
  WORKFLOW_ORDER_NUMBER_MAX_LENGTH,
  WorkflowOrderBindCommandSchema,
  WorkflowOrderBindResultSchema,
  type WorkflowOrderBindCommand,
  type WorkflowOrderBindExecutionConfig,
} from "@chatai/contracts";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import type {
  WorkflowCapabilityCommandContext,
  WorkflowCapabilityExecutionBinding,
} from "./capability-port.js";
import { requireWorkflowVariableValue } from "./variable-content.js";

export const WORKFLOW_ORDER_BIND_CAPABILITY_BINDING = {
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
  if (!isWorkflowNodeExecutionConfig("order-bind", input.config)) {
    throw orderBindCommandError("Order Bind execution config failed schema validation");
  }
  if (!input.context.identities.externalUserId) {
    throw orderBindCommandError("Order Bind recipient is unavailable in the Run context");
  }
  const config = input.config as WorkflowOrderBindExecutionConfig;
  const orderNumber = readOrderNumber(
    requireWorkflowVariableValue(
      config.orderNumberSelector,
      input.context,
      orderBindCommandError,
    ),
  );
  return {
    orderNumber,
    source: "workflow",
  };
}

function readOrderNumber(value: unknown) {
  const orderNumber = typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : typeof value === "string" ? value.trim() : "";
  if (!orderNumber || orderNumber.length > WORKFLOW_ORDER_NUMBER_MAX_LENGTH) {
    throw orderBindCommandError("Order Bind order number did not resolve to usable text");
  }
  return orderNumber;
}

function orderBindCommandError(diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    "WORKFLOW_ORDER_BIND_COMMAND_INVALID",
    "执行所需数据不可用，流程已停止",
    { diagnosticMessage },
  );
}
