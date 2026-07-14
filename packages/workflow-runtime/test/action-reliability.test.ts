import type { WorkflowExecutionSpec } from "@chatai/contracts";
import { WorkflowActionExecutionError } from "@chatai/workflow-engine";
import { describe, expect, it, vi } from "vitest";
import {
  InMemoryWorkflowRuntimeRepository,
  WorkflowRuntimeService,
} from "../src/index.js";

const now = new Date("2026-07-13T00:00:00.000Z");

describe("workflow action reliability", () => {
  it("starts legacy revisions with the current rolling entry maximum", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const createRun = vi.spyOn(runtime, "createRunWithInitialTask");
    const spec = actionSpec();
    spec.nodes.find(node => node.kind === "start")!.config.entryPolicy = {
      maxEntries: 2,
      mode: "rolling_window",
      windowSize: 365,
      windowUnit: "day",
    };
    const service = new WorkflowRuntimeService({
      findDefinition: vi.fn(async () => ({
        bizStatus: 1 as const,
        publishedRevision: 1,
        runtimeStatus: "active" as const,
      })),
      findRevision: vi.fn(async () => ({ executionSpec: spec, revision: 1 })),
    }, runtime);

    await service.startRun({
      entryEventId: "legacy-window",
      expectedRevision: 1,
      subjectId: "customer-1",
      trigger: {},
      uid: 9,
      workflowId: "31",
    });

    expect(createRun).toHaveBeenCalledWith(expect.objectContaining({
      entryPolicy: expect.objectContaining({ windowSize: 90, windowUnit: "day" }),
    }));
  });

  it("creates the action ledger before the side effect and passes its stable idempotency key", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const receivedKeys: string[] = [];
    const service = createService(runtime, async (input: unknown) => {
      expect(runtime.nodeExecutions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          idempotencyKey: "9:1:message:2",
          nodeId: "message",
          status: "running",
        }),
      ]));
      receivedKeys.push(readIdempotencyKey(input));
      return { messageId: "downstream-1" };
    });
    const actionTask = await startAction(service);

    await service.executeTask({
      now,
      taskId: actionTask.id,
      taskVersion: actionTask.taskVersion,
      uid: 9,
      workerId: "worker-1",
    });

    expect(receivedKeys).toEqual(["9:1:message:2"]);
    expect(runtime.nodeExecutions).toEqual([
      expect.objectContaining({
        idempotencyKey: "9:1:start:1",
        status: "completed",
      }),
      expect.objectContaining({
        idempotencyKey: "9:1:message:2",
        output: { messageId: "downstream-1" },
        status: "completed",
      }),
    ]);
  });

  it.each(["retryable", "unknown"] as const)(
    "persists an %s action failure as one database retry and reuses the ledger",
    async (failureKind) => {
      const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
      const receivedKeys: string[] = [];
      let attempt = 0;
      const service = createService(runtime, async (input: unknown) => {
        receivedKeys.push(readIdempotencyKey(input));
        attempt += 1;
        if (attempt === 1) throw createActionError(failureKind, "DOWNSTREAM_TEMPORARY");
        return { messageId: "downstream-1" };
      });
      const actionTask = await startAction(service);

      const firstResult = await service.executeTask({
        now,
        taskId: actionTask.id,
        taskVersion: actionTask.taskVersion,
        uid: 9,
        workerId: "worker-1",
      });

      expect(firstResult).toMatchObject({ kind: "retry-scheduled" });
      const retryTask = await runtime.findTask(9, actionTask.id);
      expect(retryTask).toMatchObject({
        dueAt: new Date("2026-07-13T00:00:05.000Z"),
        leaseExpiresAt: null,
        leaseOwner: null,
        status: "pending",
        taskVersion: actionTask.taskVersion + 2,
      });
      expect(runtime.nodeExecutions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          errorCode: "DOWNSTREAM_TEMPORARY",
          failureKind,
          idempotencyKey: "9:1:message:2",
          status: "retrying",
        }),
      ]));

      const secondResult = await service.executeTask({
        now: new Date("2026-07-13T00:00:05.000Z"),
        taskId: actionTask.id,
        taskVersion: retryTask!.taskVersion,
        uid: 9,
        workerId: "worker-2",
      });

      expect(secondResult).toMatchObject({ kind: "success" });
      expect(receivedKeys).toEqual(["9:1:message:2", "9:1:message:2"]);
      expect(runtime.nodeExecutions.filter(item => item.nodeId === "message")).toEqual([
        expect.objectContaining({
          failureKind: null,
          idempotencyKey: "9:1:message:2",
          status: "completed",
        }),
      ]);
    },
  );

  it("atomically fails the action task and run for a terminal action error", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = createService(runtime, async () => {
      throw createActionError("terminal", "DOWNSTREAM_REJECTED");
    });
    const actionTask = await startAction(service);

    const result = await service.executeTask({
      now,
      taskId: actionTask.id,
      taskVersion: actionTask.taskVersion,
      uid: 9,
      workerId: "worker-1",
    });

    expect(result).toMatchObject({ kind: "failed" });
    await expect(runtime.findRun(9, actionTask.runId)).resolves.toMatchObject({
      nextExecuteAt: null,
      status: "failed",
    });
    await expect(runtime.findTask(9, actionTask.id)).resolves.toMatchObject({
      leaseExpiresAt: null,
      leaseOwner: null,
      status: "dead",
    });
    expect(runtime.nodeExecutions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        errorCode: "DOWNSTREAM_REJECTED",
        failureKind: "terminal",
        nodeId: "message",
        status: "failed",
      }),
    ]));
  });

  it("fails instead of retrying after the configured action attempt limit", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = createService(runtime, async () => {
      throw createActionError("retryable", "DOWNSTREAM_TEMPORARY");
    }, { maxTaskAttempts: 1 });
    const actionTask = await startAction(service);

    const result = await service.executeTask({
      now,
      taskId: actionTask.id,
      taskVersion: actionTask.taskVersion,
      uid: 9,
      workerId: "worker-1",
    });

    expect(result).toMatchObject({ kind: "failed" });
    await expect(runtime.findTask(9, actionTask.id)).resolves.toMatchObject({ status: "dead" });
  });

  it("bounds classified action error fields before persistence", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = createService(runtime, async () => {
      throw createActionError("terminal", `CODE_${"X".repeat(200)}`, "错".repeat(600));
    });
    const actionTask = await startAction(service);

    await service.executeTask({
      now,
      taskId: actionTask.id,
      taskVersion: actionTask.taskVersion,
      uid: 9,
      workerId: "worker-1",
    });

    const execution = runtime.nodeExecutions.find(item => item.nodeId === "message")!;
    expect(execution.errorCode).toHaveLength(128);
    expect(execution.errorMessage).toHaveLength(512);
  });

  it("leaves an unclassified failure running until lease recovery", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = createService(runtime, async () => {
      throw new Error("programming failure");
    });
    const actionTask = await startAction(service);

    await expect(service.executeTask({
      now,
      taskId: actionTask.id,
      taskVersion: actionTask.taskVersion,
      uid: 9,
      workerId: "worker-1",
    })).rejects.toThrow("programming failure");

    await expect(runtime.findTask(9, actionTask.id)).resolves.toMatchObject({ status: "running" });
    expect(runtime.nodeExecutions).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: "message", status: "running" }),
    ]));
  });

  it("reuses the action ledger and idempotency key after an unclassified crash is lease-recovered", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const receivedKeys: string[] = [];
    let attempt = 0;
    const service = createService(runtime, async (input: unknown) => {
      receivedKeys.push(readIdempotencyKey(input));
      attempt += 1;
      if (attempt === 1) throw new Error("worker crashed after the side effect");
      return { messageId: "downstream-1" };
    });
    const actionTask = await startAction(service);

    await expect(service.executeTask({
      now,
      taskId: actionTask.id,
      taskVersion: actionTask.taskVersion,
      uid: 9,
      workerId: "worker-1",
    })).rejects.toThrow("worker crashed after the side effect");
    await runtime.recoverExpiredLeases({
      limit: 100,
      maxAttempts: 3,
      now: new Date("2026-07-13T00:02:00.000Z"),
    });
    const retryTask = await runtime.findTask(9, actionTask.id);

    await service.executeTask({
      now: new Date("2026-07-13T00:02:00.000Z"),
      taskId: actionTask.id,
      taskVersion: retryTask!.taskVersion,
      uid: 9,
      workerId: "worker-2",
    });

    expect(receivedKeys).toEqual(["9:1:message:2", "9:1:message:2"]);
    expect(runtime.nodeExecutions.filter(item => item.nodeId === "message")).toEqual([
      expect.objectContaining({ status: "completed" }),
    ]);
  });

  it("fails a prepared action ledger when lease recovery exhausts task attempts", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = createService(runtime, async () => {
      throw new Error("unclassified failure");
    });
    const actionTask = await startAction(service);

    await expect(service.executeTask({
      now,
      taskId: actionTask.id,
      taskVersion: actionTask.taskVersion,
      uid: 9,
      workerId: "worker-1",
    })).rejects.toThrow("unclassified failure");
    await runtime.recoverExpiredLeases({
      limit: 100,
      maxAttempts: 1,
      now: new Date("2026-07-13T00:02:00.000Z"),
    });

    expect(runtime.nodeExecutions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        errorCode: "WORKFLOW_TASK_ATTEMPTS_EXHAUSTED",
        nodeId: "message",
        status: "failed",
      }),
    ]));
  });

  it("terminates a prepared action ledger when the workflow is stopped during the side effect", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = createService(runtime, async () => {
      await runtime.cancelWorkflowBatch({ limit: 100, uid: 9, workflowId: "31" });
      throw new Error("action result arrived after stop");
    });
    const actionTask = await startAction(service);

    await expect(service.executeTask({
      now,
      taskId: actionTask.id,
      taskVersion: actionTask.taskVersion,
      uid: 9,
      workerId: "worker-1",
    })).rejects.toThrow("action result arrived after stop");

    expect(runtime.nodeExecutions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        errorCode: "WORKFLOW_RUN_CANCELLED",
        nodeId: "message",
        status: "failed",
      }),
    ]));
  });

  it("terminates a retrying action ledger when the workflow is stopped before retry", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = createService(runtime, async () => {
      throw createActionError("retryable", "DOWNSTREAM_TEMPORARY");
    });
    const actionTask = await startAction(service);

    await service.executeTask({
      now,
      taskId: actionTask.id,
      taskVersion: actionTask.taskVersion,
      uid: 9,
      workerId: "worker-1",
    });
    await runtime.cancelWorkflowBatch({ limit: 100, uid: 9, workflowId: "31" });

    expect(runtime.nodeExecutions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        errorCode: "WORKFLOW_RUN_CANCELLED",
        nodeId: "message",
        status: "failed",
      }),
    ]));
  });

  it("rejects preparing an action after its run is no longer running", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = createService(runtime, async () => ({}));
    const actionTask = await startAction(service);
    const claimed = await runtime.claimTask({
      expectedTaskVersion: actionTask.taskVersion,
      leaseExpiresAt: new Date("2026-07-13T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: actionTask.id,
      uid: 9,
    });
    if (claimed.kind !== "success") throw new Error("action task was not claimed");
    const run = runtime.runs.find(item => item.id === actionTask.runId)!;
    run.status = "cancelled";

    await expect(runtime.prepareActionExecution({
      expectedRunLockVersion: run.lockVersion,
      expectedTaskVersion: claimed.task.taskVersion,
      idempotencyKey: "9:1:message:2",
      input: {},
      now,
      runId: run.id,
      taskId: actionTask.id,
      uid: 9,
    })).resolves.toEqual({ kind: "conflict" });
  });

  it.each(["scheduleActionRetry", "failActionExecution"] as const)(
    "rejects %s after its run is no longer running",
    async (operation) => {
      const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
      const service = createService(runtime, async () => ({}));
      const actionTask = await startAction(service);
      const claimed = await runtime.claimTask({
        expectedTaskVersion: actionTask.taskVersion,
        leaseExpiresAt: new Date("2026-07-13T00:01:00.000Z"),
        leaseOwner: "worker-1",
        taskId: actionTask.id,
        uid: 9,
      });
      if (claimed.kind !== "success") throw new Error("action task was not claimed");
      const run = runtime.runs.find(item => item.id === actionTask.runId)!;
      await runtime.prepareActionExecution({
        expectedRunLockVersion: run.lockVersion,
        expectedTaskVersion: claimed.task.taskVersion,
        idempotencyKey: "9:1:message:2",
        input: {},
        now,
        runId: run.id,
        taskId: actionTask.id,
        uid: 9,
      });
      run.status = "cancelled";
      const failureInput = {
        errorCode: "DOWNSTREAM_TEMPORARY",
        errorMessage: "temporary failure",
        expectedRunLockVersion: run.lockVersion,
        expectedTaskVersion: claimed.task.taskVersion,
        failureKind: "retryable" as const,
        idempotencyKey: "9:1:message:2",
        inbox: {
          consumer: "workflow-task",
          expiresAt: new Date("2026-08-13T00:00:00.000Z"),
          messageId: `message-${operation}`,
        },
        now,
        runId: run.id,
        taskId: actionTask.id,
        uid: 9,
      };

      const result = operation === "scheduleActionRetry"
        ? await runtime.scheduleActionRetry({ ...failureInput, dueAt: new Date("2026-07-13T00:00:05.000Z") })
        : await runtime.failActionExecution(failureInput);

      expect(result).toEqual({ kind: "conflict" });
    },
  );

  it.each([
    { failureKind: "retryable", operation: "scheduleActionRetry" },
    { failureKind: "terminal", operation: "failActionExecution" },
  ] as const)("preserves already-processed from $operation", async ({ failureKind, operation }) => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    vi.spyOn(runtime, operation).mockResolvedValue({ kind: "already-processed" });
    const service = createService(runtime, async () => {
      throw createActionError(failureKind, "DOWNSTREAM_FAILURE");
    });
    const actionTask = await startAction(service);

    await expect(service.executeTask({
      now,
      taskId: actionTask.id,
      taskVersion: actionTask.taskVersion,
      uid: 9,
      workerId: "worker-1",
    })).rejects.toMatchObject({ code: "WORKFLOW_TASK_ALREADY_PROCESSED" });
  });
});

