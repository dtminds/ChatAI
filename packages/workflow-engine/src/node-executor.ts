import {
  evaluateWorkflowBranchPath,
  isWorkflowBranchConfigComplete,
  isWorkflowRatioSplitExecutionConfigComplete,
  WORKFLOW_WAIT_DAY_OFFSET_MAX,
  WORKFLOW_WAIT_DURATION_MAX_BY_UNIT,
  WORKFLOW_RATIO_SPLIT_TOTAL_BASIS_POINTS,
  WorkflowWaitEventConfigSchema,
  type WorkflowBranchSelector,
  type WorkflowContactIdentity,
  type WorkflowExecutionNode,
  type WorkflowNodeKind,
  type WorkflowSubjectType,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import { createHash } from "node:crypto";
import { WorkflowNodeExecutionError } from "./errors.js";

export type WorkflowNodeExecutionContext = {
  identities: WorkflowContactIdentity;
  now: Date;
  outputs: Record<string, Record<string, unknown>>;
  currentNodeLifecycle?: { enteredAt?: string; exitedAt?: string };
  nodeLifecycle?: Record<string, { enteredAt?: string; exitedAt?: string }>;
  run: {
    id: string;
    revision: number;
    sequence: number;
    subjectId: string;
    subjectType: WorkflowSubjectType;
    uid: string;
    workflowId: string;
  };
  trigger: Record<string, unknown>;
};

export type WorkflowNodeExecutionResult =
  | { output: Record<string, unknown>; sourceOutletId: string; type: "advance" }
  | { eventType: "message.received"; expiresAt: string; type: "event-wait" }
  | { dueAt: string; output: Record<string, unknown>; type: "wait" }
  | { output: Record<string, unknown>; type: "complete" };

export type WorkflowNodeExecutor = {
  execute(
    node: WorkflowExecutionNode,
    context: WorkflowNodeExecutionContext,
  ): Promise<WorkflowNodeExecutionResult> | WorkflowNodeExecutionResult;
};

// Published v1 wait specs omitted mode and used one shared duration limit.
const LEGACY_WORKFLOW_WAIT_DURATION_MAX = 525_600;
const WORKFLOW_TIMEZONE_OFFSET_MILLISECONDS = 8 * 60 * 60 * 1_000;

export class WorkflowNodeExecutorRegistry {
  private readonly executors = new Map<WorkflowNodeKind, WorkflowNodeExecutor>();

  register(kind: WorkflowNodeKind, executor: WorkflowNodeExecutor) {
    if (this.executors.has(kind)) {
      throw new WorkflowNodeExecutionError(`Executor already registered: ${kind}`);
    }
    this.executors.set(kind, executor);
    return this;
  }

  has(kind: WorkflowNodeKind) {
    return this.executors.has(kind);
  }

  async execute(node: WorkflowExecutionNode, context: WorkflowNodeExecutionContext) {
    const executor = this.executors.get(node.kind);
    if (!executor) {
      throw new WorkflowNodeExecutionError(`Executor is not registered: ${node.kind}`);
    }
    return executor.execute(node, context);
  }
}

export function createCoreNodeExecutorRegistry() {
  const registry = new WorkflowNodeExecutorRegistry();
  registry.register("start", {
    execute: () => ({ output: {}, sourceOutletId: "default", type: "advance" }),
  });
  registry.register("end", {
    execute: () => ({ output: {}, type: "complete" }),
  });
  registry.register("wait", { execute: executeWait });
  registry.register("wait-event", { execute: executeWaitEvent });
  registry.register("branch", { execute: executeBranch });
  registry.register("ratio-split", { execute: executeRatioSplit });
  return registry;
}

function executeWait(
  node: WorkflowExecutionNode,
  context: WorkflowNodeExecutionContext,
): WorkflowNodeExecutionResult {
  const dueAt = node.config.mode === "fixed-time"
    ? getFixedTimeWaitDueAt(node.config, context.now)
    : getDurationWaitDueAt(node.config, context.now);
  return { dueAt, output: { dueAt }, type: "wait" };
}

function executeWaitEvent(
  node: WorkflowExecutionNode,
  context: WorkflowNodeExecutionContext,
): WorkflowNodeExecutionResult {
  if (!Value.Check(WorkflowWaitEventConfigSchema, node.config)) {
    throw new WorkflowNodeExecutionError("Wait Event node requires a supported event, delay, and timeout");
  }
  const unitMilliseconds = node.config.timeout.unit === "minute"
    ? 60_000
    : node.config.timeout.unit === "hour"
      ? 3_600_000
      : 86_400_000;
  return {
    eventType: node.config.event.type,
    expiresAt: new Date(
      context.now.getTime() + node.config.timeout.duration * unitMilliseconds,
    ).toISOString(),
    type: "event-wait",
  };
}

function getDurationWaitDueAt(config: Record<string, unknown>, enteredAt: Date) {
  const duration = config.duration;
  const unit = config.unit;
  const legacyDurationConfig = config.mode === undefined;
  if ((!legacyDurationConfig && config.mode !== "duration")
    || typeof duration !== "number"
    || !Number.isSafeInteger(duration)
    || duration <= 0
    || (unit !== "minute" && unit !== "hour" && unit !== "day")) {
    throw new WorkflowNodeExecutionError("Wait node requires a positive duration and supported unit");
  }
  const maximumDuration = legacyDurationConfig
    ? LEGACY_WORKFLOW_WAIT_DURATION_MAX
    : WORKFLOW_WAIT_DURATION_MAX_BY_UNIT[unit];
  if (duration > maximumDuration) {
    throw new WorkflowNodeExecutionError("Wait node duration exceeds the supported unit limit");
  }
  const unitMilliseconds = unit === "minute" ? 60_000 : unit === "hour" ? 3_600_000 : 86_400_000;
  return new Date(enteredAt.getTime() + duration * unitMilliseconds).toISOString();
}

function getFixedTimeWaitDueAt(config: Record<string, unknown>, enteredAt: Date) {
  const dayOffset = config.dayOffset;
  const time = config.time;
  if (config.mode !== "fixed-time"
    || typeof dayOffset !== "number"
    || !Number.isSafeInteger(dayOffset)
    || dayOffset <= 0
    || dayOffset > WORKFLOW_WAIT_DAY_OFFSET_MAX
    || typeof time !== "string"
    || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new WorkflowNodeExecutionError("Wait node requires a valid day offset and fixed time");
  }
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  const enteredAtUtc8 = new Date(enteredAt.getTime() + WORKFLOW_TIMEZONE_OFFSET_MILLISECONDS);
  const dueAtUtc8WallClock = Date.UTC(
    enteredAtUtc8.getUTCFullYear(),
    enteredAtUtc8.getUTCMonth(),
    enteredAtUtc8.getUTCDate() + dayOffset,
    hour,
    minute,
  );
  return new Date(dueAtUtc8WallClock - WORKFLOW_TIMEZONE_OFFSET_MILLISECONDS).toISOString();
}

function executeBranch(
  node: WorkflowExecutionNode,
  context: WorkflowNodeExecutionContext,
): WorkflowNodeExecutionResult {
  if (!isWorkflowBranchConfigComplete(node.config)) {
    throw new WorkflowNodeExecutionError("Branch node requires complete ordered paths and conditions");
  }
  const paths = node.config.branchPaths;
  const defaultPath = paths.find((path) => path.isDefault);
  const matchedPath = paths.find((path) =>
    !path.isDefault && evaluateWorkflowBranchPath(path, selector => resolveBranchSelector(selector, context)),
  ) ?? defaultPath;

  if (!matchedPath) {
    throw new WorkflowNodeExecutionError("Branch node requires one default path");
  }
  return {
    output: {},
    sourceOutletId: matchedPath.id,
    type: "advance",
  };
}

function executeRatioSplit(
  node: WorkflowExecutionNode,
  context: WorkflowNodeExecutionContext,
): WorkflowNodeExecutionResult {
  if (!isWorkflowRatioSplitExecutionConfigComplete(node.config)) {
    throw new WorkflowNodeExecutionError("Ratio Split node requires a valid allocation and labels");
  }
  const bucket = createWorkflowRatioSplitBucket({
    nodeId: node.id,
    subjectId: context.run.subjectId,
    subjectType: context.run.subjectType,
    uid: context.run.uid,
    workflowId: context.run.workflowId,
  });
  return {
    output: {},
    sourceOutletId: selectWorkflowRatioSplitGroup(node.config.groups, bucket),
    type: "advance",
  };
}

function selectWorkflowRatioSplitGroup(
  groups: readonly { basisPoints: number; id: string }[],
  bucket: number,
) {
  let upperBound = 0;
  for (const group of groups) {
    upperBound += group.basisPoints;
    if (bucket < upperBound) return group.id;
  }
  throw new WorkflowNodeExecutionError("Ratio Split node allocation does not cover every bucket");
}

export function createWorkflowRatioSplitBucket(input: {
  nodeId: string;
  subjectId: string;
  subjectType: WorkflowSubjectType;
  uid: string;
  workflowId: string;
}) {
  const hash = createHash("sha256");
  for (const field of [
    input.uid,
    input.workflowId,
    input.nodeId,
    input.subjectType,
    input.subjectId,
  ]) {
    const encoded = Buffer.from(field, "utf8");
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(encoded.length);
    hash.update(length);
    hash.update(encoded);
  }
  const value = hash.digest().readUInt32BE(0);
  return Math.floor(
    value * WORKFLOW_RATIO_SPLIT_TOTAL_BASIS_POINTS / 0x1_0000_0000,
  );
}

function resolveBranchSelector(
  selector: WorkflowBranchSelector,
  context: WorkflowNodeExecutionContext,
): { available: boolean; value: unknown } {
  const [scope, key, ...path] = selector;
  if (!scope || !key) return { available: false, value: undefined };
  if (scope === "subject" && key === "id" && path.length === 0) {
    return { available: true, value: context.run.subjectId };
  }
  if (scope === "trigger") return readPath(context.trigger, [key, ...path]);
  if (scope === "node") {
    const output = context.outputs[key];
    return output ? readPath(output, path) : { available: false, value: undefined };
  }
  if (scope === "node-lifecycle") {
    const lifecycle = context.nodeLifecycle?.[key];
    return lifecycle ? readPath(lifecycle, path) : { available: false, value: undefined };
  }
  if (scope === "current-node-lifecycle") {
    return readPath(context.currentNodeLifecycle, [key, ...path]);
  }
  return { available: false, value: undefined };
}

function readPath(value: unknown, path: string[]): { available: boolean; value: unknown } {
  let current = value;
  for (const part of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)
      || !Object.prototype.hasOwnProperty.call(current, part)) {
      return { available: false, value: undefined };
    }
    current = (current as Record<string, unknown>)[part];
  }
  return { available: true, value: current };
}
