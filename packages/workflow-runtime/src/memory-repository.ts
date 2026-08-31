import type {
  WorkflowCapabilityExecutionFailureInput,
  WorkflowBeginEventWaitInput,
  WorkflowBeginFixedWaitInput,
  WorkflowAiCollectStateRecord,
  WorkflowCommitNodeResultInput,
  WorkflowCreateRunInput,
  WorkflowEventSubscriptionRecord,
  WorkflowInferenceJobRecord,
  WorkflowNodeExecutionRecord,
  WorkflowOutboxRecord,
  WorkflowPublishedRevisionResolver,
  WorkflowRevisionCleanupRecord,
  WorkflowRunRecord,
  WorkflowRuntimeRevisionRecord,
  WorkflowRuntimeRepository,
  WorkflowTaskRecord,
} from "./types.js";
import { WORKFLOW_ACTIVE_RUN_STATUSES } from "@chatai/contracts";
import {
  getWorkflowExecutionBoundaryDecision,
  transitionRun,
  transitionTask,
} from "@chatai/workflow-engine";
import { createNodeMetricDeltas } from "./node-metrics.js";
import { resolveWorkflowForwardRoute } from "./live-revision-routing.js";
import { isWorkflowTaskDeferReasonCode } from "./task-deferral.js";
import { formatWorkflowMetricDate } from "./workflow-date.js";

type WorkflowBoundaryResolver = (input: {
  uid: number;
  workflowId: string;
}) => Promise<{ bizStatus: 0 | 1; runtimeStatus: "active" | "inactive" | "paused" | "stopped" } | null>;

type NodeMetricEvent = {
  completed: number;
  current: number;
  entered: number;
  incomplete: number;
  eventKey: string;
  nodeId: string;
  passed: number;
  processedAt: Date | null;
  revision: number;
  runId: string;
  shardId: number;
  uid: number;
  workflowId: string;
};

export class InMemoryWorkflowRuntimeRepository implements WorkflowRuntimeRepository {
  readonly aiCollectStates: WorkflowAiCollectStateRecord[] = [];
  readonly runs: WorkflowRunRecord[] = [];
  readonly tasks: WorkflowTaskRecord[] = [];
  readonly nodeExecutions: WorkflowNodeExecutionRecord[] = [];
  readonly nodeMetricEvents: NodeMetricEvent[] = [];
  readonly nodeMetrics: import("./types.js").WorkflowNodeMetricRecord[] = [];
  readonly revisionCleanups: WorkflowRevisionCleanupRecord[] = [];
  readonly eventSubscriptions: WorkflowEventSubscriptionRecord[] = [];
  readonly inferenceJobs: WorkflowInferenceJobRecord[] = [];
  private inbox: Array<WorkflowCommitNodeResultInput["inbox"] & { uid: number }> = [];
  private outbox: WorkflowOutboxRecord[] = [];
  private readonly runCompletedAt = new Map<string, Date>();
  private readonly capacityDailyMetrics = new Map<string, number>();
  private readonly totalEntries = new Map<string, number>();
  private readonly runUpdatedAt = new Map<string, Date>();
  private readonly runWorkflowTypes = new Map<string, import("@chatai/contracts").WorkflowType>();
  private nextId = 1n;

  constructor(
    private readonly resolveWorkflowBoundary?: WorkflowBoundaryResolver,
    private readonly now: () => Date = () => new Date(),
    private resolvePublishedRevision?: WorkflowPublishedRevisionResolver,
  ) {}

  configurePublishedRevisionResolver(resolver: WorkflowPublishedRevisionResolver) {
    this.resolvePublishedRevision = resolver;
  }

  addRevisionCleanupRequest(input: {
    nodeId: string;
    nodeKind: "ai-collect" | "wait" | "wait-event";
    revision: number;
    uid: number;
    workflowId: string;
  }) {
    const existing = this.revisionCleanups.find(item => item.uid === input.uid
      && item.workflowId === input.workflowId
      && item.revision === input.revision
      && item.nodeId === input.nodeId);
    if (existing) return clone(existing);
    const cleanup: WorkflowRevisionCleanupRecord = {
      afterRunId: null,
      attempt: 0,
      id: this.createId(),
      lastErrorCode: null,
      leaseExpiresAt: null,
      leaseOwner: null,
      nextAttemptAt: this.now(),
      nodeId: input.nodeId,
      nodeKind: input.nodeKind,
      revision: input.revision,
      status: "pending",
      uid: input.uid,
      workflowId: input.workflowId,
    };
    this.revisionCleanups.push(cleanup);
    return clone(cleanup);
  }

  async claimRevisionCleanupBatch(
    input: Parameters<WorkflowRuntimeRepository["claimRevisionCleanupBatch"]>[0],
  ) {
    const claimable = this.revisionCleanups
      .filter(item => (item.status === "pending" && item.nextAttemptAt <= input.now)
        || (item.status === "leased" && item.leaseExpiresAt !== null && item.leaseExpiresAt <= input.now))
      .sort(compareById);
    const claimed: WorkflowRevisionCleanupRecord[] = [];
    for (const cleanup of claimable) {
      if (cleanup.attempt >= input.maxAttempts) {
        cleanup.status = "dead";
        cleanup.leaseOwner = null;
        cleanup.leaseExpiresAt = null;
        continue;
      }
      if (claimed.length >= Math.max(0, input.limit)) break;
      cleanup.attempt += 1;
      cleanup.status = "leased";
      cleanup.leaseOwner = input.leaseOwner;
      cleanup.leaseExpiresAt = clone(input.leaseExpiresAt);
      claimed.push(clone(cleanup));
    }
    return claimed;
  }

  async processRevisionCleanupBatch(
    input: Parameters<WorkflowRuntimeRepository["processRevisionCleanupBatch"]>[0],
  ) {
    const cleanup = this.revisionCleanups.find(item => item.id === input.cleanupId);
    if (!cleanup) return { kind: "not-found" as const };
    if (cleanup.status !== "leased" || cleanup.leaseOwner !== input.leaseOwner) {
      return { kind: "conflict" as const };
    }
    if (!this.resolvePublishedRevision) return { kind: "conflict" as const };
    const publishedRevision = await this.resolvePublishedRevision({
      uid: cleanup.uid,
      workflowId: cleanup.workflowId,
    });
    if (!publishedRevision) return { kind: "conflict" as const };
    if (publishedRevision.executionSpec.nodes.some(node => node.id === cleanup.nodeId)) {
      cleanup.status = "obsolete";
      cleanup.leaseOwner = null;
      cleanup.leaseExpiresAt = null;
      return { cancelled: 0, hasMore: false, kind: "success" as const, status: "obsolete" as const };
    }

    const candidates = this.runs
      .filter(run => run.uid === cleanup.uid
        && run.workflowId === cleanup.workflowId
        && run.currentNodeId === cleanup.nodeId
        && (run.status === "queued" || run.status === "running" || run.status === "waiting")
        && (cleanup.afterRunId === null || BigInt(run.id) > BigInt(cleanup.afterRunId)))
      .sort(compareById)
      .slice(0, Math.max(0, input.limit) + 1);
    const selected = candidates.slice(0, Math.max(0, input.limit));
    let cancelled = 0;
    for (const run of selected) {
      const task = this.tasks.find(item => item.uid === run.uid
        && item.runId === run.id
        && item.sequence === run.sequence
        && item.nodeId === cleanup.nodeId
        && item.status !== "completed"
        && item.status !== "cancelled"
        && item.status !== "dead");
      const expectedTaskType = cleanup.nodeKind === "wait" ? "wait"
        : cleanup.nodeKind === "wait-event" ? "wait-event"
          : "ai-collect";
      if (!task
        || task.nodeKind !== cleanup.nodeKind
        || (task.taskType !== "execute"
          && task.taskType !== expectedTaskType
          && !(cleanup.nodeKind === "ai-collect" && task.taskType === "inference"))) continue;
      cancelTask(task);
      run.status = "cancelled";
      run.terminalReason = "flow_changed_current_node_deleted";
      run.lockVersion += 1;
      run.nextExecuteAt = null;
      this.cancelEventSubscriptions(new Set([run.id]));
      this.cancelInferenceJobs(new Set([run.id]));
      this.appendNodeMetricEvents(run, `${run.id}:revision-cleanup:${cleanup.id}`, createNodeMetricDeltas({
        kind: "left-incomplete",
        nodeId: task.nodeId,
        nodeKind: task.nodeKind,
      }), task.revision);
      this.touchRun(run);
      cancelled += 1;
    }
    cleanup.afterRunId = selected.at(-1)?.id ?? cleanup.afterRunId;
    const hasMore = candidates.length > selected.length;
    cleanup.status = hasMore ? "pending" : "done";
    cleanup.attempt = 0;
    cleanup.lastErrorCode = null;
    cleanup.nextAttemptAt = clone(input.now);
    cleanup.leaseOwner = null;
    cleanup.leaseExpiresAt = null;
    return {
      cancelled,
      hasMore,
      kind: "success" as const,
      status: cleanup.status,
    };
  }

  async failRevisionCleanup(
    input: Parameters<WorkflowRuntimeRepository["failRevisionCleanup"]>[0],
  ) {
    const cleanup = this.revisionCleanups.find(item => item.id === input.cleanupId
      && item.status === "leased"
      && item.leaseOwner === input.leaseOwner);
    if (!cleanup) return false;
    cleanup.status = cleanup.attempt >= input.maxAttempts ? "dead" : "pending";
    cleanup.lastErrorCode = input.errorCode;
    cleanup.nextAttemptAt = clone(input.nextAttemptAt);
    cleanup.leaseOwner = null;
    cleanup.leaseExpiresAt = null;
    return true;
  }

  async createRunWithInitialTask(input: WorkflowCreateRunInput) {
    assertActiveRunLimit(input.activeRunLimit);
    if (this.resolveWorkflowBoundary) {
      const boundary = await this.resolveWorkflowBoundary({ uid: input.uid, workflowId: input.workflowId });
      const decision = boundary
        ? getWorkflowExecutionBoundaryDecision(boundary)
        : "cancel";
      if (decision !== "execute") {
        return { action: decision, kind: "workflow-unavailable" as const };
      }
    }

    const existingRun = this.runs.find((run) =>
      run.uid === input.uid
      && run.workflowId === input.workflowId
      && run.entryEventId === input.entryEventId,
    );
    if (existingRun) {
      const task = this.tasks.find((item) => item.runId === existingRun.id)!;
      return { deduplicated: true, kind: "success" as const, run: clone(existingRun), task: clone(task) };
    }

    const admittedAt = this.now();
    const previousRuns = this.runs.filter(run =>
      run.uid === input.uid
      && run.workflowId === input.workflowId
      && run.subjectType === input.subjectType
      && run.subjectId === input.subjectId,
    );
    if (previousRuns.some(run =>
      run.status === "queued" || run.status === "running" || run.status === "waiting")) {
      return { kind: "active-run-rejected" as const };
    }
    const entryGuardKey = `${input.uid}:${input.workflowId}:${input.subjectType}:${input.subjectId}`;
    const totalEntries = this.totalEntries.get(entryGuardKey) ?? 0;
    if (!canEnterWorkflow(input.entryPolicy, previousRuns, totalEntries, admittedAt)) {
      return { kind: "entry-policy-rejected" as const };
    }
    const activeRunCount = this.runs.filter(run => run.uid === input.uid
      && WORKFLOW_ACTIVE_RUN_STATUSES.includes(run.status as typeof WORKFLOW_ACTIVE_RUN_STATUSES[number]))
      .length;
    if (activeRunCount >= input.activeRunLimit) {
      return { kind: "capacity-rejected" as const };
    }

    const run: WorkflowRunRecord = {
      context: clone(input.context),
      createdAt: admittedAt,
      currentNodeId: input.initialNodeId,
      entryEventId: input.entryEventId,
      id: this.createId(),
      lockVersion: 1,
      nextExecuteAt: admittedAt,
      revision: input.revision,
      sequence: 1,
      shardId: input.shardId,
      status: "queued",
      subjectId: input.subjectId,
      subjectType: input.subjectType,
      terminalReason: null,
      uid: input.uid,
      workflowId: input.workflowId,
    };
    const task = createTask(this.createId(), run, {
      createdAt: admittedAt,
      dispatchImmediately: true,
      dueAt: admittedAt,
      nodeId: input.initialNodeId,
      nodeKind: input.initialNodeKind,
      taskType: "execute",
    });
    this.runs.push(run);
    this.runWorkflowTypes.set(run.id, input.workflowType);
    this.totalEntries.set(entryGuardKey, totalEntries + 1);
    this.runUpdatedAt.set(run.id, admittedAt);
    this.tasks.push(task);
    this.outbox.push(createOutbox(this.createId(), task, admittedAt));
    this.appendNodeMetricEvents(run, `${run.id}:entered`, createNodeMetricDeltas({
      kind: "entered",
      nodeId: input.initialNodeId,
      nodeKind: input.initialNodeKind,
    }));
    return { deduplicated: false, kind: "success" as const, run: clone(run), task: clone(task) };
  }

