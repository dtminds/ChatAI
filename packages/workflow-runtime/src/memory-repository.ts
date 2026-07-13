import type {
  WorkflowActionExecutionFailureInput,
  WorkflowCommitNodeResultInput,
  WorkflowCreateRunInput,
  WorkflowNodeExecutionRecord,
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
  readonly nodeExecutions: WorkflowNodeExecutionRecord[] = [];
  readonly nodeMetricEvents: NodeMetricEvent[] = [];
  readonly nodeMetrics: import("./types.js").WorkflowNodeMetricRecord[] = [];
  private inbox: Array<WorkflowCommitNodeResultInput["inbox"] & { uid: number }> = [];
  private outbox: WorkflowOutboxRecord[] = [];
  private readonly runCompletedAt = new Map<string, Date>();
  private readonly totalEntries = new Map<string, number>();
  private readonly runUpdatedAt = new Map<string, Date>();
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
    const entryGuardKey = `${input.uid}:${input.workflowId}:${input.subjectId}`;
    const totalEntries = this.totalEntries.get(entryGuardKey) ?? 0;
    if (!canEnterWorkflow(input.entryPolicy, previousRuns, totalEntries, admittedAt)) {
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
    const previousRunStatus = run.status;
    const previousNodeId = run.currentNodeId;
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
    if (run.status !== previousRunStatus || run.currentNodeId !== previousNodeId) {
      this.touchRun(run);
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
      run.lockVersion += 1;
      run.nextExecuteAt = null;
      this.touchRun(run);
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
        && (task.status === "pending" || task.status === "leased" || task.status === "dispatched" || task.status === "running")) {
        task.status = "cancelled";
        task.taskVersion += 1;
        task.leaseOwner = null;
        task.leaseExpiresAt = null;
      }
    }
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

  async prepareActionExecution(
    input: Parameters<WorkflowRuntimeRepository["prepareActionExecution"]>[0],
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
      if (existing.idempotencyKey !== input.idempotencyKey
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
      idempotencyKey: input.idempotencyKey,
      input: clone(input.input),
      nodeId: task.nodeId,
      nodeKind: task.nodeKind,
      output: {},
      runId: run.id,
      sequence: task.sequence,
      status: "running",
      uid: input.uid,
    };
    this.nodeExecutions.push(execution);
    return { execution: clone(execution), kind: "success" as const };
  }

  async scheduleActionRetry(
    input: Parameters<WorkflowRuntimeRepository["scheduleActionRetry"]>[0],
  ) {
    const state = this.requireActionFailureState(input);
    if ("kind" in state) return state;
    const { execution, run, task } = state;
    this.inbox.push({ ...clone(input.inbox), uid: input.uid });
    execution.errorCode = input.errorCode;
    execution.errorMessage = input.errorMessage;
    execution.failureKind = input.failureKind;
    execution.status = "retrying";
    task.dueAt = input.dueAt;
    task.leaseExpiresAt = null;
    task.leaseOwner = null;
    task.status = transitionTask(task.status, "pending");
    task.taskVersion += 1;
    run.lockVersion += 1;
    run.nextExecuteAt = input.dueAt;
    this.touchRun(run);
    return { kind: "success" as const, task: clone(task) };
  }

  async failActionExecution(
    input: Parameters<WorkflowRuntimeRepository["failActionExecution"]>[0],
  ) {
    const state = this.requireActionFailureState(input);
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

  private requireActionFailureState(input: WorkflowActionExecutionFailureInput) {
    if (this.inbox.some(item => item.consumer === input.inbox.consumer
      && item.messageId === input.inbox.messageId)) return alreadyProcessed();
    const run = this.runs.find(item => item.uid === input.uid && item.id === input.runId);
    const task = this.tasks.find(item => item.uid === input.uid && item.id === input.taskId);
    if (!run || !task || task.runId !== run.id) return notFound();
    const execution = this.nodeExecutions.find(item => item.uid === input.uid
      && item.runId === input.runId
      && item.sequence === task.sequence
      && item.idempotencyKey === input.idempotencyKey);
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
    const existingExecution = this.nodeExecutions.find(item => item.uid === input.uid
      && item.runId === run.id
      && item.sequence === task.sequence);
    if (existingExecution) {
      if (existingExecution.idempotencyKey !== input.nodeExecution.idempotencyKey
        || existingExecution.status !== "running") return conflict();
      existingExecution.errorCode = input.nodeExecution.errorCode ?? null;
      existingExecution.errorMessage = input.nodeExecution.errorMessage ?? null;
      existingExecution.failureKind = null;
      existingExecution.output = clone(input.nodeExecution.output);
      existingExecution.status = input.nodeExecution.errorCode ? "failed" : "completed";
    } else {
      this.nodeExecutions.push({
        errorCode: input.nodeExecution.errorCode ?? null,
        errorMessage: input.nodeExecution.errorMessage ?? null,
        failureKind: null,
        idempotencyKey: input.nodeExecution.idempotencyKey,
        input: clone(input.nodeExecution.input),
        nodeId: task.nodeId,
        nodeKind: task.nodeKind,
        output: clone(input.nodeExecution.output),
        runId: run.id,
        sequence: task.sequence,
        status: input.nodeExecution.errorCode ? "failed" : "completed",
        uid: input.uid,
      });
    }
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
      task.status = exhausted ? "dead" : "pending";
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
          execution.errorMessage = "Workflow Task attempts exhausted";
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
    const activeTaskStatuses = new Set(["pending", "leased", "dispatched", "running"]);
    const runCandidates = this.runs
      .filter(run => activeRunStatuses.has(run.status)
        && (!input.afterRunId || BigInt(run.id) > BigInt(input.afterRunId)))
      .sort(compareById)
      .slice(0, Math.max(0, input.limit) + 1);
    const selectedRuns = runCandidates.slice(0, Math.max(0, input.limit));
    let inconsistentRunsFailed = 0;
    let staleTasksCancelled = 0;

    for (const run of selectedRuns) {
      const boundary = this.resolveWorkflowBoundary
        ? await this.resolveWorkflowBoundary({ uid: run.uid, workflowId: run.workflowId })
        : { bizStatus: 1 as const, runtimeStatus: "active" as const };
      if (!boundary || getWorkflowExecutionBoundaryDecision(boundary) === "cancel") continue;

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
        || (run.status !== "waiting" && authoritativeTask.nodeId !== run.currentNodeId)
        || (run.status === "waiting" && (
          authoritativeTask.taskType !== "wait"
          || !sameDate(authoritativeTask.dueAt, run.nextExecuteAt)
        ));
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
      tasksChecked: selectedTasks.length,
      terminalRunTasksCancelled,
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
      .filter(run => (this.runCompletedAt.get(run.id) ?? run.createdAt) <= input.taskOutboxBefore)
      .filter(run => this.tasks.some(task => task.runId === run.id))
      .sort(compareById)
      .slice(0, Math.max(0, input.limit) + 1);
    const technicalRunIds = new Set(technicalRuns.slice(0, input.limit).map(run => run.id));
    const taskIds = new Set(this.tasks
      .filter(task => technicalRunIds.has(task.runId))
      .map(task => task.id));
    const outboxDeleted = this.outbox.filter(item => taskIds.has(item.payload.taskId)).length;
    const tasksDeleted = this.tasks.filter(task => technicalRunIds.has(task.runId)).length;
    this.outbox = this.outbox.filter(item => !taskIds.has(item.payload.taskId));
    for (let index = this.tasks.length - 1; index >= 0; index -= 1) {
      if (technicalRunIds.has(this.tasks[index]!.runId)) this.tasks.splice(index, 1);
    }

    const expiredRuns = this.runs
      .filter(run => terminal.has(run.status))
      .filter(run => (this.runCompletedAt.get(run.id) ?? run.createdAt) <= input.runBefore)
      .sort(compareById)
      .slice(0, Math.max(0, input.limit) + 1);
    const expiredRunIds = new Set(expiredRuns
      .slice(0, input.limit)
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
      hasMore: technicalRuns.length > input.limit || expiredRuns.length > input.limit,
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
        this.touchRun(run);
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
