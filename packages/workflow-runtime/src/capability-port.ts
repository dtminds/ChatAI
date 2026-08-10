import type {
  WorkflowNodeKind,
  WorkflowSubjectType,
} from "@chatai/contracts";
import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { WorkflowActionExecutionError } from "@chatai/workflow-engine";

export type WorkflowCapabilityKind = "action" | "query";

export type WorkflowCapabilityDefinition<
  TCommandSchema extends TSchema = TSchema,
  TResultSchema extends TSchema = TSchema,
> = {
  capabilityKey: string;
  commandSchema: TCommandSchema;
  contractVersion: number;
  kind: WorkflowCapabilityKind;
  resultSchema: TResultSchema;
};

export type WorkflowCapabilityExecutionMetadata = {
  nodeId: string;
  revision: number;
  runId: string;
  sequence: number;
  workflowId: string;
};

export type WorkflowCapabilityRequest<TCommand> = {
  command: TCommand;
  deadlineAt: Date;
  execution: WorkflowCapabilityExecutionMetadata;
  idempotencyKey?: string;
  signal: AbortSignal;
  subjectId: string;
  subjectType: WorkflowSubjectType;
  uid: number;
};

export interface WorkflowCapabilityPort {
  execute<TCommandSchema extends TSchema, TResultSchema extends TSchema>(
    definition: WorkflowCapabilityDefinition<TCommandSchema, TResultSchema>,
    request: WorkflowCapabilityRequest<Static<TCommandSchema>>,
  ): Promise<unknown>;
}

export type WorkflowCapabilityCommandContext = {
  outputs: Record<string, Record<string, unknown>>;
  subjectId: string;
  trigger: Record<string, unknown>;
};

export type WorkflowCapabilityExecutionBinding<
  TCommandSchema extends TSchema = TSchema,
  TResultSchema extends TSchema = TSchema,
> = {
  createCommand(input: {
    config: Record<string, unknown>;
    context: WorkflowCapabilityCommandContext;
  }): unknown;
  definition: WorkflowCapabilityDefinition<TCommandSchema, TResultSchema>;
  nodeKind: WorkflowNodeKind;
};

export async function executeWorkflowCapability<
  TCommandSchema extends TSchema,
  TResultSchema extends TSchema,
>(input: {
  binding: WorkflowCapabilityExecutionBinding<TCommandSchema, TResultSchema>;
  commandContext: WorkflowCapabilityCommandContext;
  config: Record<string, unknown>;
  deadlineAt: Date;
  execution: WorkflowCapabilityExecutionMetadata;
  idempotencyKey: string;
  port: WorkflowCapabilityPort;
  signal: AbortSignal;
  subjectId: string;
  subjectType: WorkflowSubjectType;
  uid: number;
}): Promise<Record<string, unknown>> {
  const command = input.binding.createCommand({
    config: structuredClone(input.config),
    context: structuredClone(input.commandContext),
  });
  if (!Value.Check(input.binding.definition.commandSchema, command)) {
    throw new WorkflowActionExecutionError(
      "terminal",
      "WORKFLOW_CAPABILITY_COMMAND_INVALID",
      "节点配置无法执行",
      { diagnosticMessage: "Workflow capability command failed schema validation" },
    );
  }
  const request: WorkflowCapabilityRequest<Static<TCommandSchema>> = {
    command: structuredClone(command) as Static<TCommandSchema>,
    deadlineAt: input.deadlineAt,
    execution: input.execution,
    signal: input.signal,
    subjectId: input.subjectId,
    subjectType: input.subjectType,
    uid: input.uid,
    ...(input.binding.definition.kind === "action"
      ? { idempotencyKey: input.idempotencyKey }
      : {}),
  };
  const result = await input.port.execute(input.binding.definition, request);
  if (!Value.Check(input.binding.definition.resultSchema, result)
    || !result || typeof result !== "object" || Array.isArray(result)) {
    throw new WorkflowActionExecutionError(
      "terminal",
      "WORKFLOW_ACTION_OUTPUT_INVALID",
      "节点返回的数据无法处理，流程已停止",
      { diagnosticMessage: "Workflow capability result failed schema validation" },
    );
  }
  return structuredClone(result) as Record<string, unknown>;
}
