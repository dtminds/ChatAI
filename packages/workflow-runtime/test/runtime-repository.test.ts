import { describe, expect, it } from "vitest";
import type { WorkflowExecutionSpec } from "@chatai/contracts";
import {
  InMemoryWorkflowRuntimeRepository,
  WorkflowRuntimeReconciler,
  type WorkflowCreateRunInput,
} from "../src/index.js";

describe("workflow runtime repository", () => {
  it("rejects run creation when the workflow boundary is unavailable", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository(async () => ({
      bizStatus: 1,
      runtimeStatus: "stopped",
    }));

    await expect(repository.createRunWithInitialTask(createRunInput())).resolves.toEqual({
      action: "cancel",
      kind: "workflow-unavailable",
    });
    expect(repository.snapshot().runs).toHaveLength(0);
  });

  it("deduplicates entry events and creates one initial task", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    const input = createRunInput();

    const first = await repository.createRunWithInitialTask(input);
    const duplicate = await repository.createRunWithInitialTask(input);

    expect(first.deduplicated).toBe(false);
    expect(duplicate).toMatchObject({ deduplicated: true, run: { id: first.run.id } });
    expect(repository.snapshot().tasks).toHaveLength(1);
    expect(repository.snapshot().outbox).toHaveLength(1);
    expect(repository.snapshot().nodeMetricEvents).toEqual([
      expect.objectContaining({ entered: 1, eventKey: expect.stringContaining(":entered"), nodeId: "start" }),
    ]);
  });

  it("claims a task only with the current task version", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    const created = await repository.createRunWithInitialTask(createRunInput());

    const claimed = await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });

    expect(claimed).toMatchObject({ kind: "success", task: { status: "running", taskVersion: 2 } });
    await expect(repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-2",
      taskId: created.task.id,
      uid: 9,
    })).resolves.toEqual({ kind: "conflict" });
  });

  it("rejects a task claim after its run becomes terminal", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    const created = await repository.createRunWithInitialTask(createRunInput());
    repository.runs[0]!.status = "cancelled";

    await expect(repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    })).resolves.toEqual({ kind: "conflict" });
    expect(repository.tasks[0]).toMatchObject({ attempt: 0, status: "dispatched", taskVersion: 1 });
  });

  it("commits execution and the next task under run and task version fences", async () => {
    const repository = repositoryWithPublishedSpec();
    const created = await repository.createRunWithInitialTask(createRunInput());
    const claimed = await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });
    if (claimed.kind !== "success") throw new Error("claim failed");

    const committed = await repository.commitNodeResult({
      expectedRunLockVersion: 1,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: { consumer: "workflow-task", expiresAt: new Date("2026-08-10T00:00:00.000Z"), messageId: "message-1" },
      nodeExecution: {
        executionKey: "9:1:start:1",
        input: {},
        output: {},
      },
      sourceOutletId: "default",
      runId: created.run.id,
      taskId: claimed.task.id,
      uid: 9,
    });

    expect(committed).toMatchObject({ kind: "success", run: { lockVersion: 2, sequence: 2 } });
    expect(repository.snapshot().nodeExecutions).toHaveLength(1);
    expect(repository.snapshot().nodeExecutions[0]).toMatchObject({
      revision: 1,
      sourceOutletId: null,
    });
    expect(repository.snapshot().inbox).toHaveLength(1);
    expect(repository.snapshot().tasks).toHaveLength(2);
    expect(repository.snapshot().tasks[1]).toMatchObject({ nodeId: "end", revision: 2 });
    expect(repository.snapshot().nodeMetricEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ current: 1, entered: 1, nodeId: "start" }),
      expect.objectContaining({ current: -1, nodeId: "start", revision: 1 }),
      expect.objectContaining({ current: 1, nodeId: "end", revision: 2 }),
    ]));
  });

  it.each([
    ["current node is deleted", flowChangedSpec("current-node-deleted"), "flow_changed_current_node_deleted"],
    ["current node kind changes", flowChangedSpec("node-kind-changed"), "flow_changed_node_kind_changed"],
    ["selected outlet is deleted", flowChangedSpec("outlet-deleted"), "flow_changed_outlet_deleted"],
    ["new target needs unavailable context", flowChangedSpec("context-incompatible"), "flow_changed_context_incompatible"],
    ["new Order Conversion target needs unavailable context", flowChangedSpec("order-conversion-context-incompatible"), "flow_changed_context_incompatible"],
    ["new branch needs unavailable context", flowChangedSpec("branch-context-incompatible"), "flow_changed_context_incompatible"],
    ["new Message target lacks its frozen seat", flowChangedSpec("message-context-incompatible"), "flow_changed_context_incompatible"],
    ["new Handoff target lacks its frozen seat", flowChangedSpec("handoff-context-incompatible"), "flow_changed_context_incompatible"],
  ] as const)("ends the run when the %s in the latest revision", async (_scenario, spec, reason) => {
    const repository = repositoryWithLatestSpec(spec);
    const runInput = createRunInput();
    const created = await repository.createRunWithInitialTask(spec.nodes.some(node =>
      node.kind === "message")
      ? {
          ...runInput,
          context: {
            ...runInput.context,
            workflow: {
              message: {
                sendingWindow: { endTime: "20:00", startTime: "09:00" },
              },
            },
          },
        }
      : runInput);
    const claimed = await repository.claimTask({
      expectedTaskVersion: created.task.taskVersion,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });
    if (claimed.kind !== "success") throw new Error("claim failed");

    const committed = await repository.commitNodeResult({
      context: created.run.context,
      expectedRunLockVersion: created.run.lockVersion,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: {
        consumer: "workflow-task",
        expiresAt: new Date("2026-08-10T00:00:00.000Z"),
        messageId: `flow-changed:${reason}`,
      },
      nodeExecution: { executionKey: `9:${created.run.id}:start:1`, input: {}, output: {} },
      runId: created.run.id,
      sourceOutletId: "default",
      taskId: created.task.id,
      uid: 9,
    });

    expect(committed).toMatchObject({
      kind: "success",
      nextTask: null,
      run: { status: "cancelled", terminalReason: reason },
    });
    expect(repository.snapshot().nodeMetricEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ current: -1, incomplete: 1, nodeId: "start", revision: 1 }),
    ]));
  });

  it("ends an old run before a branch that requires an unexecuted new predecessor", async () => {
    const repository = repositoryWithLatestSpec(publishedSpecWithInsertedMessageBeforeWait());
    const created = await repository.createRunWithInitialTask({
      ...createRunInput(),
      initialNodeId: "wait-1",
      initialNodeKind: "wait",
    });
    if (created.kind !== "success") throw new Error("create failed");
    const claimed = await repository.claimTask({
      expectedTaskVersion: created.task.taskVersion,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });
    if (claimed.kind !== "success") throw new Error("claim failed");

    const committed = await repository.commitNodeResult({
      context: created.run.context,
      expectedRunLockVersion: created.run.lockVersion,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: {
        consumer: "workflow-task",
        expiresAt: new Date("2026-08-10T00:00:00.000Z"),
        messageId: "branch-missing-new-predecessor",
      },
      nodeExecution: { executionKey: `9:${created.run.id}:wait-1:1`, input: {}, output: {} },
      runId: created.run.id,
      sourceOutletId: "default",
      taskId: claimed.task.id,
      uid: 9,
    });

    expect(committed).toMatchObject({
      kind: "success",
      nextTask: null,
      run: {
        status: "cancelled",
        terminalReason: "flow_changed_context_incompatible",
      },
    });
  });

  it("creates the latest-revision task as pending when publication wins before a paused commit", async () => {
    let runtimeStatus = "active" as const | "paused";
    const repository = new InMemoryWorkflowRuntimeRepository(
      async () => ({ bizStatus: 1, runtimeStatus }),
      () => new Date("2026-07-10T00:00:00.000Z"),
      async () => ({
        executionSpec: publishedSpec(),
        revision: 2,
        subjectType: "chatai_contact",
        workflowType: "chatai_sop",
      }),
    );
    const created = await repository.createRunWithInitialTask(createRunInput());
    const claimed = await repository.claimTask({
      expectedTaskVersion: created.task.taskVersion,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });
    if (claimed.kind !== "success") throw new Error("claim failed");
    runtimeStatus = "paused";

    const committed = await repository.commitNodeResult({
      context: created.run.context,
      expectedRunLockVersion: created.run.lockVersion,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: {
        consumer: "workflow-task",
        expiresAt: new Date("2026-08-10T00:00:00.000Z"),
        messageId: "paused-forward-route",
      },
      nodeExecution: { executionKey: `9:${created.run.id}:start:1`, input: {}, output: {} },
      runId: created.run.id,
      sourceOutletId: "default",
      taskId: created.task.id,
      uid: 9,
    });

    expect(committed).toMatchObject({
      kind: "success",
      nextTask: { nodeId: "end", revision: 2, status: "pending" },
      run: { currentNodeId: "end", revision: 2, status: "running" },
    });
    expect(repository.snapshot().outbox).toHaveLength(1);
  });

  it("cleans deleted wait nodes across more pages than the retry limit", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository(
      undefined,
      () => new Date("2026-07-10T00:00:00.000Z"),
      async () => ({
        executionSpec: publishedSpec(),
        revision: 2,
        subjectType: "chatai_contact",
        workflowType: "chatai_sop",
      }),
    );
    await Promise.all(["cleanup-1", "cleanup-2", "cleanup-3"].map(entryEventId =>
      createWaitingRun(repository, entryEventId)));
    const cleanup = repository.addRevisionCleanupRequest({
      nodeId: "wait-1",
      nodeKind: "wait",
      revision: 2,
      uid: 9,
      workflowId: "31",
    });

    for (let page = 0; page < 3; page += 1) {
      const claimed = await repository.claimRevisionCleanupBatch({
        leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
        leaseOwner: "cleanup-worker",
        limit: 1,
        maxAttempts: 1,
        now: new Date("2026-07-10T00:00:00.000Z"),
      });
      expect(claimed).toHaveLength(1);
      await expect(repository.processRevisionCleanupBatch({
        cleanupId: cleanup.id,
        leaseOwner: "cleanup-worker",
        limit: 1,
        now: new Date("2026-07-10T00:00:00.000Z"),
      })).resolves.toMatchObject({ cancelled: 1, kind: "success" });
    }

    expect(repository.revisionCleanups[0]).toMatchObject({ attempt: 0, status: "done" });
    expect(repository.runs.every(run => run.status === "cancelled")).toBe(true);
  });

  it("cleans a deleted wait node before its initial task establishes the wait", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository(
      undefined,
      () => new Date("2026-07-10T00:00:00.000Z"),
      async () => ({
        executionSpec: publishedSpec(),
        revision: 2,
        subjectType: "chatai_contact",
        workflowType: "chatai_sop",
      }),
    );
    const created = await repository.createRunWithInitialTask({
      ...createRunInput(),
      initialNodeId: "wait-1",
      initialNodeKind: "wait",
    });
    const cleanup = repository.addRevisionCleanupRequest({
      nodeId: "wait-1",
      nodeKind: "wait",
      revision: 2,
      uid: 9,
      workflowId: "31",
    });
    await repository.claimRevisionCleanupBatch({
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "cleanup-worker",
      limit: 1,
      maxAttempts: 5,
      now: new Date("2026-07-10T00:00:00.000Z"),
    });

    await expect(repository.processRevisionCleanupBatch({
      cleanupId: cleanup.id,
      leaseOwner: "cleanup-worker",
      limit: 1,
      now: new Date("2026-07-10T00:00:00.000Z"),
    })).resolves.toMatchObject({ cancelled: 1, kind: "success", status: "done" });
    expect(repository.runs.find(run => run.id === created.run.id)).toMatchObject({
      status: "cancelled",
      terminalReason: "flow_changed_current_node_deleted",
    });
    expect(repository.tasks.find(task => task.id === created.task.id)?.status).toBe("cancelled");
  });

  it("obsoletes a cleanup request when the deleted node is published again", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository(
      undefined,
      () => new Date("2026-07-10T00:00:00.000Z"),
      async () => ({
        executionSpec: publishedSpecWithWait(),
        revision: 3,
        subjectType: "chatai_contact",
        workflowType: "chatai_sop",
      }),
    );
    const waiting = await createWaitingRun(repository, "cleanup-obsolete");
    const cleanup = repository.addRevisionCleanupRequest({
      nodeId: "wait-1",
      nodeKind: "wait",
      revision: 2,
      uid: 9,
      workflowId: "31",
    });
    await repository.claimRevisionCleanupBatch({
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "cleanup-worker",
      limit: 1,
      maxAttempts: 5,
      now: new Date("2026-07-10T00:00:00.000Z"),
    });

    await expect(repository.processRevisionCleanupBatch({
      cleanupId: cleanup.id,
      leaseOwner: "cleanup-worker",
      limit: 1,
      now: new Date("2026-07-10T00:00:00.000Z"),
    })).resolves.toEqual({
      cancelled: 0,
      hasMore: false,
      kind: "success",
      status: "obsolete",
    });
    expect(repository.runs.find(run => run.id === waiting.run.id)?.status).toBe("waiting");
  });

  it("aggregates pending node metric events once", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    await repository.createRunWithInitialTask(createRunInput());

    await expect(repository.aggregateNodeMetricEvents({ limit: 100 })).resolves.toBe(1);
    await expect(repository.aggregateNodeMetricEvents({ limit: 100 })).resolves.toBe(0);
    expect(repository.snapshot().nodeMetrics).toEqual([
      expect.objectContaining({ completed: 0, current: 1, entered: 1, nodeId: "start", passed: 0 }),
    ]);
    await expect(repository.cleanupProcessedNodeMetricEvents({
      limit: 100,
      processedBefore: new Date("2027-07-11T00:00:00.000Z"),
    })).resolves.toBe(1);
    expect(repository.snapshot().nodeMetricEvents).toHaveLength(0);
  });

  it("keeps a run and its authoritative task on the wait node until it is due", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    const created = await repository.createRunWithInitialTask({
      ...createRunInput(),
      initialNodeId: "wait-1",
      initialNodeKind: "wait",
    });
    const claimedWait = await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });
    if (claimedWait.kind !== "success") throw new Error("claim failed");

    const waiting = await repository.beginFixedWait({
      dueAt: new Date("2026-07-13T00:00:00.000Z"),
      expectedRunLockVersion: 1,
      expectedTaskVersion: claimedWait.task.taskVersion,
      inbox: { consumer: "workflow-task", expiresAt: new Date("2026-08-10T00:00:00.000Z"), messageId: "wait-1" },
      now: new Date("2026-07-10T00:00:00.000Z"),
      runId: created.run.id,
      taskId: created.task.id,
      uid: 9,
    });
    if (waiting.kind !== "success") throw new Error("wait failed");

    expect(waiting.run).toMatchObject({ currentNodeId: "wait-1", status: "waiting" });
    expect(waiting.task).toMatchObject({ nodeId: "wait-1", status: "pending", taskType: "wait" });

    const claimedSuccessor = await repository.claimTask({
      expectedTaskVersion: waiting.task.taskVersion,
      leaseExpiresAt: new Date("2026-07-13T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: waiting.task.id,
      uid: 9,
    });
    expect(claimedSuccessor).toMatchObject({ kind: "success" });
    expect(repository.runs[0]).toMatchObject({ currentNodeId: "wait-1", status: "running" });
    expect(repository.snapshot().tasks).toHaveLength(1);
  });

  it("removes a cancelled waiting run from the wait node instead of its delayed successor", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    const created = await repository.createRunWithInitialTask({
      ...createRunInput(),
      initialNodeId: "wait-1",
      initialNodeKind: "wait",
    });
    const claimed = await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });
    if (claimed.kind !== "success") throw new Error("claim failed");
    const waiting = await repository.beginFixedWait({
      dueAt: new Date("2026-07-13T00:00:00.000Z"),
      expectedRunLockVersion: 1,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: { consumer: "workflow-task", expiresAt: new Date("2026-08-10T00:00:00.000Z"), messageId: "waiting-cancel" },
      now: new Date("2026-07-10T00:00:00.000Z"),
      runId: created.run.id,
      taskId: created.task.id,
      uid: 9,
    });
    if (waiting.kind !== "success") throw new Error("wait failed");

    await repository.cancelWorkflowBatch({ limit: 100, uid: 9, workflowId: "31" });

    expect(repository.snapshot().nodeMetricEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ current: -1, nodeId: "wait-1", passed: 0 }),
    ]));
    expect(repository.snapshot().nodeMetricEvents).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ current: -1, nodeId: "message-1" }),
    ]));
  });

  it("attributes unavailable waiting-run cancellation to the current wait node", async () => {
    let runtimeStatus: "active" | "stopped" = "active";
    const repository = new InMemoryWorkflowRuntimeRepository(async () => ({
      bizStatus: 1,
      runtimeStatus,
    }));
    const created = await repository.createRunWithInitialTask({
      ...createRunInput(),
      initialNodeId: "wait-1",
      initialNodeKind: "wait",
    });
    if (created.kind !== "success") throw new Error("create failed");
    const claimed = await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });
    if (claimed.kind !== "success") throw new Error("claim failed");
    const waiting = await repository.beginFixedWait({
      dueAt: new Date("2026-07-13T00:00:00.000Z"),
      expectedRunLockVersion: 1,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: { consumer: "workflow-task", expiresAt: new Date("2026-08-10T00:00:00.000Z"), messageId: "unavailable-waiting-cancel" },
      now: new Date("2026-07-10T00:00:00.000Z"),
      runId: created.run.id,
      taskId: created.task.id,
      uid: 9,
    });
    if (waiting.kind !== "success") throw new Error("wait failed");
    runtimeStatus = "stopped";

    await repository.cancelUnavailableWorkflowRuns({ limit: 100 });

    expect(repository.snapshot().nodeMetricEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ current: -1, nodeId: "wait-1", passed: 0 }),
    ]));
    expect(repository.snapshot().nodeMetricEvents).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ current: -1, nodeId: "message-1" }),
    ]));
  });

  it("rejects a commit whose next run state violates the runtime state machine", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    const created = await repository.createRunWithInitialTask(createRunInput());
    const claimed = await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });
    if (claimed.kind !== "success") throw new Error("claim failed");
    repository.runs[0]!.status = "completed";

    await expect(repository.commitNodeResult({
      expectedRunLockVersion: 1,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: { consumer: "workflow-task", expiresAt: new Date("2026-08-10T00:00:00.000Z"), messageId: "invalid-state" },
      nodeExecution: { executionKey: "invalid", input: {}, output: {} },
      runId: created.run.id,
      taskId: created.task.id,
      uid: 9,
    })).resolves.toEqual({ kind: "conflict" });
  });

  it("recovers expired running task leases without per-task writes", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    const created = await repository.createRunWithInitialTask(createRunInput());
    await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });

    const recovered = await repository.recoverExpiredLeases({
      limit: 100,
      maxAttempts: 5,
      now: new Date("2026-07-10T00:02:00.000Z"),
    });

    expect(recovered).toEqual({ dead: 0, recovered: 1 });
    expect(repository.snapshot().tasks[0]).toMatchObject({ attempt: 1, status: "pending", taskVersion: 3 });
  });

  it("marks the task dead and fails its run when execution attempts are exhausted", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    const created = await repository.createRunWithInitialTask({
      ...createRunInput(),
      initialNodeId: "wait-1",
      initialNodeKind: "wait",
    });
    await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });

    const result = await repository.recoverExpiredLeases({
      limit: 100,
      maxAttempts: 1,
      now: new Date("2026-07-10T00:02:00.000Z"),
    });

    expect(result).toEqual({ dead: 1, recovered: 0 });
    expect(repository.snapshot().tasks[0]).toMatchObject({
      attempt: 1,
      status: "dead",
      taskVersion: 3,
    });
    expect(repository.snapshot().runs[0]).toMatchObject({
      nextExecuteAt: null,
      status: "failed",
    });
    expect(repository.snapshot().nodeMetricEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ current: -1, nodeId: "wait-1", passed: 0 }),
    ]));
  });

  it("removes expired inbox records in bounded batches", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    const created = await repository.createRunWithInitialTask(createRunInput());
    const claimed = await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });
    if (claimed.kind !== "success") throw new Error("claim failed");
    await repository.commitNodeResult({
      expectedRunLockVersion: 1,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: {
        consumer: "workflow-task",
        expiresAt: new Date("2026-07-11T00:00:00.000Z"),
        messageId: "expired-message",
      },
      nodeExecution: { executionKey: "expired", input: {}, output: {} },
      runId: created.run.id,
      taskId: created.task.id,
      uid: 9,
    });

    await expect(repository.cleanupExpiredInbox({
      limit: 1,
      now: new Date("2026-07-12T00:00:00.000Z"),
    })).resolves.toBe(1);
    expect(repository.snapshot().inbox).toHaveLength(0);
  });

  it("prunes terminal workflow history in technical and user-visible retention stages", async () => {
    let now = new Date("2026-01-01T00:00:00.000Z");
    const repository = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const completed = await repository.createRunWithInitialTask(createRunInput());
    const claimed = await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-01-01T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: completed.task.id,
      uid: 9,
    });
    if (claimed.kind !== "success") throw new Error("claim failed");
    await repository.commitNodeResult({
      expectedRunLockVersion: 1,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: {
        consumer: "workflow-task",
        expiresAt: new Date("2026-02-01T00:00:00.000Z"),
        messageId: "history-retention",
      },
      nodeExecution: { executionKey: "history-retention", input: {}, output: {} },
      runId: completed.run.id,
      taskId: completed.task.id,
      uid: 9,
    });
    const active = await repository.createRunWithInitialTask({
      ...createRunInput(),
      entryEventId: "active-event",
    });

    await expect(repository.cleanupWorkflowHistory({
      limit: 100,
      runBefore: new Date("2026-01-01T00:00:00.000Z"),
      taskOutboxBefore: new Date("2026-01-01T00:00:00.000Z"),
    })).resolves.toEqual({
      hasMore: false,
      nodeExecutionsDeleted: 0,
      outboxDeleted: 0,
      runsDeleted: 0,
      tasksDeleted: 0,
    });
    expect(repository.snapshot()).toMatchObject({
      runs: expect.arrayContaining([expect.objectContaining({ id: completed.run.id })]),
      tasks: expect.arrayContaining([expect.objectContaining({ runId: completed.run.id })]),
    });

    now = new Date("2026-02-01T00:00:00.000Z");
    await expect(repository.cleanupWorkflowHistory({
      limit: 100,
      runBefore: new Date("2025-08-05T00:00:00.000Z"),
      taskOutboxBefore: new Date("2026-01-02T00:00:00.000Z"),
    })).resolves.toEqual({
      hasMore: false,
      nodeExecutionsDeleted: 0,
      outboxDeleted: 1,
      runsDeleted: 0,
      tasksDeleted: 1,
    });
    expect(repository.snapshot()).toMatchObject({
      nodeExecutions: [expect.objectContaining({ runId: completed.run.id })],
      runs: expect.arrayContaining([
        expect.objectContaining({ id: completed.run.id, status: "completed" }),
        expect.objectContaining({ id: active.run.id, status: "queued" }),
      ]),
      tasks: [expect.objectContaining({ runId: active.run.id })],
    });

    now = new Date("2026-07-13T00:00:00.000Z");
    await expect(repository.cleanupWorkflowHistory({
      limit: 100,
      runBefore: new Date("2026-01-14T00:00:00.000Z"),
      taskOutboxBefore: new Date("2026-06-13T00:00:00.000Z"),
    })).resolves.toEqual({
      hasMore: false,
      nodeExecutionsDeleted: 1,
      outboxDeleted: 0,
      runsDeleted: 1,
      tasksDeleted: 0,
    });
    expect(repository.snapshot()).toMatchObject({
      nodeExecutions: [],
      runs: [expect.objectContaining({ id: active.run.id, status: "queued" })],
      tasks: [expect.objectContaining({ runId: active.run.id })],
    });
    expect(repository.snapshot().outbox).toHaveLength(1);
  });

  it("keeps terminal task history while its outbox delivery is leased", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const repository = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const created = await repository.createRunWithInitialTask(createRunInput());
    await repository.claimOutboxBatch({
      leaseExpiresAt: new Date("2026-07-14T00:01:00.000Z"),
      leaseOwner: "publisher-1",
      limit: 1,
      now,
    });
    const claimed = await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-01-01T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });
    if (claimed.kind !== "success") throw new Error("claim failed");
    await repository.commitNodeResult({
      expectedRunLockVersion: 1,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: {
        consumer: "workflow-task",
        expiresAt: new Date("2026-02-01T00:00:00.000Z"),
        messageId: "leased-history-retention",
      },
      nodeExecution: { executionKey: "leased-history-retention", input: {}, output: {} },
      runId: created.run.id,
      taskId: created.task.id,
      uid: 9,
    });

    await expect(repository.cleanupWorkflowHistory({
      limit: 100,
      runBefore: new Date("2026-07-13T00:00:00.000Z"),
      taskOutboxBefore: new Date("2026-07-13T00:00:00.000Z"),
    })).resolves.toMatchObject({
      hasMore: true,
      outboxDeleted: 0,
      runsDeleted: 0,
      tasksDeleted: 0,
    });
    expect(repository.snapshot()).toMatchObject({
      outbox: [expect.objectContaining({ status: "leased" })],
      runs: [expect.objectContaining({ id: created.run.id })],
      tasks: [expect.objectContaining({ id: created.task.id })],
    });
  });

  it("preserves lifetime entry limits after old runs are removed", async () => {
    let now = new Date("2026-01-01T00:00:00.000Z");
    const repository = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const created = await repository.createRunWithInitialTask({
      ...createRunInput(),
      entryPolicy: { mode: "never" },
    });
    const claimed = await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-01-01T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });
    if (claimed.kind !== "success") throw new Error("claim failed");
    await repository.commitNodeResult({
      expectedRunLockVersion: 1,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: {
        consumer: "workflow-task",
        expiresAt: new Date("2026-02-01T00:00:00.000Z"),
        messageId: "lifetime-retention",
      },
      nodeExecution: { executionKey: "lifetime-retention", input: {}, output: {} },
      runId: created.run.id,
      taskId: created.task.id,
      uid: 9,
    });
    now = new Date("2026-07-13T00:00:00.000Z");
    await repository.cleanupWorkflowHistory({
      limit: 100,
      runBefore: new Date("2026-01-14T00:00:00.000Z"),
      taskOutboxBefore: new Date("2026-06-13T00:00:00.000Z"),
    });

    await expect(repository.createRunWithInitialTask({
      ...createRunInput(),
      entryEventId: "event-after-cleanup",
      entryPolicy: { mode: "never" },
    })).resolves.toEqual({ kind: "entry-policy-rejected" });
  });

  it("cancels stopped workflow runs in cursor-based batches", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    await repository.createRunWithInitialTask(createRunInput());
    await repository.createRunWithInitialTask({
      ...createRunInput(),
      entryEventId: "event-2",
      subjectId: "customer-2",
    });
    const reconciler = new WorkflowRuntimeReconciler(repository);

    const first = await reconciler.cancelStoppedWorkflow({ limit: 1, uid: 9, workflowId: "31" });
    const second = await reconciler.cancelStoppedWorkflow({
      afterRunId: first.nextCursor ?? undefined,
      limit: 1,
      uid: 9,
      workflowId: "31",
    });

    expect(first).toMatchObject({ cancelled: 1, done: false });
    expect(second).toMatchObject({ cancelled: 1 });
    expect(repository.snapshot().runs.every((run) => run.status === "cancelled")).toBe(true);
    expect(repository.snapshot().nodeMetricEvents.filter(event => event.current === -1)).toHaveLength(2);
  });
});

