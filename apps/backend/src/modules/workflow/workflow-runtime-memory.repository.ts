import type {
  WorkflowCommitNodeResultInput,
  WorkflowCreateRunInput,
  WorkflowRunRecord,
  WorkflowRuntimeRepository,
  WorkflowTaskRecord,
} from "./workflow-runtime-types.js";

type NodeExecutionRecord = WorkflowCommitNodeResultInput["nodeExecution"] & {
  runId: string;
  sequence: number;
  uid: number;
};

export class InMemoryWorkflowRuntimeRepository implements WorkflowRuntimeRepository {
  readonly runs: WorkflowRunRecord[] = [];
  readonly tasks: WorkflowTaskRecord[] = [];
  readonly nodeExecutions: NodeExecutionRecord[] = [];
  private inbox: Array<WorkflowCommitNodeResultInput["inbox"] & { uid: number }> = [];
  private outbox: Array<{ eventType: string; id: string; taskId: string; uid: number }> = [];
  private nextId = 1n;

  async createRunWithInitialTask(input: WorkflowCreateRunInput) {
    const existingRun = this.runs.find((run) =>
      run.uid === input.uid
      && run.workflowId === input.workflowId
      && run.entryEventId === input.entryEventId,
    );
    if (existingRun) {
      const task = this.tasks.find((item) => item.runId === existingRun.id)!;
      return { deduplicated: true, kind: "success" as const, run: clone(existingRun), task: clone(task) };
    }

    const run: WorkflowRunRecord = {
      context: clone(input.context),
      currentNodeId: input.initialNodeId,
      entryEventId: input.entryEventId,
      id: this.createId(),
      lockVersion: 1,
      nextExecuteAt: input.occurredAt,
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
      dueAt: input.occurredAt,
      nodeId: input.initialNodeId,
      nodeKind: input.initialNodeKind,
      taskType: "execute",
    });
    this.runs.push(run);
    this.tasks.push(task);
    this.outbox.push({ eventType: "workflow.task.ready", id: this.createId(), taskId: task.id, uid: input.uid });
    return { deduplicated: false, kind: "success" as const, run: clone(run), task: clone(task) };
  }

  async claimTask(input: Parameters<WorkflowRuntimeRepository["claimTask"]>[0]) {
    const task = this.tasks.find((item) => item.uid === input.uid && item.id === input.taskId);
    if (!task) return notFound();
    if ((task.status !== "dispatched" && task.status !== "pending")
      || task.taskVersion !== input.expectedTaskVersion) return conflict();
    task.status = "running";
    task.taskVersion += 1;
    task.leaseOwner = input.leaseOwner;
    task.leaseExpiresAt = input.leaseExpiresAt;
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
      run.status = "cancelled";
    }
    for (const task of this.tasks) {
      if (selectedIds.has(task.runId)
        && (task.status === "pending" || task.status === "leased" || task.status === "dispatched" || task.status === "running")) {
        task.status = "cancelled";
        task.taskVersion += 1;
      }
    }
    return {
      cancelled: selected.length,
      hasMore: candidates.length > selected.length,
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
    this.nodeExecutions.push({
      ...clone(input.nodeExecution),
      runId: run.id,
      sequence: task.sequence,
      uid: input.uid,
    });
    this.inbox.push({ ...clone(input.inbox), uid: input.uid });
    task.status = "completed";
    task.taskVersion += 1;
    task.leaseOwner = null;
    task.leaseExpiresAt = null;
    run.lockVersion += 1;
    if (input.context) {
      run.context = clone(input.context);
    }

    let nextTask: WorkflowTaskRecord | null = null;
    if (input.nextTask) {
      run.currentNodeId = input.nextTask.nodeId;
      run.sequence = nextSequence;
      run.status = input.nextTask.taskType === "wait" ? "waiting" : "running";
      run.nextExecuteAt = input.nextTask.dueAt;
      nextTask = createTask(this.createId(), run, input.nextTask);
      this.tasks.push(nextTask);
      if (nextTask.status === "dispatched") {
        this.outbox.push({ eventType: "workflow.task.ready", id: this.createId(), taskId: nextTask.id, uid: input.uid });
      }
    } else {
      run.status = "completed";
      run.nextExecuteAt = null;
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
    for (const task of recoverable) {
      task.status = "pending";
      task.taskVersion += 1;
      task.leaseOwner = null;
      task.leaseExpiresAt = null;
    }
    return recoverable.length;
  }

  snapshot() {
    return clone({
      inbox: this.inbox,
      nodeExecutions: this.nodeExecutions,
      outbox: this.outbox,
      runs: this.runs,
      tasks: this.tasks,
    });
  }

  private createId() {
    return String(this.nextId++);
  }
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

function clone<T>(value: T): T { return structuredClone(value); }
function conflict() { return { kind: "conflict" as const }; }
function notFound() { return { kind: "not-found" as const }; }
function alreadyProcessed() { return { kind: "already-processed" as const }; }
