import {
  isWorkflowNodeExecutionConfig,
  WorkflowTagQueryCommandSchema,
  WorkflowTagQueryResultSchema,
  type WorkflowTagQueryCommand,
  type WorkflowTagQueryExecutionConfig,
  type WorkflowTagQueryResult,
} from "@chatai/contracts";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import type {
  WorkflowCapabilityCommandContext,
  WorkflowCapabilityExecutionBinding,
} from "./capability-port.js";

export const WORKFLOW_TAG_QUERY_CAPABILITY_BINDING = {
  createCommand: createWorkflowTagQueryCommand,
  definition: {
    capabilityKey: "customer.tag.query",
    commandSchema: WorkflowTagQueryCommandSchema,
    contractVersion: 1,
    kind: "query",
    resultSchema: WorkflowTagQueryResultSchema,
  },
  mapResult({ config, result }) {
    return mapWorkflowTagQueryResult({
      config: requireWorkflowTagQueryExecutionConfig(config),
      result,
    });
  },
  nodeKind: "tag-query",
} satisfies WorkflowCapabilityExecutionBinding<
  typeof WorkflowTagQueryCommandSchema,
  typeof WorkflowTagQueryResultSchema,
  "query"
>;

export function createWorkflowTagQueryCommand(input: {
  config: Record<string, unknown>;
  context: WorkflowCapabilityCommandContext;
}): WorkflowTagQueryCommand {
  const config = requireWorkflowTagQueryExecutionConfig(input.config);
  if (!input.context.subjectId.trim()) {
    throw tagQueryCommandError("Tag Query subject is unavailable in the Run context");
  }
  return { tagIds: [...config.tagIds] };
}

export function mapWorkflowTagQueryResult(input: {
  config: WorkflowTagQueryExecutionConfig;
  result: WorkflowTagQueryResult;
}): Record<string, unknown> {
  const matchedTagById = new Map<number, string>();
  const selectedTagIdSet = new Set(input.config.tagIds);
  for (const tag of input.result.matchedTags) {
    if (!selectedTagIdSet.has(tag.id) || matchedTagById.has(tag.id)) {
      throw tagQueryOutputError("Tag Query result contains an unknown or duplicate tag");
    }
    matchedTagById.set(tag.id, tag.name);
  }
  const matchedTagNames = input.config.tagIds.flatMap((tagId) => {
    const name = matchedTagById.get(tagId);
    return name === undefined ? [] : [name];
  });
  const matchedTagCount = matchedTagNames.length;
  return {
    matched: input.config.matchMode === "all"
      ? matchedTagCount === input.config.tagIds.length
      : input.config.matchMode === "none"
        ? matchedTagCount === 0
        : matchedTagCount > 0,
    matchedTagCount,
    matchedTagNames: matchedTagNames.join("、"),
  };
}

function tagQueryCommandError(diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    "WORKFLOW_TAG_QUERY_COMMAND_INVALID",
    "节点配置无法执行",
    { diagnosticMessage },
  );
}

function requireWorkflowTagQueryExecutionConfig(
  config: Record<string, unknown>,
): WorkflowTagQueryExecutionConfig {
  if (!isWorkflowNodeExecutionConfig("tag-query", config)) {
    throw tagQueryCommandError("Tag Query execution config failed schema validation");
  }
  return structuredClone(config) as WorkflowTagQueryExecutionConfig;
}

function tagQueryOutputError(diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    "WORKFLOW_CAPABILITY_OUTPUT_INVALID",
    "节点返回的数据无法处理，流程已停止",
    { diagnosticMessage },
  );
}