function createRunInput(): WorkflowCreateRunInput {
  return {
    context: { trigger: { eventType: "customer.created" } },
    entryEventId: "event-1",
    entryPolicy: { maxEntries: 10, mode: "lifetime_limit" as const },
    initialNodeId: "start",
    initialNodeKind: "start" as const,
    occurredAt: new Date("2026-07-10T00:00:00.000Z"),
    revision: 1,
    shardId: 7,
    subjectId: "customer-1",
    subjectType: "chatai_contact",
    uid: 9,
    workflowId: "31",
    workflowType: "chatai_sop",
  };
}

function repositoryWithPublishedSpec() {
  return new InMemoryWorkflowRuntimeRepository(
    undefined,
    () => new Date("2026-07-10T00:00:00.000Z"),
    async () => ({
      executionSpec: publishedSpec(),
      revision: 2,
      subjectType: "chatai_contact",
      workflowType: "chatai_sop",
    }),
  );
}

function repositoryWithLatestSpec(executionSpec: WorkflowExecutionSpec) {
  return new InMemoryWorkflowRuntimeRepository(
    undefined,
    () => new Date("2026-07-10T00:00:00.000Z"),
    async () => ({
      executionSpec,
      revision: executionSpec.revision,
      subjectType: "chatai_contact",
      workflowType: "chatai_sop",
    }),
  );
}

