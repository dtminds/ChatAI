import type {
  WorkflowExecutionNode,
  WorkflowExecutionSpec,
  WorkflowNodeKind,
  WorkflowStartConfig,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import { WorkflowStartConfigSchema } from "@chatai/contracts";
import {
  createCoreNodeExecutorRegistry,
  createWorkflowActionIdempotencyKey,
  isWorkflowActionNodeKind,
  WorkflowActionExecutionError,
  type WorkflowNodeExecutionContext,
} from "@chatai/workflow-engine";
import { WorkflowRuntimeError } from "./errors.js";
import type {
  WorkflowCommitNodeResultInput,
  WorkflowRuntimeControlReader,
  WorkflowRunRecord,
  WorkflowRuntimeRepository,
} from "./types.js";

type WorkflowActionAdapter = NonNullable<WorkflowNodeExecutionContext["executeAction"]>;

export class WorkflowRuntimeService {
  private readonly actionMaxRetryDelayMs: number;
  private readonly actionRetryDelayMs: number;
  private readonly executors = createCoreNodeExecutorRegistry();
  private readonly maxTaskAttempts: number;
  private readonly taskLeaseDurationMs: number;

  constructor(
    private readonly controlRepository: WorkflowRuntimeControlReader,
    private readonly runtimeRepository: WorkflowRuntimeRepository,
    private readonly executeAction?: WorkflowActionAdapter,
    options: {
      actionMaxRetryDelayMs?: number;
      actionRetryDelayMs?: number;
      maxTaskAttempts?: number;
      taskLeaseDurationMs?: number;
    } = {},
  ) {
    this.actionMaxRetryDelayMs = options.actionMaxRetryDelayMs ?? 300_000;
    this.actionRetryDelayMs = options.actionRetryDelayMs ?? 5_000;
    this.maxTaskAttempts = options.maxTaskAttempts ?? 5;
    this.taskLeaseDurationMs = options.taskLeaseDurationMs ?? 60_000;
  }

  async startRun(input: {
    entryEventId: string;
    expectedRevision: number;
    subjectId: string;
    trigger: Record<string, unknown>;
    uid: number;
    workflowId: string;
  }) {
    const definition = await this.controlRepository.findDefinition(input.uid, input.workflowId);
    if (!definition) throw workflowUnavailable();
    if (definition.runtimeStatus !== "active" || definition.publishedRevision === null) {
      throw runtimeStatusError(definition.runtimeStatus);
    }
    if (definition.publishedRevision !== input.expectedRevision) throw staleDefinitionError();
    const revision = await this.controlRepository.findRevision(
      input.uid,
      input.workflowId,
      definition.publishedRevision,
    );
    if (!revision) throw new WorkflowRuntimeError("WORKFLOW_REVISION_NOT_FOUND", "Workflow Revision 不存在", 404);
    const entryNode = requireExecutionNode(revision.executionSpec, revision.executionSpec.entryNodeId);
    const startConfig = requireStartConfig(entryNode);

    const created = await this.runtimeRepository.createRunWithInitialTask({
      context: { outputs: {}, trigger: structuredClone(input.trigger) },
      entryEventId: input.entryEventId,
      entryPolicy: startConfig.entryPolicy,
      initialNodeId: entryNode.id,
      initialNodeKind: entryNode.kind,
      occurredAt: parseOccurredAt(input.trigger),
      revision: revision.revision,
      shardId: getWorkflowShardId(input.uid, input.subjectId),
      subjectId: input.subjectId,
      uid: input.uid,
      workflowId: input.workflowId,
    });
    if (created.kind === "workflow-unavailable") {
      throw created.action === "defer"
        ? runtimeStatusError("paused")
        : workflowUnavailable();
    }
    if (created.kind === "entry-policy-rejected") return created;
    if (created.kind !== "success") throw staleDefinitionError();
    return created;
  }

  async executeTask(input: {
    messageId?: string;
    now: Date;
    taskId: string;
    taskVersion: number;
    uid: number;
    workerId: string;
  }) {
    const task = await this.runtimeRepository.findTask(input.uid, input.taskId);
    if (!task) throw new WorkflowRuntimeError("WORKFLOW_TASK_NOT_FOUND", "Workflow Task 不存在", 404);
    const run = await this.runtimeRepository.findRun(input.uid, task.runId);
    if (!run) throw new WorkflowRuntimeError("WORKFLOW_RUN_NOT_FOUND", "Workflow Run 不存在", 404);
    const revision = await this.controlRepository.findRevision(input.uid, run.workflowId, run.revision);
    if (!revision) throw new WorkflowRuntimeError("WORKFLOW_REVISION_NOT_FOUND", "Workflow Revision 不存在", 404);

    const claimed = await this.runtimeRepository.claimTask({
      expectedTaskVersion: input.taskVersion,
      leaseExpiresAt: new Date(input.now.getTime() + this.taskLeaseDurationMs),
      leaseOwner: input.workerId,
      taskId: task.id,
      uid: input.uid,
    });
    if (claimed.kind === "workflow-unavailable") {
      throw claimed.action === "defer"
        ? runtimeStatusError("paused")
        : workflowUnavailable();
    }
    if (claimed.kind !== "success") throw staleTaskError();

    const node = requireExecutionNode(revision.executionSpec, claimed.task.nodeId);
    const actionIdempotencyKey = createWorkflowActionIdempotencyKey({
      nodeId: node.id,
      runId: run.id,
      sequence: claimed.task.sequence,
      uid: String(input.uid),
    });
    if (isWorkflowActionNodeKind(node.kind)) {
      const prepared = await this.runtimeRepository.prepareActionExecution({
        expectedRunLockVersion: run.lockVersion,
        expectedTaskVersion: claimed.task.taskVersion,
        idempotencyKey: actionIdempotencyKey,
        input: createNodeInputSnapshot(run),
        now: input.now,
        runId: run.id,
        taskId: task.id,
        uid: input.uid,
      });
      if (prepared.kind !== "success") throw staleTaskError();
    }
    let executionResult: Awaited<ReturnType<ReturnType<typeof createCoreNodeExecutorRegistry>["execute"]>>;
    try {
      executionResult = await this.executors.execute(node, createExecutionContext(
        run,
        input.now,
        this.executeAction,
        isWorkflowActionNodeKind(node.kind) ? actionIdempotencyKey : undefined,
      ));
    } catch (error) {
      if (!(error instanceof WorkflowActionExecutionError) || !isWorkflowActionNodeKind(node.kind)) throw error;
      const failureInput = {
        errorCode: error.code.slice(0, 128),
        errorMessage: error.message.slice(0, 512),
        expectedRunLockVersion: run.lockVersion,
        expectedTaskVersion: claimed.task.taskVersion,
        failureKind: error.failureKind,
        idempotencyKey: actionIdempotencyKey,
        inbox: createInbox(input.messageId, task.id, input.taskVersion, input.now),
        now: input.now,
        runId: run.id,
        taskId: task.id,
        uid: input.uid,
      };
      if (error.failureKind === "terminal" || claimed.task.attempt >= this.maxTaskAttempts) {
        const failed = await this.runtimeRepository.failActionExecution(failureInput);
        if (failed.kind === "already-processed") throw alreadyProcessedError();
        if (failed.kind !== "success") throw staleTaskError();
        return {
          errorCode: failureInput.errorCode,
          failureKind: failureInput.failureKind,
          kind: "failed" as const,
          run: failed.run,
          task: failed.task,
        };
      }
      const retryDelayMs = Math.min(
        this.actionRetryDelayMs * 2 ** Math.max(0, claimed.task.attempt - 1),
        this.actionMaxRetryDelayMs,
      );
      const scheduled = await this.runtimeRepository.scheduleActionRetry({
        ...failureInput,
        dueAt: new Date(input.now.getTime() + retryDelayMs),
      });
      if (scheduled.kind === "already-processed") throw alreadyProcessedError();
      if (scheduled.kind !== "success") throw staleTaskError();
      return {
        errorCode: failureInput.errorCode,
        failureKind: failureInput.failureKind,
        kind: "retry-scheduled" as const,
        retryAt: scheduled.task.dueAt,
        task: scheduled.task,
      };
    }
    const nextTask = createNextTask(revision.executionSpec, node, executionResult, input.now);
    const nextContext = appendNodeOutput(run.context, node.id, executionResult.output);
    const commitInput: WorkflowCommitNodeResultInput = {
      context: nextContext,
      expectedRunLockVersion: run.lockVersion,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: {
        ...createInbox(input.messageId, task.id, input.taskVersion, input.now),
      },
      nodeExecution: {
        idempotencyKey: actionIdempotencyKey,
        input: createNodeInputSnapshot(run),
        output: executionResult.output,
      },
      nextTask,
      runId: run.id,
      taskId: task.id,
      uid: input.uid,
    };
    const committed = await this.runtimeRepository.commitNodeResult(commitInput);
    if (committed.kind === "already-processed") throw alreadyProcessedError();
    if (committed.kind !== "success") throw staleTaskError();
    return committed;
  }
}

function createExecutionContext(
  run: WorkflowRunRecord,
  now: Date,
  executeAction: WorkflowActionAdapter | undefined,
  actionIdempotencyKey?: string,
): WorkflowNodeExecutionContext {
  const trigger = isRecord(run.context.trigger) ? run.context.trigger : {};
  const outputs = isRecord(run.context.outputs)
    ? run.context.outputs as Record<string, Record<string, unknown>>
    : {};
  return {
    actionIdempotencyKey,
    evaluateBranchPath: (path) => {
      const matches = isRecord(run.context.branchMatches) ? run.context.branchMatches : {};
      return matches[path.id] === true;
    },
    executeAction,
    now,
    outputs,
    run: {
      id: run.id,
      revision: run.revision,
      sequence: run.sequence,
      subjectId: run.subjectId,
      uid: String(run.uid),
    },
    trigger,
  };
}

function createInbox(messageId: string | undefined, taskId: string, taskVersion: number, now: Date) {
  return {
    consumer: "workflow-task",
    expiresAt: new Date(now.getTime() + 31 * 86_400_000),
    messageId: messageId ?? `task:${taskId}:v${taskVersion}`,
  };
}

function createNextTask(
  spec: WorkflowExecutionSpec,
  node: WorkflowExecutionNode,
  result: Awaited<ReturnType<ReturnType<typeof createCoreNodeExecutorRegistry>["execute"]>>,
  now: Date,
) {
  if (result.type === "complete") return undefined;
  const sourceOutletId = result.type === "wait" ? "default" : result.sourceOutletId;
  const edge = spec.edges.find((item) =>
    item.source === node.id && item.sourceOutletId === sourceOutletId,
  );
  if (!edge) throw new WorkflowRuntimeError("WORKFLOW_EDGE_NOT_FOUND", "Workflow 执行出口不存在", 500);
  const target = requireExecutionNode(spec, edge.target);
  return {
    dispatchImmediately: result.type !== "wait",
    dueAt: result.type === "wait" ? new Date(result.dueAt) : now,
    nodeId: target.id,
    nodeKind: target.kind,
    taskType: result.type === "wait" ? "wait" : "execute",
  };
}

function appendNodeOutput(
  context: Record<string, unknown>,
  nodeId: string,
  output: Record<string, unknown>,
) {
  const existingOutputs = isRecord(context.outputs) ? context.outputs : {};
  return {
    ...structuredClone(context),
    outputs: {
      ...structuredClone(existingOutputs),
      [nodeId]: structuredClone(output),
    },
  };
}

function createNodeInputSnapshot(run: WorkflowRunRecord) {
  return {
    subjectId: run.subjectId,
    trigger: isRecord(run.context.trigger) ? structuredClone(run.context.trigger) : {},
  };
}

function requireExecutionNode(spec: WorkflowExecutionSpec, nodeId: string) {
  const node = spec.nodes.find((item) => item.id === nodeId);
  if (!node) throw new WorkflowRuntimeError("WORKFLOW_NODE_NOT_FOUND", "Workflow 执行节点不存在", 500);
  return node;
}

function requireStartConfig(node: WorkflowExecutionNode): WorkflowStartConfig {
  if (node.kind !== "start" || !Value.Check(WorkflowStartConfigSchema, node.config)) {
    throw new WorkflowRuntimeError("WORKFLOW_START_CONFIG_INVALID", "Workflow Start 配置无效", 500);
  }
  return structuredClone(node.config) as WorkflowStartConfig;
}

function parseOccurredAt(trigger: Record<string, unknown>) {
  const value = trigger.occurredAt;
  const parsed = typeof value === "string" ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function getWorkflowShardId(uid: number, subjectId: string) {
  let hash = 2166136261;
  const value = `${uid}:${subjectId}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 256;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function runtimeStatusError(status: "active" | "inactive" | "paused" | "stopped") {
  if (status === "paused") return new WorkflowRuntimeError("WORKFLOW_RUNTIME_PAUSED", "Workflow 已暂停");
  if (status === "stopped") return new WorkflowRuntimeError("WORKFLOW_RUNTIME_STOPPED", "Workflow 已停止");
  return new WorkflowRuntimeError("WORKFLOW_RUNTIME_INACTIVE", "Workflow 尚未启用");
}

function workflowUnavailable() {
  return new WorkflowRuntimeError("WORKFLOW_RUNTIME_UNAVAILABLE", "Workflow 不可执行");
}

function staleTaskError() {
  return new WorkflowRuntimeError("WORKFLOW_TASK_STALE", "Workflow Task 已过期");
}

function alreadyProcessedError() {
  return new WorkflowRuntimeError("WORKFLOW_TASK_ALREADY_PROCESSED", "Workflow Task 已处理");
}

function staleDefinitionError() {
  return new WorkflowRuntimeError("WORKFLOW_DEFINITION_STALE", "Workflow 已更新，请重新进入");
}
