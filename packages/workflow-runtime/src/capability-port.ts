import type {
  WorkflowCapabilityKind,
  WorkflowCapabilityNodeKind,
  WorkflowContactIdentity,
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
  identities: WorkflowContactIdentity;
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
  customFields: Record<string, number | string>;
  currentNodeLifecycle: { enteredAt?: string; exitedAt?: string };
  identities: WorkflowContactIdentity;
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
  completeWithoutExecution?(input: {
    config: Record<string, unknown>;
    context: WorkflowCapabilityCommandContext;
  }): Record<string, unknown> | undefined;
  createCommand(input: {
    config: Record<string, unknown>;
    context: WorkflowCapabilityCommandContext;
  }): unknown;
  definition: WorkflowCapabilityDefinition<TCommandSchema, TResultSchema, TKind>;
  executionTimeoutMs?: number;
  mapResult?(input: {
    command: Static<TCommandSchema>;
    config: Record<string, unknown>;
    context: WorkflowCapabilityCommandContext;
    result: Static<TResultSchema>;
  }): Record<string, unknown>;
  nodeKind: WorkflowCapabilityNodeKind;
  resolveSourceOutlet?(input: {
    command: Static<TCommandSchema>;
    config: Record<string, unknown>;
    context: WorkflowCapabilityCommandContext;
    result: Static<TResultSchema>;
  }): string;
};

export type WorkflowCapabilityStepResult = {
  output: Record<string, unknown>;
  sourceOutletId: string;
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
  const step = await executeWorkflowCapabilityStep(input);
  return step.output;
}

export async function executeWorkflowCapabilityStep<
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
}): Promise<WorkflowCapabilityStepResult> {
  const localResult = input.binding.completeWithoutExecution?.({
    config: structuredClone(input.config),
    context: structuredClone(input.commandContext),
  });
  if (localResult !== undefined) {
    return {
      output: decodeCapabilityResult(input.binding.definition.resultSchema, localResult),
      sourceOutletId: "default",
    };
  }
  const command = input.binding.createCommand({
    config: structuredClone(input.config),
    context: structuredClone(input.commandContext),
  });
  if (!Value.Check(input.binding.definition.commandSchema, command)) {
    throw new WorkflowCapabilityExecutionError(
      "terminal",
      "WORKFLOW_CAPABILITY_COMMAND_INVALID",
      "执行所需数据不可用，流程已停止",
      { diagnosticMessage: "Workflow capability command failed schema validation" },
    );
  }
  const request = {
    command: structuredClone(command) as Static<TCommandSchema>,
    deadlineAt: input.deadlineAt,
    execution: input.execution,
    identities: structuredClone(input.commandContext.identities),
    signal: input.signal,
    subjectId: input.subjectId,
    subjectType: input.subjectType,
    uid: input.uid,
    ...(input.binding.definition.kind === "action"
      ? { idempotencyKey: input.executionKey }
      : {}),
  } as WorkflowCapabilityRequest<Static<TCommandSchema>, TKind>;
  const result = await input.port.execute(input.binding.definition, request);
  const decodedResult = decodeCapabilityResult(
    input.binding.definition.resultSchema,
    result,
  ) as Static<TResultSchema>;
  const mappedInput = {
    command: structuredClone(command) as Static<TCommandSchema>,
    config: structuredClone(input.config),
    context: structuredClone(input.commandContext),
    result: decodedResult,
  };
  return {
    output: input.binding.mapResult
      ? input.binding.mapResult(mappedInput)
      : decodedResult as Record<string, unknown>,
    sourceOutletId: input.binding.resolveSourceOutlet?.(mappedInput) ?? "default",
  };
}

function decodeCapabilityResult(schema: TSchema, result: unknown) {
  let decodedResult: unknown;
  try {
    decodedResult = Value.Decode(schema, structuredClone(result));
  } catch {
    throw capabilityOutputInvalid();
  }
  if (!decodedResult || typeof decodedResult !== "object" || Array.isArray(decodedResult)) {
    throw capabilityOutputInvalid();
  }
  return decodedResult as Record<string, unknown>;
}

function capabilityOutputInvalid() {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    "WORKFLOW_CAPABILITY_OUTPUT_INVALID",
    "返回结果异常，流程已停止",
    { diagnosticMessage: "Workflow capability result failed schema validation" },
  );
}
