import { describe, expect, it, vi } from "vitest";
import pino from "pino";
import type { WorkflowBroker, WorkflowBrokerSubscription } from "../src/broker/types.js";
import type { startRoleLoop } from "../src/role-loop.js";
import { startWorkflowWorker, startWorkflowWorkerRuntime } from "../src/runtime.js";

describe("workflow worker runtime", () => {
  it("starts independent entry and task subscriptions and closes every resource", async () => {
    const resources = createResources();
    const runtime = await startWorkflowWorkerRuntime({
      ...resources.dependencies,
      config: config(),
    });

    expect(resources.broker.subscribe).toHaveBeenCalledWith(expect.objectContaining({
      subscription: "entry-sub",
      topic: "entry-topic",
      type: "Shared",
    }));
    expect(resources.broker.subscribe).toHaveBeenCalledWith(expect.objectContaining({
      subscription: "task-sub",
      topic: "task-topic",
      type: "Shared",
    }));
    expect(runtime.getReadiness()).toMatchObject({
      broker: true,
      database: true,
      roles: { "entry-consumer": true, "task-consumer": true },
    });

    await runtime.close();

    expect(resources.subscriptionClose).toHaveBeenCalledTimes(2);
    expect(resources.broker.close).toHaveBeenCalledTimes(1);
    expect(resources.database.destroy).toHaveBeenCalledTimes(1);
  });

  it("cleans up initialized resources when startup fails", async () => {
    const resources = createResources();
    resources.broker.subscribe
      .mockResolvedValueOnce({ close: resources.subscriptionClose })
      .mockRejectedValueOnce(new Error("task subscription failed"));

    await expect(startWorkflowWorkerRuntime({
      ...resources.dependencies,
      config: config(),
    })).rejects.toThrow("task subscription failed");

    expect(resources.subscriptionClose).toHaveBeenCalledTimes(1);
    expect(resources.broker.close).toHaveBeenCalledTimes(1);
    expect(resources.database.destroy).toHaveBeenCalledTimes(1);
  });

  it("starts selected background roles and closes every loop", async () => {
    const resources = createResources();
    const backgroundConfig = {
      ...config(),
      roles: new Set(["scheduler", "outbox", "reconciler"] as const),
    };
    const runtime = await startWorkflowWorkerRuntime({
      ...resources.dependencies,
      config: backgroundConfig,
    });

    await vi.waitFor(() => {
      expect(runtime.getReadiness().roles).toEqual({
        outbox: true,
        reconciler: true,
        scheduler: true,
      });
    });
    expect(resources.scheduler).toHaveBeenCalled();
    expect(resources.outboxPublisher).toHaveBeenCalled();
    expect(resources.reconciler).toHaveBeenCalled();

    await runtime.close();
    expect(resources.loopClose).toHaveBeenCalledTimes(4);
  });

  it("feeds consistency cursors into the next reconciler iteration and resets after the last page", async () => {
    const resources = createResources();
    resources.reconciler
      .mockResolvedValueOnce(reconcilerResult({
        nextConsistencyRunCursor: "10",
        nextConsistencyTaskCursor: null,
        nextCursor: "5",
      }))
      .mockResolvedValueOnce(reconcilerResult({
        nextConsistencyRunCursor: null,
        nextConsistencyTaskCursor: "20",
        nextCursor: null,
      }))
      .mockResolvedValueOnce(reconcilerResult({
        nextConsistencyRunCursor: null,
        nextConsistencyTaskCursor: null,
        nextCursor: null,
      }))
      .mockResolvedValueOnce(reconcilerResult());
    const runtime = await startWorkflowWorkerRuntime({
      ...resources.dependencies,
      config: config(new Set(["reconciler"] as const)),
    });
    await vi.waitFor(() => expect(resources.reconciler).toHaveBeenCalledTimes(1));

    await resources.runRole("reconciler");
    await resources.runRole("reconciler");
    await resources.runRole("reconciler");

    expect(resources.reconciler).toHaveBeenNthCalledWith(1, expect.objectContaining({
      afterConsistencyRunId: undefined,
      afterConsistencyTaskId: undefined,
      afterRunId: undefined,
    }));
    expect(resources.reconciler).toHaveBeenNthCalledWith(2, expect.objectContaining({
      afterConsistencyRunId: "10",
      afterConsistencyTaskId: undefined,
      afterRunId: "5",
    }));
    expect(resources.reconciler).toHaveBeenNthCalledWith(3, expect.objectContaining({
      afterConsistencyRunId: undefined,
      afterConsistencyTaskId: "20",
      afterRunId: undefined,
    }));
    expect(resources.reconciler).toHaveBeenNthCalledWith(4, expect.objectContaining({
      afterConsistencyRunId: undefined,
      afterConsistencyTaskId: undefined,
      afterRunId: undefined,
    }));
    await runtime.close();
  });

  it("runs history cleanup on its own low-frequency schedule", async () => {
    let now = new Date("2026-07-13T00:00:00.000Z");
    const resources = createResources();
    const runtime = await startWorkflowWorkerRuntime({
      ...resources.dependencies,
      config: config(new Set(["reconciler"] as const)),
      now: () => now,
    });
    await vi.waitFor(() => expect(resources.reconciler).toHaveBeenCalledTimes(1));

    now = new Date("2026-07-13T00:00:30.000Z");
    await resources.runRole("reconciler");
    now = new Date("2026-07-13T01:00:00.000Z");
    await resources.runRole("reconciler");

    expect(resources.reconciler).toHaveBeenNthCalledWith(1, expect.objectContaining({
      historyRetention: {
        runBefore: new Date("2026-01-14T00:00:00.000Z"),
        taskOutboxBefore: new Date("2026-06-13T00:00:00.000Z"),
      },
      now: new Date("2026-07-13T00:00:00.000Z"),
    }));
    expect(resources.reconciler).toHaveBeenNthCalledWith(2, expect.not.objectContaining({
      historyRetention: expect.anything(),
    }));
    expect(resources.reconciler).toHaveBeenNthCalledWith(3, expect.objectContaining({
      historyRetention: {
        runBefore: new Date("2026-01-14T01:00:00.000Z"),
        taskOutboxBefore: new Date("2026-06-13T01:00:00.000Z"),
      },
      now: new Date("2026-07-13T01:00:00.000Z"),
    }));
    await runtime.close();
  });

  it("catches up history cleanup on the reconciler interval while a backlog remains", async () => {
    let now = new Date("2026-07-13T00:00:00.000Z");
    const resources = createResources();
    resources.reconciler
      .mockResolvedValueOnce(reconcilerResult({ historyCleanupHasMore: true }))
      .mockResolvedValueOnce(reconcilerResult({ historyCleanupHasMore: false }))
      .mockResolvedValue(reconcilerResult());
    const runtime = await startWorkflowWorkerRuntime({
      ...resources.dependencies,
      config: config(new Set(["reconciler"] as const)),
      now: () => now,
    });
    await vi.waitFor(() => expect(resources.reconciler).toHaveBeenCalledTimes(1));

    now = new Date("2026-07-13T00:00:30.000Z");
    await resources.runRole("reconciler");
    now = new Date("2026-07-13T01:00:00.000Z");
    await resources.runRole("reconciler");
    now = new Date("2026-07-13T01:00:30.000Z");
    await resources.runRole("reconciler");

    expect(resources.reconciler).toHaveBeenNthCalledWith(1, expect.objectContaining({
      historyRetention: expect.any(Object),
    }));
    expect(resources.reconciler).toHaveBeenNthCalledWith(2, expect.objectContaining({
      historyRetention: expect.any(Object),
    }));
    expect(resources.reconciler).toHaveBeenNthCalledWith(3, expect.not.objectContaining({
      historyRetention: expect.anything(),
    }));
    expect(resources.reconciler).toHaveBeenNthCalledWith(4, expect.objectContaining({
      historyRetention: expect.any(Object),
    }));
    await runtime.close();
  });

  it("routes idle role heartbeats through the debug log policy", async () => {
    const resources = createResources();
    const runtime = await startWorkflowWorkerRuntime({
      ...resources.dependencies,
      config: config(new Set(["scheduler"] as const)),
    });

    await vi.waitFor(() => {
      expect(resources.dependencies.logger.debug).toHaveBeenCalledWith(expect.objectContaining({
        event: "workflow.worker.role.idle",
        role: "scheduler",
      }), "workflow worker role idle");
    });
    expect(resources.dependencies.logger.info).not.toHaveBeenCalledWith(expect.objectContaining({
      event: "workflow.worker.role.completed",
      role: "scheduler",
    }), expect.any(String));
    await runtime.close();
  });

  it("keeps role failure details in structured Pino logs", async () => {
    const resources = createResources();
    const records: Array<Record<string, unknown>> = [];
    const logger = pino({ base: null, timestamp: false }, {
      write(message) {
        records.push(JSON.parse(message) as Record<string, unknown>);
      },
    });
    const runtime = await startWorkflowWorkerRuntime({
      ...resources.dependencies,
      config: config(new Set(["scheduler"] as const)),
      logger,
    });
    const failure = new Error("scheduler unavailable");

    resources.failRole("scheduler", failure);

    expect(records).toContainEqual(expect.objectContaining({
      err: expect.objectContaining({
        message: "scheduler unavailable",
        stack: expect.any(String),
        type: "Error",
      }),
      event: "workflow.worker.role.failed",
      role: "scheduler",
    }));
    await runtime.close();
  });

  it("wires readiness probe failures to the structured error field", async () => {
    const resources = createResources();
    const runtime = await startWorkflowWorkerRuntime({
      ...resources.dependencies,
      config: config(),
    });
    const failure = new Error("readiness unavailable");

    resources.failRole("readiness", failure);

    expect(resources.dependencies.logger.error).toHaveBeenCalledWith({
      err: failure,
      event: "workflow.worker.readiness.failed",
      role: "readiness",
    }, "workflow worker readiness probe failed");
    await runtime.close();
  });

  it("updates readiness when a consumer or dependency becomes unavailable", async () => {
    const resources = createResources();
    const runtime = await startWorkflowWorkerRuntime({
      ...resources.dependencies,
      config: config(),
    });

    await vi.waitFor(() => {
      expect(resources.dependencies.logger.info).toHaveBeenCalledWith(expect.objectContaining({
        event: "workflow.worker.readiness.changed",
        status: "ready",
      }), "workflow worker readiness became ready");
    });

    resources.subscriptionConnected = false;
    resources.brokerReady = false;
    resources.databaseReady = false;
    await resources.runReadinessProbe();

    expect(runtime.getReadiness()).toEqual({
      broker: false,
      database: false,
      roles: { "entry-consumer": false, "task-consumer": false },
    });
    expect(resources.dependencies.logger.warn).toHaveBeenCalledWith(expect.objectContaining({
      broker: false,
      database: false,
      event: "workflow.worker.readiness.changed",
      status: "not-ready",
    }), "workflow worker readiness degraded");
    await runtime.close();
  });

  it("checks only the topics used by the enabled roles", async () => {
    const resources = createResources();
    const runtime = await startWorkflowWorkerRuntime({
      ...resources.dependencies,
      config: config(new Set(["entry-consumer"] as const)),
    });

    await resources.runReadinessProbe();

    expect(resources.broker.checkHealth).toHaveBeenLastCalledWith(["entry-topic"]);
    await runtime.close();
  });

  it("closes runtime resources when the health server cannot start", async () => {
    const runtimeClose = vi.fn(async () => {});

    await expect(startWorkflowWorker({
      config: config(),
      logger: { info: vi.fn() },
      startHealth: vi.fn(async () => { throw new Error("health port busy"); }),
      startRuntime: vi.fn(async () => ({
        close: runtimeClose,
        getReadiness: () => ({ broker: true, database: true, roles: {} }),
      })),
    })).rejects.toThrow("health port busy");

    expect(runtimeClose).toHaveBeenCalledTimes(1);
  });

});