  async hasProcessedInboxMessage(input: { consumer: string; messageId: string }) {
    return this.inbox.some(item => item.consumer === input.consumer
      && item.messageId === input.messageId);
  }

  async recordProcessedInboxMessage(input: {
    capacityRejectedCount: number;
    consumer: string;
    expiresAt: Date;
    messageId: string;
    processedAt: Date;
    uid: number;
  }) {
    assertNonNegativeInteger(input.capacityRejectedCount, "Workflow capacity rejected count");
    if (this.inbox.some(item => item.consumer === input.consumer
      && item.messageId === input.messageId)) return false;
    this.inbox.push({
      consumer: input.consumer,
      expiresAt: clone(input.expiresAt),
      messageId: input.messageId,
      uid: input.uid,
    });
    if (input.capacityRejectedCount > 0) {
      const metricKey = `${input.uid}:${formatWorkflowMetricDate(input.processedAt)}`;
      this.capacityDailyMetrics.set(
        metricKey,
        (this.capacityDailyMetrics.get(metricKey) ?? 0) + input.capacityRejectedCount,
      );
    }
    return true;
  }

  async beginEventWait(input: WorkflowBeginEventWaitInput) {
    if (this.inbox.some(item => item.consumer === input.inbox.consumer
      && item.messageId === input.inbox.messageId)) return alreadyProcessed();
    const run = this.runs.find(item => item.uid === input.uid && item.id === input.runId);
    const task = this.tasks.find(item => item.uid === input.uid && item.id === input.taskId);
    if (!run || !task || task.runId !== run.id) return notFound();
    if (run.lockVersion !== input.expectedRunLockVersion
      || run.status !== "running"
      || task.taskVersion !== input.expectedTaskVersion
      || task.status !== "running"
      || task.sequence !== run.sequence
      || task.revision !== run.revision
      || task.nodeId !== run.currentNodeId
      || task.nodeKind !== "wait-event"
      || input.expiresAt <= input.effectiveFrom) return conflict();
    let boundaryDecision: "cancel" | "defer" | "execute" = "execute";
    if (this.resolveWorkflowBoundary) {
      const boundary = await this.resolveWorkflowBoundary({
        uid: input.uid,
        workflowId: run.workflowId,
      });
      boundaryDecision = boundary ? getWorkflowExecutionBoundaryDecision(boundary) : "cancel";
      if (boundaryDecision === "cancel") {
        return { action: "cancel" as const, kind: "workflow-unavailable" as const };
      }
    }
    if (this.eventSubscriptions.some(item => item.uid === input.uid
      && item.taskId === task.id
      && item.eventType === input.eventType)) return conflict();

    const subscription: WorkflowEventSubscriptionRecord = {
      createdAt: clone(input.now),
      effectiveFrom: clone(input.effectiveFrom),
      eventType: input.eventType,
      expiresAt: clone(input.expiresAt),
      id: this.createId(),
      nodeId: task.nodeId,
      revision: task.revision,
      resumeAt: null,
      runId: run.id,
      seatId: input.seatId,
      status: "waiting",
      subjectId: run.subjectId,
      subjectType: run.subjectType,
      taskId: task.id,
      triggerEventId: null,
      triggerOccurredAt: null,
      triggerProjection: null,
      uid: input.uid,
      updatedAt: clone(input.now),
      workflowId: run.workflowId,
    };
    this.eventSubscriptions.push(subscription);
    this.inbox.push({ ...clone(input.inbox), uid: input.uid });
    task.dueAt = clone(input.expiresAt);
    task.leaseExpiresAt = null;
    task.leaseOwner = null;
    task.status = boundaryDecision === "defer" ? "suspended" : transitionTask(task.status, "pending");
    task.taskType = "wait-event";
    task.taskVersion += 1;
    run.lockVersion += 1;
    run.nextExecuteAt = clone(input.expiresAt);
    run.status = transitionRun(run.status, "waiting");
    this.touchRun(run);
    return {
      kind: "success" as const,
      run: clone(run),
      subscription: clone(subscription),
      task: clone(task),
    };
  }

  async beginFixedWait(input: WorkflowBeginFixedWaitInput) {
    if (this.inbox.some(item => item.consumer === input.inbox.consumer
      && item.messageId === input.inbox.messageId)) return alreadyProcessed();
    const run = this.runs.find(item => item.uid === input.uid && item.id === input.runId);
    const task = this.tasks.find(item => item.uid === input.uid && item.id === input.taskId);
    if (!run || !task || task.runId !== run.id) return notFound();
    if (run.lockVersion !== input.expectedRunLockVersion
      || run.status !== "running"
      || task.taskVersion !== input.expectedTaskVersion
      || task.status !== "running"
      || task.sequence !== run.sequence
      || task.revision !== run.revision
      || task.nodeId !== run.currentNodeId
      || task.nodeKind !== "wait"
      || task.taskType !== "execute"
      || input.dueAt <= input.now) return conflict();
    let boundaryDecision: "cancel" | "defer" | "execute" = "execute";
    if (this.resolveWorkflowBoundary) {
      const boundary = await this.resolveWorkflowBoundary({ uid: input.uid, workflowId: run.workflowId });
      boundaryDecision = boundary ? getWorkflowExecutionBoundaryDecision(boundary) : "cancel";
      if (boundaryDecision === "cancel") {
        return { action: "cancel" as const, kind: "workflow-unavailable" as const };
      }
    }
    this.inbox.push({ ...clone(input.inbox), uid: input.uid });
    task.dueAt = clone(input.dueAt);
    task.leaseExpiresAt = null;
    task.leaseOwner = null;
    task.status = boundaryDecision === "defer" ? "suspended" : transitionTask(task.status, "pending");
    task.taskType = "wait";
    task.taskVersion += 1;
    run.lockVersion += 1;
    run.nextExecuteAt = clone(input.dueAt);
    run.status = transitionRun(run.status, "waiting");
    this.touchRun(run);
    return { kind: "success" as const, run: clone(run), task: clone(task) };
  }

  async listMatchingEventSubscriptions(
    uid: number,
    subjectType: WorkflowEventSubscriptionRecord["subjectType"],
    eventType: WorkflowEventSubscriptionRecord["eventType"],
    subjectId: string,
    seatId: number | null,
    eventOccurredAt: Date,
  ) {
    const matches: WorkflowEventSubscriptionRecord[] = [];
    for (const subscription of this.eventSubscriptions) {
      if (subscription.uid !== uid
        || subscription.subjectType !== subjectType
        || subscription.eventType !== eventType
        || subscription.subjectId !== subjectId
        || (subscription.seatId !== null && subscription.seatId !== seatId)
        || subscription.status !== "waiting"
        || eventOccurredAt < subscription.effectiveFrom
        || eventOccurredAt >= subscription.expiresAt) continue;
      const boundary = this.resolveWorkflowBoundary
        ? await this.resolveWorkflowBoundary({ uid, workflowId: subscription.workflowId })
        : { bizStatus: 1 as const, runtimeStatus: "active" as const };
      if (!boundary || getWorkflowExecutionBoundaryDecision(boundary) === "cancel") continue;
      matches.push(subscription);
    }
    return clone(matches);
  }

  async findEventSubscriptionByTask(uid: number, taskId: string) {
    const subscription = this.eventSubscriptions.find(item => item.uid === uid && item.taskId === taskId);
    return subscription ? clone(subscription) : null;
  }

  async triggerEventSubscription(
    input: Parameters<WorkflowRuntimeRepository["triggerEventSubscription"]>[0],
  ) {
    const subscription = this.eventSubscriptions.find(item => item.uid === input.uid
      && item.id === input.subscriptionId);
    if (!subscription) return notFound();
    if (subscription.status !== "waiting") return conflict();
    const run = this.runs.find(item => item.uid === input.uid && item.id === subscription.runId);
    const task = this.tasks.find(item => item.uid === input.uid && item.id === subscription.taskId);
    if (!run || !task || task.runId !== run.id) return notFound();
    const boundary = this.resolveWorkflowBoundary
      ? await this.resolveWorkflowBoundary({ uid: input.uid, workflowId: subscription.workflowId })
      : { bizStatus: 1 as const, runtimeStatus: "active" as const };
    const decision = boundary ? getWorkflowExecutionBoundaryDecision(boundary) : "cancel";
    if (decision === "cancel") {
      subscription.status = "cancelled";
      subscription.updatedAt = clone(input.recordedAt);
      return { action: "cancel" as const, kind: "workflow-unavailable" as const };
    }
    if (subscription.status !== "waiting") return conflict();
    if ((task.status !== "pending"
        && task.status !== "suspended"
        && task.status !== "leased"
        && task.status !== "dispatched"
        && task.status !== "running")
      || (run.status !== "waiting" && run.status !== "running")
      || run.currentNodeId !== subscription.nodeId
      || task.nodeId !== subscription.nodeId
      || task.nodeKind !== "wait-event"
      || task.taskType !== "wait-event") return conflict();

    if (task.dueAt.getTime() !== subscription.expiresAt.getTime()
      || input.eventOccurredAt.getTime() < subscription.effectiveFrom.getTime()
      || input.eventOccurredAt.getTime() >= subscription.expiresAt.getTime()
      || input.resumeAt.getTime() < input.recordedAt.getTime()) return conflict();

    subscription.resumeAt = clone(input.resumeAt);
    subscription.status = "triggered";
    subscription.triggerEventId = input.eventId;
    subscription.triggerOccurredAt = clone(input.eventOccurredAt);
    subscription.triggerProjection = clone(input.projection);
    subscription.updatedAt = clone(input.recordedAt);
    task.dueAt = clone(input.resumeAt);
    task.leaseExpiresAt = null;
    task.leaseOwner = null;
    if (decision === "defer") task.status = "suspended";
    else if (task.status !== "pending") task.status = transitionTask(task.status, "pending");
    task.taskVersion += 1;
    run.lockVersion += 1;
    run.nextExecuteAt = clone(input.resumeAt);
    if (run.status === "running") run.status = transitionRun(run.status, "waiting");
    this.touchRun(run);
    return {
      kind: "success" as const,
      run: clone(run),
      subscription: clone(subscription),
      task: clone(task),
    };
  }

  async timeoutEventSubscription(
    input: Parameters<WorkflowRuntimeRepository["timeoutEventSubscription"]>[0],
  ) {
    const subscription = this.eventSubscriptions.find(item => item.uid === input.uid
      && item.id === input.subscriptionId);
    if (!subscription) return notFound();
    if (subscription.status === "timed_out") return alreadyProcessed();
    if (subscription.status !== "waiting") return conflict();
    subscription.status = "timed_out";
    subscription.updatedAt = clone(input.timedOutAt);
    return { kind: "success" as const, subscription: clone(subscription) };
  }

  async claimTask(input: Parameters<WorkflowRuntimeRepository["claimTask"]>[0]) {
    const task = this.tasks.find((item) => item.uid === input.uid && item.id === input.taskId);
    if (!task) return notFound();
    if ((task.status !== "dispatched" && task.status !== "pending")
      || task.taskVersion !== input.expectedTaskVersion) return conflict();
    const run = this.runs.find(item => item.id === task.runId && item.uid === task.uid);
    if (!run || (run.status !== "queued" && run.status !== "running" && run.status !== "waiting")) {
      return conflict();
    }
    if (task.sequence !== run.sequence
      || task.revision !== run.revision
      || task.nodeId !== run.currentNodeId
      || task.workflowId !== run.workflowId
      || task.shardId !== run.shardId) return conflict();
    if (this.resolveWorkflowBoundary) {
      const boundary = await this.resolveWorkflowBoundary({ uid: input.uid, workflowId: task.workflowId });
      const decision = boundary
        ? getWorkflowExecutionBoundaryDecision(boundary)
        : "cancel";
      if (decision !== "execute") {
        task.status = decision === "defer" ? "suspended" : "cancelled";
        task.taskVersion += 1;
        task.leaseOwner = null;
        task.leaseExpiresAt = null;
        return { action: decision, kind: "workflow-unavailable" as const };
      }
    }
    if ((task.status !== "dispatched" && task.status !== "pending")
      || task.taskVersion !== input.expectedTaskVersion
      || (run.status !== "queued" && run.status !== "running" && run.status !== "waiting")) {
      return conflict();
    }
    const previousRunStatus = run.status;
    task.status = transitionTask(task.status, "running");
    task.attempt += 1;
    task.taskVersion += 1;
    task.lastErrorCode = null;
    task.leaseOwner = input.leaseOwner;
    task.leaseExpiresAt = input.leaseExpiresAt;
    if (run.status === "queued" || run.status === "waiting") {
      run.status = transitionRun(run.status, "running");
    }
    if (run.status !== previousRunStatus) {
      run.nextExecuteAt = null;
      this.touchRun(run);
    }
    return { kind: "success" as const, task: clone(task) };
  }

