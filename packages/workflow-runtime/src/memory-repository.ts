import type {
  WorkflowCommitNodeResultInput,
  WorkflowCreateRunInput,
  WorkflowOutboxRecord,
  WorkflowRunRecord,
  WorkflowRuntimeRepository,
  WorkflowTaskRecord,
} from "./types.js";
import {
  getWorkflowExecutionBoundaryDecision,
  transitionRun,
  transitionTask,
} from "@chatai/workflow-engine";
import { createNodeMetricDeltas } from "./node-metrics.js";

type WorkflowBoundaryResolver = (input: {
  uid: number;
  workflowId: string;
}) => Promise<{ bizStatus: 0 | 1; runtimeStatus: "active" | "inactive" | "paused" | "stopped" } | null>;

type NodeExecutionRecord = WorkflowCommitNodeResultInput["nodeExecution"] & {
  runId: string;
  sequence: number;
  uid: number;
};

type NodeMetricEvent = {
  completed: number;
  current: number;
  entered: number;
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
  readonly runs: WorkflowRunRecord[] = [];
  readonly tasks: WorkflowTaskRecord[] = [];
  readonly nodeExecutions: NodeExecutionRecord[] = [];
  readonly nodeMetricEvents: NodeMetricEvent[] = [];
  readonly nodeMetrics: import("./types.js").WorkflowNodeMetricRecord[] = [];
  private inbox: Array<WorkflowCommitNodeResultInput["inbox"] & { uid: number }> = [];
  private outbox: WorkflowOutboxRecord[] = [];
  private nextId = 1n;

  constructor(
    private readonly resolveWorkflowBoundary?: WorkflowBoundaryResolver,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createRunWithInitialTask(input: WorkflowCreateRunInput) {
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
      && run.subjectId === input.subjectId,
    );
    if (!canEnterWorkflow(input.entryPolicy, previousRuns, admittedAt)) {
      return { kind: "entry-policy-rejected" as const };
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
      uid: input.uid,
      workflowId: input.workflowId,
    };
    const task = createTask(this.createId(), run, {
      dispatchImmediately: true,
      dueAt: admittedAt,
      nodeId: input.initialNodeId,
      nodeKind: input.initialNodeKind,
      taskType: "execute",
    });
    this.runs.push(run);
    this.tasks.push(task);
    this.outbox.push(createOutbox(this.createId(), task, admittedAt));
    this.appendNodeMetricEvents(run, `${run.id}:entered`, createNodeMetricDeltas({
      kind: "entered",
      nodeId: input.initialNodeId,
      nodeKind: input.initialNodeKind,
    }));
    return { deduplicated: false, kind: "success" as const, run: clone(run), task: clone(task) };
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
    if (this.resolveWorkflowBoundary) {
      const boundary = await this.resolveWorkflowBoundary({ uid: input.uid, workflowId: task.workflowId });
      const decision = boundary
        ? getWorkflowExecutionBoundaryDecision(boundary)
        : "cancel";
      if (decision !== "execute") {
        task.status = decision === "defer" ? "pending" : "cancelled";
        task.taskVersion += 1;
        task.leaseOwner = null;
        task.leaseExpiresAt = null;
        return { action: decision, kind: "workflow-unavailable" as const };
      }
    }
    task.status = transitionTask(task.status, "running");
    task.attempt += 1;
    task.taskVersion += 1;
    task.leaseOwner = input.leaseOwner;
    task.leaseExpiresAt = input.leaseExpiresAt;
    if (run.currentNodeId !== task.nodeId) {
      const previousTask = this.tasks.find(candidate => candidate.runId === run.id
        && candidate.sequence === task.sequence - 1);
      if (previousTask) {
        this.appendNodeMetricEvents(run, `${run.id}:${task.sequence}:activated`, createNodeMetricDeltas({
          fromNodeId: previousTask.nodeId,
          fromNodeKind: previousTask.nodeKind,
          kind: "advanced",
          toNodeId: task.nodeId,
          toNodeKind: task.nodeKind,
        }));
      }
      run.currentNodeId = task.nodeId;
    }
    if (run.status === "queued" || run.status === "waiting") {
      run.status = transitionRun(run.status, "running");
    }
    return { kind: "success" as const, task: clone(task) };
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
    }
    for (const task of this.tasks) {
      if (selectedIds.has(task.runId)
        && (task.status === "pending" || task.status === "leased" || task.status === "dispatched" || task.status === "running")) {
        task.status = "cancelled";
        task.taskVersion += 1;
        task.leaseOwner = null;
        task.leaseExpiresAt = null;
      }
    }
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
    }
    for (const task of this.tasks) {
      if (selectedIds.has(task.runId)
        && (task.status === "pending" || task.status === "leased" || task.status === "dispatched" || task.status === "running")) {
        task.status = "cancelled";
        task.taskVersion += 1;
        task.leaseOwner = null;
        task.leaseExpiresAt = null;
      }
    }
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

  async commitNodeResult(input: WorkflowCommitNodeResultInput) {
    if (this.inbox.some((item) =>
      item.consumer === input.inbox.consumer && item.messageId === input.inbox.messageId,
    )) return alreadyProcessed();

    const run = this.runs.find((item) => item.uid === input.uid && item.id === input.runId);
    const task = this.tasks.find((item) => item.uid === input.uid && item.id === input.taskId);
    if (!run || !task || task.runId !== run.id) return notFound();
    if (run.lockVersion !== input.expectedRunLockVersion
      || task.taskVersion !== input.expectedTaskVersion
      || task.status !== "running") return conflict();

    const nextSequence = run.sequence + 1;
    const nextTaskStatus = transitionTask(task.status, "completed");
    const nextRunStatus = transitionRun(
      run.status,
      input.nextTask
        ? input.nextTask.taskType === "wait" ? "waiting" : "running"
        : "completed",
    );
    this.nodeExecutions.push({
      ...clone(input.nodeExecution),
      runId: run.id,
      sequence: task.sequence,
      uid: input.uid,
    });
    this.inbox.push({ ...clone(input.inbox), uid: input.uid });
    task.status = nextTaskStatus;
    task.taskVersion += 1;
    task.leaseOwner = null;
    task.leaseExpiresAt = null;
    run.lockVersion += 1;
    if (input.context) {
      run.context = clone(input.context);
    }

    let nextTask: WorkflowTaskRecord | null = null;
    if (input.nextTask) {
      const delayedSuccessor = input.nextTask.taskType === "wait";
      if (!delayedSuccessor) run.currentNodeId = input.nextTask.nodeId;
      run.sequence = nextSequence;
      run.status = nextRunStatus;
      run.nextExecuteAt = input.nextTask.dueAt;
      nextTask = createTask(this.createId(), run, input.nextTask);
      this.tasks.push(nextTask);
      if (nextTask.status === "dispatched") {
        this.outbox.push(createOutbox(this.createId(), nextTask, this.now()));
      }
      if (!delayedSuccessor) {
        this.appendNodeMetricEvents(run, `${run.id}:${task.sequence}:advanced`, createNodeMetricDeltas({
          fromNodeId: task.nodeId,
          fromNodeKind: task.nodeKind,
          kind: "advanced",
          toNodeId: input.nextTask.nodeId,
          toNodeKind: input.nextTask.nodeKind,
        }));
      }
    } else {
      run.status = nextRunStatus;
      run.nextExecuteAt = null;
      this.appendNodeMetricEvents(run, `${run.id}:${task.sequence}:completed`, createNodeMetricDeltas({
        kind: "completed",
        nodeId: task.nodeId,
        nodeKind: task.nodeKind,
      }));
    }
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
      task.status = exhausted ? "dead" : "pending";
      task.taskVersion += 1;
      task.leaseOwner = null;
      task.leaseExpiresAt = null;
      if (exhausted) {
        dead += 1;
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
        }
      } else {
        recovered += 1;
      }
    }
    return { dead, recovered };
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
    const shardIds = input.shardIds ? new Set(input.shardIds) : null;
    const candidates = this.tasks
      .filter(task => task.status === "pending"
        && task.dueAt <= input.now
        && (!shardIds || shardIds.has(task.shardId)))
      .sort((first, second) => compareDateAndId(
        first.dueAt,
        first.id,
        second.dueAt,
        second.id,
      ));
    const result = { cancelled: 0, deferred: 0, dispatched: 0 };
    for (const task of candidates) {
      if (result.cancelled + result.dispatched >= Math.max(0, input.limit)) break;
      const boundary = this.resolveWorkflowBoundary
        ? await this.resolveWorkflowBoundary({ uid: task.uid, workflowId: task.workflowId })
        : { bizStatus: 1 as const, runtimeStatus: "active" as const };
      const decision = boundary ? getWorkflowExecutionBoundaryDecision(boundary) : "cancel";
      if (decision === "defer") {
        result.deferred += 1;
        continue;
      }
      task.taskVersion += 1;
      if (decision === "cancel") {
        task.status = "cancelled";
        result.cancelled += 1;
        continue;
      }
      task.status = "dispatched";
      this.outbox.push(createOutbox(this.createId(), task, input.now));
      result.dispatched += 1;
    }
    return result;
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
      }
    }
    return true;
  }

  async markOutboxSent(input: Parameters<WorkflowRuntimeRepository["markOutboxSent"]>[0]) {
    const item = this.outbox.find(candidate => candidate.id === input.id
      && candidate.status === "leased"
      && candidate.leaseOwner === input.leaseOwner);
    if (!item) return false;
    item.status = "sent";
    item.sentAt = input.sentAt;
    item.leaseOwner = null;
    item.leaseExpiresAt = null;
    return true;
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
      inbox: this.inbox,
      nodeExecutions: this.nodeExecutions,
      nodeMetricEvents: this.nodeMetricEvents,
      nodeMetrics: this.nodeMetrics,
      outbox: this.outbox,
      runs: this.runs,
      tasks: this.tasks,
    });
  }

  private createId() {
    return String(this.nextId++);
  }

  private appendNodeMetricEvents(
    run: WorkflowRunRecord,
    eventKey: string,
    deltas: ReturnType<typeof createNodeMetricDeltas>,
  ) {
    for (const delta of deltas) {
      const key = `${eventKey}:${delta.nodeId}`;
      if (this.nodeMetricEvents.some(event => event.eventKey === key)) continue;
      this.nodeMetricEvents.push({
        ...delta,
        eventKey: key,
        processedAt: null,
        revision: run.revision,
        runId: run.id,
        shardId: run.shardId % 16,
        uid: run.uid,
        workflowId: run.workflowId,
      });
    }
  }
}

function canEnterWorkflow(
  policy: WorkflowCreateRunInput["entryPolicy"],
  runs: WorkflowRunRecord[],
  now: Date,
) {
  if (policy.mode === "never") return runs.length === 0;
  if (policy.mode === "lifetime_limit") return runs.length < policy.maxEntries;
  const windowMilliseconds = policy.windowSize
    * (policy.windowUnit === "hour" ? 3_600_000 : 86_400_000);
  const cutoff = now.getTime() - windowMilliseconds;
  return runs.filter(run => run.createdAt.getTime() >= cutoff).length < policy.maxEntries;
}

function createTask(
  id: string,
  run: WorkflowRunRecord,
  input: NonNullable<WorkflowCommitNodeResultInput["nextTask"]>,
): WorkflowTaskRecord {
  return {
    attempt: 0,
    dueAt: input.dueAt,
    id,
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
