import {
  isWorkflowNodeExecutionConfig,
  WORKFLOW_AUDIENCE_FILTER_OUTLET_MATCHED,
  WORKFLOW_AUDIENCE_FILTER_OUTLET_UNMATCHED,
  WorkflowAudienceFilterCommandSchema,
  WorkflowAudienceFilterResultSchema,
  type WorkflowAudienceFilterCommand,
  type WorkflowAudienceFilterExecutionConfig,
  type WorkflowAudienceFilterResult,
} from "@chatai/contracts";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import type {
  WorkflowCapabilityCommandContext,
  WorkflowCapabilityExecutionBinding,
} from "./capability-port.js";

export const WORKFLOW_AUDIENCE_FILTER_CAPABILITY_BINDING = {
  createCommand: createWorkflowAudienceFilterCommand,
  definition: {
    capabilityKey: "cdp.group.check-contact",
    commandSchema: WorkflowAudienceFilterCommandSchema,
    contractVersion: 1,
    kind: "query",
    resultSchema: WorkflowAudienceFilterResultSchema,
  },
  mapResult() {
    return {};
  },
  nodeKind: "audience-filter",
  resolveSourceOutlet({ result }) {
    return resolveWorkflowAudienceFilterSourceOutlet(result);
  },
} satisfies WorkflowCapabilityExecutionBinding<
  typeof WorkflowAudienceFilterCommandSchema,
  typeof WorkflowAudienceFilterResultSchema,
  "query"
>;

export function createWorkflowAudienceFilterCommand(input: {
  config: Record<string, unknown>;
  context: WorkflowCapabilityCommandContext;
}): WorkflowAudienceFilterCommand {
  const config = requireWorkflowAudienceFilterExecutionConfig(input.config);
  if (!input.context.identities.externalUserId) {
    throw audienceFilterCommandError("Audience Filter subject is unavailable in the Run context");
  }
  return { groupId: config.group.id };
}

export function resolveWorkflowAudienceFilterSourceOutlet(
  result: WorkflowAudienceFilterResult,
) {
  return result.exist
    ? WORKFLOW_AUDIENCE_FILTER_OUTLET_MATCHED
    : WORKFLOW_AUDIENCE_FILTER_OUTLET_UNMATCHED;
}

function requireWorkflowAudienceFilterExecutionConfig(
  config: Record<string, unknown>,
): WorkflowAudienceFilterExecutionConfig {
  if (!isWorkflowNodeExecutionConfig("audience-filter", config)) {
    throw audienceFilterCommandError("Audience Filter execution config failed schema validation");
  }
  return structuredClone(config) as WorkflowAudienceFilterExecutionConfig;
}

function audienceFilterCommandError(diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    "WORKFLOW_AUDIENCE_FILTER_COMMAND_INVALID",
    "执行所需数据不可用，流程已停止",
    { diagnosticMessage },
  );
}