function createResources() {
  let brokerReady = true;
  let databaseReady = true;
  let subscriptionConnected = true;
  let readinessProbe: (() => Promise<unknown>) | undefined;
  const roleInputs = new Map<string, Parameters<typeof startRoleLoop>[0]>();
  const subscriptionClose = vi.fn(async () => {});
  const subscription: WorkflowBrokerSubscription = {
    close: subscriptionClose,
    isConnected: () => subscriptionConnected,
  };
  const broker = {
    checkHealth: vi.fn(async () => {
      if (!brokerReady) throw new Error("broker unavailable");
    }),
    close: vi.fn(async () => {}),
    publish: vi.fn(),
    subscribe: vi.fn(async () => subscription),
  } satisfies WorkflowBroker;
  const database = {
    destroy: vi.fn(async () => {}),
  };
  const loopClose = vi.fn(async () => {});
  const scheduler = vi.fn(async () => ({ cancelled: 0, deferred: 0, dispatched: 0 }));
  const outboxPublisher = vi.fn(async () => ({ claimed: 0, failed: 0, sent: 0 }));
  const reconciler = vi.fn(async () => ({
    cancelled: 0,
    inboxDeleted: 0,
    nextCursor: null,
    stalledTasksRepublished: 0,
    outboxLeasesRecovered: 0,
    taskLeasesDead: 0,
    taskLeasesRecovered: 0,
  }));
  return {
    broker,
    database,
    dependencies: {
      broker,
      database,
      entryConsumer: vi.fn(async input => input.broker.subscribe({
        handler: async () => {},
        subscription: input.subscription,
        topic: input.topic,
        type: "Shared",
      })),
      pingDatabase: vi.fn(async () => {
        if (!databaseReady) throw new Error("database unavailable");
      }),
      logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      outboxPublisher,
      outboxRepository: {} as never,
      reconciler,
      reconcilerService: {} as never,
      roleLoop: vi.fn(input => {
        roleInputs.set(input.role, input);
        if (input.role === "readiness") readinessProbe = input.run;
        void input.run().then(result => input.onHeartbeat?.({
          completedAt: new Date(),
          durationMs: 1,
          result,
        }));
        return { close: loopClose };
      }),
      runtimeService: { executeTask: vi.fn(), startRun: vi.fn() },
      scheduler,
      schedulerRepository: {} as never,
      taskConsumer: vi.fn(async input => input.broker.subscribe({
        handler: async () => {},
        subscription: input.subscription,
        topic: input.topic,
        type: "Shared",
      })),
      triggerBindingReader: { listActiveTriggerBindings: vi.fn(async () => []) },
      workerId: "worker-1",
    },
    failRole: (role: string, error: unknown) => {
      const input = roleInputs.get(role);
      if (!input) throw new Error(`Role loop not started: ${role}`);
      input.onError?.(error);
    },
    loopClose,
    outboxPublisher,
    reconciler,
    get brokerReady() { return brokerReady; },
    set brokerReady(value: boolean) { brokerReady = value; },
    get databaseReady() { return databaseReady; },
    set databaseReady(value: boolean) { databaseReady = value; },
    runReadinessProbe: async () => {
      if (!readinessProbe) throw new Error("readiness probe not started");
      const result = await readinessProbe();
      roleInputs.get("readiness")?.onHeartbeat?.({
        completedAt: new Date(),
        durationMs: 1,
        result,
      });
      return result;
    },
    runRole: async (role: string) => {
      const input = roleInputs.get(role);
      if (!input) throw new Error(`Role loop not started: ${role}`);
      return input.run();
    },
    scheduler,
    subscriptionClose,
    get subscriptionConnected() { return subscriptionConnected; },
    set subscriptionConnected(value: boolean) { subscriptionConnected = value; },
  };
}

