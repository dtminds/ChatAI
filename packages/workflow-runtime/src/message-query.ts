import {
  WorkflowMessageQueryCommandSchema,
  WorkflowMessageQueryConfigSchema,
  WorkflowMessageQueryResultSchema,
  isValidWorkflowLocalDateTime,
  type WorkflowDynamicTimeReference,
  type WorkflowMessageQueryConfig,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import type {
  WorkflowCapabilityCommandContext,
  WorkflowCapabilityExecutionBinding,
} from "./capability-port.js";

const WORKFLOW_TIMEZONE_OFFSET_MILLISECONDS = 8 * 60 * 60 * 1_000;
const FIXED_LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;

export const WORKFLOW_MESSAGE_QUERY_CAPABILITY_BINDING = {
  createCommand: ({ config, context }) => {
    if (!Value.Check(WorkflowMessageQueryConfigSchema, config)) {
      throw invalidMessageQueryCommand("Message Query config failed schema validation");
    }
    const seatId = getSeatId(context.trigger);
    if (seatId === null) {
      throw invalidMessageQueryCommand("Message Query requires trigger.projection.seatId");
    }
    const range = resolveMessageQueryRange(config.timeRange, context);
    if (range.rangeStart >= range.rangeEnd) {
      throw invalidMessageQueryCommand("Message Query requires rangeStart before rangeEnd");
    }
    return {
      limit: config.limit,
      rangeEnd: range.rangeEnd,
      rangeStart: range.rangeStart,
      seatId,
      take: config.take,
    };
  },
  definition: {
    capabilityKey: "operation.chatai.message.query",
    commandSchema: WorkflowMessageQueryCommandSchema,
    contractVersion: 1,
    kind: "query",
    resultSchema: WorkflowMessageQueryResultSchema,
  },
  nodeKind: "message-query",
} satisfies WorkflowCapabilityExecutionBinding<
  typeof WorkflowMessageQueryCommandSchema,
  typeof WorkflowMessageQueryResultSchema,
  "query"
>;

function resolveMessageQueryRange(
  timeRange: WorkflowMessageQueryConfig["timeRange"],
  context: WorkflowCapabilityCommandContext,
) {
  if (timeRange.mode === "fixed") {
    return {
      rangeEnd: parseFixedLocalDateTime(timeRange.endAt),
      rangeStart: parseFixedLocalDateTime(timeRange.startAt),
    };
  }
  return {
    rangeEnd: resolveDynamicTimeReference(timeRange.end, context),
    rangeStart: resolveDynamicTimeReference(timeRange.start, context),
  };
}

function resolveDynamicTimeReference(
  reference: WorkflowDynamicTimeReference,
  context: WorkflowCapabilityCommandContext,
) {
  let value: unknown;
  if (reference.kind === "workflow-trigger") {
    value = context.trigger.occurredAt;
  } else if (reference.kind === "current-node-lifecycle") {
    value = context.currentNodeLifecycle.enteredAt;
  } else if (reference.kind === "node-lifecycle") {
    value = context.nodeLifecycle[reference.nodeId]?.[reference.field];
  } else {
    value = resolveSelector(reference.selector, context);
  }
  return parseTimestamp(value, `Message Query ${reference.kind} time reference is unavailable`);
}

function resolveSelector(
  selector: readonly string[],
  context: WorkflowCapabilityCommandContext,
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

function getSeatId(trigger: Record<string, unknown>) {
  const projection = trigger.projection;
  if (!projection || typeof projection !== "object" || Array.isArray(projection)) return null;
  const seatId = (projection as Record<string, unknown>).seatId;
  return typeof seatId === "number" && Number.isSafeInteger(seatId) && seatId > 0
    ? seatId
    : null;
}

function invalidMessageQueryCommand(diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    "WORKFLOW_MESSAGE_QUERY_COMMAND_INVALID",
    "消息查询条件无法执行",
    { diagnosticMessage },
  );
}