function flowChangedSpec(
  scenario:
    | "branch-context-incompatible"
    | "context-incompatible"
    | "current-node-deleted"
    | "handoff-context-incompatible"
    | "message-context-incompatible"
    | "node-kind-changed"
    | "order-conversion-context-incompatible"
    | "outlet-deleted",
): WorkflowExecutionSpec {
  const spec = publishedSpec();
  if (scenario === "current-node-deleted") {
    return { ...spec, edges: [], entryNodeId: "end", nodes: [spec.nodes[1]!] };
  }
  if (scenario === "node-kind-changed") {
    return {
      ...spec,
      nodes: [{
        config: { duration: 1, unit: "day" },
        id: "start",
        kind: "wait",
        nodeSchemaVersion: 1,
      }, spec.nodes[1]!],
    };
  }
  if (scenario === "outlet-deleted") return { ...spec, edges: [] };
  if (scenario === "handoff-context-incompatible") {
    return {
      ...spec,
      edges: [
        { id: "start-handoff", source: "start", sourceOutletId: "default", target: "handoff-1" },
        { id: "handoff-end", source: "handoff-1", sourceOutletId: "default", target: "end" },
      ],
      nodes: [
        spec.nodes[0]!,
        {
          config: {
            customerMessage: [],
            operatorMessage: [{ type: "text", value: "需要人工处理" }],
          },
          id: "handoff-1",
          kind: "handoff",
          nodeSchemaVersion: 1,
        },
        spec.nodes[1]!,
      ],
    };
  }
  if (scenario === "message-context-incompatible") {
    return {
      ...spec,
      edges: [
        { id: "start-message", source: "start", sourceOutletId: "default", target: "message-1" },
        { id: "message-end", source: "message-1", sourceOutletId: "default", target: "end" },
      ],
      nodes: [
        spec.nodes[0]!,
        {
          config: {
            attachments: [],
            content: [{ type: "text", value: "hello" }],
            contentMode: "custom",
          },
          id: "message-1",
          kind: "message",
          nodeSchemaVersion: 2,
        },
        spec.nodes[1]!,
      ],
    };
  }
  if (scenario === "order-conversion-context-incompatible") {
    return {
      ...spec,
      edges: [
        { id: "start-order-conversion", source: "start", sourceOutletId: "default", target: "order-conversion-1" },
        { id: "order-conversion-end", source: "order-conversion-1", sourceOutletId: "default", target: "end" },
      ],
      nodes: [
        spec.nodes[0]!,
        {
          config: {
            orderNumberSelector: ["node", "llm-1", "result"],
          },
          id: "order-conversion-1",
          kind: "order-conversion",
          nodeSchemaVersion: 1,
        },
        spec.nodes[1]!,
      ],
    };
  }
  if (scenario === "branch-context-incompatible") {
    return {
      ...spec,
      edges: [
        { id: "start-branch", source: "start", sourceOutletId: "default", target: "branch-1" },
        { id: "branch-matched-end", source: "branch-1", sourceOutletId: "matched", target: "end" },
        { id: "branch-default-end", source: "branch-1", sourceOutletId: "default", target: "end" },
      ],
      nodes: [
        {
          ...spec.nodes[0]!,
          config: {
            entryMode: "event",
            entryPolicy: { maxEntries: 10, mode: "lifetime_limit" },
            seatIds: [101],
            triggers: [{ keywords: ["price"], type: "message.received" }],
          },
        },
        {
          config: {
            branchPaths: [
              {
                conditions: [{
                  id: "message-id-present",
                  operator: "greater-than",
                  selector: ["trigger", "projection", "messageId"],
                  value: 0,
                  valueType: "number",
                }],
                id: "matched",
                label: "Matched",
                logic: "all",
              },
              {
                conditions: [],
                id: "default",
                isDefault: true,
                label: "Default",
                logic: "all",
              },
            ],
          },
          id: "branch-1",
          kind: "branch",
          nodeSchemaVersion: 1,
        },
        spec.nodes[1]!,
      ],
    };
  }
  return {
    ...spec,
    edges: [{ id: "start-llm", source: "start", sourceOutletId: "default", target: "llm-1" }],
    nodes: [
      {
        ...spec.nodes[0]!,
        config: {
          entryMode: "event",
          entryPolicy: { maxEntries: 10, mode: "lifetime_limit" },
          seatIds: [101],
          triggers: [{ keywords: ["price"], type: "message.received" }],
        },
      },
      {
        config: {
          inputs: [{
            id: "message-id",
            name: "messageId",
            value: {
              kind: "variable",
              selector: ["trigger", "projection", "messageId"],
              valueType: { kind: "number" },
            },
          }],
          modelId: "model-1",
          reasoningEffort: "medium",
          output: {
            field: { description: "", id: "result", name: "result", type: "string" },
            format: "text",
          },
          systemPrompt: [{ type: "text", value: "Classify" }],
          userPrompt: [{ selector: ["input", "message-id"], type: "variable" }],
        },
        id: "llm-1",
        kind: "llm",
        nodeSchemaVersion: 1,
      },
      spec.nodes[1]!,
    ],
  };
}