  async deferTask(input: Parameters<WorkflowRuntimeRepository["deferTask"]>[0]) {
    const task = this.tasks.find((item) => item.uid === input.uid && item.id === input.taskId);
    if (!task) return notFound();
    if ((task.status !== "pending" && task.status !== "dispatched" && task.status !== "leased")
      || task.taskVersion !== input.expectedTaskVersion) return conflict();
    const run = this.runs.find(item => item.id === task.runId && item.uid === task.uid);
    if (!run || (run.status !== "queued" && run.status !== "running" && run.status !== "waiting")
      || task.sequence !== run.sequence
      || task.revision !== run.revision
      || task.nodeId !== run.currentNodeId
      || task.workflowId !== run.workflowId
      || task.shardId !== run.shardId) return conflict();
    const boundary = this.resolveWorkflowBoundary
      ? await this.resolveWorkflowBoundary({ uid: task.uid, workflowId: task.workflowId })
      : { bizStatus: 1 as const, runtimeStatus: "active" as const };
    const boundaryDecision = boundary ? getWorkflowExecutionBoundaryDecision(boundary) : "cancel";
    if (boundaryDecision === "cancel") return conflict();
    task.dueAt = input.dueAt;
    task.lastErrorCode = input.reasonCode;
    task.leaseExpiresAt = null;
    task.leaseOwner = null;
    task.status = boundaryDecision === "defer" ? "suspended" : "pending";
    task.taskVersion += 1;
    run.status = run.status === "waiting" ? "waiting" : transitionRun(run.status, "waiting");
    run.lockVersion += 1;
    run.nextExecuteAt = clone(input.dueAt);
    this.touchRun(run);
    return { kind: "success" as const, run: clone(run), task: clone(task) };
  }

  async cancelWorkflowBatch(input: Parameters<WorkflowRuntimeRepository["cancelWorkflowBatch"]>[0]) {
    const candidates = this.runs
      .filter((run) =>
        run.uid === input.uid
        && run.workflowId === input.workflowId
        && (run.status === "queued" || run.status === "running" || run.status === "waiting")
        && (!input.afterRunId || BigInt(run.id) > BigInt(input.afterRunId)),
      )
      .sort((first, second) => BigInt(first.id) < BigInt(second.id) ? -1 : 1)
      .slice(0, input.limit + 1);
    const selected = candidates.slice(0, input.limit);
    const selectedIds = new Set(selected.map((run) => run.id));
    for (const run of selected) {
      const task = this.findCurrentTask(run);
      if (task) this.appendNodeMetricEvents(run, `${run.id}:cancelled`, createNodeMetricDeltas({
        kind: "left-incomplete", nodeId: task.nodeId, nodeKind: task.nodeKind,
      }));
      run.status = "cancelled";
      run.lockVersion += 1;
      run.nextExecuteAt = null;
      this.touchRun(run);
    }
    for (const task of this.tasks) {
      if (selectedIds.has(task.runId)
        && (task.status === "pending" || task.status === "suspended" || task.status === "waiting_external"
          || task.status === "leased" || task.status === "dispatched" || task.status === "running")) {
        task.status = "cancelled";
        task.taskVersion += 1;
        task.leaseOwner = null;
        task.leaseExpiresAt = null;
      }
    }
    this.cancelEventSubscriptions(selectedIds);
    this.cancelInferenceJobs(selectedIds);
    this.failRunningExecutions(selectedIds, "WORKFLOW_RUN_CANCELLED", "Workflow run was cancelled");
    return {
      cancelled: selected.length,
      hasMore: candidates.length > selected.length,
      lastRunId: selected.at(-1)?.id ?? null,
    };
  }

  async cancelUnavailableWorkflowRuns(
    input: Parameters<WorkflowRuntimeRepository["cancelUnavailableWorkflowRuns"]>[0],
  ) {
    const unavailable: WorkflowRunRecord[] = [];
    for (const run of this.runs) {
      if (run.status !== "queued" && run.status !== "running" && run.status !== "waiting") continue;
      if (input.afterRunId && BigInt(run.id) <= BigInt(input.afterRunId)) continue;
      const boundary = this.resolveWorkflowBoundary
        ? await this.resolveWorkflowBoundary({ uid: run.uid, workflowId: run.workflowId })
        : { bizStatus: 1 as const, runtimeStatus: "active" as const };
      if (!boundary || getWorkflowExecutionBoundaryDecision(boundary) === "cancel") unavailable.push(run);
    }
    unavailable.sort((first, second) => BigInt(first.id) < BigInt(second.id) ? -1 : 1);
    const selected = unavailable.slice(0, Math.max(0, input.limit));
    const selectedIds = new Set(selected.map(run => run.id));
    for (const run of selected) {
      const task = this.findCurrentTask(run);
      if (task) this.appendNodeMetricEvents(run, `${run.id}:cancelled`, createNodeMetricDeltas({
        kind: "left-incomplete", nodeId: task.nodeId, nodeKind: task.nodeKind,
      }));
      run.status = "cancelled";
      run.lockVersion += 1;
      run.nextExecuteAt = null;
      this.touchRun(run);
    }
    for (const task of this.tasks) {
      if (selectedIds.has(task.runId)
        && (task.status === "pending" || task.status === "suspended" || task.status === "waiting_external"
          || task.status === "leased" || task.status === "dispatched" || task.status === "running")) {
        task.status = "cancelled";
        task.taskVersion += 1;
        task.leaseOwner = null;
        task.leaseExpiresAt = null;
      }
    }
    for (const outbox of this.outbox) {
      if (selectedIds.has(outbox.payload.runId)
        && (outbox.status === "pending" || outbox.status === "leased" || outbox.status === "republished")) {
        outbox.status = "dead";
        outbox.leaseOwner = null;
        outbox.leaseExpiresAt = null;
      }
    }
    this.cancelEventSubscriptions(selectedIds);
    this.cancelInferenceJobs(selectedIds);
    this.failRunningExecutions(selectedIds, "WORKFLOW_RUN_CANCELLED", "Workflow run was cancelled");
    return {
      cancelled: selected.length,
      hasMore: unavailable.length > selected.length,
      lastRunId: selected.at(-1)?.id ?? null,
    };
  }

  async findRun(uid: number, runId: string) {
    const run = this.runs.find((item) => item.uid === uid && item.id === runId);
    return run ? clone(run) : null;
  }

  async findTask(uid: number, taskId: string) {
    const task = this.tasks.find((item) => item.uid === uid && item.id === taskId);
    return task ? clone(task) : null;
  }

  private findCurrentTask(run: WorkflowRunRecord) {
    return this.tasks
      .filter(item => item.runId === run.id && item.nodeId === run.currentNodeId)
      .sort((first, second) => second.sequence - first.sequence)[0];
  }

  async prepareCapabilityExecution(
    input: Parameters<WorkflowRuntimeRepository["prepareCapabilityExecution"]>[0],
  ) {
    const run = this.runs.find(item => item.uid === input.uid && item.id === input.runId);
    const task = this.tasks.find(item => item.uid === input.uid && item.id === input.taskId);
    if (!run || !task || task.runId !== run.id) return notFound();
    if (run.lockVersion !== input.expectedRunLockVersion
      || run.status !== "running"
      || task.taskVersion !== input.expectedTaskVersion
      || task.status !== "running") return conflict();
    const existing = this.nodeExecutions.find(item => item.uid === input.uid
      && item.runId === input.runId
      && item.sequence === task.sequence);
    if (existing) {
      if (existing.executionKey !== input.executionKey
        || existing.nodeId !== task.nodeId
        || existing.nodeKind !== task.nodeKind
        || existing.status === "completed"
        || existing.status === "failed") return conflict();
      existing.status = "running";
      existing.errorCode = null;
      existing.errorMessage = null;
      existing.failureKind = null;
      return { execution: clone(existing), kind: "success" as const };
    }
    const execution: WorkflowNodeExecutionRecord = {
      errorCode: null,
      errorMessage: null,
      failureKind: null,
      executionKey: input.executionKey,
      input: clone(input.input),
      nodeId: task.nodeId,
      nodeKind: task.nodeKind,
      output: {},
      runId: run.id,
      revision: task.revision,
      sequence: task.sequence,
      sourceOutletId: null,
      status: "running",
      uid: input.uid,
    };
    this.nodeExecutions.push(execution);
    return { execution: clone(execution), kind: "success" as const };
  }

  async updateCapabilityExecutionInput(
    input: Parameters<WorkflowRuntimeRepository["updateCapabilityExecutionInput"]>[0],
  ) {
    const run = this.runs.find(item => item.uid === input.uid && item.id === input.runId);
    const task = this.tasks.find(item => item.uid === input.uid && item.id === input.taskId);
    if (!run || !task || task.runId !== run.id) return notFound();
    if (run.lockVersion !== input.expectedRunLockVersion
      || run.status !== "running"
      || task.taskVersion !== input.expectedTaskVersion
      || task.status !== "running") return conflict();
    const execution = this.nodeExecutions.find(item => item.uid === input.uid
      && item.runId === input.runId
      && item.sequence === task.sequence);
    if (!execution
      || execution.executionKey !== input.executionKey
      || execution.nodeId !== task.nodeId
      || execution.nodeKind !== task.nodeKind
      || execution.status !== "running") return conflict();
    execution.input = clone(input.input);
    return { execution: clone(execution), kind: "success" as const };
  }

  async beginInference(input: Parameters<WorkflowRuntimeRepository["beginInference"]>[0]) {
    if (this.inbox.some(item => item.consumer === input.inbox.consumer
      && item.messageId === input.inbox.messageId)) return alreadyProcessed();
    const run = this.runs.find(item => item.uid === input.uid && item.id === input.runId);
    const task = this.tasks.find(item => item.uid === input.uid && item.id === input.taskId);
    if (!run || !task || task.runId !== run.id) return notFound();
    if (this.resolveWorkflowBoundary) {
      const boundary = await this.resolveWorkflowBoundary({ uid: input.uid, workflowId: run.workflowId });
      const decision = boundary ? getWorkflowExecutionBoundaryDecision(boundary) : "cancel";
      if (decision !== "execute") return { action: decision, kind: "workflow-unavailable" as const };
    }
    if (run.lockVersion !== input.expectedRunLockVersion
      || run.status !== "running"
      || task.taskVersion !== input.expectedTaskVersion
      || task.status !== "running"
      || task.sequence !== run.sequence
      || task.revision !== run.revision
      || task.nodeId !== run.currentNodeId
      || (task.nodeKind !== "llm" && task.nodeKind !== "ai-intent" && task.nodeKind !== "ai-collect")
      || input.deadlineAt <= input.now) return conflict();
    const existing = this.inferenceJobs.find(item => item.uid === input.uid
      && item.executionKey === input.executionKey);
    if (existing) {
      if (existing.taskId !== task.id) return conflict();
      task.dueAt = clone(existing.deadlineAt);
      task.leaseExpiresAt = null;
      task.leaseOwner = null;
      task.status = "waiting_external";
      task.taskType = "inference";
      task.taskVersion += 1;
      run.lockVersion += 1;
      run.nextExecuteAt = clone(existing.deadlineAt);
      run.status = transitionRun(run.status, "waiting");
      this.inbox.push({ ...clone(input.inbox), uid: input.uid });
      this.touchRun(run);
      return { created: false, job: clone(existing), kind: "success" as const, run: clone(run), task: clone(task) };
    }
    const job: WorkflowInferenceJobRecord = {
      attempt: 0,
      contractVersion: input.contractVersion,
      createdAt: clone(input.now),
      deadlineAt: clone(input.deadlineAt),
      errorCode: null,
      errorMessage: null,
      executionKey: input.executionKey,
      failureKind: null,
      id: this.createId(),
      leaseExpiresAt: null,
      leaseOwner: null,
      nextAttemptAt: clone(input.now),
      nodeId: task.nodeId,
      nodeKind: task.nodeKind,
      pausedAt: null,
      payload: clone(input.payload),
      result: null,
      runId: run.id,
      sequence: task.sequence,
      status: "pending",
      taskId: task.id,
      uid: input.uid,
      updatedAt: clone(input.now),
    };
    this.inferenceJobs.push(job);
    this.inbox.push({ ...clone(input.inbox), uid: input.uid });
    task.dueAt = clone(input.deadlineAt);
    task.leaseExpiresAt = null;
    task.leaseOwner = null;
    task.status = "waiting_external";
    task.taskType = "inference";
    task.taskVersion += 1;
    run.lockVersion += 1;
    run.nextExecuteAt = clone(input.deadlineAt);
    run.status = transitionRun(run.status, "waiting");
    this.touchRun(run);
    return { created: true, job: clone(job), kind: "success" as const, run: clone(run), task: clone(task) };
  }

