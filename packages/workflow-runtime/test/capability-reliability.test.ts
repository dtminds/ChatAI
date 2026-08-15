import type { WorkflowExecutionSpec } from "@chatai/contracts";
import { Type } from "@sinclair/typebox";
import {
  createWorkflowDeploymentCapabilities,
  WorkflowCapabilityExecutionError,
  WorkflowNodeExecutorRegistry,
} from "@chatai/workflow-engine";
import { describe, expect, it, vi } from "vitest";
import {
  type WorkflowCapabilityPort,
  type WorkflowCapabilityExecutionBinding,
  InMemoryWorkflowRuntimeRepository,
  type WorkflowMessageQueryRequest,
  WorkflowRuntimeService,
} from "../src/index.js";

const now = new Date("2026-07-13T00:00:00.000Z");

describe("workflow capability reliability", () => {
  it("requires the capability timeout to fit within half of the task lease", () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);

    expect(() => createService(runtime, async () => ({}), {
      capabilityTimeoutMs: 30_001,
      taskLeaseDurationMs: 60_000,
    })).toThrow("capability timeout must not exceed half of the task lease duration");
  });

  it("requires a positive Inference total timeout", () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);

    expect(() => createService(runtime, async () => ({}), {
      inferenceTotalTimeoutMs: 0,
    })).toThrow("inference timeout must be a positive integer");
  });

  it("rejects a binding whose operation kind disagrees with the node contract", () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const mismatchedBinding: WorkflowCapabilityExecutionBinding = {
      ...TEST_MESSAGE_CAPABILITY_BINDING,
      definition: {
        ...TEST_MESSAGE_CAPABILITY_BINDING.definition,
        kind: "query",
      },
    };

    expect(() => createService(runtime, async () => ({}), {
      capabilityBindings: [mismatchedBinding],
    })).toThrow("binding kind does not match node execution class: message");
  });

  it("fails a capability node through its execution ledger when its binding is unavailable", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = createService(runtime, async () => ({}), { capabilityBindings: [] });
    const actionTask = await startCapability(service);

    await expect(service.executeTask({
      now,
      taskId: actionTask.id,
      taskVersion: actionTask.taskVersion,
      uid: 9,
      workerId: "worker-1",
    })).resolves.toMatchObject({
      errorCode: "WORKFLOW_CAPABILITY_BINDING_UNAVAILABLE",
      failureKind: "terminal",
      kind: "failed",
    });
    expect(runtime.nodeExecutions).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: "message", status: "failed" }),
    ]));
  });

  it("aborts a timed-out action and persists an unknown-outcome retry", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
      const actionStartedAt = new Date(now.getTime() + 5_000);
      let actionSignal: AbortSignal | undefined;
      let deadlineAt: Date | undefined;
      const service = createService(runtime, async (input: unknown) => {
        const actionInput = input as { deadlineAt: Date; signal: AbortSignal };
        actionSignal = actionInput.signal;
        deadlineAt = actionInput.deadlineAt;
        return new Promise<Record<string, unknown>>(() => {});
      }, {
        capabilityTimeoutMs: 100,
        clock: () => actionStartedAt,
        taskLeaseDurationMs: 1_000,
      });
      const actionTask = await startCapability(service);

      const execution = service.executeTask({
        now,
        taskId: actionTask.id,
        taskVersion: actionTask.taskVersion,
        uid: 9,
        workerId: "worker-1",
      });
      await vi.advanceTimersByTimeAsync(100);

      await expect(execution).resolves.toMatchObject({
        diagnosticMessage: "Workflow capability exceeded its 100ms deadline",
        errorCode: "WORKFLOW_CAPABILITY_TIMEOUT",
        failureKind: "unknown",
        kind: "retry-scheduled",
      });
      expect(actionSignal?.aborted).toBe(true);
      expect(deadlineAt).toEqual(new Date(actionStartedAt.getTime() + 100));
      expect(runtime.nodeExecutions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          errorCode: "WORKFLOW_CAPABILITY_TIMEOUT",
          errorMessage: "节点执行超时",
          failureKind: "unknown",
          status: "retrying",
        }),
      ]));
    } finally {
      vi.useRealTimers();
    }
  });

  it("persists Query retries and terminal failures without an external idempotency key", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const requests: WorkflowMessageQueryRequest[] = [];
    let attempt = 0;
    const service = createService(runtime, async () => ({}), {
      messageQueryExecute: async (request) => {
        requests.push(request);
        attempt += 1;
        throw new WorkflowCapabilityExecutionError(
          attempt === 1 ? "retryable" : "terminal",
          attempt === 1 ? "DOWNSTREAM_TEMPORARY" : "DOWNSTREAM_REJECTED",
          "节点能力调用失败",
        );
      },
      spec: messageQuerySpec(),
    });
    const capabilityTask = await startCapability(service, {
      occurredAt: "2026-07-12T23:00:00.000Z",
      projection: { seatId: 101 },
    });

    await expect(service.executeTask({
      now,
      taskId: capabilityTask.id,
      taskVersion: capabilityTask.taskVersion,
      uid: 9,
      workerId: "worker-1",
    })).resolves.toMatchObject({
      errorCode: "DOWNSTREAM_TEMPORARY",
      kind: "retry-scheduled",
    });
    const retryTask = await runtime.findTask(9, capabilityTask.id);
    if (!retryTask) throw new Error("query retry task was not created");

    await expect(service.executeTask({
      now: retryTask.dueAt,
      taskId: retryTask.id,
      taskVersion: retryTask.taskVersion,
      uid: 9,
      workerId: "worker-2",
    })).resolves.toMatchObject({
      errorCode: "DOWNSTREAM_REJECTED",
      kind: "failed",
    });

    expect(requests).toHaveLength(2);
    for (const request of requests) expect(request).not.toHaveProperty("idempotencyKey");
    expect(runtime.nodeExecutions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        errorCode: "DOWNSTREAM_REJECTED",
        executionKey: "9:1:capability:2",
        nodeKind: "message-query",
        status: "failed",
      }),
    ]));
  });

  it("executes Message Query with Runtime trigger and node lifecycle context", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const requests: unknown[] = [];
    const spec = messageQuerySpec();
    spec.nodes[1]!.config = {
      limit: 10,
      take: "latest",
      timeRange: {
        end: { field: "enteredAt", kind: "current-node-lifecycle" },
        mode: "dynamic",
        start: { field: "occurredAt", kind: "workflow-trigger" },
      },
    };
    const service = createService(runtime, async () => ({}), {
      messageQueryExecute: async (request) => {
        requests.push(request);
        return {
          messageCount: 0,
          messageIds: [],
          rangeEnd: now.toISOString(),
          rangeStart: "2026-07-12T23:00:00.000Z",
          textContent: "",
        };
      },
      spec,
    });
    const capabilityTask = await startCapability(service, {
      occurredAt: "2026-07-12T23:00:00.000Z",
      projection: { seatId: 101 },
    });

    await expect(service.executeTask({
      now,
      taskId: capabilityTask.id,
      taskVersion: capabilityTask.taskVersion,
      uid: 9,
      workerId: "worker-1",
    })).resolves.toMatchObject({ kind: "success" });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      command: {
        limit: 10,
        rangeEnd: now.getTime(),
        rangeStart: Date.parse("2026-07-12T23:00:00.000Z"),
        seatId: 101,
        take: "latest",
      },
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 9,
    });
    expect(requests[0]).not.toHaveProperty("idempotencyKey");
  });

  it("fails an action whose projected output exceeds 8 KiB in UTF-8", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = createService(runtime, async () => ({ value: "中".repeat(2_800) }));
    const actionTask = await startCapability(service);

    const result = await service.executeTask({
      now,
      taskId: actionTask.id,
      taskVersion: actionTask.taskVersion,
      uid: 9,
      workerId: "worker-1",
    });

    expect(result).toMatchObject({
      errorCode: "WORKFLOW_CAPABILITY_OUTPUT_TOO_LARGE",
      failureKind: "terminal",
      kind: "failed",
    });
    expect(runtime.nodeExecutions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        errorMessage: "节点返回的数据无法处理，流程已停止",
        nodeId: "message",
        output: {},
        status: "failed",
      }),
    ]));
    await expect(runtime.findRun(9, actionTask.runId)).resolves.toMatchObject({
      context: { outputs: { start: {} } },
      status: "failed",
    });
  });

  it("fails an action that returns a non-JSON output", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = createService(runtime, async () => ({ value: 1n }) as never);
    const actionTask = await startCapability(service);

    await expect(service.executeTask({
      now,
      taskId: actionTask.id,
      taskVersion: actionTask.taskVersion,
      uid: 9,
      workerId: "worker-1",
    })).resolves.toMatchObject({
      errorCode: "WORKFLOW_CAPABILITY_OUTPUT_INVALID",
      failureKind: "terminal",
      kind: "failed",
    });
  });

  it("fails when a valid action output would push the Run Context over its budget", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = createService(runtime, async () => ({ value: "y".repeat(3_000) }));
    const actionTask = await startCapability(service, {
      padding: "x".repeat(128 * 1024 - 2_000),
    });

    await expect(service.executeTask({
      now,
      taskId: actionTask.id,
      taskVersion: actionTask.taskVersion,
      uid: 9,
      workerId: "worker-1",
    })).resolves.toMatchObject({
      errorCode: "WORKFLOW_CONTEXT_TOO_LARGE",
      failureKind: "terminal",
      kind: "failed",
    });
    expect(runtime.nodeExecutions).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: "message", output: {}, status: "failed" }),
    ]));
  });

  it("fails the current core node when its output pushes the Run Context over budget", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const executeAction = vi.fn(async () => ({ messageId: "downstream-1" }));
    const service = createService(runtime, executeAction);
    const emptyContextBytes = Buffer.byteLength(JSON.stringify({
      outputs: {},
      trigger: { padding: "" },
    }), "utf8");
    const started = await service.startRun({
      entryEventId: "exact-context",
      expectedRevision: 1,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      trigger: {
        padding: "x".repeat(128 * 1024 - emptyContextBytes),
      },
      uid: 9,
      workflowId: "31",
    });

    const result = await service.executeTask({
      now,
      taskId: started.task.id,
      taskVersion: started.task.taskVersion,
      uid: 9,
      workerId: "worker-1",
    });

    expect(result).toMatchObject({
      errorCode: "WORKFLOW_CONTEXT_TOO_LARGE",
      kind: "node-failed",
      nodeId: "start",
      nodeKind: "start",
      run: { status: "failed" },
    });
    expect(executeAction).not.toHaveBeenCalled();
    expect(runtime.tasks).toEqual([
      expect.objectContaining({ nodeId: "start", status: "dead" }),
    ]);
    expect(runtime.nodeExecutions).toEqual([
      expect.objectContaining({
        errorCode: "WORKFLOW_CONTEXT_TOO_LARGE",
        nodeId: "start",
        output: {},
        status: "failed",
      }),
    ]);
  });

  it("fails a core node whose output exceeds 8 KiB", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const executors = new WorkflowNodeExecutorRegistry().register("start", {
      execute: () => ({
        output: { value: "x".repeat(8 * 1024) },
        sourceOutletId: "default",
        type: "advance",
      }),
    });
    const service = createService(runtime, async () => ({}), {
      executors,
      spec: coreOutputSpec(),
    });
    const started = await service.startRun({
      entryEventId: "large-core-output",
      expectedRevision: 1,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      trigger: {},
      uid: 9,
      workflowId: "31",
    });
    const result = await service.executeTask({
      now,
      taskId: started.task.id,
      taskVersion: started.task.taskVersion,
      uid: 9,
      workerId: "worker-1",
    });

    expect(result).toMatchObject({
      errorCode: "WORKFLOW_NODE_OUTPUT_TOO_LARGE",
      kind: "node-failed",
      nodeId: "start",
      nodeKind: "start",
      run: { status: "failed" },
    });
    expect(runtime.tasks.some(task => task.nodeId === "end")).toBe(false);
    expect(runtime.nodeExecutions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        errorCode: "WORKFLOW_NODE_OUTPUT_TOO_LARGE",
        nodeId: "start",
        output: {},
        status: "failed",
      }),
    ]));
  });

  it("does not call the downstream action when the stored Run Context is already over budget", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const executeAction = vi.fn(async () => ({ messageId: "downstream-1" }));
    const service = createService(runtime, executeAction);
    const actionTask = await startCapability(service);
    const run = runtime.runs.find(item => item.id === actionTask.runId);
    if (!run) throw new Error("run was not created");
    run.context = {
      outputs: { start: {} },
      trigger: { padding: "x".repeat(128 * 1024) },
    };

    await expect(service.executeTask({
      now,
      taskId: actionTask.id,
      taskVersion: actionTask.taskVersion,
      uid: 9,
      workerId: "worker-1",
    })).resolves.toMatchObject({
      errorCode: "WORKFLOW_CONTEXT_TOO_LARGE",
      kind: "failed",
    });
    expect(executeAction).not.toHaveBeenCalled();
  });

  it("rejects an entry context above the runtime context budget", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = createService(runtime, async () => ({}));

    await expect(service.startRun({
      entryEventId: "oversized-context",
      expectedRevision: 1,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      trigger: { text: "中".repeat(50_000) },
      uid: 9,
      workflowId: "31",
    })).rejects.toMatchObject({ code: "WORKFLOW_CONTEXT_TOO_LARGE", statusCode: 400 });
    expect(runtime.snapshot().runs).toHaveLength(0);
  });

  it("rejects an entry context that cannot be represented as JSON", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = createService(runtime, async () => ({}));

    await expect(service.startRun({
      entryEventId: "invalid-context",
      expectedRevision: 1,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      trigger: { callback: () => undefined },
      uid: 9,
      workflowId: "31",
    })).rejects.toMatchObject({ code: "WORKFLOW_CONTEXT_INVALID", statusCode: 400 });
    expect(runtime.snapshot().runs).toHaveLength(0);
  });

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
    const service = createService(runtime, async () => ({}), { spec });

    await service.startRun({
      entryEventId: "legacy-window",
      expectedRevision: 1,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
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
          executionKey: "9:1:message:2",
          nodeId: "message",
          status: "running",
        }),
      ]));
      receivedKeys.push(readIdempotencyKey(input));
      return { messageId: "downstream-1" };
    });
    const actionTask = await startCapability(service);

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
        executionKey: "9:1:start:1",
        status: "completed",
      }),
      expect.objectContaining({
        executionKey: "9:1:message:2",
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
      const actionTask = await startCapability(service);

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
          executionKey: "9:1:message:2",
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
          executionKey: "9:1:message:2",
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
    const actionTask = await startCapability(service);

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

  it("persists only the user-safe action error and returns diagnostics for internal logging", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = createService(runtime, async () => {
      throw new WorkflowCapabilityExecutionError(
        "terminal",
        "DOWNSTREAM_REJECTED",
        "消息发送失败",
        { diagnosticMessage: "Java messaging API returned 503" },
      );
    });
    const actionTask = await startCapability(service);

    const result = await service.executeTask({
      now,
      taskId: actionTask.id,
      taskVersion: actionTask.taskVersion,
      uid: 9,
      workerId: "worker-1",
    });

    expect(result).toMatchObject({
      diagnosticMessage: "Java messaging API returned 503",
      kind: "failed",
    });
    expect(runtime.nodeExecutions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        errorCode: "DOWNSTREAM_REJECTED",
        errorMessage: "消息发送失败",
      }),
    ]));
  });

  it("fails instead of retrying after the configured action attempt limit", async () => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = createService(runtime, async () => {
      throw createActionError("retryable", "DOWNSTREAM_TEMPORARY");
    }, { maxTaskAttempts: 1 });
    const actionTask = await startCapability(service);

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
    const actionTask = await startCapability(service);

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
    const actionTask = await startCapability(service);

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
    const actionTask = await startCapability(service);

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
    const actionTask = await startCapability(service);

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
    const actionTask = await startCapability(service);

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
    const actionTask = await startCapability(service);

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
    const actionTask = await startCapability(service);
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

    await expect(runtime.prepareCapabilityExecution({
      expectedRunLockVersion: run.lockVersion,
      expectedTaskVersion: claimed.task.taskVersion,
      executionKey: "9:1:message:2",
      input: {},
      now,
      runId: run.id,
      taskId: actionTask.id,
      uid: 9,
    })).resolves.toEqual({ kind: "conflict" });
  });

  it.each(["scheduleCapabilityRetry", "failCapabilityExecution"] as const)(
    "rejects %s after its run is no longer running",
    async (operation) => {
      const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
      const service = createService(runtime, async () => ({}));
      const actionTask = await startCapability(service);
      const claimed = await runtime.claimTask({
        expectedTaskVersion: actionTask.taskVersion,
        leaseExpiresAt: new Date("2026-07-13T00:01:00.000Z"),
        leaseOwner: "worker-1",
        taskId: actionTask.id,
        uid: 9,
      });
      if (claimed.kind !== "success") throw new Error("action task was not claimed");
      const run = runtime.runs.find(item => item.id === actionTask.runId)!;
      await runtime.prepareCapabilityExecution({
        expectedRunLockVersion: run.lockVersion,
        expectedTaskVersion: claimed.task.taskVersion,
        executionKey: "9:1:message:2",
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
        executionKey: "9:1:message:2",
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

      const result = operation === "scheduleCapabilityRetry"
        ? await runtime.scheduleCapabilityRetry({ ...failureInput, dueAt: new Date("2026-07-13T00:00:05.000Z") })
        : await runtime.failCapabilityExecution(failureInput);

      expect(result).toEqual({ kind: "conflict" });
    },
  );

  it.each([
    { failureKind: "retryable", operation: "scheduleCapabilityRetry" },
    { failureKind: "terminal", operation: "failCapabilityExecution" },
  ] as const)("preserves already-processed from $operation", async ({ failureKind, operation }) => {
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    vi.spyOn(runtime, operation).mockResolvedValue({ kind: "already-processed" });
    const service = createService(runtime, async () => {
      throw createActionError(failureKind, "DOWNSTREAM_FAILURE");
    });
    const actionTask = await startCapability(service);

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
  executeCapability: (input: unknown) => Promise<Record<string, unknown>>,
  options: {
    capabilityBindings?: readonly WorkflowCapabilityExecutionBinding[];
    capabilityTimeoutMs?: number;
    clock?: () => Date;
    executors?: WorkflowNodeExecutorRegistry;
    inferenceTotalTimeoutMs?: number;
    maxTaskAttempts?: number;
    messageQueryExecute?: (input: WorkflowMessageQueryRequest) => Promise<unknown>;
    spec?: WorkflowExecutionSpec;
    taskLeaseDurationMs?: number;
  } = {},
) {
  const capabilityPort: WorkflowCapabilityPort = {
    execute: async (_definition, request) => executeCapability(request),
  };
  return new WorkflowRuntimeService(createControlReader(options.spec), runtime, capabilityPort, {
    capabilityMaxRetryDelayMs: 60_000,
    capabilityRetryDelayMs: 5_000,
    capabilityTimeoutMs: options.capabilityTimeoutMs ?? 15_000,
    clock: options.clock ?? (() => now),
    capabilityBindings: options.capabilityBindings ?? [TEST_MESSAGE_CAPABILITY_BINDING],
    deploymentCapabilities: createWorkflowDeploymentCapabilities([ENTRY_EVENT_CAPABILITY]),
    entitlementPort: {
      check: async () => ({ entitled: true, unentitledSince: null }),
    },
    executors: options.executors,
    inferenceTotalTimeoutMs: options.inferenceTotalTimeoutMs,
    maxTaskAttempts: options.maxTaskAttempts ?? 3,
    messageQueryPort: options.messageQueryExecute
      ? { execute: options.messageQueryExecute }
      : undefined,
    taskLeaseDurationMs: options.taskLeaseDurationMs ?? 60_000,
  });
}

const TEST_MESSAGE_CAPABILITY_BINDING: WorkflowCapabilityExecutionBinding = {
  createCommand: () => ({}),
  definition: {
    capabilityKey: "operation.test.message",
    commandSchema: Type.Record(Type.String(), Type.Unknown()),
    contractVersion: 1,
    kind: "action",
    resultSchema: Type.Record(Type.String(), Type.Unknown()),
  },
  nodeKind: "message",
};

async function startCapability(
  service: WorkflowRuntimeService,
  trigger: Record<string, unknown> = {},
) {
  const started = await service.startRun({
    entryEventId: "event-1",
    expectedRevision: 1,
    subjectId: "customer-1",
    subjectType: "chatai_contact",
    trigger,
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
  if (!("nextTask" in advanced) || !advanced.nextTask) {
    throw new Error("capability task was not created");
  }
  return advanced.nextTask;
}

function createControlReader(spec = actionSpec()) {
  return {
    applyEntitlementLoss: vi.fn(async () => ({ affectedDefinitions: 0 })),
    findDefinition: vi.fn(async () => ({
      bizStatus: 1 as const,
      publishedRevision: 1,
      runtimeStatus: "active" as const,
      statusReason: null,
      workflowType: "chatai_sop" as const,
    })),
    findRevision: vi.fn(async () => ({
      executionSpec: spec,
      revision: 1,
      subjectType: "chatai_contact" as const,
      workflowType: "chatai_sop" as const,
    })),
  };
}

const ENTRY_EVENT_CAPABILITY = {
  capabilityKey: "event.contact.friend_added",
  contractVersion: 1,
} as const;

function coreOutputSpec(): WorkflowExecutionSpec {
  return {
    edges: [
      { id: "start-end", source: "start", sourceOutletId: "default", target: "end" },
    ],
    entryNodeId: "start",
    nodes: [
      {
        config: startConfig(),
        id: "start",
        kind: "start",
        nodeSchemaVersion: 1,
        requiredCapabilities: [ENTRY_EVENT_CAPABILITY],
      },
      {
        config: {},
        id: "end",
        kind: "end",
        nodeSchemaVersion: 1,
        requiredCapabilities: [],
      },
    ],
    requiredCapabilities: [ENTRY_EVENT_CAPABILITY],
    revision: 1,
    schemaVersion: 2,
    terminalNodeId: "end",
    workflowId: "31",
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
      {
        config: startConfig(),
        id: "start",
        kind: "start",
        nodeSchemaVersion: 1,
        requiredCapabilities: [ENTRY_EVENT_CAPABILITY],
      },
      {
        config: {},
        id: "message",
        kind: "message",
        nodeSchemaVersion: 1,
        requiredCapabilities: [],
      },
      {
        config: {},
        id: "end",
        kind: "end",
        nodeSchemaVersion: 1,
        requiredCapabilities: [],
      },
    ],
    requiredCapabilities: [ENTRY_EVENT_CAPABILITY],
    revision: 1,
    schemaVersion: 2,
    terminalNodeId: "end",
    workflowId: "31",
  };
}

function messageQuerySpec(): WorkflowExecutionSpec {
  return {
    edges: [
      { id: "start-capability", source: "start", sourceOutletId: "default", target: "capability" },
      { id: "capability-end", source: "capability", sourceOutletId: "default", target: "end" },
    ],
    entryNodeId: "start",
    nodes: [
      {
        config: startConfig(),
        id: "start",
        kind: "start",
        nodeSchemaVersion: 1,
        requiredCapabilities: [ENTRY_EVENT_CAPABILITY],
      },
      {
        config: {
          limit: 10,
          take: "latest",
          timeRange: {
            end: { field: "enteredAt", kind: "current-node-lifecycle" },
            mode: "dynamic",
            start: { field: "occurredAt", kind: "workflow-trigger" },
          },
        },
        id: "capability",
        kind: "message-query",
        nodeSchemaVersion: 1,
        requiredCapabilities: [],
      },
      {
        config: {},
        id: "end",
        kind: "end",
        nodeSchemaVersion: 1,
        requiredCapabilities: [],
      },
    ],
    requiredCapabilities: [ENTRY_EVENT_CAPABILITY],
    revision: 1,
    schemaVersion: 2,
    terminalNodeId: "end",
    workflowId: "31",
  };
}

function startConfig() {
  return {
    entryPolicy: { maxEntries: 10, mode: "lifetime_limit" as const },
    seatIds: [101],
    triggers: [{ sourceIds: [], type: "contact.friend_added" as const }],
  };
}

function createActionError(
  kind: "retryable" | "terminal" | "unknown",
  code: string,
  message = "可展示的下游错误",
) {
  return new WorkflowCapabilityExecutionError(kind, code, message);
}

function readIdempotencyKey(input: unknown) {
  expect(input).toEqual(expect.objectContaining({ idempotencyKey: expect.any(String) }));
  return (input as { idempotencyKey: string }).idempotencyKey;
}