function publishedSpec(): WorkflowExecutionSpec {
  return {
    edges: [{ id: "start-end", source: "start", sourceOutletId: "default", target: "end" }],
    entryNodeId: "start",
    nodes: [
      {
        config: {
          entryPolicy: { maxEntries: 10, mode: "lifetime_limit" },
          eventType: "contact.friend_added",
          filter: { sourceIds: ["qr-code-1"] },
          seatIds: [101],
        },
        id: "start",
        kind: "start",
        nodeSchemaVersion: 1,
      },
      {
        config: {},
        id: "end",
        kind: "end",
        nodeSchemaVersion: 1,
      },
    ],
    revision: 2,
    schemaVersion: 3,
    terminalNodeId: "end",
    workflowId: "31",
  };
}

function publishedSpecWithWait(): WorkflowExecutionSpec {
  const spec = publishedSpec();
  return {
    ...spec,
    edges: [
      { id: "start-wait", source: "start", sourceOutletId: "default", target: "wait-1" },
      { id: "wait-end", source: "wait-1", sourceOutletId: "default", target: "end" },
    ],
    nodes: [
      spec.nodes[0]!,
      {
        config: { duration: 1, unit: "day" },
        id: "wait-1",
        kind: "wait",
        nodeSchemaVersion: 1,
      },
      spec.nodes[1]!,
    ],
    revision: 3,
  };
}

