import {
  isWorkflowNodeExecutionConfig,
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
  mapResult({ config, result }) {
    return mapWorkflowAudienceFilterResult({
      config: requireWorkflowAudienceFilterExecutionConfig(config),
      result,
    });
  },
  nodeKind: "audience-filter",
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
  return { groupIds: [...new Set(config.groups.map((group) => group.id))] };
}

export function mapWorkflowAudienceFilterResult(input: {
  config: WorkflowAudienceFilterExecutionConfig;
  result: WorkflowAudienceFilterResult;
}): {
  matched: boolean;
  matchedGroupCount: number;
  matchedGroupNames: string;
} {
  const selectedIds = input.config.groups.map((group) => group.id);
  const selectedIdSet = new Set(selectedIds);
  const membershipIds = new Set(
    input.result.groupIds.filter((groupId) => selectedIdSet.has(groupId)),
  );
  if (membershipIds.size === 0 && input.result.exist) {
    for (const groupId of selectedIds) membershipIds.add(groupId);
  }
  const matchedGroupNames = input.config.groups.flatMap((group) => (
    membershipIds.has(group.id) ? [group.name] : []
  ));
  const matchedGroupCount = matchedGroupNames.length;
  return {
    matched: input.config.matchMode === "all"
      ? matchedGroupCount === selectedIds.length
      : input.config.matchMode === "none"
        ? matchedGroupCount === 0
        : matchedGroupCount > 0,
    matchedGroupCount,
    matchedGroupNames: matchedGroupNames.join("、"),
  };
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
