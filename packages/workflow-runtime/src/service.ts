import type {
  WorkflowEntryEventType,
  WorkflowExecutionNode,
  WorkflowExecutionSpec,
  WorkflowJsonObject,
  WorkflowNodeKind,
  WorkflowStartConfig,
  WorkflowSubjectType,
  WorkflowType,
  WorkflowWaitEventConfig,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import {
  getWorkflowNodeContract,
  normalizeWorkflowEntryPolicy,
  WORKFLOW_INBOX_RETENTION_DAYS,
  WorkflowStartConfigSchema,
  WorkflowWaitEventConfigSchema,
} from "@chatai/contracts";
import {
  createCoreNodeExecutorRegistry,
  createWorkflowDeploymentCapabilities,
  createWorkflowNodeExecutionKey,
  hasWorkflowDeploymentCapability,
  WorkflowCapabilityExecutionError,
  type WorkflowNodeExecutorRegistry,
  type WorkflowNodeExecutionContext,
  type WorkflowDeploymentCapabilities,
} from "@chatai/workflow-engine";
import {
  executeWorkflowCapability,
  type WorkflowCapabilityExecutionBinding,
  type WorkflowCapabilityPort,
} from "./capability-port.js";
import {
  decideWorkflowEntitlement,
  UnavailableWorkflowEntitlementPort,
  WorkflowEntitlementUnavailableError,
  type WorkflowEntitlementPort,
} from "./entitlement.js";
import { WorkflowRuntimeError } from "./errors.js";
import {
  assertWorkflowRuntimeValue,
  WORKFLOW_NODE_OUTPUT_MAX_BYTES,
  WORKFLOW_RUN_CONTEXT_MAX_BYTES,
  WorkflowRuntimeValueError,
} from "./runtime-value-limits.js";
import {
  createWorkflowInferenceRequest,
  mapWorkflowInferenceResult,
} from "./inference.js";
import type {
  WorkflowCommitNodeResultInput,
  WorkflowEventSubscriptionRecord,
  WorkflowRuntimeControlReader,
  WorkflowRunRecord,
  WorkflowRuntimeRepository,
  WorkflowTaskRecord,
} from "./types.js";

type WorkflowExecuteTaskInput = {
  messageId?: string;
  now: Date;
  taskId: string;
  taskVersion: number;
  uid: number;
  workerId: string;
};

export class WorkflowRuntimeService {
  private readonly capabilityMaxRetryDelayMs: number;
  private readonly capabilityRetryDelayMs: number;
  private readonly capabilityTimeoutMs: number;
  private readonly clock: () => Date;
  private readonly executors: WorkflowNodeExecutorRegistry;
  private readonly maxTaskAttempts: number;
  private readonly taskLeaseDurationMs: number;
  private readonly deferredTaskDelayMs: number;
  private readonly inferenceTotalTimeoutMs: number;
  private readonly deploymentCapabilities: WorkflowDeploymentCapabilities;
  private readonly entitlementPort: WorkflowEntitlementPort;
  private readonly capabilityBindings: Map<WorkflowNodeKind, WorkflowCapabilityExecutionBinding>;

  constructor(
    private readonly controlRepository: WorkflowRuntimeControlReader,
    private readonly runtimeRepository: WorkflowRuntimeRepository,
    private readonly capabilityPort?: WorkflowCapabilityPort,
    options: {
      capabilityMaxRetryDelayMs?: number;
      capabilityRetryDelayMs?: number;
      capabilityTimeoutMs?: number;
      capabilityBindings?: readonly WorkflowCapabilityExecutionBinding[];
      clock?: () => Date;
      deferredTaskDelayMs?: number;
      inferenceTotalTimeoutMs?: number;
      deploymentCapabilities?: WorkflowDeploymentCapabilities;
      entitlementPort?: WorkflowEntitlementPort;
      executors?: WorkflowNodeExecutorRegistry;
      maxTaskAttempts?: number;
      taskLeaseDurationMs?: number;
    } = {},
  ) {
    this.capabilityMaxRetryDelayMs = options.capabilityMaxRetryDelayMs ?? 300_000;
    this.capabilityRetryDelayMs = options.capabilityRetryDelayMs ?? 5_000;
    this.capabilityTimeoutMs = options.capabilityTimeoutMs ?? 15_000;
    this.clock = options.clock ?? (() => new Date());
    this.executors = options.executors ?? createCoreNodeExecutorRegistry();
    this.maxTaskAttempts = options.maxTaskAttempts ?? 5;
    this.taskLeaseDurationMs = options.taskLeaseDurationMs ?? 60_000;
    this.deferredTaskDelayMs = options.deferredTaskDelayMs ?? 60_000;
    this.inferenceTotalTimeoutMs = options.inferenceTotalTimeoutMs ?? 600_000;
    this.deploymentCapabilities = options.deploymentCapabilities
      ?? createWorkflowDeploymentCapabilities([]);
    this.entitlementPort = options.entitlementPort
      ?? new UnavailableWorkflowEntitlementPort();
    this.capabilityBindings = createCapabilityBindingMap(options.capabilityBindings ?? []);
    this.runtimeRepository.configurePublishedRevisionResolver?.(async ({ uid, workflowId }) => {
      const definition = await this.controlRepository.findDefinition(uid, workflowId);
      if (definition?.publishedRevision === null || definition?.publishedRevision === undefined) {
        return null;
      }
      return this.controlRepository.findRevision(uid, workflowId, definition.publishedRevision);
    });
    if (!Number.isSafeInteger(this.capabilityTimeoutMs) || this.capabilityTimeoutMs <= 0) {
      throw new Error("Workflow capability timeout must be a positive integer");
    }
    if (this.capabilityTimeoutMs * 2 > this.taskLeaseDurationMs) {
      throw new Error("Workflow capability timeout must not exceed half of the task lease duration");
    }
    if (!Number.isSafeInteger(this.inferenceTotalTimeoutMs)
      || this.inferenceTotalTimeoutMs <= 0) {
      throw new Error("Workflow inference timeout must be a positive integer");
    }
  }

  async startRun(input: {
    entryEventId: string;
    expectedRevision: number;
    subjectId: string;
    subjectType: WorkflowSubjectType;
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
    if (revision.workflowType !== definition.workflowType
      || revision.subjectType !== input.subjectType) {
      throw staleDefinitionError();
    }
    await this.requireEntitlement(input.uid, revision.workflowType);
    if (!revision.executionSpec.requiredCapabilities.every((requirement) =>
      hasWorkflowDeploymentCapability(this.deploymentCapabilities, requirement))) {
      throw deploymentCapabilityDisabledError();
    }
    const entryNode = requireExecutionNode(revision.executionSpec, revision.executionSpec.entryNodeId);
    const startConfig = requireStartConfig(entryNode);

    let context: Record<string, unknown>;
    try {
      context = { outputs: {}, trigger: structuredClone(input.trigger) };
      assertWorkflowRuntimeValue(context, "run-context", WORKFLOW_RUN_CONTEXT_MAX_BYTES);
    } catch (error) {
      throw new WorkflowRuntimeError(
        error instanceof WorkflowRuntimeValueError && error.reason === "too-large"
          ? "WORKFLOW_CONTEXT_TOO_LARGE"
          : "WORKFLOW_CONTEXT_INVALID",
        "Workflow 运行数据无效",
        400,
      );
    }
    const created = await this.runtimeRepository.createRunWithInitialTask({
      context,
      entryEventId: input.entryEventId,
      entryPolicy: startConfig.entryPolicy,
      initialNodeId: entryNode.id,
      initialNodeKind: entryNode.kind,
      occurredAt: parseOccurredAt(input.trigger),
      revision: revision.revision,
      shardId: getWorkflowShardId(input.uid, input.subjectType, input.subjectId),
      subjectId: input.subjectId,
      subjectType: input.subjectType,
      uid: input.uid,
      workflowId: input.workflowId,
      workflowType: revision.workflowType,
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

  async recordWaitEvent(input: {
    eventId: string;
    eventOccurredAt: Date;
    eventType: WorkflowEntryEventType;
    match: WorkflowJsonObject;
    projection: WorkflowJsonObject;
    recordedAt: Date;
    subscription: WorkflowEventSubscriptionRecord;
    subjectId: string;
    subjectType: WorkflowSubjectType;
    uid: number;
  }) {
    if (input.subscription.uid !== input.uid
      || input.subscription.eventType !== input.eventType
      || input.subscription.subjectId !== input.subjectId
      || input.subscription.subjectType !== input.subjectType) {
      throw staleDefinitionError();
    }
    const definition = await this.controlRepository.findDefinition(
      input.uid,
      input.subscription.workflowId,
    );
    if (!definition) throw staleDefinitionError();
    const revision = await this.controlRepository.findRevision(
      input.uid,
      input.subscription.workflowId,
      input.subscription.revision,
    );
    if (!revision
      || revision.workflowType !== definition.workflowType
      || revision.subjectType !== input.subscription.subjectType) {
      throw staleDefinitionError();
    }
    const node = requireExecutionNode(revision.executionSpec, input.subscription.nodeId);
    const config = requireWaitEventConfig(node);
    if (config.event.type !== input.eventType
      || (input.subscription.seatId !== null
        && input.match.seatId !== input.subscription.seatId)) {
      return { kind: "not-matched" as const };
    }
    if (!node.requiredCapabilities.every((requirement) =>
      hasWorkflowDeploymentCapability(this.deploymentCapabilities, requirement))) {
      throw deploymentCapabilityDisabledError();
    }
    const collectUntil = input.subscription.status === "waiting"
      ? new Date(input.recordedAt.getTime() + config.event.collectWindowSeconds * 1_000)
      : input.subscription.collectUntil;
    if (!collectUntil) throw staleTaskError();
    const recorded = await this.runtimeRepository.recordEventSubscriptionEvent({
      collectUntil,
      eventId: input.eventId,
      eventOccurredAt: input.eventOccurredAt,
      projection: input.projection,
      recordedAt: input.recordedAt,
      subscriptionId: input.subscription.id,
      uid: input.uid,
    });
    if (recorded.kind === "workflow-unavailable") throw workflowUnavailable();
    if (recorded.kind === "entry-policy-rejected") throw staleTaskError();
    return recorded;
  }

  async executeTask(input: WorkflowExecuteTaskInput) {
    const task = await this.runtimeRepository.findTask(input.uid, input.taskId);
    if (!task) throw new WorkflowRuntimeError("WORKFLOW_TASK_NOT_FOUND", "Workflow Task 不存在", 404);
    const run = await this.runtimeRepository.findRun(input.uid, task.runId);
    if (!run) throw new WorkflowRuntimeError("WORKFLOW_RUN_NOT_FOUND", "Workflow Run 不存在", 404);
    if (task.revision !== run.revision || task.sequence !== run.sequence
      || task.nodeId !== run.currentNodeId) throw staleTaskError();
    const revision = await this.controlRepository.findRevision(input.uid, run.workflowId, task.revision);
    if (!revision) throw new WorkflowRuntimeError("WORKFLOW_REVISION_NOT_FOUND", "Workflow Revision 不存在", 404);
    if (revision.subjectType !== run.subjectType) throw staleDefinitionError();
    const node = requireExecutionNode(revision.executionSpec, task.nodeId);
    const existingEventSubscription = node.kind === "wait-event"
      ? await this.runtimeRepository.findEventSubscriptionByTask(input.uid, task.id)
      : null;
    if (existingEventSubscription && task.dueAt.getTime() > input.now.getTime()) {
      throw staleTaskError();
    }

    try {
      await this.requireEntitlement(input.uid, revision.workflowType);
    } catch (error) {
      if (error instanceof WorkflowRuntimeError
        && (error.code === "WORKFLOW_ENTITLEMENT_UNAVAILABLE"
          || error.code === "WORKFLOW_RUNTIME_PAUSED")) {
        await this.deferTaskOrThrowStale(task, input.now);
      }
      throw error;
    }
    if (!node.requiredCapabilities.every((requirement) =>
      hasWorkflowDeploymentCapability(this.deploymentCapabilities, requirement))) {
      await this.deferTaskOrThrowStale(task, input.now);
      throw deploymentCapabilityDisabledError();
    }

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

    const nodeExecutionKey = createWorkflowNodeExecutionKey({
      nodeId: node.id,
      runId: run.id,
      sequence: claimed.task.sequence,
      uid: String(input.uid),
    });
    if (node.kind === "wait-event") {
      return this.executeWaitEventTask({
        nodeExecutionKey,
        claimedTask: claimed.task,
        existingSubscription: existingEventSubscription,
        input,
        node,
        run,
      });
    }
    const executionClass = getWorkflowNodeContract(node.kind).executionClass;
    const capabilityNode = executionClass === "action"
      || executionClass === "inference"
      || executionClass === "query";
    const inferenceNode = executionClass === "inference";
    const capabilityBinding = this.capabilityBindings.get(node.kind);
    if (capabilityNode) {
      const prepared = await this.runtimeRepository.prepareCapabilityExecution({
        expectedRunLockVersion: run.lockVersion,
        expectedTaskVersion: claimed.task.taskVersion,
        executionKey: nodeExecutionKey,
        input: createNodeInputSnapshot(run),
        now: input.now,
        runId: run.id,
        taskId: task.id,
        uid: input.uid,
      });
      if (prepared.kind !== "success") throw staleTaskError();
    }
    let executionResult:
      | Awaited<ReturnType<ReturnType<typeof createCoreNodeExecutorRegistry>["execute"]>>
      | { kind: "inference-waiting"; type: "inference-wait" };
    let nextContext: Record<string, unknown>;
    try {
      assertWorkflowRuntimeValue(run.context, "run-context", WORKFLOW_RUN_CONTEXT_MAX_BYTES);
      executionResult = node.kind === "wait" && claimed.task.taskType === "wait"
        ? {
            output: { dueAt: claimed.task.dueAt.toISOString() },
            sourceOutletId: "default",
            type: "advance" as const,
          }
        : inferenceNode
        ? await this.executeInferenceTask({
            claimedTask: claimed.task,
            input,
            node,
            nodeExecutionKey,
            run,
          })
        : capabilityNode
          ? await executeWithCapabilityTimeout({
            nodeExecutionKey,
            capabilityTimeoutMs: this.capabilityTimeoutMs,
            binding: capabilityBinding,
            node,
            port: this.capabilityPort,
            run,
            startedAt: this.clock(),
          })
          : await this.executors.execute(node, createExecutionContext(
            run,
            input.now,
            claimed.task.createdAt,
          ));
      if (executionResult.type === "event-wait") {
        throw new Error(`Unexpected Wait Event result for ${node.kind}`);
      }
      if (executionResult.type === "inference-wait") return executionResult;
      assertWorkflowRuntimeValue(
        executionResult.output,
        "node-output",
        WORKFLOW_NODE_OUTPUT_MAX_BYTES,
      );
      if (executionResult.type === "wait") {
        const waiting = await this.runtimeRepository.beginFixedWait({
          dueAt: new Date(executionResult.dueAt),
          expectedRunLockVersion: run.lockVersion,
          expectedTaskVersion: claimed.task.taskVersion,
          inbox: createInbox(input.messageId, task.id, input.taskVersion, input.now),
          now: input.now,
          runId: run.id,
          taskId: task.id,
          uid: input.uid,
        });
        if (waiting.kind === "already-processed") throw alreadyProcessedError();
        if (waiting.kind === "workflow-unavailable") {
          throw waiting.action === "defer"
            ? runtimeStatusError("paused")
            : workflowUnavailable();
        }
        if (waiting.kind !== "success") throw staleTaskError();
        return { kind: "waiting" as const, run: waiting.run, task: waiting.task };
      }
      nextContext = appendNodeOutput(run.context, node.id, executionResult.output, {
        enteredAt: claimed.task.createdAt,
        exitedAt: input.now,
      });
      assertWorkflowRuntimeValue(nextContext, "run-context", WORKFLOW_RUN_CONTEXT_MAX_BYTES);
    } catch (error) {
      if (!capabilityNode && error instanceof WorkflowRuntimeValueError) {
        return this.commitCoreNodeFailure({
          nodeExecutionKey,
          error,
          input,
          node,
          run,
          task: claimed.task,
        });
      }
      const capabilityError = capabilityNode ? toCapabilityExecutionError(error) : null;
      if (!capabilityError) throw error;
      const failureInput = {
        errorCode: capabilityError.code.slice(0, 128),
        errorMessage: capabilityError.message.slice(0, 512),
        expectedRunLockVersion: run.lockVersion,
        expectedTaskVersion: claimed.task.taskVersion,
        failureKind: capabilityError.failureKind,
        executionKey: nodeExecutionKey,
        inbox: createInbox(input.messageId, task.id, input.taskVersion, input.now),
        now: input.now,
        runId: run.id,
        taskId: task.id,
        uid: input.uid,
      };
      if (capabilityError.failureKind === "terminal" || claimed.task.attempt >= this.maxTaskAttempts) {
        const failed = await this.runtimeRepository.failCapabilityExecution(failureInput);
        if (failed.kind === "already-processed") throw alreadyProcessedError();
        if (failed.kind !== "success") throw staleTaskError();
        return {
          errorCode: failureInput.errorCode,
          diagnosticMessage: capabilityError.diagnosticMessage.slice(0, 1_024),
          failureKind: failureInput.failureKind,
          kind: "failed" as const,
          run: failed.run,
          task: failed.task,
        };
      }
      const retryDelayMs = Math.min(
        this.capabilityRetryDelayMs * 2 ** Math.max(0, claimed.task.attempt - 1),
        this.capabilityMaxRetryDelayMs,
      );
      const scheduled = await this.runtimeRepository.scheduleCapabilityRetry({
        ...failureInput,
        dueAt: new Date(input.now.getTime() + retryDelayMs),
      });
      if (scheduled.kind === "already-processed") throw alreadyProcessedError();
      if (scheduled.kind !== "success") throw staleTaskError();
      return {
        errorCode: failureInput.errorCode,
        diagnosticMessage: capabilityError.diagnosticMessage.slice(0, 1_024),
        failureKind: failureInput.failureKind,
        kind: "retry-scheduled" as const,
        retryAt: scheduled.task.dueAt,
        task: scheduled.task,
      };
    }
    const commitInput: WorkflowCommitNodeResultInput = {
      context: nextContext,
      expectedRunLockVersion: run.lockVersion,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: {
        ...createInbox(input.messageId, task.id, input.taskVersion, input.now),
      },
      nodeExecution: {
        executionKey: nodeExecutionKey,
        input: createNodeInputSnapshot(run),
        output: executionResult.output,
      },
      runId: run.id,
      ...(executionResult.type === "advance"
        ? { sourceOutletId: executionResult.sourceOutletId }
        : {}),
      taskId: task.id,
      uid: input.uid,
    };
    const committed = await this.runtimeRepository.commitNodeResult(commitInput);
    if (committed.kind === "already-processed") throw alreadyProcessedError();
    if (committed.kind !== "success") throw staleTaskError();
    return committed;
  }

  private async executeInferenceTask(input: {
    claimedTask: WorkflowTaskRecord;
    input: WorkflowExecuteTaskInput;
    node: WorkflowExecutionNode;
    nodeExecutionKey: string;
    run: WorkflowRunRecord;
  }): Promise<
    | { kind: "inference-waiting"; type: "inference-wait" }
    | { output: Record<string, unknown>; sourceOutletId: string; type: "advance" }
  > {
    const existing = await this.runtimeRepository.findInferenceByExecutionKey(
      input.input.uid,
      input.nodeExecutionKey,
    );
    if (existing?.status === "succeeded") {
      if (!existing.result) {
        throw new WorkflowCapabilityExecutionError(
          "terminal",
          "WORKFLOW_INFERENCE_OUTPUT_INVALID",
          "节点返回的数据无法处理，流程已停止",
          { diagnosticMessage: "Succeeded inference job has no result" },
        );
      }
      return {
        ...mapWorkflowInferenceResult(input.node, existing.result),
        type: "advance",
      };
    }
    if (existing?.status === "failed") {
      throw new WorkflowCapabilityExecutionError(
        "terminal",
        existing.errorCode ?? "WORKFLOW_INFERENCE_FAILED",
        existing.errorMessage ?? "推理任务未能完成",
        { diagnosticMessage: existing.errorCode ?? "Workflow inference job failed" },
      );
    }
    if (existing?.status === "cancelled") throw staleTaskError();
    const payload = existing?.payload ?? createWorkflowInferenceRequest(input.node, input.run);
    const waiting = await this.runtimeRepository.beginInference({
      contractVersion: 1,
      deadlineAt: existing?.deadlineAt
        ?? new Date(input.input.now.getTime() + this.inferenceTotalTimeoutMs),
      executionKey: input.nodeExecutionKey,
      expectedRunLockVersion: input.run.lockVersion,
      expectedTaskVersion: input.claimedTask.taskVersion,
      inbox: createInbox(
        input.input.messageId,
        input.claimedTask.id,
        input.input.taskVersion,
        input.input.now,
      ),
      now: input.input.now,
      payload,
      runId: input.run.id,
      taskId: input.claimedTask.id,
      uid: input.input.uid,
    });
    if (waiting.kind === "already-processed") throw alreadyProcessedError();
    if (waiting.kind === "workflow-unavailable") {
      throw waiting.action === "defer"
        ? runtimeStatusError("paused")
        : workflowUnavailable();
    }
    if (waiting.kind !== "success") throw staleTaskError();
    return { kind: "inference-waiting", type: "inference-wait" };
  }

  private async executeWaitEventTask(input: {
    nodeExecutionKey: string;
    claimedTask: WorkflowTaskRecord;
    existingSubscription: WorkflowEventSubscriptionRecord | null;
    input: WorkflowExecuteTaskInput;
    node: WorkflowExecutionNode;
    run: WorkflowRunRecord;
  }) {
    if (!input.existingSubscription) {
      const executionResult = await this.executors.execute(
        input.node,
        createExecutionContext(input.run, input.input.now, input.claimedTask.dueAt),
      );
      if (executionResult.type !== "event-wait") {
        throw new Error(`Wait Event executor returned ${executionResult.type}`);
      }
      const waiting = await this.runtimeRepository.beginEventWait({
        effectiveFrom: input.input.now,
        eventType: executionResult.eventType,
        expectedRunLockVersion: input.run.lockVersion,
        expectedTaskVersion: input.claimedTask.taskVersion,
        expiresAt: new Date(executionResult.expiresAt),
        inbox: createInbox(
          input.input.messageId,
          input.claimedTask.id,
          input.input.taskVersion,
          input.input.now,
        ),
        now: input.input.now,
        runId: input.run.id,
        seatId: getRunSeatId(input.run.context),
        taskId: input.claimedTask.id,
        uid: input.input.uid,
      });
      if (waiting.kind === "already-processed") throw alreadyProcessedError();
      if (waiting.kind === "workflow-unavailable") {
        throw waiting.action === "defer"
          ? runtimeStatusError("paused")
          : workflowUnavailable();
      }
      if (waiting.kind !== "success") throw staleTaskError();
      return {
        kind: "waiting" as const,
        run: waiting.run,
        subscription: waiting.subscription,
        task: waiting.task,
      };
    }

    let collectedEvents: Awaited<ReturnType<WorkflowRuntimeRepository[
      "listEventSubscriptionEvents"
    ]>> | null = null;
    let sourceOutletId: "timeout" | "triggered";
    if (input.existingSubscription.status === "waiting") {
      const timedOut = await this.runtimeRepository.timeoutEventSubscription({
        subscriptionId: input.existingSubscription.id,
        timedOutAt: input.input.now,
        uid: input.input.uid,
      });
      if (timedOut.kind !== "success" && timedOut.kind !== "already-processed") {
        throw staleTaskError();
      }
      sourceOutletId = "timeout";
    } else if (input.existingSubscription.status === "timed_out") {
      sourceOutletId = "timeout";
    } else if (input.existingSubscription.status === "triggered") {
      collectedEvents = await this.runtimeRepository.listEventSubscriptionEvents(
        input.input.uid,
        input.existingSubscription.id,
      );
      sourceOutletId = "triggered";
    } else {
      throw staleTaskError();
    }

    let output: Record<string, unknown>;
    let nextContext: Record<string, unknown>;
    try {
      output = collectedEvents ? aggregateWaitEventOutput(collectedEvents) : {};
      assertWorkflowRuntimeValue(output, "node-output", WORKFLOW_NODE_OUTPUT_MAX_BYTES);
      nextContext = appendNodeOutput(input.run.context, input.node.id, output, {
        enteredAt: input.claimedTask.dueAt,
        exitedAt: input.input.now,
      });
      assertWorkflowRuntimeValue(nextContext, "run-context", WORKFLOW_RUN_CONTEXT_MAX_BYTES);
    } catch (error) {
      if (!(error instanceof WorkflowRuntimeValueError)) throw error;
      return this.commitCoreNodeFailure({
        nodeExecutionKey: input.nodeExecutionKey,
        error,
        input: input.input,
        node: input.node,
        run: input.run,
        task: input.claimedTask,
      });
    }

    const committed = await this.runtimeRepository.commitNodeResult({
      context: nextContext,
      expectedRunLockVersion: input.run.lockVersion,
      expectedTaskVersion: input.claimedTask.taskVersion,
      inbox: createInbox(
        input.input.messageId,
        input.claimedTask.id,
        input.input.taskVersion,
        input.input.now,
      ),
      nodeExecution: {
        executionKey: input.nodeExecutionKey,
        input: createNodeInputSnapshot(input.run),
        output,
      },
      runId: input.run.id,
      sourceOutletId,
      taskId: input.claimedTask.id,
      uid: input.input.uid,
    });
    if (committed.kind === "already-processed") throw alreadyProcessedError();
    if (committed.kind !== "success") throw staleTaskError();
    return committed;
  }

  private async commitCoreNodeFailure(input: {
    nodeExecutionKey: string;
    error: WorkflowRuntimeValueError;
    input: WorkflowExecuteTaskInput;
    node: WorkflowExecutionNode;
    run: WorkflowRunRecord;
    task: WorkflowTaskRecord;
  }) {
    const nodeFailure = toCoreNodeRuntimeFailure(input.error);
    const committed = await this.runtimeRepository.commitNodeResult({
      expectedRunLockVersion: input.run.lockVersion,
      expectedTaskVersion: input.task.taskVersion,
      inbox: createInbox(
        input.input.messageId,
        input.task.id,
        input.input.taskVersion,
        input.input.now,
      ),
      nodeExecution: {
        errorCode: nodeFailure.errorCode,
        errorMessage: nodeFailure.errorMessage,
        executionKey: input.nodeExecutionKey,
        input: createNodeInputSnapshot(input.run),
        output: {},
      },
      runId: input.run.id,
      taskId: input.task.id,
      uid: input.input.uid,
    });
    if (committed.kind === "already-processed") throw alreadyProcessedError();
    if (committed.kind !== "success") throw staleTaskError();
    return {
      ...nodeFailure,
      diagnosticMessage: nodeFailure.diagnosticMessage.slice(0, 1_024),
      kind: "node-failed" as const,
      nodeId: input.node.id,
      nodeKind: input.node.kind,
      run: committed.run,
    };
  }

  private async requireEntitlement(uid: number, workflowType: WorkflowType) {
    try {
      const decision = await decideWorkflowEntitlement(this.entitlementPort, {
        now: this.clock(),
        uid,
        workflowType,
      });
      if (decision.action === "allow") return decision.result;
      await this.controlRepository.applyEntitlementLoss({
        opSubUserId: "0",
        transitionedAt: this.clock(),
        transition: decision.action,
        uid,
        workflowType,
      });
      throw runtimeStatusError(decision.action === "pause" ? "paused" : "stopped");
    } catch (error) {
      if (error instanceof WorkflowEntitlementUnavailableError) {
        throw new WorkflowRuntimeError(
          "WORKFLOW_ENTITLEMENT_UNAVAILABLE",
          "暂时无法确认 Workflow 产品权益",
          503,
        );
      }
      throw error;
    }
  }

  private async deferTaskOrThrowStale(task: { id: string; taskVersion: number; uid: number }, now: Date) {
    const deferred = await this.runtimeRepository.deferTask({
      dueAt: new Date(now.getTime() + this.deferredTaskDelayMs),
      expectedTaskVersion: task.taskVersion,
      taskId: task.id,
      uid: task.uid,
    });
    if (deferred.kind !== "success") throw staleTaskError();
  }
}

function getRunSeatId(context: Record<string, unknown>) {
  const trigger = isRecord(context.trigger) ? context.trigger : null;
  const projection = trigger && isRecord(trigger.projection) ? trigger.projection : null;
  const seatId = projection?.seatId;
  return typeof seatId === "number" && Number.isSafeInteger(seatId) && seatId > 0
    ? seatId
    : null;
}

function createExecutionContext(
  run: WorkflowRunRecord,
  now: Date,
  enteredAt: Date = now,
): WorkflowNodeExecutionContext {
  const trigger = isRecord(run.context.trigger) ? run.context.trigger : {};
  const outputs = isRecord(run.context.outputs)
    ? run.context.outputs as Record<string, Record<string, unknown>>
    : {};
  const nodeLifecycle = isRecord(run.context.nodeLifecycle)
    ? run.context.nodeLifecycle as Record<string, { enteredAt?: string; exitedAt?: string }>
    : {};
  return {
    currentNodeLifecycle: { enteredAt: enteredAt.toISOString() },
    now,
    nodeLifecycle,
    outputs,
    run: {
      id: run.id,
      revision: run.revision,
      sequence: run.sequence,
      subjectId: run.subjectId,
      subjectType: run.subjectType,
      uid: String(run.uid),
    },
    trigger,
  };
}

async function executeWithCapabilityTimeout(input: {
  nodeExecutionKey: string;
  capabilityTimeoutMs: number;
  binding: WorkflowCapabilityExecutionBinding | undefined;
  node: WorkflowExecutionNode;
  port: WorkflowCapabilityPort | undefined;
  run: WorkflowRunRecord;
  startedAt: Date;
}) {
  if (!input.binding) {
    throw new WorkflowCapabilityExecutionError(
      "terminal",
      "WORKFLOW_CAPABILITY_BINDING_UNAVAILABLE",
      "节点能力暂不可用",
      { diagnosticMessage: `Workflow capability binding is not configured for ${input.node.kind}` },
    );
  }
  if (!input.port) {
    throw new WorkflowCapabilityExecutionError(
      "terminal",
      "WORKFLOW_CAPABILITY_PORT_UNAVAILABLE",
      "节点能力暂不可用",
      { diagnosticMessage: "Workflow capability port is not configured" },
    );
  }
  const controller = new AbortController();
  const deadlineAt = new Date(input.startedAt.getTime() + input.capabilityTimeoutMs);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new WorkflowCapabilityExecutionError(
        "unknown",
        "WORKFLOW_CAPABILITY_TIMEOUT",
        "节点执行超时",
        { diagnosticMessage: `Workflow capability exceeded its ${input.capabilityTimeoutMs}ms deadline` },
      );
      reject(error);
      controller.abort(error);
    }, input.capabilityTimeoutMs);
  });
  try {
    return await Promise.race([
      executeWorkflowCapability({
        binding: input.binding,
        commandContext: {
          outputs: isRecord(input.run.context.outputs)
            ? input.run.context.outputs as Record<string, Record<string, unknown>>
            : {},
          subjectId: input.run.subjectId,
          trigger: isRecord(input.run.context.trigger) ? input.run.context.trigger : {},
        },
        config: input.node.config,
        deadlineAt,
        execution: {
          nodeId: input.node.id,
          revision: input.run.revision,
          runId: input.run.id,
          sequence: input.run.sequence,
          workflowId: input.run.workflowId,
        },
        executionKey: input.nodeExecutionKey,
        port: input.port,
        signal: controller.signal,
        subjectId: input.run.subjectId,
        subjectType: input.run.subjectType,
        uid: input.run.uid,
      }).then(output => ({ output, sourceOutletId: "default", type: "advance" as const })),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function toCapabilityExecutionError(error: unknown) {
  if (error instanceof WorkflowCapabilityExecutionError) return error;
  if (!(error instanceof WorkflowRuntimeValueError)) return null;
  const safeMessage = "节点返回的数据无法处理，流程已停止";
  if (error.scope === "node-output" && error.reason === "invalid") {
    return new WorkflowCapabilityExecutionError(
      "terminal",
      "WORKFLOW_CAPABILITY_OUTPUT_INVALID",
      safeMessage,
      { diagnosticMessage: "Workflow capability returned a non-JSON output" },
    );
  }
  const code = error.scope === "node-output"
    ? "WORKFLOW_CAPABILITY_OUTPUT_TOO_LARGE"
    : error.reason === "invalid"
      ? "WORKFLOW_CONTEXT_INVALID"
      : "WORKFLOW_CONTEXT_TOO_LARGE";
  return new WorkflowCapabilityExecutionError(
    "terminal",
    code,
    safeMessage,
    {
      diagnosticMessage: formatRuntimeValueDiagnostic(error),
    },
  );
}

function createCapabilityBindingMap(
  bindings: readonly WorkflowCapabilityExecutionBinding[],
) {
  const result = new Map<WorkflowNodeKind, WorkflowCapabilityExecutionBinding>();
  for (const binding of bindings) {
    const executionClass = getWorkflowNodeContract(binding.nodeKind).executionClass;
    if (executionClass !== binding.definition.kind) {
      throw new Error(
        `Workflow capability binding kind does not match node execution class: ${binding.nodeKind}`,
      );
    }
    if (result.has(binding.nodeKind)) {
      throw new Error(`Duplicate Workflow capability binding: ${binding.nodeKind}`);
    }
    result.set(binding.nodeKind, binding);
  }
  return result;
}

function toCoreNodeRuntimeFailure(error: WorkflowRuntimeValueError) {
  const errorCode = error.scope === "node-output"
    ? error.reason === "invalid"
      ? "WORKFLOW_NODE_OUTPUT_INVALID"
      : "WORKFLOW_NODE_OUTPUT_TOO_LARGE"
    : error.reason === "invalid"
      ? "WORKFLOW_CONTEXT_INVALID"
      : "WORKFLOW_CONTEXT_TOO_LARGE";
  return {
    diagnosticMessage: formatRuntimeValueDiagnostic(error),
    errorCode,
    errorMessage: "节点运行数据无法处理，流程已停止",
  };
}

function formatRuntimeValueDiagnostic(error: WorkflowRuntimeValueError) {
  const valueDescription = error.actualBytes === null
    ? "invalid"
    : `${error.actualBytes} bytes`;
  return `Workflow ${error.scope} was ${valueDescription}; limit is ${error.limitBytes} bytes`;
}

function createInbox(messageId: string | undefined, taskId: string, taskVersion: number, now: Date) {
  return {
    consumer: "workflow-task",
    expiresAt: new Date(now.getTime() + WORKFLOW_INBOX_RETENTION_DAYS * 86_400_000),
    messageId: messageId ?? `task:${taskId}:v${taskVersion}`,
  };
}

function appendNodeOutput(
  context: Record<string, unknown>,
  nodeId: string,
  output: Record<string, unknown>,
  lifecycle: { enteredAt: Date; exitedAt: Date },
) {
  const existingOutputs = isRecord(context.outputs) ? context.outputs : {};
  const existingLifecycle = isRecord(context.nodeLifecycle) ? context.nodeLifecycle : {};
  return {
    ...structuredClone(context),
    outputs: {
      ...structuredClone(existingOutputs),
      [nodeId]: structuredClone(output),
    },
    nodeLifecycle: {
      ...structuredClone(existingLifecycle),
      [nodeId]: {
        enteredAt: lifecycle.enteredAt.toISOString(),
        exitedAt: lifecycle.exitedAt.toISOString(),
      },
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
  if (node.kind !== "start") {
    throw new WorkflowRuntimeError("WORKFLOW_START_CONFIG_INVALID", "Workflow Start 配置无效", 500);
  }
  const normalizedConfig = {
    ...node.config,
    entryPolicy: normalizeWorkflowEntryPolicy(node.config.entryPolicy),
  };
  if (!Value.Check(WorkflowStartConfigSchema, normalizedConfig)) {
    throw new WorkflowRuntimeError("WORKFLOW_START_CONFIG_INVALID", "Workflow Start 配置无效", 500);
  }
  return structuredClone(normalizedConfig) as WorkflowStartConfig;
}

function requireWaitEventConfig(node: WorkflowExecutionNode): WorkflowWaitEventConfig {
  if (node.kind !== "wait-event" || !Value.Check(WorkflowWaitEventConfigSchema, node.config)) {
    throw new WorkflowRuntimeError(
      "WORKFLOW_WAIT_EVENT_CONFIG_INVALID",
      "Workflow Wait Event 配置无效",
      500,
    );
  }
  return structuredClone(node.config) as WorkflowWaitEventConfig;
}

function aggregateWaitEventOutput(
  events: Awaited<ReturnType<WorkflowRuntimeRepository["listEventSubscriptionEvents"]>>,
) {
  if (events.length === 0) throw invalidWaitEventOutput();
  const messageIds: number[] = [];
  const textParts: string[] = [];
  let lastMessageAt = events[0]!.occurredAt;
  for (const event of events) {
    const messageId = event.projection.messageId;
    if (typeof messageId !== "number" || !Number.isSafeInteger(messageId) || messageId <= 0) {
      throw invalidWaitEventOutput();
    }
    messageIds.push(messageId);
    if (typeof event.projection.text === "string" && event.projection.text.length > 0) {
      textParts.push(event.projection.text);
    }
    if (event.occurredAt > lastMessageAt) lastMessageAt = event.occurredAt;
  }
  return {
    lastMessageAt: lastMessageAt.toISOString(),
    messageCount: events.length,
    messageIds,
    textContent: textParts.join("\n"),
  };
}

function invalidWaitEventOutput() {
  return new WorkflowRuntimeValueError(
    "invalid",
    "node-output",
    null,
    WORKFLOW_NODE_OUTPUT_MAX_BYTES,
  );
}

function parseOccurredAt(trigger: Record<string, unknown>) {
  const value = trigger.occurredAt;
  const parsed = typeof value === "string" ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function getWorkflowShardId(
  uid: number,
  subjectType: WorkflowSubjectType,
  subjectId: string,
) {
  let hash = 2166136261;
  const value = `${uid}:${subjectType}:${subjectId}`;
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

function deploymentCapabilityDisabledError() {
  return new WorkflowRuntimeError(
    "WORKFLOW_DEPLOYMENT_CAPABILITY_DISABLED",
    "Workflow 依赖的部署能力未开启",
    503,
  );
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
