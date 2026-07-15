import {
  WORKFLOW_WAIT_DAY_OFFSET_MAX,
  WORKFLOW_WAIT_DURATION_MAX_BY_UNIT,
  type WorkflowExecutionNode,
  type WorkflowNodeKind,
} from "@chatai/contracts";
import { WorkflowNodeExecutionError } from "./errors.js";

export type WorkflowNodeExecutionContext = {
  evaluateBranchPath?: (path: WorkflowBranchPathConfig) => boolean;
  executeAction?: (input: {
    context: WorkflowNodeExecutionContext;
    deadlineAt: Date;
    idempotencyKey: string;
    node: WorkflowExecutionNode;
    signal: AbortSignal;
  }) => Promise<Record<string, unknown>>;
  actionDeadlineAt?: Date;
  actionIdempotencyKey?: string;
  actionSignal?: AbortSignal;
  matchingPathIds?: Set<string>;
  now: Date;
  outputs: Record<string, Record<string, unknown>>;
  run: {
    id: string;
    revision: number;
    sequence: number;
    subjectId: string;
    uid: string;
  };
  trigger: Record<string, unknown>;
};

export type WorkflowNodeExecutionResult =
  | { output: Record<string, unknown>; sourceOutletId: string; type: "advance" }
  | { dueAt: string; output: Record<string, unknown>; type: "wait" }
  | { output: Record<string, unknown>; type: "complete" };

export type WorkflowNodeExecutor = {
  execute(
    node: WorkflowExecutionNode,
    context: WorkflowNodeExecutionContext,
  ): Promise<WorkflowNodeExecutionResult> | WorkflowNodeExecutionResult;
};

type WorkflowBranchPathConfig = {
  id: string;
  isDefault?: boolean;
  label?: string;
};

export class WorkflowNodeExecutorRegistry {
  private readonly executors = new Map<WorkflowNodeKind, WorkflowNodeExecutor>();

  register(kind: WorkflowNodeKind, executor: WorkflowNodeExecutor) {
    if (this.executors.has(kind)) {
      throw new WorkflowNodeExecutionError(`Executor already registered: ${kind}`);
    }
    this.executors.set(kind, executor);
    return this;
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
  registry.register("branch", { execute: executeBranch });

  const actionExecutor: WorkflowNodeExecutor = {
    async execute(node, context) {
      if (!context.executeAction) {
        throw new WorkflowNodeExecutionError(`Action adapter is not configured: ${node.kind}`);
      }
      if (!context.actionIdempotencyKey) {
        throw new WorkflowNodeExecutionError(`Action idempotency key is not configured: ${node.kind}`);
      }
      if (!context.actionDeadlineAt || !context.actionSignal) {
        throw new WorkflowNodeExecutionError(`Action deadline is not configured: ${node.kind}`);
      }
      return {
        output: await context.executeAction({
          context,
          deadlineAt: context.actionDeadlineAt,
          idempotencyKey: context.actionIdempotencyKey,
          node,
          signal: context.actionSignal,
        }),
        sourceOutletId: "default",
        type: "advance",
      };
    },
  };
  for (const kind of ["message", "tag", "coupon", "handoff"] as const) {
    registry.register(kind, actionExecutor);
  }
  return registry;
}

export function isWorkflowActionNodeKind(kind: WorkflowNodeKind) {
  return kind === "message" || kind === "tag" || kind === "coupon" || kind === "handoff";
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

function getDurationWaitDueAt(config: Record<string, unknown>, enteredAt: Date) {
  const duration = config.duration;
  const unit = config.unit;
  if (config.mode !== "duration"
    || typeof duration !== "number"
    || !Number.isSafeInteger(duration)
    || duration <= 0
    || (unit !== "minute" && unit !== "hour" && unit !== "day")) {
    throw new WorkflowNodeExecutionError("Wait node requires a positive duration and supported unit");
  }
  if (duration > WORKFLOW_WAIT_DURATION_MAX_BY_UNIT[unit]) {
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
  const dueAt = new Date(enteredAt);
  dueAt.setDate(dueAt.getDate() + dayOffset);
  dueAt.setHours(hour, minute, 0, 0);
  return dueAt.toISOString();
}

function executeBranch(
  node: WorkflowExecutionNode,
  context: WorkflowNodeExecutionContext,
): WorkflowNodeExecutionResult {
  const paths = parseBranchPaths(node.config.branchPaths);
  const defaultPath = paths.find((path) => path.isDefault);
  const matchedPath = paths.find((path) =>
    !path.isDefault && (context.evaluateBranchPath?.(path) ?? false),
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

function parseBranchPaths(value: unknown): WorkflowBranchPathConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || !("id" in item) || typeof item.id !== "string") {
      return [];
    }
    return [{
      id: item.id,
      isDefault: "isDefault" in item && item.isDefault === true,
      label: "label" in item && typeof item.label === "string" ? item.label : undefined,
    }];
  });
}
