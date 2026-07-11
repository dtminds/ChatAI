import type { WorkflowExecutionNode, WorkflowNodeKind } from "@chatai/contracts";
import { WorkflowNodeExecutionError } from "./errors.js";

export type WorkflowNodeExecutionContext = {
  evaluateBranchPath?: (path: WorkflowBranchPathConfig) => boolean;
  executeAction?: (input: {
    context: WorkflowNodeExecutionContext;
    node: WorkflowExecutionNode;
  }) => Promise<Record<string, unknown>>;
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
      return {
        output: await context.executeAction({ context, node }),
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

function executeWait(
  node: WorkflowExecutionNode,
  context: WorkflowNodeExecutionContext,
): WorkflowNodeExecutionResult {
  const delayDays = node.config.delayDays;
  if (typeof delayDays !== "number" || !Number.isFinite(delayDays) || delayDays < 0) {
    throw new WorkflowNodeExecutionError("Wait node requires a non-negative delayDays");
  }
  const dueAt = new Date(context.now.getTime() + delayDays * 86_400_000).toISOString();
  return { dueAt, output: { dueAt }, type: "wait" };
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
    output: {
      matchedPathId: matchedPath.id,
      ...(matchedPath.label ? { matchedPathLabel: matchedPath.label } : {}),
    },
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