  async findInferenceByExecutionKey(uid: number, executionKey: string) {
    const job = this.inferenceJobs.find(item => item.uid === uid && item.executionKey === executionKey);
    return job ? clone(job) : null;
  }

  async initializeAiCollectState(
    input: Parameters<WorkflowRuntimeRepository["initializeAiCollectState"]>[0],
  ) {
    const existing = this.aiCollectStates.find(state => state.uid === input.uid
      && state.taskId === input.taskId);
    if (existing) {
      if (existing.bizId !== input.bizId
        || existing.runId !== input.runId
        || existing.workflowId !== input.workflowId
        || existing.seatId !== input.seatId
        || existing.thirdExternalUserId !== input.thirdExternalUserId
        || !sameNullableDate(existing.expiresAt, input.expiresAt)) {
        throw new Error("AI Collect state initialization conflict");
      }
      return clone(existing);
    }
    if (this.aiCollectStates.some(state => state.uid === input.uid && state.bizId === input.bizId)) {
      throw new Error("AI Collect bizId already belongs to another Task");
    }
    const state: WorkflowAiCollectStateRecord = {
      activeBatchCursor: null,
      activeBatchCutoffAt: null,
      activeBatchHasMore: false,
      activeInferenceKey: null,
      bizId: input.bizId,
      collected: {},
      conversationId: null,
      createdAt: clone(input.now),
      directiveAttempt: 0,
      directiveLeaseExpiresAt: null,
      directiveLeaseOwner: null,
      directiveNextAttemptAt: clone(input.now),
      directiveStatus: "inactive",
      disableReason: null,
      expiresAt: input.expiresAt ? clone(input.expiresAt) : null,
      initialInputProcessed: false,
      lastMessageCursor: clone(input.initialMessageCursor),
      nextBatchSequence: 1,
      observedRound: 0,
      openingMessageSent: false,
      pendingCutoffAt: null,
      quietUntil: null,
      runId: input.runId,
      seatId: input.seatId,
      taskId: input.taskId,
      terminalOutlet: null,
      thirdExternalUserId: input.thirdExternalUserId,
      uid: input.uid,
      updatedAt: clone(input.now),
      workflowId: input.workflowId,
    };
    this.aiCollectStates.push(state);
    return clone(state);
  }

  async findAiCollectStateByTask(uid: number, taskId: string) {
    const state = this.aiCollectStates.find(item => item.uid === uid && item.taskId === taskId);
    return state ? clone(state) : null;
  }

  async transitionAiCollectState(
    input: Parameters<WorkflowRuntimeRepository["transitionAiCollectState"]>[0],
  ) {
    const state = this.aiCollectStates.find(item => item.uid === input.uid
      && item.taskId === input.taskId);
    if (!state) return notFound();
    const transition = input.transition;
    if (state.terminalOutlet !== null
      && transition.kind !== "terminal"
      && transition.kind !== "disable-requested"
      && transition.kind !== "directive-disabled") return conflict();
    if (transition.kind === "opening-message-sent") {
      state.openingMessageSent = true;
    } else if (transition.kind === "conversation-resolved") {
      if (state.conversationId !== null && state.conversationId !== transition.conversationId) {
        return conflict();
      }
      state.conversationId = transition.conversationId;
    } else if (transition.kind === "directive-active") {
      if (state.conversationId === null || state.expiresAt === null
        || state.directiveStatus === "disabled") return conflict();
      state.directiveStatus = "active";
    } else if (transition.kind === "initial-input-processed") {
      if (state.activeInferenceKey !== null) return conflict();
      state.initialInputProcessed = true;
    } else if (transition.kind === "inference-started") {
      if (state.activeInferenceKey === transition.executionKey) return { kind: "success" as const, state: clone(state) };
      if (state.activeInferenceKey !== null || !transition.executionKey) return conflict();
      state.activeBatchCursor = transition.batchCursor ? clone(transition.batchCursor) : null;
      state.activeBatchCutoffAt = transition.batchCutoffAt ? clone(transition.batchCutoffAt) : null;
      state.activeBatchHasMore = transition.batchHasMore;
      state.activeInferenceKey = transition.executionKey;
      state.nextBatchSequence += 1;
    } else if (transition.kind === "inference-completed") {
      if (state.activeInferenceKey !== transition.executionKey) return conflict();
      state.collected = clone(transition.collected);
      if (state.activeBatchCutoffAt === null) {
        state.initialInputProcessed = true;
      } else {
        if (!state.activeBatchCursor) return conflict();
        state.lastMessageCursor = clone(state.activeBatchCursor);
        if (state.activeBatchHasMore) {
          state.quietUntil = clone(input.now);
        } else if (state.pendingCutoffAt
          && state.pendingCutoffAt <= state.activeBatchCutoffAt) {
          state.pendingCutoffAt = null;
          state.quietUntil = null;
        }
      }
      state.activeBatchCursor = null;
      state.activeBatchCutoffAt = null;
      state.activeBatchHasMore = false;
      state.activeInferenceKey = null;
    } else if (transition.kind === "message-batch-empty") {
      if (state.activeInferenceKey !== null) return conflict();
      if (state.pendingCutoffAt && state.pendingCutoffAt <= transition.cutoffAt) {
        state.pendingCutoffAt = null;
        state.quietUntil = null;
      }
    } else if (transition.kind === "disable-requested") {
      state.disableReason = transition.reason;
    } else if (transition.kind === "terminal") {
      if (state.activeInferenceKey !== null) return conflict();
      if (state.terminalOutlet !== null && state.terminalOutlet !== transition.outlet) return conflict();
      state.terminalOutlet = transition.outlet;
      state.disableReason = transition.disableReason;
    } else if (transition.kind === "directive-disabled") {
      state.directiveStatus = "disabled";
      state.directiveLeaseExpiresAt = null;
      state.directiveLeaseOwner = null;
    }
    state.updatedAt = clone(input.now);
    return { kind: "success" as const, state: clone(state) };
  }

  async beginAiCollectWait(
    input: Parameters<WorkflowRuntimeRepository["beginAiCollectWait"]>[0],
  ) {
    if (this.inbox.some(item => item.consumer === input.inbox.consumer
      && item.messageId === input.inbox.messageId)) return alreadyProcessed();
    const run = this.runs.find(item => item.uid === input.uid && item.id === input.runId);
    const task = this.tasks.find(item => item.uid === input.uid && item.id === input.taskId);
    const state = this.aiCollectStates.find(item => item.uid === input.uid
      && item.taskId === input.taskId);
    if (!run || !task || !state || task.runId !== run.id || state.runId !== run.id) return notFound();
    if (run.lockVersion !== input.expectedRunLockVersion
      || run.status !== "running"
      || task.taskVersion !== input.expectedTaskVersion
      || task.status !== "running"
      || task.sequence !== run.sequence
      || task.revision !== run.revision
      || task.nodeId !== run.currentNodeId
      || task.nodeKind !== "ai-collect"
      || (task.taskType !== "execute" && task.taskType !== "ai-collect")
      || state.activeInferenceKey !== null
      || state.terminalOutlet !== null
      || state.directiveStatus !== "active"
      || state.expiresAt === null
      || input.dueAt > state.expiresAt
      || input.dueAt <= input.now) return conflict();
    const boundary = this.resolveWorkflowBoundary
      ? await this.resolveWorkflowBoundary({ uid: input.uid, workflowId: run.workflowId })
      : { bizStatus: 1 as const, runtimeStatus: "active" as const };
    const decision = boundary ? getWorkflowExecutionBoundaryDecision(boundary) : "cancel";
    if (decision === "cancel") return { action: "cancel" as const, kind: "workflow-unavailable" as const };
    this.inbox.push({ ...clone(input.inbox), uid: input.uid });
    task.dueAt = clone(input.dueAt);
    task.leaseExpiresAt = null;
    task.leaseOwner = null;
    task.status = decision === "defer" ? "suspended" : transitionTask(task.status, "pending");
    task.taskType = "ai-collect";
    task.taskVersion += 1;
    run.lockVersion += 1;
    run.nextExecuteAt = clone(input.dueAt);
    run.status = transitionRun(run.status, "waiting");
    this.touchRun(run);
    return { kind: "success" as const, run: clone(run), state: clone(state), task: clone(task) };
  }

  async recordAiCollectDirectiveEvent(
    input: Parameters<WorkflowRuntimeRepository["recordAiCollectDirectiveEvent"]>[0],
  ) {
    const messageId = `${input.uid}:${input.eventId}`;
    if (this.inbox.some(item => item.consumer === "workflow-entry" && item.messageId === messageId)) {
      return { kind: "deduplicated" as const };
    }
    const state = this.aiCollectStates.find(item => item.uid === input.uid
      && item.bizId === input.bizId);
    this.inbox.push({
      consumer: "workflow-entry",
      expiresAt: clone(input.inboxExpiresAt),
      messageId,
      uid: input.uid,
    });
    if (!state
      || state.directiveStatus !== "active"
      || state.terminalOutlet !== null
      || state.expiresAt === null
      || input.eventOccurredAt >= state.expiresAt
      || state.seatId !== input.seatId
      || state.thirdExternalUserId !== input.thirdExternalUserId) {
      return { kind: "stale" as const };
    }
    const expiresAt = state.expiresAt;
    state.observedRound = Math.max(state.observedRound, input.totalRound);
    state.pendingCutoffAt = !state.pendingCutoffAt || input.eventOccurredAt > state.pendingCutoffAt
      ? clone(input.eventOccurredAt)
      : state.pendingCutoffAt;
    state.quietUntil = clone(input.quietUntil < expiresAt ? input.quietUntil : expiresAt);
    state.updatedAt = clone(input.now);
    const task = this.tasks.find(item => item.uid === state.uid && item.id === state.taskId);
    const run = this.runs.find(item => item.uid === state.uid && item.id === state.runId);
    const quietUntil = state.quietUntil;
    if (task && run && task.status === "pending" && state.activeInferenceKey === null
      && task.dueAt.getTime() !== quietUntil.getTime()
      && (run.status === "waiting" || run.status === "running")) {
      task.dueAt = clone(quietUntil);
      task.taskVersion += 1;
      run.lockVersion += 1;
      run.nextExecuteAt = clone(quietUntil);
      if (run.status === "running") run.status = transitionRun(run.status, "waiting");
      this.touchRun(run);
    }
    return { kind: "queued" as const };
  }

  async claimAiCollectDirectiveDisableBatch(
    input: Parameters<WorkflowRuntimeRepository["claimAiCollectDirectiveDisableBatch"]>[0],
  ) {
    const candidates = this.aiCollectStates.filter(state => {
      const run = this.runs.find(item => item.uid === state.uid && item.id === state.runId);
      const leaseExpired = state.directiveStatus === "disabling"
        && state.directiveLeaseExpiresAt !== null
        && state.directiveLeaseExpiresAt <= input.now;
      const terminalRun = run && (run.status === "completed" || run.status === "failed" || run.status === "cancelled");
      return (state.directiveStatus === "active" || leaseExpired)
        && state.directiveNextAttemptAt <= input.now
        && (state.disableReason !== null || (state.expiresAt !== null && state.expiresAt <= input.now) || terminalRun);
    }).sort((first, second) => compareById({ id: first.taskId }, { id: second.taskId }))
      .slice(0, Math.max(0, input.limit));
    for (const state of candidates) {
      const run = this.runs.find(item => item.uid === state.uid && item.id === state.runId);
      state.disableReason ??= state.expiresAt !== null && state.expiresAt <= input.now
        ? "expired"
        : run?.status === "failed"
          ? "workflow-failed"
          : "workflow-stopped";
      state.directiveAttempt += 1;
      state.directiveLeaseExpiresAt = clone(input.leaseExpiresAt);
      state.directiveLeaseOwner = input.leaseOwner;
      state.directiveStatus = "disabling";
      state.updatedAt = clone(input.now);
    }
    return clone(candidates);
  }

  async completeAiCollectDirectiveDisable(
    input: Parameters<WorkflowRuntimeRepository["completeAiCollectDirectiveDisable"]>[0],
  ) {
    const state = this.aiCollectStates.find(item => item.uid === input.uid
      && item.taskId === input.taskId
      && item.directiveStatus === "disabling"
      && item.directiveLeaseOwner === input.leaseOwner);
    if (!state) return false;
    state.directiveStatus = "disabled";
    state.directiveLeaseExpiresAt = null;
    state.directiveLeaseOwner = null;
    state.updatedAt = clone(input.now);
    return true;
  }