function publishedSpecWithInsertedMessageBeforeWait(): WorkflowExecutionSpec {
  const spec = publishedSpec();
  return {
    ...spec,
    edges: [
      { id: "start-message", source: "start", sourceOutletId: "default", target: "message-1" },
      { id: "message-wait", source: "message-1", sourceOutletId: "default", target: "wait-1" },
      { id: "wait-branch", source: "wait-1", sourceOutletId: "default", target: "branch-1" },
      { id: "branch-matched-end", source: "branch-1", sourceOutletId: "matched", target: "end" },
      { id: "branch-default-end", source: "branch-1", sourceOutletId: "default", target: "end" },
    ],
    nodes: [
      spec.nodes[0]!,
      {
        config: {},
        id: "message-1",
        kind: "message",
        nodeSchemaVersion: 1,
      },
      {
        config: { duration: 1, unit: "day" },
        id: "wait-1",
        kind: "wait",
        nodeSchemaVersion: 1,
      },
      {
        config: {
          branchPaths: [
            {
              conditions: [{
                id: "message-sent",
                operator: "is-not-empty",
                selector: ["node-lifecycle", "message-1", "exitedAt"],
                valueType: "datetime",
              }],
              id: "matched",
              label: "Matched",
              logic: "all",
            },
            {
              conditions: [],
              id: "default",
              isDefault: true,
              label: "Default",
              logic: "all",
            },
          ],
        },
        id: "branch-1",
        kind: "branch",
        nodeSchemaVersion: 1,
      },
      spec.nodes[1]!,
    ],
  };
}