function createService(
  runtime: InMemoryWorkflowRuntimeRepository,
  executeAction: (input: unknown) => Promise<Record<string, unknown>>,
  options: { maxTaskAttempts?: number } = {},
) {
  return new WorkflowRuntimeService(createControlReader(), runtime, executeAction as never, {
    actionMaxRetryDelayMs: 60_000,
    actionRetryDelayMs: 5_000,
    maxTaskAttempts: options.maxTaskAttempts ?? 3,
    taskLeaseDurationMs: 60_000,
  });
}

async function startAction(service: WorkflowRuntimeService) {
  const started = await service.startRun({
    entryEventId: "event-1",
    expectedRevision: 1,
    subjectId: "customer-1",
    trigger: {},
    uid: 9,
    workflowId: "31",
  });
  const advanced = await service.executeTask({
    now,
    taskId: started.task.id,
    taskVersion: started.task.taskVersion,
    uid: 9,
    workerId: "worker-1",
  });
  if (!("nextTask" in advanced) || !advanced.nextTask) throw new Error("action task was not created");
  return advanced.nextTask;
}

function createControlReader() {
  return {
    findDefinition: vi.fn(async () => ({
      bizStatus: 1 as const,
      publishedRevision: 1,
      runtimeStatus: "active" as const,
    })),
    findRevision: vi.fn(async () => ({ executionSpec: actionSpec(), revision: 1 })),
  };
}