  async retryAiCollectDirectiveDisable(
    input: Parameters<WorkflowRuntimeRepository["retryAiCollectDirectiveDisable"]>[0],
  ) {
    const state = this.aiCollectStates.find(item => item.uid === input.uid
      && item.taskId === input.taskId
      && item.directiveStatus === "disabling"
      && item.directiveLeaseOwner === input.leaseOwner);
    if (!state) return false;
    state.directiveStatus = "active";
    state.directiveLeaseExpiresAt = null;
    state.directiveLeaseOwner = null;
    state.directiveNextAttemptAt = clone(input.nextAttemptAt);
    state.updatedAt = clone(input.now);
    return true;
  }

  async claimInferenceBatch(input: Parameters<WorkflowRuntimeRepository["claimInferenceBatch"]>[0]) {
    const candidates = this.inferenceJobs
      .filter(job => (job.status === "pending" || job.status === "retry_wait")
        && job.nextAttemptAt <= input.now
        && job.deadlineAt > input.now
        && job.pausedAt === null)
      .sort((left, right) => compareDateAndId(left.nextAttemptAt, left.id, right.nextAttemptAt, right.id));
    const jobs: WorkflowInferenceJobRecord[] = [];
    for (const job of candidates) {
      if (jobs.length >= Math.max(0, input.limit)) break;
      const run = this.runs.find(item => item.uid === job.uid && item.id === job.runId);
      if (!run || run.status !== "waiting") continue;
      if (this.resolveWorkflowBoundary) {
        const boundary = await this.resolveWorkflowBoundary({ uid: job.uid, workflowId: run.workflowId });
        if (!boundary || getWorkflowExecutionBoundaryDecision(boundary) !== "execute") continue;
      }
      jobs.push(job);
    }
    for (const job of jobs) {
      job.attempt += 1;
      job.leaseExpiresAt = clone(input.leaseExpiresAt);
      job.leaseOwner = input.leaseOwner;
      job.status = "running";
      job.updatedAt = clone(input.now);
    }
    return clone(jobs);
  }

  async renewInferenceLease(input: Parameters<WorkflowRuntimeRepository["renewInferenceLease"]>[0]) {
    const job = this.inferenceJobs.find(item => item.id === input.id
      && item.status === "running" && item.leaseOwner === input.leaseOwner);
    if (!job) return false;
    job.leaseExpiresAt = clone(input.leaseExpiresAt);
    job.updatedAt = this.now();
    return true;
  }

  async completeInference(input: Parameters<WorkflowRuntimeRepository["completeInference"]>[0]) {
    return this.finishInference(input.id, input.leaseOwner, input.completedAt, {
      result: input.result,
      status: "succeeded",
    });
  }

  async retryInference(input: Parameters<WorkflowRuntimeRepository["retryInference"]>[0]) {
    const job = this.inferenceJobs.find(item => item.id === input.id
      && item.status === "running" && item.leaseOwner === input.leaseOwner);
    if (!job || input.nextAttemptAt >= job.deadlineAt) return false;
    job.errorCode = input.errorCode;
    job.errorMessage = input.errorMessage;
    job.failureKind = input.failureKind;
    job.leaseExpiresAt = null;
    job.leaseOwner = null;
    job.nextAttemptAt = clone(input.nextAttemptAt);
    job.status = "retry_wait";
    job.updatedAt = this.now();
    return true;
  }

  async failInference(input: Parameters<WorkflowRuntimeRepository["failInference"]>[0]) {
    return this.finishInference(input.id, input.leaseOwner, input.failedAt, {
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      failureKind: input.failureKind,
      status: "failed",
    });
  }

  async recoverInferenceJobs(input: Parameters<WorkflowRuntimeRepository["recoverInferenceJobs"]>[0]) {
    let expired = 0;
    let recovered = 0;
    const eligible: WorkflowInferenceJobRecord[] = [];
    for (const job of this.inferenceJobs) {
      if ((job.status !== "pending" && job.status !== "retry_wait" && job.status !== "running")
        || job.pausedAt !== null) continue;
      const run = this.runs.find(item => item.uid === job.uid && item.id === job.runId);
      if (!run) continue;
      if (this.resolveWorkflowBoundary) {
        const boundary = await this.resolveWorkflowBoundary({ uid: job.uid, workflowId: run.workflowId });
        if (!boundary || getWorkflowExecutionBoundaryDecision(boundary) !== "execute") continue;
      }
      const leaseExpired = job.status === "running"
        && job.leaseExpiresAt !== null
        && job.leaseExpiresAt <= input.now;
      const attemptsExhausted = job.attempt >= input.maxAttempts
        && (job.status !== "running" || leaseExpired);
      if (job.deadlineAt <= input.now || attemptsExhausted || leaseExpired) eligible.push(job);
    }
    for (const job of eligible.sort(compareById).slice(0, Math.max(0, input.limit))) {
      const leaseExpired = job.status === "running"
        && job.leaseExpiresAt !== null
        && job.leaseExpiresAt <= input.now;
      const attemptsExhausted = job.attempt >= input.maxAttempts
        && (job.status !== "running" || leaseExpired);
      if (job.deadlineAt <= input.now || attemptsExhausted) {
        const finished = await this.finishInference(job.id, job.leaseOwner, input.now, {
          errorCode: job.deadlineAt <= input.now
            ? "WORKFLOW_INFERENCE_DEADLINE_EXCEEDED"
            : "WORKFLOW_INFERENCE_ATTEMPTS_EXHAUSTED",
          errorMessage: "执行未完成",
          failureKind: "unknown",
          status: "failed",
        }, true);
        if (finished) expired += 1;
      } else if (leaseExpired) {
        job.leaseExpiresAt = null;
        job.leaseOwner = null;
        job.nextAttemptAt = clone(input.now);
        job.status = "pending";
        job.updatedAt = clone(input.now);
        recovered += 1;
      }
    }
    return { expired, recovered };
  }

  async transitionInferenceJobs(
    input: Parameters<WorkflowRuntimeRepository["transitionInferenceJobs"]>[0],
  ) {
    const workflowIds = new Set(input.workflowIds);
    for (const job of this.inferenceJobs) {
      if (job.uid !== input.uid) continue;
      const run = this.runs.find(item => item.uid === job.uid && item.id === job.runId);
      if (!run || !workflowIds.has(run.workflowId)) continue;
      if (input.transition === "cancel") {
        if (job.status !== "pending" && job.status !== "retry_wait" && job.status !== "running") continue;
        job.status = "cancelled";
        job.leaseExpiresAt = null;
        job.leaseOwner = null;
        job.pausedAt = null;
      } else if (input.transition === "pause") {
        if ((job.status !== "pending" && job.status !== "retry_wait" && job.status !== "running")
          || job.pausedAt !== null
          || job.deadlineAt <= input.transitionedAt) continue;
        job.pausedAt = clone(input.transitionedAt);
        if (job.status === "running") {
          job.attempt = Math.max(0, job.attempt - 1);
          job.status = "pending";
        }
        job.leaseExpiresAt = null;
        job.leaseOwner = null;
      } else if (job.pausedAt !== null) {
        const pausedMs = Math.max(0, input.transitionedAt.getTime() - job.pausedAt.getTime());
        job.deadlineAt = new Date(job.deadlineAt.getTime() + pausedMs);
        job.nextAttemptAt = new Date(job.nextAttemptAt.getTime() + pausedMs);
        job.pausedAt = null;
      }
      job.updatedAt = clone(input.transitionedAt);
    }
  }

  async scheduleCapabilityRetry(
    input: Parameters<WorkflowRuntimeRepository["scheduleCapabilityRetry"]>[0],
  ) {
    const state = this.requireCapabilityFailureState(input);
    if ("kind" in state) return state;
    const { execution, run, task } = state;
    const boundary = this.resolveWorkflowBoundary
      ? await this.resolveWorkflowBoundary({ uid: task.uid, workflowId: task.workflowId })
      : { bizStatus: 1 as const, runtimeStatus: "active" as const };
    const boundaryDecision = boundary ? getWorkflowExecutionBoundaryDecision(boundary) : "cancel";
    if (boundaryDecision === "cancel") return conflict();
    this.inbox.push({ ...clone(input.inbox), uid: input.uid });
    execution.errorCode = input.errorCode;
    execution.errorMessage = input.errorMessage;
    execution.failureKind = input.failureKind;
    execution.status = "retrying";
    task.dueAt = input.dueAt;
    task.leaseExpiresAt = null;
    task.leaseOwner = null;
    task.status = boundaryDecision === "defer" ? "suspended" : transitionTask(task.status, "pending");
    task.taskVersion += 1;
    run.lockVersion += 1;
    run.nextExecuteAt = input.dueAt;
    this.touchRun(run);
    return { kind: "success" as const, task: clone(task) };
  }

  async failCapabilityExecution(
    input: Parameters<WorkflowRuntimeRepository["failCapabilityExecution"]>[0],
  ) {
    const state = this.requireCapabilityFailureState(input);
    if ("kind" in state) return state;
    const { execution, run, task } = state;
    this.inbox.push({ ...clone(input.inbox), uid: input.uid });
    execution.errorCode = input.errorCode;
    execution.errorMessage = input.errorMessage;
    execution.failureKind = input.failureKind;
    execution.status = "failed";
    task.leaseExpiresAt = null;
    task.leaseOwner = null;
    task.status = transitionTask(task.status, "dead");
    task.taskVersion += 1;
    run.lockVersion += 1;
    run.nextExecuteAt = null;
    run.status = transitionRun(run.status, "failed");
    this.appendNodeMetricEvents(run, `${run.id}:${task.id}:failed`, createNodeMetricDeltas({
      kind: "left-incomplete",
      nodeId: task.nodeId,
      nodeKind: task.nodeKind,
    }));
    this.touchRun(run);
    return { kind: "success" as const, run: clone(run), task: clone(task) };
  }

  private requireCapabilityFailureState(input: WorkflowCapabilityExecutionFailureInput) {
    if (this.inbox.some(item => item.consumer === input.inbox.consumer
      && item.messageId === input.inbox.messageId)) return alreadyProcessed();
    const run = this.runs.find(item => item.uid === input.uid && item.id === input.runId);
    const task = this.tasks.find(item => item.uid === input.uid && item.id === input.taskId);
    if (!run || !task || task.runId !== run.id) return notFound();
    const execution = this.nodeExecutions.find(item => item.uid === input.uid
      && item.runId === input.runId
      && item.sequence === task.sequence
      && item.executionKey === input.executionKey);
    if (!execution) return notFound();
    if (run.lockVersion !== input.expectedRunLockVersion
      || run.status !== "running"
      || task.taskVersion !== input.expectedTaskVersion
      || task.status !== "running"
      || execution.status !== "running") return conflict();
    return { execution, run, task };
  }

