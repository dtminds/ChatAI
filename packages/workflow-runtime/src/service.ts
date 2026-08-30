import type {
  WorkflowAiCollectExecutionConfig,
  WorkflowEntryEventType,
  WorkflowDirectEntryPayload,
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
  WorkflowMessageSchema,
  WORKFLOW_DIRECT_ENTRY_EVENT_TYPE,
  isWorkflowAiCollectExecutionConfigComplete,
} from "@chatai/contracts";
import {
  createCoreNodeExecutorRegistry,
  createWorkflowNodeExecutionKey,
  isWorkflowRuntimeSupportedNodeKind,
  WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS,
  WorkflowCapabilityExecutionError,
  WorkflowNodeExecutionError,
  type WorkflowNodeExecutorRegistry,
  type WorkflowNodeExecutionContext,
} from "@chatai/workflow-engine";
import {
  executeWorkflowCapabilityStep,
  type WorkflowCapabilityExecutionBinding,
  type WorkflowCapabilityPort,
} from "./capability-port.js";
import {
  createWorkflowChatAiRunContext,
  getNextWorkflowMessageExecutionAt,
} from "./chatai-action-context.js";
import { readWorkflowTriggerSeatId } from "./context-readers.js";
import {
  decideWorkflowEntitlement,
  UnavailableWorkflowEntitlementPort,
  WorkflowEntitlementUnavailableError,
  type WorkflowEntitlementPort,
} from "./entitlement.js";
import {
  deriveWorkflowExecutionContextRequirements,
  prepareWorkflowExecutionContext,
  type WorkflowContactIdentityPort,
  type WorkflowPreparedExecutionContext,
} from "./execution-context-prepare.js";
import { WorkflowRuntimeError } from "./errors.js";
import {
  isWorkflowTaskDeferReasonCode,
  type WorkflowTaskDeferReasonCode,
} from "./task-deferral.js";
import {
  assertWorkflowRuntimeValue,
  WORKFLOW_NODE_OUTPUT_MAX_BYTES,
  WORKFLOW_RUN_CONTEXT_MAX_BYTES,
  WorkflowRuntimeValueError,
} from "./runtime-value-limits.js";
import {
  createWorkflowAiCollectInferenceRequest,
  createWorkflowInferenceRequest,
  hasWorkflowInferenceInput,
  mapWorkflowAiCollectInferenceResult,
  mapWorkflowInferenceResult,
  resolveWorkflowAiCollectInput,
  resolveWorkflowInferenceWithoutProvider,
} from "./inference.js";
import {
  createWorkflowAiCollectBizId,
  getWorkflowAiCollectTimeoutAt,
  isWorkflowAiCollectComplete,
  renderWorkflowAiCollectDirective,
  WORKFLOW_AI_COLLECT_DIRECTIVE_TYPE,
  WORKFLOW_AI_COLLECT_QUIET_PERIOD_MS,
  type WorkflowAiCollectConversationPort,
  type WorkflowConversationDirectivePort,
} from "./ai-collect.js";
import {
  executeWorkflowMessageQuery,
  type WorkflowMessageQueryPort,
} from "./message-query.js";
import { fitWorkflowMessageOutput } from "./workflow-messages.js";
import type {
  WorkflowCommitNodeResultInput,
  WorkflowAiCollectStateRecord,
  WorkflowEventSubscriptionRecord,
  WorkflowRuntimeControlReader,
  WorkflowRuntimeRevisionRecord,
  WorkflowRuntimeSnapshotKey,
  WorkflowRuntimeSnapshotRecord,
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
  private readonly entitlementPort: WorkflowEntitlementPort;
  private readonly contactIdentityPort?: WorkflowContactIdentityPort;
  private readonly capabilityBindings: Map<WorkflowNodeKind, WorkflowCapabilityExecutionBinding>;
  private readonly messageQueryPort?: WorkflowMessageQueryPort;
  private readonly aiCollectConversationPort?: WorkflowAiCollectConversationPort;
  private readonly conversationDirectivePort?: WorkflowConversationDirectivePort;

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
      contactIdentityPort?: WorkflowContactIdentityPort;
      deferredTaskDelayMs?: number;
      inferenceTotalTimeoutMs?: number;
      entitlementPort?: WorkflowEntitlementPort;
      executors?: WorkflowNodeExecutorRegistry;
      maxTaskAttempts?: number;
      messageQueryPort?: WorkflowMessageQueryPort;
      aiCollectConversationPort?: WorkflowAiCollectConversationPort;
      conversationDirectivePort?: WorkflowConversationDirectivePort;
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
    this.entitlementPort = options.entitlementPort
      ?? new UnavailableWorkflowEntitlementPort();
    this.contactIdentityPort = options.contactIdentityPort;
    this.capabilityBindings = createCapabilityBindingMap(options.capabilityBindings ?? []);
    this.messageQueryPort = options.messageQueryPort;
    this.aiCollectConversationPort = options.aiCollectConversationPort;
    this.conversationDirectivePort = options.conversationDirectivePort;
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

  assertRuntimeComposition() {
    const missingNodeKinds = WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS.filter((kind) => {
      if (kind === "message-query") return this.messageQueryPort === undefined;
      if (kind === "ai-collect") {
        return this.aiCollectConversationPort === undefined
          || this.conversationDirectivePort === undefined;
      }
      const executionClass: string = getWorkflowNodeContract(kind).executionClass;
      if (executionClass === "core") return !this.executors.has(kind);
      if (executionClass === "inference") return false;
      return this.capabilityPort === undefined || !this.capabilityBindings.has(kind);
    });
    if (missingNodeKinds.length > 0) {
      throw new Error(
        `Workflow runtime-ready nodes lack production executors: ${missingNodeKinds.join(", ")}`,
      );
    }
  }

  protected assertNodeExecutable(node: WorkflowExecutionNode) {
    if (isWorkflowRuntimeSupportedNodeKind(node.kind)) return;
    throw runtimeNodeUnsupportedError();
  }

  async loadRuntimeSnapshots(input: {
    keys: readonly WorkflowRuntimeSnapshotKey[];
    uid: number;
  }) {
    return this.controlRepository.findRuntimeSnapshots(input.uid, input.keys);
  }

  recordAiCollectDirectiveEvent(input: {
    bizId: string;
    eventId: string;
    eventOccurredAt: Date;
    now: Date;
    seatId: number;
    thirdExternalUserId: string;
    totalRound: number;
    uid: number;
  }) {
    return this.runtimeRepository.recordAiCollectDirectiveEvent({
      ...input,
      inboxExpiresAt: new Date(
        input.now.getTime() + WORKFLOW_INBOX_RETENTION_DAYS * 86_400_000,
      ),
      quietUntil: new Date(input.now.getTime() + WORKFLOW_AI_COLLECT_QUIET_PERIOD_MS),
    });
  }

  private assertSpecExecutable(spec: WorkflowExecutionSpec) {
    for (const node of spec.nodes) this.assertNodeExecutable(node);
  }

  async startRun(input: {
    entryEventId: string;
    expectedRevision: number;
    subjectId: string;
    subjectType: WorkflowSubjectType;
    trigger: Record<string, unknown>;
    uid: number;
    workflowId: string;
    runtimeSnapshot?: WorkflowRuntimeSnapshotRecord | null;
  }) {
    let snapshot = input.runtimeSnapshot;
    if (snapshot === undefined) {
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
      if (!revision) {
        throw new WorkflowRuntimeError("WORKFLOW_REVISION_NOT_FOUND", "Workflow Revision 不存在", 404);
      }
      snapshot = { definition, revision, uid: input.uid, workflowId: input.workflowId };
    }
    if (!snapshot) throw workflowUnavailable();
    if (snapshot.uid !== input.uid
      || snapshot.workflowId !== input.workflowId
      || snapshot.revision.revision !== input.expectedRevision) {
      throw staleDefinitionError();
    }
    const { definition, revision } = snapshot;
    if (definition.runtimeStatus !== "active" || definition.publishedRevision === null) {
      throw runtimeStatusError(definition.runtimeStatus);
    }
    if (definition.publishedRevision !== input.expectedRevision) throw staleDefinitionError();
    if (revision.workflowType !== definition.workflowType
      || revision.subjectType !== input.subjectType) {
      throw staleDefinitionError();
    }
    const entryNode = requireExecutionNode(revision.executionSpec, revision.executionSpec.entryNodeId);
    const startConfig = requireStartConfig(entryNode);
    return this.createInitialRun({
      ...input,
      revision,
      startConfig,
    });
  }

  async startDirectRun(input: {
    entryEventId: string;
    expectedRevision: number;
    occurredAt: string;
    payload: WorkflowDirectEntryPayload;
    payloadVersion: number;
    source: string;
    uid: number;
  }) {
    const definition = await this.controlRepository.findDefinition(input.uid, input.payload.workflowId);
    if (!definition) throw workflowUnavailable();
    if (definition.runtimeStatus !== "active" || definition.publishedRevision === null) {
      throw runtimeStatusError(definition.runtimeStatus);
    }
    if (definition.publishedRevision !== input.expectedRevision) throw staleDefinitionError();
    const revision = await this.controlRepository.findRevision(
      input.uid,
      input.payload.workflowId,
      input.expectedRevision,
    );
    if (!revision || revision.workflowType !== definition.workflowType) {
      throw staleDefinitionError();
    }
    const entryNode = requireExecutionNode(revision.executionSpec, revision.executionSpec.entryNodeId);
    const startConfig = requireStartConfig(entryNode);
    if (startConfig.entryMode !== "direct-push") throw directEntryUnavailableError();
    const subject = resolveDirectEntrySubject(revision.subjectType, startConfig, input.payload);
    const { workflowId, ...projection } = input.payload;
    return this.createInitialRun({
      entryEventId: input.entryEventId,
      revision,
      startConfig,
      subjectId: subject.subjectId,
      subjectType: revision.subjectType,
      trigger: {
        eventId: input.entryEventId,
        eventType: WORKFLOW_DIRECT_ENTRY_EVENT_TYPE,
        occurredAt: input.occurredAt,
        payloadVersion: input.payloadVersion,
        projection: structuredClone(projection),
        source: input.source,
      },
      uid: input.uid,
      workflowId,
    });
  }

  private async createInitialRun(input: {
    entryEventId: string;
    revision: WorkflowRuntimeRevisionRecord;
    startConfig: WorkflowStartConfig;
    subjectId: string;
    subjectType: WorkflowSubjectType;
    trigger: Record<string, unknown>;
    uid: number;
    workflowId: string;
  }) {
    const { revision, startConfig } = input;
    const entitlement = await this.requireEntitlement(
      input.uid,
      input.workflowId,
      revision.workflowType,
    );
    this.assertSpecExecutable(revision.executionSpec);
    const entryNode = requireExecutionNode(revision.executionSpec, revision.executionSpec.entryNodeId);

    let context: Record<string, unknown>;
    try {
      context = {
        outputs: {},
        trigger: structuredClone(input.trigger),
        workflow: createWorkflowChatAiRunContext(startConfig),
      };
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
      activeRunLimit: entitlement.activeRunLimit,
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
    if (created.kind === "capacity-rejected"
      || created.kind === "entry-policy-rejected"
      || created.kind === "active-run-rejected") {
      return created;
    }
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
    runtimeSnapshot?: WorkflowRuntimeSnapshotRecord | null;
  }) {
    if (input.subscription.uid !== input.uid
      || input.subscription.eventType !== input.eventType
      || input.subscription.subjectId !== input.subjectId
      || input.subscription.subjectType !== input.subjectType) {
      throw staleDefinitionError();
    }
    let snapshot = input.runtimeSnapshot;
    if (snapshot === undefined) {
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
      snapshot = revision
        ? { definition, revision, uid: input.uid, workflowId: input.subscription.workflowId }
        : null;
    }
    if (!snapshot
      || snapshot.uid !== input.uid
      || snapshot.workflowId !== input.subscription.workflowId
      || snapshot.revision.revision !== input.subscription.revision) {
      throw staleDefinitionError();
    }
    const { definition, revision } = snapshot;
    if (revision.workflowType !== definition.workflowType
      || revision.subjectType !== input.subscription.subjectType) {
      throw staleDefinitionError();
    }
    const node = requireExecutionNode(revision.executionSpec, input.subscription.nodeId);
    this.assertNodeExecutable(node);
    const config = requireWaitEventConfig(node);
    if (config.event.type !== input.eventType
      || (input.subscription.seatId !== null
        && input.match.seatId !== input.subscription.seatId)) {
      return { kind: "not-matched" as const };
    }
    const message = input.projection.message;
    if (!Value.Check(WorkflowMessageSchema, message)) throw staleDefinitionError();
    const delayedUntil = new Date(
      input.eventOccurredAt.getTime() + getWaitEventDelayMilliseconds(config),
    );
    const resumeAt = delayedUntil > input.recordedAt ? delayedUntil : input.recordedAt;
    const recorded = await this.runtimeRepository.triggerEventSubscription({
      eventId: input.eventId,
      eventOccurredAt: input.eventOccurredAt,
      projection: { message: structuredClone(message) },
      recordedAt: input.recordedAt,
      resumeAt,
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
      await this.requireEntitlement(input.uid, run.workflowId, revision.workflowType);
      this.assertNodeExecutable(node);
    } catch (error) {
      if (error instanceof WorkflowRuntimeError
        && isWorkflowTaskDeferReasonCode(error.code)) {
        await this.deferTaskOrThrowStale(task, input.now, error.code);
      }
      throw error;
    }
    if (node.kind === "message" && isRecord(run.context.workflow)) {
      const nextExecutionAt = getNextWorkflowMessageExecutionAt(
        run.context.workflow,
        input.now,
      );
      if (nextExecutionAt) {
        await this.deferTaskUntilOrThrowStale(
          task,
          nextExecutionAt,
          "WORKFLOW_MESSAGE_SENDING_WINDOW_DEFERRED",
        );
        throw new WorkflowRuntimeError(
          "WORKFLOW_MESSAGE_SENDING_WINDOW_DEFERRED",
          "消息发送时间未到",
          409,
        );
      }
    }
    const executionClass = getWorkflowNodeContract(node.kind).executionClass;
    const compositeNode = executionClass === "composite";
    const capabilityNode = executionClass === "action"
      || executionClass === "inference"
      || executionClass === "query";
    const inferenceNode = executionClass === "inference";
    const capabilityBinding = this.capabilityBindings.get(node.kind);
    const contextRequirements = deriveWorkflowExecutionContextRequirements(node);
    const requiresPreparedExecution = capabilityNode
      || compositeNode
      || contextRequirements.globalContext
      || contextRequirements.identities.length > 0;
    const capabilityTimeoutMs = capabilityBinding?.executionTimeoutMs
      ?? this.capabilityTimeoutMs;
    const taskLeaseDurationMs = capabilityBinding?.executionTimeoutMs === undefined
      ? this.taskLeaseDurationMs
      : Math.max(this.taskLeaseDurationMs, capabilityTimeoutMs * 2);
    const claimed = await this.runtimeRepository.claimTask({
      expectedTaskVersion: input.taskVersion,
      leaseExpiresAt: new Date(input.now.getTime() + taskLeaseDurationMs),
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
    if (requiresPreparedExecution) {
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
      let preparedContext: WorkflowPreparedExecutionContext = { identities: {} };
      if (contextRequirements.identities.length > 0) {
        preparedContext = await prepareWorkflowExecutionContext({
          contactIdentityPort: this.contactIdentityPort,
          node,
          subjectId: run.subjectId,
          subjectType: run.subjectType,
          trigger: isRecord(run.context.trigger) ? run.context.trigger : {},
          uid: run.uid,
        });
      }
      executionResult = node.kind === "wait" && claimed.task.taskType === "wait"
        ? {
            output: { dueAt: claimed.task.dueAt.toISOString() },
            sourceOutletId: "default",
            type: "advance" as const,
          }
        : compositeNode
          ? await this.executeAiCollectTask({
              claimedTask: claimed.task,
              input,
              node,
              nodeExecutionKey,
              preparedContext,
              run,
            })
        : inferenceNode
        ? await this.executeInferenceTask({
            claimedTask: claimed.task,
            input,
            node,
            nodeExecutionKey,
            run,
          })
        : node.kind === "message-query"
          ? await executeMessageQueryWithTimeout({
              capabilityTimeoutMs: this.capabilityTimeoutMs,
              enteredAt: claimed.task.createdAt,
              node,
              port: this.messageQueryPort,
              preparedContext,
              run,
              startedAt: this.clock(),
            })
        : capabilityNode
          ? await executeWithCapabilityTimeout({
            nodeExecutionKey,
            capabilityTimeoutMs,
            binding: capabilityBinding,
            enteredAt: claimed.task.createdAt,
            node,
            port: this.capabilityPort,
            preparedContext,
            run,
            startedAt: this.clock(),
          })
          : await this.executors.execute(node, createExecutionContext(
            run,
            input.now,
            claimed.task.createdAt,
            preparedContext,
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
          throw workflowUnavailable();
        }
        if (waiting.kind !== "success") throw staleTaskError();
        return { kind: "waiting" as const, run: waiting.run, task: waiting.task };
      }
      const completedAt = this.clock();
      nextContext = appendNodeOutput(run.context, node.id, executionResult.output, {
        enteredAt: claimed.task.createdAt,
        exitedAt: completedAt,
      });
      assertWorkflowRuntimeValue(nextContext, "run-context", WORKFLOW_RUN_CONTEXT_MAX_BYTES);
    } catch (error) {
      if (!requiresPreparedExecution && isCoreNodeExecutionFailure(error)) {
        return this.commitCoreNodeFailure({
          nodeExecutionKey,
          error,
          input,
          node,
          run,
          task: claimed.task,
        });
      }
      const capabilityError = requiresPreparedExecution ? toCapabilityExecutionError(error) : null;
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
        ...(executionResult.type === "advance"
          && getWorkflowNodeContract(node.kind).recordSourceOutlet
          ? { sourceOutletId: executionResult.sourceOutletId }
          : {}),
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

  private async executeAiCollectTask(input: {
    claimedTask: WorkflowTaskRecord;
    input: WorkflowExecuteTaskInput;
    node: WorkflowExecutionNode;
    nodeExecutionKey: string;
    preparedContext: WorkflowPreparedExecutionContext;
    run: WorkflowRunRecord;
  }): Promise<
    | { kind: "inference-waiting"; type: "inference-wait" }
    | { output: Record<string, unknown>; sourceOutletId: string; type: "advance" }
  > {
    if (input.node.kind !== "ai-collect"
      || !isWorkflowAiCollectExecutionConfigComplete(input.node.config)) {
      throw new WorkflowCapabilityExecutionError(
        "terminal",
        "WORKFLOW_AI_COLLECT_CONFIG_INVALID",
        "资料收集配置不可用，流程已停止",
      );
    }
    const config = input.node.config as WorkflowAiCollectExecutionConfig;
    const conversationPort = this.aiCollectConversationPort;
    const directivePort = this.conversationDirectivePort;
    if (!conversationPort || !directivePort) {
      throw new WorkflowCapabilityExecutionError(
        "terminal",
        "WORKFLOW_AI_COLLECT_PORT_UNAVAILABLE",
        "资料收集服务不可用，流程已停止",
      );
    }
    const seatId = getRunSeatId(input.run.context);
    const thirdExternalUserId = input.preparedContext.identities.thirdExternalUserId;
    if (seatId === null || !thirdExternalUserId) {
      throw new WorkflowCapabilityExecutionError(
        "terminal",
        "WORKFLOW_AI_COLLECT_CONTEXT_INVALID",
        "执行所需数据不可用，流程已停止",
      );
    }
    let state = await this.runtimeRepository.initializeAiCollectState({
      bizId: createWorkflowAiCollectBizId(input.claimedTask.id),
      expiresAt: getWorkflowAiCollectTimeoutAt(input.node, input.claimedTask.createdAt),
      initialMessageCursor: {
        id: 1,
        timestamp: Math.max(0, input.claimedTask.createdAt.getTime() - 1),
      },
      now: input.input.now,
      runId: input.run.id,
      seatId,
      taskId: input.claimedTask.id,
      thirdExternalUserId,
      uid: input.input.uid,
      workflowId: input.run.workflowId,
    });

    while (true) {
      if (state.terminalOutlet !== null) {
        return this.finishAiCollectTask(state, directivePort);
      }

      if (state.activeInferenceKey !== null) {
        const inference = await this.runtimeRepository.findInferenceByExecutionKey(
          state.uid,
          state.activeInferenceKey,
        );
        if (!inference) {
          throw new WorkflowCapabilityExecutionError(
            "unknown",
            "WORKFLOW_AI_COLLECT_INFERENCE_STATE_MISSING",
            "资料提取暂未完成",
          );
        }
        if (inference.status === "succeeded") {
          if (!inference.result) {
            throw new WorkflowCapabilityExecutionError(
              "terminal",
              "WORKFLOW_INFERENCE_OUTPUT_INVALID",
              "返回结果异常，流程已停止",
            );
          }
          const completedBatchCutoffAt = state.activeBatchCutoffAt;
          const completedBatchHasMore = state.activeBatchHasMore;
          const completedAt = this.clock();
          const collected = mapWorkflowAiCollectInferenceResult(
            input.node,
            inference.result,
            state.collected,
          );
          state = await this.transitionAiCollectStateOrThrow({
            now: completedAt,
            taskId: state.taskId,
            transition: {
              collected,
              executionKey: state.activeInferenceKey,
              kind: "inference-completed",
            },
            uid: state.uid,
          });
          if (!isWorkflowAiCollectComplete(input.node, state.collected)
            && completedBatchCutoffAt !== null
            && !completedBatchHasMore
            && state.pendingCutoffAt === null
            && state.expiresAt !== null
            && (completedAt >= state.expiresAt
              || state.observedRound >= config.maxFollowUpCount)) {
            state = await this.transitionAiCollectStateOrThrow({
              now: completedAt,
              taskId: state.taskId,
              transition: {
                disableReason: completedAt >= state.expiresAt ? "expired" : "round-limit-reached",
                kind: "terminal",
                outlet: "incomplete",
              },
              uid: state.uid,
            });
          }
          continue;
        }
        if (inference.status === "failed") {
          await this.transitionAiCollectStateOrThrow({
            now: this.clock(),
            taskId: state.taskId,
            transition: { kind: "disable-requested", reason: "workflow-failed" },
            uid: state.uid,
          });
          throw new WorkflowCapabilityExecutionError(
            inference.failureKind ?? "unknown",
            inference.errorCode ?? "WORKFLOW_AI_COLLECT_INFERENCE_FAILED",
            inference.errorMessage ?? "资料提取未完成",
          );
        }
        if (inference.status === "cancelled") throw staleTaskError();
        const waiting = await this.runtimeRepository.beginInference({
          contractVersion: inference.contractVersion,
          deadlineAt: inference.deadlineAt,
          executionKey: inference.executionKey,
          expectedRunLockVersion: input.run.lockVersion,
          expectedTaskVersion: input.claimedTask.taskVersion,
          inbox: createInbox(
            input.input.messageId,
            input.claimedTask.id,
            input.input.taskVersion,
            input.input.now,
          ),
          now: input.input.now,
          payload: inference.payload,
          runId: input.run.id,
          taskId: input.claimedTask.id,
          uid: input.input.uid,
        });
        if (waiting.kind === "already-processed") throw alreadyProcessedError();
        if (waiting.kind === "workflow-unavailable") throw workflowUnavailable();
        if (waiting.kind !== "success") throw staleTaskError();
        return { kind: "inference-waiting", type: "inference-wait" };
      }

      if (isWorkflowAiCollectComplete(input.node, state.collected)) {
        state = await this.transitionAiCollectStateOrThrow({
          now: this.clock(),
          taskId: state.taskId,
          transition: { disableReason: "completed", kind: "terminal", outlet: "completed" },
          uid: state.uid,
        });
        continue;
      }

      if (!state.initialInputProcessed) {
        const initialInput = resolveWorkflowAiCollectInput(
          input.node,
          input.run,
          { enteredAt: input.claimedTask.createdAt.toISOString() },
        );
        if (hasWorkflowInferenceInput(initialInput)) {
          const started = await this.startAiCollectInference({
            batchCursor: null,
            batchCutoffAt: null,
            batchHasMore: false,
            claimedTask: input.claimedTask,
            input: input.input,
            node: input.node,
            nodeExecutionKey: input.nodeExecutionKey,
            payloadInput: initialInput,
            run: input.run,
            state,
          });
          if (started.kind === "waiting") {
            return { kind: "inference-waiting", type: "inference-wait" };
          }
          state = started.state;
          continue;
        }
        state = await this.transitionAiCollectStateOrThrow({
          now: this.clock(),
          taskId: state.taskId,
          transition: { kind: "initial-input-processed" },
          uid: state.uid,
        });
        continue;
      }

      if (config.maxFollowUpCount > 0) {
        if (state.expiresAt === null) throw new Error("AI Collect assisted state has no expiry");
        if (this.clock() < state.expiresAt) {
          if (state.conversationId === null) {
            const conversation = await executeAiCollectOperation(
              this.capabilityTimeoutMs,
              () => conversationPort.resolveConversation({
                seatId,
                thirdExternalUserId,
                uid: state.uid,
              }),
            );
            state = await this.transitionAiCollectStateOrThrow({
              now: this.clock(),
              taskId: state.taskId,
              transition: { conversationId: conversation.conversationId, kind: "conversation-resolved" },
              uid: state.uid,
            });
            continue;
          }
          if (state.directiveStatus === "inactive") {
            await executeAiCollectOperation(this.capabilityTimeoutMs, signal => directivePort.activate({
              bizId: state.bizId,
              bizInfo: "",
              conversationId: state.conversationId!,
              expiresAt: state.expiresAt!,
              limitRound: config.maxFollowUpCount,
              payload: renderWorkflowAiCollectDirective(input.node, state.collected),
              priority: 0,
              signal,
              type: WORKFLOW_AI_COLLECT_DIRECTIVE_TYPE,
              uid: state.uid,
            }));
            state = await this.transitionAiCollectStateOrThrow({
              now: this.clock(),
              taskId: state.taskId,
              transition: { kind: "directive-active" },
              uid: state.uid,
            });
            continue;
          }
        }
      }

      const openingMessage = config.openingMessage;
      const canSendOpeningMessage = config.maxFollowUpCount === 0
        || state.directiveStatus === "active";
      if (openingMessage && canSendOpeningMessage && !state.openingMessageSent) {
        await executeAiCollectOperation(this.capabilityTimeoutMs, signal =>
          conversationPort.sendOpeningMessage({
            idempotencyKey: `${input.nodeExecutionKey}:opening`,
            message: openingMessage,
            seatId,
            signal,
            thirdExternalUserId,
            uid: input.input.uid,
          }));
        state = await this.transitionAiCollectStateOrThrow({
          now: this.clock(),
          taskId: state.taskId,
          transition: { kind: "opening-message-sent" },
          uid: state.uid,
        });
        continue;
      }

      if (config.maxFollowUpCount === 0) {
        state = await this.transitionAiCollectStateOrThrow({
          now: this.clock(),
          taskId: state.taskId,
          transition: { disableReason: "incomplete", kind: "terminal", outlet: "incomplete" },
          uid: state.uid,
        });
        continue;
      }

      const now = this.clock();
      if (state.expiresAt === null) throw new Error("AI Collect assisted state has no expiry");
      const expiresAt = state.expiresAt;

      const settling = now >= expiresAt
        || state.observedRound >= config.maxFollowUpCount;
      const queryCutoff = now >= expiresAt
        ? expiresAt
        : state.pendingCutoffAt;
      const quietElapsed = state.quietUntil === null || state.quietUntil <= now;
      if (queryCutoff && (settling || quietElapsed)) {
        const batch = await executeAiCollectOperation(
          this.capabilityTimeoutMs,
          () => conversationPort.readCustomerMessages({
            after: state.lastMessageCursor,
            seatId,
            thirdExternalUserId,
            uid: state.uid,
            until: queryCutoff,
          }),
        );
        if (batch.messages.length > 0) {
          if (!batch.cursor) throw new Error("AI Collect message batch has no cursor");
          const started = await this.startAiCollectInference({
            batchCursor: batch.cursor,
            batchCutoffAt: queryCutoff,
            batchHasMore: batch.hasMore,
            claimedTask: input.claimedTask,
            input: input.input,
            node: input.node,
            nodeExecutionKey: input.nodeExecutionKey,
            payloadInput: batch.messages,
            run: input.run,
            state,
          });
          if (started.kind === "waiting") {
            return { kind: "inference-waiting", type: "inference-wait" };
          }
          state = started.state;
          continue;
        }
        state = await this.transitionAiCollectStateOrThrow({
          now: this.clock(),
          taskId: state.taskId,
          transition: { cutoffAt: queryCutoff, kind: "message-batch-empty" },
          uid: state.uid,
        });
        if (settling && state.pendingCutoffAt === null) {
          state = await this.transitionAiCollectStateOrThrow({
            now: this.clock(),
            taskId: state.taskId,
            transition: {
              disableReason: now >= expiresAt ? "expired" : "round-limit-reached",
              kind: "terminal",
              outlet: "incomplete",
            },
            uid: state.uid,
          });
        }
        continue;
      }
      if (settling && state.pendingCutoffAt === null) {
        state = await this.transitionAiCollectStateOrThrow({
          now,
          taskId: state.taskId,
          transition: {
            disableReason: now >= expiresAt ? "expired" : "round-limit-reached",
            kind: "terminal",
            outlet: "incomplete",
          },
          uid: state.uid,
        });
        continue;
      }

      const dueAt = state.pendingCutoffAt && state.quietUntil
        ? new Date(Math.min(state.quietUntil.getTime(), expiresAt.getTime()))
        : expiresAt;
      const waiting = await this.runtimeRepository.beginAiCollectWait({
        dueAt,
        expectedRunLockVersion: input.run.lockVersion,
        expectedTaskVersion: input.claimedTask.taskVersion,
        inbox: createInbox(
          input.input.messageId,
          input.claimedTask.id,
          input.input.taskVersion,
          input.input.now,
        ),
        now: input.input.now,
        runId: input.run.id,
        taskId: input.claimedTask.id,
        uid: input.input.uid,
      });
      if (waiting.kind === "already-processed") throw alreadyProcessedError();
      if (waiting.kind === "workflow-unavailable") throw workflowUnavailable();
      if (waiting.kind !== "success") throw staleTaskError();
      return { kind: "inference-waiting", type: "inference-wait" };
    }
  }

  private async startAiCollectInference(input: {
    batchCursor: import("./ai-collect.js").WorkflowAiCollectMessageCursor | null;
    batchCutoffAt: Date | null;
    batchHasMore: boolean;
    claimedTask: WorkflowTaskRecord;
    input: WorkflowExecuteTaskInput;
    node: WorkflowExecutionNode;
    nodeExecutionKey: string;
    payloadInput: unknown;
    run: WorkflowRunRecord;
    state: WorkflowAiCollectStateRecord;
  }): Promise<
    | { kind: "adopted"; state: WorkflowAiCollectStateRecord }
    | { kind: "waiting" }
  > {
    const executionKey = `${input.nodeExecutionKey}:collect:${input.state.nextBatchSequence}`;
    const payload = createWorkflowAiCollectInferenceRequest(
      input.node,
      input.payloadInput,
      input.state.collected,
    );
    const existing = await this.runtimeRepository.findInferenceByExecutionKey(
      input.state.uid,
      executionKey,
    );
    if (!existing) {
      const waiting = await this.runtimeRepository.beginInference({
        contractVersion: 1,
        deadlineAt: new Date(input.input.now.getTime() + this.inferenceTotalTimeoutMs),
        executionKey,
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
        uid: input.state.uid,
      });
      if (waiting.kind === "already-processed") throw alreadyProcessedError();
      if (waiting.kind === "workflow-unavailable") throw workflowUnavailable();
      if (waiting.kind !== "success") throw staleTaskError();
    }
    const state = await this.transitionAiCollectStateOrThrow({
      now: this.clock(),
      taskId: input.state.taskId,
      transition: {
        batchCursor: input.batchCursor,
        batchCutoffAt: input.batchCutoffAt,
        batchHasMore: input.batchHasMore,
        executionKey,
        kind: "inference-started",
      },
      uid: input.state.uid,
    });
    return existing && (existing.status === "succeeded" || existing.status === "failed")
      ? { kind: "adopted", state }
      : { kind: "waiting" };
  }

  private async finishAiCollectTask(
    state: WorkflowAiCollectStateRecord,
    directivePort: WorkflowConversationDirectivePort,
  ): Promise<{ output: Record<string, unknown>; sourceOutletId: string; type: "advance" }> {
    if (state.directiveStatus === "active") {
      await executeAiCollectOperation(this.capabilityTimeoutMs, signal => directivePort.disable({
        bizId: state.bizId,
        reason: state.disableReason ?? state.terminalOutlet!,
        signal,
        type: WORKFLOW_AI_COLLECT_DIRECTIVE_TYPE,
        uid: state.uid,
      }));
      state = await this.transitionAiCollectStateOrThrow({
        now: this.clock(),
        taskId: state.taskId,
        transition: { kind: "directive-disabled" },
        uid: state.uid,
      });
    } else if (state.directiveStatus === "disabling") {
      throw new WorkflowCapabilityExecutionError(
        "retryable",
        "WORKFLOW_AI_COLLECT_DIRECTIVE_DISABLE_PENDING",
        "资料收集正在结束",
      );
    }
    return {
      output: state.terminalOutlet === "completed" ? structuredClone(state.collected) : {},
      sourceOutletId: state.terminalOutlet!,
      type: "advance",
    };
  }

  private async transitionAiCollectStateOrThrow(
    input: Parameters<WorkflowRuntimeRepository["transitionAiCollectState"]>[0],
  ) {
    const result = await this.runtimeRepository.transitionAiCollectState(input);
    if (result.kind !== "success") throw staleTaskError();
    return result.state;
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
          "返回结果异常，流程已停止",
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
        existing.errorMessage ?? "执行未完成",
        { diagnosticMessage: existing.errorCode ?? "Workflow inference job failed" },
      );
    }
    if (existing?.status === "cancelled") throw staleTaskError();
    if (!existing) {
      const immediate = resolveWorkflowInferenceWithoutProvider(
        input.node,
        input.run,
        { enteredAt: input.claimedTask.createdAt.toISOString() },
      );
      if (immediate) return { ...immediate, type: "advance" };
    }
    const payload = existing?.payload ?? createWorkflowInferenceRequest(
      input.node,
      input.run,
      { enteredAt: input.claimedTask.createdAt.toISOString() },
    );
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
      sourceOutletId = "triggered";
    } else {
      throw staleTaskError();
    }

    let output: Record<string, unknown>;
    let nextContext: Record<string, unknown>;
    try {
      output = sourceOutletId === "triggered"
        ? createTriggeredWaitEventOutput(input.existingSubscription)
        : {};
      assertWorkflowRuntimeValue(output, "node-output", WORKFLOW_NODE_OUTPUT_MAX_BYTES);
      const completedAt = this.clock();
      nextContext = appendNodeOutput(input.run.context, input.node.id, output, {
        enteredAt: input.existingSubscription.effectiveFrom,
        exitedAt: completedAt,
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
        ...(getWorkflowNodeContract(input.node.kind).recordSourceOutlet
          ? { sourceOutletId }
          : {}),
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
    error: WorkflowNodeExecutionError | WorkflowRuntimeValueError;
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

  private async requireEntitlement(uid: number, workflowId: string, workflowType: WorkflowType) {
    try {
      const decision = await decideWorkflowEntitlement(this.entitlementPort, {
        uid,
        workflowType,
      });
      if (decision.action === "allow") return decision.result;
      const definition = await this.controlRepository.findDefinition(uid, workflowId);
      if (definition?.runtimeStatus === "inactive") throw runtimeStatusError("inactive");
      const confirmation = await decideWorkflowEntitlement(this.entitlementPort, {
        forceRefresh: true,
        uid,
        workflowType,
      });
      if (confirmation.action === "allow") return confirmation.result;
      await this.controlRepository.deactivateWorkflowForEntitlementLoss({
        opSubUserId: "0",
        uid,
        workflowId,
        workflowType,
      });
      throw runtimeStatusError("inactive");
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

  private async deferTaskOrThrowStale(
    task: { id: string; taskVersion: number; uid: number },
    now: Date,
    reasonCode: WorkflowTaskDeferReasonCode,
  ) {
    await this.deferTaskUntilOrThrowStale(
      task,
      new Date(now.getTime() + this.deferredTaskDelayMs),
      reasonCode,
    );
  }

  private async deferTaskUntilOrThrowStale(
    task: { id: string; taskVersion: number; uid: number },
    dueAt: Date,
    reasonCode: WorkflowTaskDeferReasonCode,
  ) {
    const deferred = await this.runtimeRepository.deferTask({
      dueAt,
      expectedTaskVersion: task.taskVersion,
      reasonCode,
      taskId: task.id,
      uid: task.uid,
    });
    if (deferred.kind !== "success") throw staleTaskError();
  }
}

function getRunSeatId(context: Record<string, unknown>) {
  const trigger = isRecord(context.trigger) ? context.trigger : null;
  return trigger ? readWorkflowTriggerSeatId(trigger) : null;
}

function createExecutionContext(
  run: WorkflowRunRecord,
  now: Date,
  enteredAt: Date = now,
  preparedContext: WorkflowPreparedExecutionContext = { identities: {} },
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
    identities: structuredClone(preparedContext.identities),
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
      workflowId: run.workflowId,
    },
    trigger,
  };
}

async function executeWithCapabilityTimeout(input: {
  nodeExecutionKey: string;
  capabilityTimeoutMs: number;
  binding: WorkflowCapabilityExecutionBinding | undefined;
  enteredAt: Date;
  node: WorkflowExecutionNode;
  port: WorkflowCapabilityPort | undefined;
  preparedContext: WorkflowPreparedExecutionContext;
  run: WorkflowRunRecord;
  startedAt: Date;
}) {
  if (!input.binding) {
    throw new WorkflowCapabilityExecutionError(
      "terminal",
      "WORKFLOW_CAPABILITY_BINDING_UNAVAILABLE",
      "执行服务暂不可用，流程已停止",
      { diagnosticMessage: `Workflow capability binding is not configured for ${input.node.kind}` },
    );
  }
  if (!input.port) {
    throw new WorkflowCapabilityExecutionError(
      "terminal",
      "WORKFLOW_CAPABILITY_PORT_UNAVAILABLE",
      "执行服务暂不可用，流程已停止",
      { diagnosticMessage: "Workflow capability port is not configured" },
    );
  }
  const binding = input.binding;
  const port = input.port;
  const deadlineAt = new Date(input.startedAt.getTime() + input.capabilityTimeoutMs);
  return raceWithWorkflowTimeout({
    createError: () => new WorkflowCapabilityExecutionError(
      "unknown",
      "WORKFLOW_CAPABILITY_TIMEOUT",
      "执行超时",
      { diagnosticMessage: `Workflow capability exceeded its ${input.capabilityTimeoutMs}ms deadline` },
    ),
    execute: signal => executeWorkflowCapabilityStep({
      binding,
      commandContext: {
        currentNodeLifecycle: { enteredAt: input.enteredAt.toISOString() },
        identities: structuredClone(input.preparedContext.identities),
        nodeLifecycle: isRecord(input.run.context.nodeLifecycle)
          ? input.run.context.nodeLifecycle as Record<
            string,
            { enteredAt?: string; exitedAt?: string }
          >
          : {},
        outputs: isRecord(input.run.context.outputs)
          ? input.run.context.outputs as Record<string, Record<string, unknown>>
          : {},
        subjectId: input.run.subjectId,
        trigger: isRecord(input.run.context.trigger) ? input.run.context.trigger : {},
        workflow: isRecord(input.run.context.workflow) ? input.run.context.workflow : {},
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
      port,
      signal,
      subjectId: input.run.subjectId,
      subjectType: input.run.subjectType,
      uid: input.run.uid,
    }).then(step => ({
      output: step.output,
      sourceOutletId: step.sourceOutletId,
      type: "advance" as const,
    })),
    timeoutMs: input.capabilityTimeoutMs,
  });
}

async function executeMessageQueryWithTimeout(input: {
  capabilityTimeoutMs: number;
  enteredAt: Date;
  node: WorkflowExecutionNode;
  port: WorkflowMessageQueryPort | undefined;
  preparedContext: WorkflowPreparedExecutionContext;
  run: WorkflowRunRecord;
  startedAt: Date;
}) {
  if (!input.port) {
    throw new WorkflowCapabilityExecutionError(
      "terminal",
      "WORKFLOW_MESSAGE_QUERY_PORT_UNAVAILABLE",
      "执行服务暂不可用，流程已停止",
      { diagnosticMessage: "Workflow Message Query port is not configured" },
    );
  }
  const port = input.port;
  return raceWithWorkflowTimeout({
    createError: () => new WorkflowCapabilityExecutionError(
      "unknown",
      "WORKFLOW_CAPABILITY_TIMEOUT",
      "执行超时",
      { diagnosticMessage: `Workflow Message Query exceeded its ${input.capabilityTimeoutMs}ms deadline` },
    ),
    execute: signal => executeWorkflowMessageQuery({
      config: input.node.config,
      context: {
        currentNodeLifecycle: { enteredAt: input.enteredAt.toISOString() },
        identities: structuredClone(input.preparedContext.identities),
        nodeLifecycle: isRecord(input.run.context.nodeLifecycle)
          ? input.run.context.nodeLifecycle as Record<
            string,
            { enteredAt?: string; exitedAt?: string }
          >
          : {},
        outputs: isRecord(input.run.context.outputs)
          ? input.run.context.outputs as Record<string, Record<string, unknown>>
          : {},
        subjectId: input.run.subjectId,
        trigger: isRecord(input.run.context.trigger) ? input.run.context.trigger : {},
      },
      port,
      signal,
      subjectId: input.run.subjectId,
      subjectType: input.run.subjectType,
      uid: input.run.uid,
    }).then(output => ({ output, sourceOutletId: "default", type: "advance" as const })),
    timeoutMs: input.capabilityTimeoutMs,
  });
}

async function raceWithWorkflowTimeout<T>(input: {
  createError(): WorkflowCapabilityExecutionError;
  execute(signal: AbortSignal): Promise<T>;
  timeoutMs: number;
}) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = input.createError();
      reject(error);
      controller.abort(error);
    }, input.timeoutMs);
  });
  try {
    return await Promise.race([input.execute(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function executeAiCollectOperation<T>(
  timeoutMs: number,
  execute: (signal: AbortSignal) => Promise<T>,
) {
  return raceWithWorkflowTimeout({
    createError: () => new WorkflowCapabilityExecutionError(
      "unknown",
      "WORKFLOW_AI_COLLECT_OPERATION_TIMEOUT",
      "资料收集操作超时",
      { diagnosticMessage: `AI Collect operation exceeded its ${timeoutMs}ms deadline` },
    ),
    execute,
    timeoutMs,
  });
}

function toCapabilityExecutionError(error: unknown) {
  if (error instanceof WorkflowCapabilityExecutionError) return error;
  if (!(error instanceof WorkflowRuntimeValueError)) return null;
  const safeMessage = "返回结果异常，流程已停止";
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
    if (binding.executionTimeoutMs !== undefined
      && (!Number.isSafeInteger(binding.executionTimeoutMs)
        || binding.executionTimeoutMs <= 0
        || binding.executionTimeoutMs > Number.MAX_SAFE_INTEGER / 2)) {
      throw new Error(
        `Workflow capability binding timeout must be a positive safe integer: ${binding.nodeKind}`,
      );
    }
    result.set(binding.nodeKind, binding);
  }
  return result;
}

function isCoreNodeExecutionFailure(
  error: unknown,
): error is WorkflowNodeExecutionError | WorkflowRuntimeValueError {
  return error instanceof WorkflowNodeExecutionError
    || error instanceof WorkflowRuntimeValueError;
}

function toCoreNodeRuntimeFailure(error: WorkflowNodeExecutionError | WorkflowRuntimeValueError) {
  if (error instanceof WorkflowNodeExecutionError) {
    return {
      diagnosticMessage: error.message,
      errorCode: "WORKFLOW_CORE_NODE_EXECUTION_INVALID",
      errorMessage: "节点配置异常，流程已停止",
    };
  }
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
    errorMessage: "流程数据异常，流程已停止",
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

function createTriggeredWaitEventOutput(subscription: WorkflowEventSubscriptionRecord) {
  const message = subscription.triggerProjection?.message;
  if (!subscription.triggerOccurredAt || !Value.Check(WorkflowMessageSchema, message)) {
    throw invalidWaitEventOutput();
  }
  return fitWorkflowMessageOutput(message, visibleMessage => ({
    message: visibleMessage,
    triggeredAt: subscription.triggerOccurredAt!.toISOString(),
  }));
}

function getWaitEventDelayMilliseconds(config: WorkflowWaitEventConfig) {
  const unitMilliseconds = config.delay.unit === "second"
    ? 1_000
    : config.delay.unit === "minute"
      ? 60_000
      : config.delay.unit === "hour"
        ? 3_600_000
        : 86_400_000;
  return config.delay.duration * unitMilliseconds;
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

function resolveDirectEntrySubject(
  subjectType: WorkflowSubjectType,
  startConfig: WorkflowStartConfig,
  payload: WorkflowDirectEntryPayload,
) {
  if (subjectType === "chatai_contact") {
    if (!("seatIds" in startConfig)
      || !("thirdExternalUserId" in payload)
      || !startConfig.seatIds.includes(payload.seatId)) {
      throw directEntryIdentityError();
    }
    return { subjectId: payload.thirdExternalUserId };
  }
  if (subjectType === "wecom_contact") {
    if (!("workUserIds" in startConfig)
      || !("externalUserId" in payload)
      || !startConfig.workUserIds.includes(payload.workUserId)) {
      throw directEntryIdentityError();
    }
    return { subjectId: String(payload.externalUserId) };
  }
  throw directEntryIdentityError();
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

function directEntryUnavailableError() {
  return new WorkflowRuntimeError(
    "WORKFLOW_DIRECT_ENTRY_UNAVAILABLE",
    "Workflow 不允许外部推送进入",
  );
}

function directEntryIdentityError() {
  return new WorkflowRuntimeError(
    "WORKFLOW_DIRECT_ENTRY_IDENTITY_INVALID",
    "Workflow 外部推送身份无效",
    400,
  );
}

function runtimeNodeUnsupportedError() {
  return new WorkflowRuntimeError(
    "WORKFLOW_RUNTIME_NODE_UNSUPPORTED",
    "节点暂不可执行",
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
