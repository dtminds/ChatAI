import {
  isWorkflowNodeExecutionConfig,
  WORKFLOW_ORDER_NUMBER_MAX_LENGTH,
  WorkflowPointsTransferCommandSchema,
  WorkflowPointsTransferResultSchema,
  type WorkflowPointsTransferCommand,
  type WorkflowPointsTransferExecutionConfig,
} from "@chatai/contracts";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import type {
  WorkflowCapabilityCommandContext,
  WorkflowCapabilityExecutionBinding,
} from "./capability-port.js";
import { requireWorkflowVariableValue } from "./variable-content.js";

export const WORKFLOW_POINTS_TRANSFER_CAPABILITY_BINDING = {
  completeWithoutExecution: completeWorkflowPointsTransferWithoutExecution,
  createCommand: createWorkflowPointsTransferCommand,
  definition: {
    capabilityKey: "mall.point.transfer",
    commandSchema: WorkflowPointsTransferCommandSchema,
    contractVersion: 1,
    kind: "action",
    resultSchema: WorkflowPointsTransferResultSchema,
  },
  mapResult({ result }) {
    return { result: result.result };
  },
  nodeKind: "points-transfer",
} satisfies WorkflowCapabilityExecutionBinding<
  typeof WorkflowPointsTransferCommandSchema,
  typeof WorkflowPointsTransferResultSchema,
  "action"
>;

export function createWorkflowPointsTransferCommand(input: {
  config: Record<string, unknown>;
  context: WorkflowCapabilityCommandContext;
}): WorkflowPointsTransferCommand {
  const prepared = prepareWorkflowPointsTransferCommand(input);
  if (prepared === null) {
    throw pointsTransferCommandError("Points Transfer order number did not resolve to usable text");
  }
  return prepared;
}

function completeWorkflowPointsTransferWithoutExecution(input: {
  config: Record<string, unknown>;
  context: WorkflowCapabilityCommandContext;
}) {
  return prepareWorkflowPointsTransferCommand(input) === null
    ? { result: false }
    : undefined;
}

function prepareWorkflowPointsTransferCommand(input: {
  config: Record<string, unknown>;
  context: WorkflowCapabilityCommandContext;
}): WorkflowPointsTransferCommand | null {
  if (!isWorkflowNodeExecutionConfig("points-transfer", input.config)) {
    throw pointsTransferCommandError("Points Transfer execution config failed schema validation");
  }
  if (!input.context.identities.mallUserId) {
    throw pointsTransferCommandError("Points Transfer recipient is unavailable in the Run context");
  }
  const config = input.config as WorkflowPointsTransferExecutionConfig;
  return readOrderNumber(
    requireWorkflowVariableValue(
      config.orderNumberSelector,
      input.context,
      pointsTransferCommandError,
    ),
  );
}

function readOrderNumber(value: unknown): WorkflowPointsTransferCommand | null {
  const orderNumber = typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : typeof value === "string" ? value.trim() : "";
  if (!orderNumber || orderNumber.length > WORKFLOW_ORDER_NUMBER_MAX_LENGTH) return null;
  return {
    orderNumber,
    source: "workflow",
  };
}

function pointsTransferCommandError(diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    "WORKFLOW_POINTS_TRANSFER_COMMAND_INVALID",
    "执行所需数据不可用，流程已停止",
    { diagnosticMessage },
  );
}