  async commitNodeResult(input: WorkflowCommitNodeResultInput) {
    if (this.inbox.some((item) =>
      item.consumer === input.inbox.consumer && item.messageId === input.inbox.messageId,
    )) return alreadyProcessed();

    const run = this.runs.find((item) => item.uid === input.uid && item.id === input.runId);
    const task = this.tasks.find((item) => item.uid === input.uid && item.id === input.taskId);
    if (!run || !task || task.runId !== run.id) return notFound();
    if (run.lockVersion !== input.expectedRunLockVersion
      || run.status !== "running"
      || task.taskVersion !== input.expectedTaskVersion
      || task.status !== "running"
      || task.sequence !== run.sequence
      || task.revision !== run.revision
      || task.nodeId !== run.currentNodeId) return conflict();

    const failed = input.nodeExecution.errorCode !== undefined;
    const nextContext = !failed && input.context ? clone(input.context) : run.context;
    let boundaryDecision: "cancel" | "defer" | "execute" = "execute";
    let forwardRoute: ReturnType<typeof resolveWorkflowForwardRoute> | null = null;
    let publishedRevision: WorkflowRuntimeRevisionRecord | null = null;
    if (!failed && input.sourceOutletId) {
      if (this.resolveWorkflowBoundary) {
        const boundary = await this.resolveWorkflowBoundary({ uid: input.uid, workflowId: run.workflowId });
        boundaryDecision = boundary ? getWorkflowExecutionBoundaryDecision(boundary) : "cancel";
      }
      if (boundaryDecision === "cancel") {
        return { action: "cancel" as const, kind: "workflow-unavailable" as const };
      }
      if (!this.resolvePublishedRevision) return conflict();
      publishedRevision = await this.resolvePublishedRevision({ uid: input.uid, workflowId: run.workflowId });
      if (!publishedRevision) return conflict();
      forwardRoute = resolveWorkflowForwardRoute({
        context: nextContext,
        currentNodeId: task.nodeId,
        currentNodeKind: task.nodeKind,
        latestSpec: publishedRevision.executionSpec,
        sourceOutletId: input.sourceOutletId,
      });
    }

    const nextTaskStatus = transitionTask(task.status, failed ? "dead" : "completed");
    const existingExecution = this.nodeExecutions.find(item => item.uid === input.uid
      && item.runId === run.id
      && item.sequence === task.sequence);
    if (existingExecution) {
      if (existingExecution.executionKey !== input.nodeExecution.executionKey
        || existingExecution.revision !== task.revision
        || existingExecution.status !== "running") return conflict();
      existingExecution.errorCode = input.nodeExecution.errorCode ?? null;
      existingExecution.errorMessage = input.nodeExecution.errorMessage ?? null;
      existingExecution.failureKind = null;
      existingExecution.output = clone(input.nodeExecution.output);
      existingExecution.sourceOutletId = input.nodeExecution.sourceOutletId ?? null;
      existingExecution.status = failed ? "failed" : "completed";
    } else {
      this.nodeExecutions.push({
        errorCode: input.nodeExecution.errorCode ?? null,
        errorMessage: input.nodeExecution.errorMessage ?? null,
        failureKind: null,
        executionKey: input.nodeExecution.executionKey,
        input: clone(input.nodeExecution.input),
        nodeId: task.nodeId,
        nodeKind: task.nodeKind,
        output: clone(input.nodeExecution.output),
        runId: run.id,
        revision: task.revision,
        sequence: task.sequence,
        sourceOutletId: input.nodeExecution.sourceOutletId ?? null,
        status: failed ? "failed" : "completed",
        uid: input.uid,
      });
    }
    this.inbox.push({ ...clone(input.inbox), uid: input.uid });
    task.status = nextTaskStatus;
    task.taskVersion += 1;
    task.leaseOwner = null;
    task.leaseExpiresAt = null;
    run.lockVersion += 1;
    if (!failed && input.context) {
      run.context = clone(input.context);
    }

    let nextTask: WorkflowTaskRecord | null = null;
    if (failed) {
      run.status = transitionRun(run.status, "failed");
      run.nextExecuteAt = null;
      run.terminalReason = input.nodeExecution.errorCode ?? null;
      this.appendNodeMetricEvents(run, `${run.id}:${task.sequence}:failed`, createNodeMetricDeltas({
        kind: "left-incomplete",
        nodeId: task.nodeId,
        nodeKind: task.nodeKind,
      }), task.revision);
    } else if (forwardRoute?.kind === "flow-changed") {
      run.status = transitionRun(run.status, "cancelled");
      run.nextExecuteAt = null;
      run.terminalReason = forwardRoute.reason;
      this.appendNodeMetricEvents(run, `${run.id}:${task.sequence}:flow-changed`, createNodeMetricDeltas({
        kind: "left-incomplete",
        nodeId: task.nodeId,
        nodeKind: task.nodeKind,
      }), task.revision);
    } else if (forwardRoute?.kind === "success" && publishedRevision) {
      const nextSequence = run.sequence + 1;
      const arrivedAt = this.now();
      run.currentNodeId = forwardRoute.target.id;
      run.revision = publishedRevision.revision;
      run.sequence = nextSequence;
      run.status = transitionRun(run.status, "running");
      run.nextExecuteAt = clone(arrivedAt);
      run.terminalReason = null;
      nextTask = createTask(this.createId(), run, {
        createdAt: arrivedAt,
        dispatchImmediately: boundaryDecision === "execute",
        dueAt: arrivedAt,
        nodeId: forwardRoute.target.id,
        nodeKind: forwardRoute.target.kind,
        taskType: "execute",
      });
      if (boundaryDecision === "defer") nextTask.status = "suspended";
      this.tasks.push(nextTask);
      if (nextTask.status === "dispatched") {
        this.outbox.push(createOutbox(this.createId(), nextTask, arrivedAt));
      }
      const deltas = createNodeMetricDeltas({
        fromNodeId: task.nodeId,
        fromNodeKind: task.nodeKind,
        kind: "advanced",
        toNodeId: forwardRoute.target.id,
        toNodeKind: forwardRoute.target.kind,
      });
      this.appendNodeMetricEvents(
        run,
        `${run.id}:${task.sequence}:advanced:left`,
        deltas.filter(delta => delta.nodeId === task.nodeId),
        task.revision,
      );
      this.appendNodeMetricEvents(
        run,
        `${run.id}:${task.sequence}:advanced:entered`,
        deltas.filter(delta => delta.nodeId === forwardRoute.target.id),
        publishedRevision.revision,
      );
    } else {
      run.status = transitionRun(run.status, "completed");
      run.nextExecuteAt = null;
      run.terminalReason = null;
      this.appendNodeMetricEvents(run, `${run.id}:${task.sequence}:completed`, createNodeMetricDeltas({
        kind: "completed",
        nodeId: task.nodeId,
        nodeKind: task.nodeKind,
      }), task.revision);
    }
    this.touchRun(run);
    return {
      kind: "success" as const,
      nextTask: nextTask ? clone(nextTask) : null,
      run: clone(run),
    };
  }

  async recoverExpiredLeases(input: Parameters<WorkflowRuntimeRepository["recoverExpiredLeases"]>[0]) {
    const recoverable = this.tasks
      .filter((task) => task.status === "running" && task.leaseExpiresAt && task.leaseExpiresAt <= input.now)
      .slice(0, Math.max(0, input.limit));
    let dead = 0;
    let recovered = 0;
    for (const task of recoverable) {
      const exhausted = task.attempt >= input.maxAttempts;
      const boundary = this.resolveWorkflowBoundary
        ? await this.resolveWorkflowBoundary({ uid: task.uid, workflowId: task.workflowId })
        : { bizStatus: 1 as const, runtimeStatus: "active" as const };
      const boundaryDecision = boundary ? getWorkflowExecutionBoundaryDecision(boundary) : "cancel";
      task.status = exhausted
        ? "dead"
        : boundaryDecision === "execute"
          ? "pending"
          : boundaryDecision === "defer"
            ? "suspended"
            : "cancelled";
      task.taskVersion += 1;
      task.leaseOwner = null;
      task.leaseExpiresAt = null;
      if (exhausted) {
        dead += 1;
        const execution = this.nodeExecutions.find(item => item.uid === task.uid
          && item.runId === task.runId
          && item.sequence === task.sequence
          && item.status === "running");
        if (execution) {
          execution.errorCode = "WORKFLOW_TASK_ATTEMPTS_EXHAUSTED";
          execution.errorMessage = "多次执行失败，流程已停止";
          execution.failureKind = null;
          execution.status = "failed";
        }
        const run = this.runs.find(candidate => candidate.id === task.runId && candidate.uid === task.uid);
        if (run && (run.status === "queued" || run.status === "running" || run.status === "waiting")) {
          this.appendNodeMetricEvents(run, `${run.id}:${task.sequence}:failed`, createNodeMetricDeltas({
            kind: "left-incomplete",
            nodeId: task.nodeId,
            nodeKind: task.nodeKind,
          }));
          run.status = "failed";
          run.lockVersion += 1;
          run.nextExecuteAt = null;
          this.touchRun(run);
        }
      } else {
        recovered += 1;
      }
    }
    return { dead, recovered };
  }

  async reconcileRunTaskConsistency(
    input: Parameters<WorkflowRuntimeRepository["reconcileRunTaskConsistency"]>[0],
  ) {
    const activeRunStatuses = new Set(["queued", "running", "waiting"]);
    const activeTaskStatuses = new Set(["pending", "suspended", "waiting_external", "leased", "dispatched", "running"]);
    const runCandidates = this.runs
      .filter(run => activeRunStatuses.has(run.status)
        && (!input.afterRunId || BigInt(run.id) > BigInt(input.afterRunId)))
      .sort(compareById)
      .slice(0, Math.max(0, input.limit) + 1);
    const selectedRuns = runCandidates.slice(0, Math.max(0, input.limit));
    let inconsistentRunsFailed = 0;
    let staleTasksCancelled = 0;
    let taskStatusesReconciled = 0;

    for (const run of selectedRuns) {
      const boundary = this.resolveWorkflowBoundary
        ? await this.resolveWorkflowBoundary({ uid: run.uid, workflowId: run.workflowId })
        : { bizStatus: 1 as const, runtimeStatus: "active" as const };
      if (!boundary) continue;
      const boundaryDecision = getWorkflowExecutionBoundaryDecision(boundary);
      if (boundaryDecision === "cancel") continue;

      const activeTasks = this.tasks.filter(task => task.runId === run.id && activeTaskStatuses.has(task.status));
      const authoritativeTask = activeTasks.find(task => task.sequence === run.sequence);
      for (const task of activeTasks) {
        if (task === authoritativeTask) continue;
        cancelTask(task);
        staleTasksCancelled += 1;
      }

      const updatedAt = this.runUpdatedAt.get(run.id) ?? run.createdAt;
      const invalidAuthoritativeTask = !authoritativeTask
        || authoritativeTask.uid !== run.uid
        || authoritativeTask.workflowId !== run.workflowId
        || authoritativeTask.revision !== run.revision
        || authoritativeTask.shardId !== run.shardId
        || authoritativeTask.nodeId !== run.currentNodeId
        || (run.status === "waiting" && (
          (authoritativeTask.taskType !== "wait" && authoritativeTask.taskType !== "wait-event"
            && authoritativeTask.taskType !== "inference"
            && authoritativeTask.taskType !== "ai-collect"
            && !(authoritativeTask.taskType === "execute"
              && isWorkflowTaskDeferReasonCode(authoritativeTask.lastErrorCode)))
          || !sameDate(authoritativeTask.dueAt, run.nextExecuteAt)
        ));
      if (!invalidAuthoritativeTask && authoritativeTask) {
        const repairedStatus = boundaryDecision === "execute" && authoritativeTask.status === "suspended"
          ? "pending" as const
          : boundaryDecision === "defer" && authoritativeTask.status === "pending"
            ? "suspended" as const
            : null;
        if (repairedStatus) {
          authoritativeTask.leaseExpiresAt = null;
          authoritativeTask.leaseOwner = null;
          authoritativeTask.status = repairedStatus;
          authoritativeTask.taskVersion += 1;
          taskStatusesReconciled += 1;
        }
      }
      if (!invalidAuthoritativeTask || updatedAt > input.inconsistentBefore) continue;

      for (const task of activeTasks) {
        if (!activeTaskStatuses.has(task.status)) continue;
        cancelTask(task);
        staleTasksCancelled += 1;
      }
      const currentTask = this.findCurrentTask(run);
      if (currentTask) this.appendNodeMetricEvents(
        run,
        `${run.id}:runtime-state-inconsistent`,
        createNodeMetricDeltas({
          kind: "left-incomplete",
          nodeId: currentTask.nodeId,
          nodeKind: currentTask.nodeKind,
        }),
      );
      run.status = "failed";
      run.lockVersion += 1;
      run.nextExecuteAt = null;
      this.runCompletedAt.set(run.id, input.now);
      this.runUpdatedAt.set(run.id, input.now);
      inconsistentRunsFailed += 1;
    }

    const taskCandidates = this.tasks
      .filter(task => activeTaskStatuses.has(task.status)
        && (!input.afterTaskId || BigInt(task.id) > BigInt(input.afterTaskId)))
      .sort(compareById)
      .slice(0, Math.max(0, input.limit) + 1);
    const selectedTasks = taskCandidates.slice(0, Math.max(0, input.limit));
    let terminalRunTasksCancelled = 0;
    for (const task of selectedTasks) {
      const run = this.runs.find(candidate => candidate.id === task.runId);
      if (run && activeRunStatuses.has(run.status)) continue;
      cancelTask(task);
      terminalRunTasksCancelled += 1;
    }

    return {
      hasMoreRuns: runCandidates.length > selectedRuns.length,
      hasMoreTasks: taskCandidates.length > selectedTasks.length,
      inconsistentRunsFailed,
      lastRunId: selectedRuns.at(-1)?.id ?? null,
      lastTaskId: selectedTasks.at(-1)?.id ?? null,
      runsChecked: selectedRuns.length,
      staleTasksCancelled,
      taskStatusesReconciled,
      tasksChecked: selectedTasks.length,
      terminalRunTasksCancelled,
    };
  }