async function createWaitingRun(
  repository: InMemoryWorkflowRuntimeRepository,
  entryEventId: string,
) {
  const created = await repository.createRunWithInitialTask({
    ...createRunInput(),
    entryEventId,
    initialNodeId: "wait-1",
    initialNodeKind: "wait",
    subjectId: entryEventId,
  });
  if (created.kind !== "success") throw new Error("create failed");
  const claimed = await repository.claimTask({
    expectedTaskVersion: created.task.taskVersion,
    leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
    leaseOwner: "task-worker",
    taskId: created.task.id,
    uid: 9,
  });
  if (claimed.kind !== "success") throw new Error("claim failed");
  const waiting = await repository.beginFixedWait({
    dueAt: new Date("2026-07-11T00:00:00.000Z"),
    expectedRunLockVersion: created.run.lockVersion,
    expectedTaskVersion: claimed.task.taskVersion,
    inbox: {
      consumer: "workflow-task",
      expiresAt: new Date("2026-08-10T00:00:00.000Z"),
      messageId: `wait:${entryEventId}`,
    },
    now: new Date("2026-07-10T00:00:00.000Z"),
    runId: created.run.id,
    taskId: claimed.task.id,
    uid: 9,
  });
  if (waiting.kind !== "success") throw new Error("wait failed");
  return waiting;
}
