import {
  WorkflowMessageQueryCommandSchema,
  WorkflowMessageQueryConfigSchema,
  WorkflowMessageQueryResultSchema,
  isValidWorkflowLocalDateTime,
  type WorkflowContactIdentity,
  type WorkflowMessageQueryCommand,
  type WorkflowMessageQueryConfig,
  type WorkflowSubjectType,
  type WorkflowVariableSelector,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import { readWorkflowTriggerSeatId } from "./context-readers.js";

export type WorkflowMessageQueryCommandContext = {
  currentNodeLifecycle: { enteredAt?: string; exitedAt?: string };
  identities: WorkflowContactIdentity;
  nodeLifecycle: Record<string, { enteredAt?: string; exitedAt?: string }>;
  outputs: Record<string, Record<string, unknown>>;
  subjectId: string;
  trigger: Record<string, unknown>;
};

export type WorkflowMessageQueryRequest = {
  command: WorkflowMessageQueryCommand;
  identities: WorkflowContactIdentity;
  signal: AbortSignal;
  subjectId: string;
  subjectType: WorkflowSubjectType;
  uid: number;
};

export interface WorkflowMessageQueryPort {
  execute(request: WorkflowMessageQueryRequest): Promise<unknown>;
}

const WORKFLOW_TIMEZONE_OFFSET_MILLISECONDS = 8 * 60 * 60 * 1_000;
const ONE_MINUTE_MILLISECONDS = 60 * 1_000;
const FIXED_LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;

export function createWorkflowMessageQueryCommand(input: {
  config: Record<string, unknown>;
  context: WorkflowMessageQueryCommandContext;
}): WorkflowMessageQueryCommand {
  if (!Value.Check(WorkflowMessageQueryConfigSchema, input.config)) {
    throw invalidMessageQueryCommand("Message Query config failed schema validation");
  }
  const config = input.config as WorkflowMessageQueryConfig;
  const seatId = readWorkflowTriggerSeatId(input.context.trigger);
  if (seatId === null) {
    throw invalidMessageQueryCommand("Message Query requires trigger.projection.seatId");
  }
  const range = resolveMessageQueryRange(config.timeRange, input.context);
  if (range.rangeStart >= range.rangeEnd) {
    throw invalidMessageQueryCommand("Message Query requires rangeStart before rangeEnd");
  }
  const command = {
    limit: config.limit,
    rangeEnd: range.rangeEnd,
    rangeStart: range.rangeStart,
    seatId,
    take: config.take,
  };
  if (!Value.Check(WorkflowMessageQueryCommandSchema, command)) {
    throw invalidMessageQueryCommand("Message Query command failed schema validation");
  }
  return command;
}

export async function executeWorkflowMessageQuery(input: {
  config: Record<string, unknown>;
  context: WorkflowMessageQueryCommandContext;
  port: WorkflowMessageQueryPort;
  signal: AbortSignal;
  subjectId: string;
  subjectType: WorkflowSubjectType;
  uid: number;
}): Promise<Record<string, unknown>> {
  const result = await input.port.execute({
    command: createWorkflowMessageQueryCommand({
      config: input.config,
      context: input.context,
    }),
    identities: structuredClone(input.context.identities),
    signal: input.signal,
    subjectId: input.subjectId,
    subjectType: input.subjectType,
    uid: input.uid,
  });
  if (!Value.Check(WorkflowMessageQueryResultSchema, result)
    || !result || typeof result !== "object" || Array.isArray(result)) {
    throw new WorkflowCapabilityExecutionError(
      "terminal",
      "WORKFLOW_MESSAGE_QUERY_OUTPUT_INVALID",
      "返回结果异常，流程已停止",
      { diagnosticMessage: "Message Query result failed schema validation" },
    );
  }
  return structuredClone(result) as Record<string, unknown>;
}

function resolveMessageQueryRange(
  timeRange: WorkflowMessageQueryConfig["timeRange"],
  context: WorkflowMessageQueryCommandContext,
) {
  if (timeRange.mode === "fixed") {
    return {
      rangeEnd: parseFixedLocalDateTime(timeRange.endAt) + ONE_MINUTE_MILLISECONDS - 1,
      rangeStart: parseFixedLocalDateTime(timeRange.startAt),
    };
  }
  return {
    rangeEnd: resolveDynamicTimeReference(timeRange.end, context),
    rangeStart: resolveDynamicTimeReference(timeRange.start, context),
  };
}

function resolveDynamicTimeReference(
  selector: WorkflowVariableSelector,
  context: WorkflowMessageQueryCommandContext,
) {
  return parseTimestamp(
    resolveSelector(selector, context),
    `Message Query ${selector.join(".")} time reference is unavailable`,
  );
}

function resolveSelector(
  selector: readonly string[],
  context: WorkflowMessageQueryCommandContext,
) {
  const [scope, key, ...path] = selector;
  let value: unknown;
  if (scope === "trigger") value = key ? context.trigger[key] : undefined;
  else if (scope === "node") value = key ? context.outputs[key] : undefined;
  else if (scope === "node-lifecycle") value = key ? context.nodeLifecycle[key] : undefined;
  else if (scope === "current-node-lifecycle") {
    value = key ? context.currentNodeLifecycle[key as "enteredAt" | "exitedAt"] : undefined;
  }
  else return undefined;
  for (const part of path) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function parseFixedLocalDateTime(value: string) {
  if (!isValidWorkflowLocalDateTime(value)) {
    throw invalidMessageQueryCommand("Message Query fixed time is invalid");
  }
  const match = FIXED_LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match) throw invalidMessageQueryCommand("Message Query fixed time is invalid");
  const [, year, month, day, hour, minute] = match;
  const timestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  ) - WORKFLOW_TIMEZONE_OFFSET_MILLISECONDS;
  return timestamp;
}

function parseTimestamp(value: unknown, diagnosticMessage: string) {
  if (typeof value !== "string") throw invalidMessageQueryCommand(diagnosticMessage);
  const timestamp = Date.parse(value);
  if (!Number.isSafeInteger(timestamp)) throw invalidMessageQueryCommand(diagnosticMessage);
  return timestamp;
}

function invalidMessageQueryCommand(diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    "WORKFLOW_MESSAGE_QUERY_COMMAND_INVALID",
    "查询条件不可用，流程已停止",
    { diagnosticMessage },
  );
}
