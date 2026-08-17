import type {
  WorkflowCapabilityKind,
  WorkflowCapabilityNodeKind,
  WorkflowSubjectType,
} from "@chatai/contracts";
import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";

export type { WorkflowCapabilityKind } from "@chatai/contracts";

export type WorkflowCapabilityDefinition<
  TCommandSchema extends TSchema = TSchema,
  TResultSchema extends TSchema = TSchema,
  TKind extends WorkflowCapabilityKind = WorkflowCapabilityKind,
> = {
  capabilityKey: string;
  commandSchema: TCommandSchema;
  contractVersion: number;
  kind: TKind;
  resultSchema: TResultSchema;
};

export type WorkflowCapabilityExecutionMetadata = {
  nodeId: string;
  revision: number;
  runId: string;
  sequence: number;
  workflowId: string;
};

type WorkflowCapabilityRequestBase<TCommand> = {
  command: TCommand;
  deadlineAt: Date;
  execution: WorkflowCapabilityExecutionMetadata;
  signal: AbortSignal;
  subjectId: string;
  subjectType: WorkflowSubjectType;
  uid: number;
};

export type WorkflowCapabilityRequest<
  TCommand,
  TKind extends WorkflowCapabilityKind = WorkflowCapabilityKind,
> = TKind extends "action"
  ? WorkflowCapabilityRequestBase<TCommand> & {
      idempotencyKey: string;
    }
  : WorkflowCapabilityRequestBase<TCommand> & {
      idempotencyKey?: never;
    };

export interface WorkflowCapabilityPort {
  execute<
    TCommandSchema extends TSchema,
    TResultSchema extends TSchema,
    TKind extends WorkflowCapabilityKind,
  >(
    definition: WorkflowCapabilityDefinition<TCommandSchema, TResultSchema, TKind>,
    request: WorkflowCapabilityRequest<Static<TCommandSchema>, TKind>,
  ): Promise<unknown>;
}

export type WorkflowCapabilityCommandContext = {
  currentNodeLifecycle: { enteredAt?: string; exitedAt?: string };
  nodeLifecycle: Record<string, { enteredAt?: string; exitedAt?: string }>;
  outputs: Record<string, Record<string, unknown>>;
  subjectId: string;
  trigger: Record<string, unknown>;
  workflow: Record<string, unknown>;
};

export type WorkflowCapabilityExecutionBinding<
  TCommandSchema extends TSchema = TSchema,
  TResultSchema extends TSchema = TSchema,
  TKind extends WorkflowCapabilityKind = WorkflowCapabilityKind,
> = {
  createCommand(input: {
    config: Record<string, unknown>;
    context: WorkflowCapabilityCommandContext;
  }): unknown;
  definition: WorkflowCapabilityDefinition<TCommandSchema, TResultSchema, TKind>;
  nodeKind: WorkflowCapabilityNodeKind;
  normalizeResult?(result: Static<TResultSchema>): Static<TResultSchema> | null;
};

export async function executeWorkflowCapability<
  TCommandSchema extends TSchema,
  TResultSchema extends TSchema,
  TKind extends WorkflowCapabilityKind,
>(input: {
  binding: WorkflowCapabilityExecutionBinding<TCommandSchema, TResultSchema, TKind>;
  commandContext: WorkflowCapabilityCommandContext;
  config: Record<string, unknown>;
  deadlineAt: Date;
  execution: WorkflowCapabilityExecutionMetadata;
  executionKey: string;
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
    throw new WorkflowCapabilityExecutionError(
      "terminal",
      "WORKFLOW_CAPABILITY_COMMAND_INVALID",
      "节点配置无法执行",
      { diagnosticMessage: "Workflow capability command failed schema validation" },
    );
  }
  const request = {
    command: structuredClone(command) as Static<TCommandSchema>,
    deadlineAt: input.deadlineAt,
    execution: input.execution,
    signal: input.signal,
    subjectId: input.subjectId,
    subjectType: input.subjectType,
    uid: input.uid,
    ...(input.binding.definition.kind === "action"
      ? { idempotencyKey: input.executionKey }
      : {}),
  } as WorkflowCapabilityRequest<Static<TCommandSchema>, TKind>;
  const result = await input.port.execute(input.binding.definition, request);
  if (!Value.Check(input.binding.definition.resultSchema, result)
    || !result || typeof result !== "object" || Array.isArray(result)) {
    throw capabilityOutputInvalid();
  }
  const normalizedResult = input.binding.normalizeResult
    ? input.binding.normalizeResult(structuredClone(result) as Static<TResultSchema>)
    : structuredClone(result);
  if (!Value.Check(input.binding.definition.resultSchema, normalizedResult)
    || !normalizedResult
    || typeof normalizedResult !== "object"
    || Array.isArray(normalizedResult)) {
    throw capabilityOutputInvalid();
  }
  return structuredClone(normalizedResult) as Record<string, unknown>;
}

function capabilityOutputInvalid() {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    "WORKFLOW_CAPABILITY_OUTPUT_INVALID",
    "节点返回的数据无法处理，流程已停止",
    { diagnosticMessage: "Workflow capability result failed schema validation" },
  );
}