  async reconcileTenantCapacityCounts(
    input: Parameters<WorkflowRuntimeRepository["reconcileTenantCapacityCounts"]>[0],
  ) {
    const limit = Math.max(0, Math.trunc(input.limit));
    const candidateUids = [...new Set(this.runs.map(run => run.uid))]
      .filter(uid => input.afterUid === undefined || uid > input.afterUid)
      .sort((left, right) => left - right)
      .slice(0, limit + 1);
    const selectedUids = candidateUids.slice(0, limit);
    return {
      checked: selectedUids.length,
      corrected: 0,
      hasMore: candidateUids.length > selectedUids.length,
      lastUid: selectedUids.at(-1) ?? null,
    };
  }

  async deactivateWorkflowForEntitlementLoss(
    _input: Parameters<WorkflowRuntimeRepository["deactivateWorkflowForEntitlementLoss"]>[0],
  ): Promise<{ affectedDefinitions: number }> {
    throw new Error(
      "InMemoryWorkflowRuntimeRepository does not support Workflow definition deactivation",
    );
  }

  async listActiveCapacityTenants(
    input: Parameters<WorkflowRuntimeRepository["listActiveCapacityTenants"]>[0],
  ) {
    const limit = Math.max(0, Math.trunc(input.limit));
    const candidateUids = [...new Set(this.runs.filter(run =>
      WORKFLOW_ACTIVE_RUN_STATUSES.includes(
        run.status as typeof WORKFLOW_ACTIVE_RUN_STATUSES[number],
      )).map(run => run.uid))]
      .filter(uid => input.afterUid === undefined || uid > input.afterUid)
      .sort((left, right) => left - right)
      .slice(0, limit + 1);
    const uids = candidateUids.slice(0, limit);
    return {
      hasMore: candidateUids.length > uids.length,
      lastUid: uids.at(-1) ?? null,
      uids,
    };
  }

  async listActiveRunWorkflowIds(
    input: Parameters<WorkflowRuntimeRepository["listActiveRunWorkflowIds"]>[0],
  ) {
    const seen = new Set<string>();
    const result: Array<{
      workflowId: string;
      workflowType: import("@chatai/contracts").WorkflowType;
    }> = [];
    for (const run of this.runs) {
      if (run.uid !== input.uid
        || !WORKFLOW_ACTIVE_RUN_STATUSES.includes(
          run.status as typeof WORKFLOW_ACTIVE_RUN_STATUSES[number],
        )
        || seen.has(run.workflowId)) continue;
      const workflowType = this.runWorkflowTypes.get(run.id);
      if (!workflowType || !input.workflowTypes.includes(workflowType)) continue;
      seen.add(run.workflowId);
      result.push({ workflowId: run.workflowId, workflowType });
    }
    return result;
  }

  async reconcileEventSubscriptions(
    input: Parameters<WorkflowRuntimeRepository["reconcileEventSubscriptions"]>[0],
  ) {
    const candidates = this.eventSubscriptions
      .filter(item => (item.status === "waiting" || item.status === "triggered")
        && (!input.afterSubscriptionId || BigInt(item.id) > BigInt(input.afterSubscriptionId)))
      .sort(compareById)
      .slice(0, Math.max(0, input.limit) + 1);
    const selected = candidates.slice(0, Math.max(0, input.limit));
    let cancelled = 0;
    for (const subscription of selected) {
      const run = this.runs.find(item => item.uid === subscription.uid && item.id === subscription.runId);
      const task = this.tasks.find(item => item.uid === subscription.uid && item.id === subscription.taskId);
      const consistent = run
        && (run.status === "queued" || run.status === "running" || run.status === "waiting")
        && run.currentNodeId === subscription.nodeId
        && task
        && task.runId === run.id
        && task.nodeId === subscription.nodeId
        && task.nodeKind === "wait-event"
        && task.taskType === "wait-event"
        && (task.status === "pending"
          || task.status === "suspended"
          || task.status === "leased"
          || task.status === "dispatched"
          || task.status === "running")
        && task.dueAt.getTime() === (subscription.status === "triggered"
          ? subscription.resumeAt?.getTime()
          : subscription.expiresAt.getTime());
      if (consistent) continue;
      subscription.status = "cancelled";
      subscription.updatedAt = this.now();
      cancelled += 1;
    }
    return {
      cancelled,
      checked: selected.length,
      hasMore: candidates.length > selected.length,
      lastSubscriptionId: selected.at(-1)?.id ?? null,
    };
  }

  async republishStalledDispatchedTasks(
    input: Parameters<WorkflowRuntimeRepository["republishStalledDispatchedTasks"]>[0],
  ) {
    const recoverable = this.tasks
      .filter(task => task.status === "dispatched")
      .filter(task => {
        const currentOutbox = findLast(this.outbox, item =>
          item.payload.taskId === task.id && item.taskVersion === task.taskVersion,
        );
        return currentOutbox?.status === "sent"
          && currentOutbox.sentAt !== null
          && currentOutbox.sentAt <= input.dispatchedBefore;
      })
      .slice(0, Math.max(0, input.limit));
    for (const task of recoverable) {
      const previous = findLast(this.outbox, item =>
        item.payload.taskId === task.id
        && item.taskVersion === task.taskVersion
        && item.status === "sent",
      );
      if (previous) previous.status = "republished";
      this.outbox.push(createOutbox(this.createId(), task, input.now));
    }
    return recoverable.length;
  }

  async cleanupExpiredInbox(input: Parameters<WorkflowRuntimeRepository["cleanupExpiredInbox"]>[0]) {
    const expired = this.inbox
      .filter(item => item.expiresAt <= input.now)
      .slice(0, Math.max(0, input.limit));
    const expiredKeys = new Set(expired.map(item => `${item.consumer}\0${item.messageId}`));
    this.inbox = this.inbox.filter(item => !expiredKeys.has(`${item.consumer}\0${item.messageId}`));
    return expired.length;
  }

  async cleanupWorkflowHistory(
    input: Parameters<WorkflowRuntimeRepository["cleanupWorkflowHistory"]>[0],
  ) {
    if (input.limit <= 0) {
      return {
        hasMore: false,
        nodeExecutionsDeleted: 0,
        outboxDeleted: 0,
        runsDeleted: 0,
        tasksDeleted: 0,
      };
    }
    const terminal = new Set(["cancelled", "completed", "failed"]);
    const technicalRuns = this.runs
      .filter(run => terminal.has(run.status))
      .filter(run => (this.runCompletedAt.get(run.id) ?? run.createdAt) < input.taskOutboxBefore)
      .filter(run => this.tasks.some(task => task.runId === run.id))
      .sort(compareById)
      .slice(0, Math.max(0, input.limit) + 1);
    const selectedTechnicalRuns = technicalRuns.slice(0, input.limit);
    const blockedTechnicalRunIds = new Set(selectedTechnicalRuns
      .filter(run => this.tasks.some(task => task.runId === run.id
        && this.outbox.some(item => item.payload.taskId === task.id && item.status === "leased")))
      .map(run => run.id));
    const technicalRunIds = new Set(selectedTechnicalRuns
      .filter(run => !blockedTechnicalRunIds.has(run.id))
      .map(run => run.id));
    const taskIds = new Set(this.tasks
      .filter(task => technicalRunIds.has(task.runId))
      .map(task => task.id));
    const outboxDeleted = this.outbox.filter(item => taskIds.has(item.payload.taskId)).length;
    const tasksDeleted = this.tasks.filter(task => technicalRunIds.has(task.runId)).length;
    this.outbox = this.outbox.filter(item => !taskIds.has(item.payload.taskId));
    for (let index = this.inferenceJobs.length - 1; index >= 0; index -= 1) {
      if (technicalRunIds.has(this.inferenceJobs[index]!.runId)) this.inferenceJobs.splice(index, 1);
    }
    for (let index = this.eventSubscriptions.length - 1; index >= 0; index -= 1) {
      if (technicalRunIds.has(this.eventSubscriptions[index]!.runId)) {
        this.eventSubscriptions.splice(index, 1);
      }
    }
    for (let index = this.aiCollectStates.length - 1; index >= 0; index -= 1) {
      if (technicalRunIds.has(this.aiCollectStates[index]!.runId)) {
        this.aiCollectStates.splice(index, 1);
      }
    }
    for (let index = this.tasks.length - 1; index >= 0; index -= 1) {
      if (technicalRunIds.has(this.tasks[index]!.runId)) this.tasks.splice(index, 1);
    }

    const expiredRuns = this.runs
      .filter(run => terminal.has(run.status))
      .filter(run => (this.runCompletedAt.get(run.id) ?? run.createdAt) < input.runBefore)
      .sort(compareById)
      .slice(0, Math.max(0, input.limit) + 1);
    const selectedExpiredRuns = expiredRuns.slice(0, input.limit);
    const expiredRunIds = new Set(selectedExpiredRuns
      .filter(run => !this.tasks.some(task => task.runId === run.id))
      .map(run => run.id));
    const nodeExecutionsDeleted = this.nodeExecutions.filter(item => expiredRunIds.has(item.runId)).length;
    for (let index = this.nodeExecutions.length - 1; index >= 0; index -= 1) {
      if (expiredRunIds.has(this.nodeExecutions[index]!.runId)) this.nodeExecutions.splice(index, 1);
    }
    for (let index = this.runs.length - 1; index >= 0; index -= 1) {
      const run = this.runs[index]!;
      if (!expiredRunIds.has(run.id)) continue;
      this.runs.splice(index, 1);
      this.runCompletedAt.delete(run.id);
      this.runUpdatedAt.delete(run.id);
    }
    return {
      hasMore: blockedTechnicalRunIds.size > 0
        || selectedExpiredRuns.some(run => this.tasks.some(task => task.runId === run.id))
        || technicalRuns.length > input.limit
        || expiredRuns.length > input.limit,
      nodeExecutionsDeleted,
      outboxDeleted,
      runsDeleted: expiredRunIds.size,
      tasksDeleted,
    };
  }

  async aggregateNodeMetricEvents(input: Parameters<WorkflowRuntimeRepository["aggregateNodeMetricEvents"]>[0]) {
    const events = this.nodeMetricEvents.filter(event => event.processedAt === null).slice(0, Math.max(0, input.limit));
    for (const event of events) {
      let metric = this.nodeMetrics.find(item => item.uid === event.uid
        && item.workflowId === event.workflowId
        && item.revision === event.revision
        && item.nodeId === event.nodeId
        && item.shardId === event.shardId);
      if (!metric) {
        metric = {
          completed: 0,
          current: 0,
          entered: 0,
          incomplete: 0,
          nodeId: event.nodeId,
          passed: 0,
          revision: event.revision,
          shardId: event.shardId,
          uid: event.uid,
          updatedAt: this.now(),
          workflowId: event.workflowId,
        };
        this.nodeMetrics.push(metric);
      }
      metric.completed += event.completed;
      metric.current = Math.max(0, metric.current + event.current);
      metric.entered += event.entered;
      metric.incomplete += event.incomplete;
      metric.passed += event.passed;
      metric.updatedAt = this.now();
      event.processedAt = this.now();
    }
    return events.length;
  }

  async cleanupProcessedNodeMetricEvents(
    input: Parameters<WorkflowRuntimeRepository["cleanupProcessedNodeMetricEvents"]>[0],
  ) {
    const selected = this.nodeMetricEvents
      .filter(event => event.processedAt !== null && event.processedAt <= input.processedBefore)
      .slice(0, Math.max(0, input.limit));
    const keys = new Set(selected.map(event => event.eventKey));
    for (let index = this.nodeMetricEvents.length - 1; index >= 0; index -= 1) {
      if (keys.has(this.nodeMetricEvents[index]!.eventKey)) this.nodeMetricEvents.splice(index, 1);
    }
    return selected.length;
  }

  async listNodeMetrics(uid: number, workflowId: string, revision: number) {
    return clone(this.nodeMetrics.filter(item => item.uid === uid
      && item.workflowId === workflowId
      && item.revision === revision));
  }

  async dispatchDueTasks(input: Parameters<WorkflowRuntimeRepository["dispatchDueTasks"]>[0]) {
    const candidates = this.tasks
      .filter(task => task.status === "pending" && task.dueAt <= input.now)
      .sort((first, second) => compareDateAndId(
        first.dueAt,
        first.id,
        second.dueAt,
        second.id,
      ));
    const result = { cancelled: 0, dispatched: 0, suspended: 0 };
    for (const task of candidates) {
      if (result.cancelled + result.dispatched + result.suspended >= Math.max(0, input.limit)) break;
      const boundary = this.resolveWorkflowBoundary
        ? await this.resolveWorkflowBoundary({ uid: task.uid, workflowId: task.workflowId })
        : { bizStatus: 1 as const, runtimeStatus: "active" as const };
      const decision = boundary ? getWorkflowExecutionBoundaryDecision(boundary) : "cancel";
      if (decision === "defer") {
        task.status = "suspended";
        task.taskVersion += 1;
        result.suspended += 1;
        continue;
      }
      task.taskVersion += 1;
      if (decision === "cancel") {
        task.status = "cancelled";
        this.cancelEventSubscriptions(new Set([task.runId]));
        this.cancelInferenceJobs(new Set([task.runId]));
        result.cancelled += 1;
        continue;
      }
      task.status = "dispatched";
      this.outbox.push(createOutbox(this.createId(), task, input.now));
      result.dispatched += 1;
    }
    return result;
  }