function actionSpec(): WorkflowExecutionSpec {
  return {
    edges: [
      { id: "start-message", source: "start", sourceOutletId: "default", target: "message" },
      { id: "message-end", source: "message", sourceOutletId: "default", target: "end" },
    ],
    entryNodeId: "start",
    nodes: [
      { config: startConfig(), id: "start", kind: "start", nodeSchemaVersion: 1 },
      { config: {}, id: "message", kind: "message", nodeSchemaVersion: 1 },
      { config: {}, id: "end", kind: "end", nodeSchemaVersion: 1 },
    ],
    revision: 1,
    schemaVersion: 1,
    terminalNodeId: "end",
    workflowId: "31",
  };
}

function startConfig() {
  return {
    accountIds: ["account-a"],
    entryPolicy: { maxEntries: 10, mode: "lifetime_limit" as const },
    triggers: [{ type: "contact.friend_added" as const }],
  };
}

function createActionError(
  kind: "retryable" | "terminal" | "unknown",
  code: string,
  message = "可展示的下游错误",
) {
  return new WorkflowActionExecutionError(kind, code, message);
}

function readIdempotencyKey(input: unknown) {
  expect(input).toEqual(expect.objectContaining({ idempotencyKey: expect.any(String) }));
  return (input as { idempotencyKey: string }).idempotencyKey;
}