function reconcilerResult(overrides: {
  historyCleanupHasMore?: boolean;
  nextConsistencyRunCursor?: string | null;
  nextConsistencyTaskCursor?: string | null;
  nextCursor?: string | null;
} = {}) {
  return {
    cancelled: 0,
    historyCleanupHasMore: false,
    inboxDeleted: 0,
    inconsistentRunsFailed: 0,
    nextConsistencyRunCursor: null,
    nextConsistencyTaskCursor: null,
    nextCursor: null,
    nodeMetricEventsAggregated: 0,
    nodeMetricEventsDeleted: 0,
    outboxLeasesRecovered: 0,
    runsChecked: 0,
    staleTasksCancelled: 0,
    stalledTasksRepublished: 0,
    taskLeasesDead: 0,
    taskLeasesRecovered: 0,
    tasksChecked: 0,
    terminalRunTasksCancelled: 0,
    ...overrides,
  };
}

function config(roles = new Set(["entry-consumer", "task-consumer"] as const)) {
  return {
    broker: "fake" as const,
    databaseUrl: "mysql://localhost/workflow",
    deadLetterTopics: { entry: "entry-dlq", task: "task-dlq" },
    environment: "dev" as const,
    healthPort: 3002,
    logLevel: "info",
    maxRedeliverCount: 5,
    pulsar: { serviceUrl: null, token: null },
    roles,
    runtime: {
      actionMaxRetryDelayMs: 300_000,
      actionRetryDelayMs: 5_000,
      actionTimeoutMs: 15_000,
      batchSize: 100,
      dispatchTimeoutMs: 300_000,
      historyCleanupBatchSize: 1_000,
      historyCleanupIntervalMs: 3_600_000,
      inboxCleanupBatchSize: 1_000,
      leaseDurationMs: 60_000,
      maxOutboxAttempts: 100,
      maxOutboxRetryDelayMs: 300_000,
      maxTaskAttempts: 5,
      outboxIntervalMs: 1_000,
      reconcileIntervalMs: 30_000,
      readinessIntervalMs: 30_000,
      retryDelayMs: 5_000,
      runRetentionDays: 180,
      schedulerIntervalMs: 1_000,
      shardIds: Array.from({ length: 256 }, (_, index) => index),
      taskOutboxRetentionDays: 30,
    },
    subscriptionType: "Shared" as const,
    subscriptions: { entry: "entry-sub", task: "task-sub" },
    topics: { entry: "entry-topic", task: "task-topic" },
  };
}