  async processTaskStatusTransitionBatch(
    _input: Parameters<WorkflowRuntimeRepository["processTaskStatusTransitionBatch"]>[0],
  ) {
    return { claimed: false, dead: 0, failed: 0, hasMore: false, transitioned: 0 };
  }

  async claimOutboxBatch(input: Parameters<WorkflowRuntimeRepository["claimOutboxBatch"]>[0]) {
    const candidates = this.outbox
      .filter(item => item.status === "pending" && item.nextAttemptAt <= input.now)
      .sort((first, second) => compareDateAndId(
        first.nextAttemptAt,
        first.id,
        second.nextAttemptAt,
        second.id,
      ))
      .slice(0, Math.max(0, input.limit));
    for (const item of candidates) {
      item.status = "leased";
      item.attempt += 1;
      item.leaseOwner = input.leaseOwner;
      item.leaseExpiresAt = input.leaseExpiresAt;
    }
    return clone(candidates);
  }

  async markOutboxFailed(input: Parameters<WorkflowRuntimeRepository["markOutboxFailed"]>[0]) {
    const item = this.outbox.find(candidate => candidate.id === input.id
      && candidate.status === "leased"
      && candidate.leaseOwner === input.leaseOwner);
    if (!item) return false;
    item.status = "pending";
    item.nextAttemptAt = input.nextAttemptAt;
    item.leaseOwner = null;
    item.leaseExpiresAt = null;
    return true;
  }

  async markOutboxDead(input: Parameters<WorkflowRuntimeRepository["markOutboxDead"]>[0]) {
    const item = this.outbox.find(candidate => candidate.id === input.id
      && candidate.status === "leased"
      && candidate.leaseOwner === input.leaseOwner);
    if (!item) return false;
    item.status = "dead";
    item.leaseOwner = null;
    item.leaseExpiresAt = null;
    const task = this.tasks.find(candidate => candidate.id === item.payload.taskId
      && candidate.uid === item.uid
      && candidate.status === "dispatched"
      && candidate.taskVersion === item.taskVersion);
    if (task) {
      task.status = "dead";
      task.taskVersion += 1;
      const run = this.runs.find(candidate => candidate.id === task.runId && candidate.uid === task.uid);
      if (run && (run.status === "queued" || run.status === "running" || run.status === "waiting")) {
        run.status = "failed";
        run.lockVersion += 1;
        run.nextExecuteAt = null;
        this.touchRun(run);
      }
    }
    return true;
  }

  async markOutboxSentBatch(
    input: Parameters<WorkflowRuntimeRepository["markOutboxSentBatch"]>[0],
  ) {
    const ids = new Set(input.ids);
    let sent = 0;
    for (const item of this.outbox) {
      if (!ids.has(item.id)
        || item.status !== "leased"
        || item.leaseOwner !== input.leaseOwner) continue;
      item.status = "sent";
      item.sentAt = input.sentAt;
      item.leaseOwner = null;
      item.leaseExpiresAt = null;
      sent += 1;
    }
    return sent;
  }

  async recoverExpiredOutboxLeases(
    input: Parameters<WorkflowRuntimeRepository["recoverExpiredOutboxLeases"]>[0],
  ) {
    const recoverable = this.outbox
      .filter(item => item.status === "leased"
        && item.leaseExpiresAt
        && item.leaseExpiresAt <= input.now)
      .slice(0, Math.max(0, input.limit));
    for (const item of recoverable) {
      item.status = "pending";
      item.leaseOwner = null;
      item.leaseExpiresAt = null;
      item.nextAttemptAt = input.now;
    }
    return recoverable.length;
  }

  snapshot() {
    return clone({
      aiCollectStates: this.aiCollectStates,
      capacityDailyMetrics: [...this.capacityDailyMetrics.entries()],
      eventSubscriptions: this.eventSubscriptions,
      inferenceJobs: this.inferenceJobs,
      inbox: this.inbox,
      nodeExecutions: this.nodeExecutions,
      nodeMetricEvents: this.nodeMetricEvents,
      nodeMetrics: this.nodeMetrics,
      outbox: this.outbox,
      revisionCleanups: this.revisionCleanups,
      runs: this.runs,
      tasks: this.tasks,
    });
  }

  private createId() {
    return String(this.nextId++);
  }

  private failRunningExecutions(runIds: Set<string>, errorCode: string, errorMessage: string) {
    for (const execution of this.nodeExecutions) {
      if (!runIds.has(execution.runId)
        || (execution.status !== "running" && execution.status !== "retrying")) continue;
      execution.errorCode = errorCode;
      execution.errorMessage = errorMessage;
      execution.failureKind = null;
      execution.status = "failed";
    }
  }

  private async finishInference(
    id: string,
    leaseOwner: string | null,
    completedAt: Date,
    terminal: {
      errorCode?: string;
      errorMessage?: string;
      failureKind?: "retryable" | "terminal" | "unknown";
      result?: import("@chatai/contracts").WorkflowInferenceResult;
      status: "failed" | "succeeded";
    },
    allowUnleased = false,
  ) {
    const job = this.inferenceJobs.find(item => item.id === id
      && (allowUnleased
        ? item.status === "pending" || item.status === "retry_wait" || item.status === "running"
        : item.status === "running" && item.leaseOwner === leaseOwner));
    if (!job) return false;
    job.errorCode = terminal.errorCode ?? null;
    job.errorMessage = terminal.errorMessage ?? null;
    job.failureKind = terminal.failureKind ?? null;
    job.leaseExpiresAt = null;
    job.leaseOwner = null;
    job.result = terminal.result ? clone(terminal.result) : null;
    job.status = terminal.status;
    job.updatedAt = clone(completedAt);
    const task = this.tasks.find(item => item.uid === job.uid && item.id === job.taskId);
    const run = this.runs.find(item => item.uid === job.uid && item.id === job.runId);
    if (!task || !run || task.status !== "waiting_external" || task.taskType !== "inference"
      || run.status !== "waiting") return true;
    task.dueAt = clone(completedAt);
    task.taskVersion += 1;
    run.lockVersion += 1;
    run.nextExecuteAt = clone(completedAt);
    const boundary = this.resolveWorkflowBoundary
      ? await this.resolveWorkflowBoundary({ uid: job.uid, workflowId: run.workflowId })
      : { bizStatus: 1 as const, runtimeStatus: "active" as const };
    const boundaryDecision = boundary ? getWorkflowExecutionBoundaryDecision(boundary) : "cancel";
    task.taskType = "execute";
    run.status = transitionRun(run.status, "running");
    if (boundaryDecision === "execute") {
      task.status = transitionTask(task.status, "dispatched");
      this.outbox.push(createOutbox(this.createId(), task, completedAt));
    } else if (boundaryDecision === "defer") {
      task.status = transitionTask(task.status, "suspended");
    } else {
      task.status = transitionTask(task.status, "cancelled");
    }
    this.touchRun(run);
    return true;
  }

  private cancelEventSubscriptions(runIds: Set<string>) {
    for (const subscription of this.eventSubscriptions) {
      if (!runIds.has(subscription.runId)
        || (subscription.status !== "waiting" && subscription.status !== "triggered")) continue;
      subscription.status = "cancelled";
      subscription.updatedAt = this.now();
    }
  }

  private cancelInferenceJobs(runIds: Set<string>) {
    for (const job of this.inferenceJobs) {
      if (!runIds.has(job.runId)
        || (job.status !== "pending" && job.status !== "running" && job.status !== "retry_wait")) continue;
      job.status = "cancelled";
      job.leaseOwner = null;
      job.leaseExpiresAt = null;
      job.updatedAt = this.now();
    }
  }

  private touchRun(run: WorkflowRunRecord) {
    const now = this.now();
    this.runUpdatedAt.set(run.id, now);
    if (run.status === "cancelled" || run.status === "completed" || run.status === "failed") {
      this.runCompletedAt.set(run.id, now);
    }
  }

  private appendNodeMetricEvents(
    run: WorkflowRunRecord,
    eventKey: string,
    deltas: ReturnType<typeof createNodeMetricDeltas>,
    revision = run.revision,
  ) {
    for (const delta of deltas) {
      const key = `${eventKey}:${delta.nodeId}`;
      if (this.nodeMetricEvents.some(event => event.eventKey === key)) continue;
      this.nodeMetricEvents.push({
        ...delta,
        eventKey: key,
        processedAt: null,
        revision,
        runId: run.id,
        shardId: run.shardId % 16,
        uid: run.uid,
        workflowId: run.workflowId,
      });
    }
  }
}

function cancelTask(task: WorkflowTaskRecord) {
  task.status = "cancelled";
  task.taskVersion += 1;
  task.leaseOwner = null;
  task.leaseExpiresAt = null;
}

function compareById(first: { id: string }, second: { id: string }) {
  const firstId = BigInt(first.id);
  const secondId = BigInt(second.id);
  return firstId === secondId ? 0 : firstId < secondId ? -1 : 1;
}

function sameDate(first: Date, second: Date | null) {
  return second !== null && first.getTime() === second.getTime();
}

function sameNullableDate(first: Date | null, second: Date | null) {
  return first === null ? second === null : second !== null && first.getTime() === second.getTime();
}

function canEnterWorkflow(
  policy: WorkflowCreateRunInput["entryPolicy"],
  runs: WorkflowRunRecord[],
  totalEntries: number,
  now: Date,
) {
  if (policy.mode === "never") return totalEntries === 0;
  if (policy.mode === "lifetime_limit") return totalEntries < policy.maxEntries;
  const windowMilliseconds = policy.windowSize
    * (policy.windowUnit === "hour" ? 3_600_000 : 86_400_000);
  const cutoff = now.getTime() - windowMilliseconds;
  return runs.filter(run => run.createdAt.getTime() >= cutoff).length < policy.maxEntries;
}

function assertActiveRunLimit(value: number) {
  assertNonNegativeInteger(value, "Workflow active Run limit");
}

function assertNonNegativeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
}

function createTask(
  id: string,
  run: WorkflowRunRecord,
  input: {
    createdAt: Date;
    dispatchImmediately: boolean;
    dueAt: Date;
    nodeId: string;
    nodeKind: WorkflowTaskRecord["nodeKind"];
    taskType: string;
  },
): WorkflowTaskRecord {
  return {
    attempt: 0,
    createdAt: clone(input.createdAt),
    dueAt: input.dueAt,
    id,
    lastErrorCode: null,
    leaseExpiresAt: null,
    leaseOwner: null,
    nodeId: input.nodeId,
    nodeKind: input.nodeKind,
    revision: run.revision,
    runId: run.id,
    sequence: run.sequence,
    shardId: run.shardId,
    status: input.dispatchImmediately === false || input.taskType === "wait" ? "pending" : "dispatched",
    taskType: input.taskType,
    taskVersion: 1,
    uid: run.uid,
    workflowId: run.workflowId,
  };
}

function createOutbox(id: string, task: WorkflowTaskRecord, now: Date): WorkflowOutboxRecord {
  return {
    attempt: 0,
    eventType: "workflow.task.ready",
    id,
    leaseExpiresAt: null,
    leaseOwner: null,
    nextAttemptAt: now,
    payload: {
      messageId: `workflow-task:${task.id}:v${task.taskVersion}`,
      occurredAt: now.toISOString(),
      runId: task.runId,
      shardId: task.shardId,
      taskId: task.id,
      taskVersion: task.taskVersion,
      uid: String(task.uid),
    },
    sentAt: null,
    status: "pending",
    taskVersion: task.taskVersion,
    uid: task.uid,
  };
}

function clone<T>(value: T): T { return structuredClone(value); }
function findLast<T>(items: T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index]!)) return items[index];
  }
  return undefined;
}
function compareDateAndId(firstDate: Date, firstId: string, secondDate: Date, secondId: string) {
  const dateOrder = firstDate.getTime() - secondDate.getTime();
  if (dateOrder !== 0) return dateOrder;
  return BigInt(firstId) < BigInt(secondId) ? -1 : BigInt(firstId) > BigInt(secondId) ? 1 : 0;
}
function conflict() { return { kind: "conflict" as const }; }
function notFound() { return { kind: "not-found" as const }; }
function alreadyProcessed() { return { kind: "already-processed" as const }; }
