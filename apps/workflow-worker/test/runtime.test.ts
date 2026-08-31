import { describe, expect, it, vi } from "vitest";
import pino from "pino";
import type { WorkflowBroker, WorkflowBrokerSubscription } from "../src/broker/types.js";
import type { WorkflowWorkerConfig } from "../src/config.js";
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
    }));
    expect(resources.dependencies.entryConsumer).toHaveBeenCalledWith(expect.objectContaining({
      subscriptionReader: resources.dependencies.eventSubscriptionReader,
      inboxRepository: resources.dependencies.inboxRepository,
      logger: resources.dependencies.logger,
    }));
    expect(resources.broker.subscribe).toHaveBeenCalledWith(expect.objectContaining({
      subscription: "task-sub",
      topic: "task-topic",
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

  it("flushes runtime state before destroying the database", async () => {
    const resources = createResources();
    const closeOrder: string[] = [];
    const runtimeState = {
      close: vi.fn(async () => { closeOrder.push("runtime-state"); }),
      markConsumer: vi.fn(),
      markFailed: vi.fn(),
      markStarted: vi.fn(),
      markSucceeded: vi.fn(),
    };
    resources.database.destroy.mockImplementation(async () => {
      closeOrder.push("database");
    });

    const runtime = await startWorkflowWorkerRuntime({
      ...resources.dependencies,
      config: config(),
      database: resources.database,
      runtimeState,
    });

    await runtime.close();

    expect(closeOrder).toEqual(["runtime-state", "database"]);
  });

  it("does not require inference dependencies when the inference role is disabled", async () => {
    const resources = createResources();
    const runtime = await startWorkflowWorkerRuntime({
      ...resources.dependencies,
      config: config(),
      inferenceAdapter: undefined,
      llmTestAdapter: undefined,
      llmTestAttemptRepository: undefined,
      llmTestAttemptWorker: undefined,
    });

    expect(runtime.getReadiness().roles).toEqual({
      "entry-consumer": true,
      "task-consumer": true,
    });
    await runtime.close();
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
      roles: new Set(["inference", "scheduler", "outbox", "reconciler"] as const),
    };
    const runtime = await startWorkflowWorkerRuntime({
      ...resources.dependencies,
      config: backgroundConfig,
    });

    await vi.waitFor(() => {
      expect(runtime.getReadiness().roles).toEqual({
        inference: true,
        outbox: true,
        reconciler: true,
        scheduler: true,
      });
    });
    expect(resources.inferenceWorker).toHaveBeenCalledWith(expect.objectContaining({
      adapter: resources.dependencies.inferenceAdapter,
      limit: 10,
      repository: resources.dependencies.inferenceRepository,
    }));
    expect(resources.scheduler).toHaveBeenCalled();
    expect(resources.outboxPublisher).toHaveBeenCalledWith(expect.objectContaining({
      limit: 100,
      publishConcurrency: 8,
    }));
    expect(resources.reconciler).toHaveBeenCalled();
    expect(resources.entitlementReconciler).toHaveBeenCalled();

    await runtime.close();
    expect(resources.loopClose).toHaveBeenCalledTimes(6);
  });

  it("runs LLM test Attempts in real mode", async () => {
    const resources = createResources();
    const llmTestAttemptWorker = vi.fn(async () => ({
      claimed: 0,
      failed: 0,
      succeeded: 0,
      timedOut: 0,
    }));
    const runtime = await startWorkflowWorkerRuntime({
      ...resources.dependencies,
      config: { ...config(new Set(["inference"] as const)) },
      llmTestAdapter: { execute: vi.fn() },
      llmTestAttemptRepository: {} as never,
      llmTestAttemptWorker,
    });

    await vi.waitFor(() => expect(llmTestAttemptWorker).toHaveBeenCalledTimes(1));
    expect(llmTestAttemptWorker).toHaveBeenCalledWith(expect.objectContaining({
      leaseOwner: "worker-1",
      limit: 10,
    }));
    await runtime.close();

  });

  it("feeds consistency cursors into the next reconciler iteration and resets after the last page", async () => {
    const resources = createResources();
    resources.reconciler
      .mockResolvedValueOnce(reconcilerResult({
        nextCapacityCursor: 9,
        nextEventSubscriptionCursor: "15",
        nextConsistencyRunCursor: "10",
        nextConsistencyTaskCursor: null,
        nextCursor: "5",
      }))
      .mockResolvedValueOnce(reconcilerResult({
        nextCapacityCursor: null,
        nextEventSubscriptionCursor: null,
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
      afterCapacityUid: undefined,
      afterEventSubscriptionId: undefined,
      afterConsistencyRunId: undefined,
      afterConsistencyTaskId: undefined,
      afterRunId: undefined,
    }));
    expect(resources.reconciler).toHaveBeenNthCalledWith(2, expect.objectContaining({
      afterCapacityUid: 9,
      afterEventSubscriptionId: "15",
      afterConsistencyRunId: "10",
      afterConsistencyTaskId: undefined,
      afterRunId: "5",
    }));
    expect(resources.reconciler).toHaveBeenNthCalledWith(3, expect.objectContaining({
      afterCapacityUid: undefined,
      afterEventSubscriptionId: undefined,
      afterConsistencyRunId: undefined,
      afterConsistencyTaskId: "20",
      afterRunId: undefined,
    }));
    expect(resources.reconciler).toHaveBeenNthCalledWith(4, expect.objectContaining({
      afterCapacityUid: undefined,
      afterEventSubscriptionId: undefined,
      afterConsistencyRunId: undefined,
      afterConsistencyTaskId: undefined,
      afterRunId: undefined,
    }));
    await runtime.close();
  });

  it("advances entitlement cursors in an independent reconciler loop", async () => {
    const resources = createResources();
    resources.entitlementReconciler
      .mockResolvedValueOnce({
        checksUnavailable: 0,
        hasMore: true,
        lastUid: 108,
        tenantsChecked: 100,
        workflowsDeactivated: 0,
      })
      .mockResolvedValueOnce({
        checksUnavailable: 0,
        hasMore: false,
        lastUid: 109,
        tenantsChecked: 1,
        workflowsDeactivated: 0,
      })
      .mockResolvedValue({
        checksUnavailable: 0,
        hasMore: false,
        lastUid: null,
        tenantsChecked: 0,
        workflowsDeactivated: 0,
      });
    const runtime = await startWorkflowWorkerRuntime({
      ...resources.dependencies,
      config: config(new Set(["reconciler"] as const)),
    });
    await vi.waitFor(() => expect(resources.entitlementReconciler).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(resources.dependencies.logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "workflow.worker.role.idle",
        role: "entitlement-reconciler",
      }),
      "workflow worker role idle",
    ));

    await resources.runRole("entitlement-reconciler");
    await resources.runRole("entitlement-reconciler");

    expect(resources.entitlementReconciler).toHaveBeenNthCalledWith(1, {
      afterUid: undefined,
      limit: 100,
    });
    expect(resources.entitlementReconciler).toHaveBeenNthCalledWith(2, {
      afterUid: 108,
      limit: 100,
    });
    expect(resources.entitlementReconciler).toHaveBeenNthCalledWith(3, {
      afterUid: undefined,
      limit: 100,
    });
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

  it.each<{
    roles: WorkflowWorkerConfig["roles"];
    topics: string[];
  }>([
    {
      roles: new Set(["entry-consumer"]),
      topics: ["entry-topic", "entry-dlq"],
    },
    {
      roles: new Set(["task-consumer"]),
      topics: ["task-topic", "task-dlq"],
    },
    {
      roles: new Set(["outbox"]),
      topics: ["task-topic"],
    },
    {
      roles: new Set(["task-consumer", "outbox"]),
      topics: ["task-topic", "task-dlq"],
    },
  ])("checks only the source and dead-letter topics used by $roles", async ({ roles, topics }) => {
    const resources = createResources();
    const runtime = await startWorkflowWorkerRuntime({
      ...resources.dependencies,
      config: config(roles),
    });

    await resources.runReadinessProbe();

    expect(resources.broker.checkHealth).toHaveBeenLastCalledWith(topics);
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
      workerId: "worker-1",
    })).rejects.toThrow("health port busy");

    expect(runtimeClose).toHaveBeenCalledTimes(1);
  });

  it("logs stable worker identity metadata on startup", async () => {
    const logger = { info: vi.fn() };
    const worker = await startWorkflowWorker({
      config: config(),
      logger,
      startHealth: vi.fn(async () => ({ close: vi.fn(async () => {}) })),
      startRuntime: vi.fn(async () => ({
        close: vi.fn(async () => {}),
        getReadiness: () => ({ broker: true, database: true, roles: {} }),
      })),
      workerId: "worker-1",
    });

    expect(logger.info).toHaveBeenCalledWith({
      deadLetterTopics: { entry: "entry-dlq", task: "task-dlq" },
      event: "workflow.worker.started",
      roles: ["entry-consumer", "task-consumer"],
      subscriptions: { entry: "entry-sub", task: "task-sub" },
      topics: { entry: "entry-topic", task: "task-topic" },
      workerId: "worker-1",
    }, "workflow worker started");
    await worker.close();
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
  const scheduler = vi.fn(async () => ({ cancelled: 0, dispatched: 0, suspended: 0 }));
  const inferenceWorker = vi.fn(async () => ({ claimed: 0, failed: 0, retried: 0, succeeded: 0 }));
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
  const entitlementReconciler = vi.fn(async () => ({
    checksUnavailable: 0,
    hasMore: false,
    lastUid: null,
    tenantsChecked: 0,
    workflowsDeactivated: 0,
  }));
  return {
    broker,
    database,
    dependencies: {
      broker,
      database,
      entryConsumer: vi.fn(async input => input.broker.subscribe({
        handler: async () => {},
        maxInFlight: input.maxInFlight,
        subscription: input.subscription,
        topic: input.topic,
      })),
      conversationDirectivePort: { addOrUpdate: vi.fn(), disable: vi.fn() },
      conversationDirectiveRepository: {} as never,
      conversationDirectiveWorker: vi.fn(async () => ({ claimed: 0, disabled: 0, retried: 0 })),
      eventSubscriptionReader: { listMatchingEventSubscriptions: vi.fn(async () => []) },
      inboxRepository: {
        hasProcessedInboxMessage: vi.fn(async () => false),
        recordProcessedInboxMessage: vi.fn(async () => true),
      },
      inferenceAdapter: { execute: vi.fn() },
      inferenceRepository: {} as never,
      inferenceWorker,
      llmTestAdapter: { execute: vi.fn() },
      llmTestAttemptRepository: {} as never,
      llmTestAttemptWorker: vi.fn(async () => ({
        claimed: 0,
        failed: 0,
        succeeded: 0,
        timedOut: 0,
      })),
      messageReader: { findById: vi.fn(async () => null) },
      pingDatabase: vi.fn(async () => {
        if (!databaseReady) throw new Error("database unavailable");
      }),
      logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      outboxPublisher,
      outboxRepository: {} as never,
      reconciler,
      reconcilerService: {
        deactivateUnentitledWorkflows: entitlementReconciler,
      } as never,
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
      runtimeService: {
        executeTask: vi.fn(),
        recordAiCollectDirectiveEvent: vi.fn(),
        recordWaitEvent: vi.fn(),
        startRun: vi.fn(),
      },
      scheduler,
      schedulerRepository: {} as never,
      taskConsumer: vi.fn(async input => input.broker.subscribe({
        handler: async () => {},
        maxInFlight: input.maxInFlight,
        subscription: input.subscription,
        topic: input.topic,
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
    inferenceWorker,
    outboxPublisher,
    reconciler,
    entitlementReconciler,
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
  nextCapacityCursor?: number | null;
  nextEventSubscriptionCursor?: string | null;
  nextConsistencyRunCursor?: string | null;
  nextConsistencyTaskCursor?: string | null;
  nextCursor?: string | null;
} = {}) {
  return {
    cancelled: 0,
    capacityCountsChecked: 0,
    capacityCountsCorrected: 0,
    historyCleanupHasMore: false,
    inboxDeleted: 0,
    inconsistentRunsFailed: 0,
    eventSubscriptionsCancelled: 0,
    eventSubscriptionsChecked: 0,
    nextConsistencyRunCursor: null,
    nextConsistencyTaskCursor: null,
    nextCapacityCursor: null,
    nextCursor: null,
    nextEventSubscriptionCursor: null,
    nodeMetricEventsAggregated: 0,
    nodeMetricEventsDeleted: 0,
    outboxLeasesRecovered: 0,
    runsChecked: 0,
    staleTasksCancelled: 0,
    stalledTasksRepublished: 0,
    taskLeasesDead: 0,
    taskLeasesRecovered: 0,
    taskStatusesReconciled: 0,
    tasksChecked: 0,
    terminalRunTasksCancelled: 0,
    ...overrides,
  };
}

function config(
  roles: WorkflowWorkerConfig["roles"] = new Set(["entry-consumer", "task-consumer"]),
) {
  return {
    consumerConcurrency: { entry: 10, task: 10 },
    databaseUrl: "mysql://localhost/workflow",
    deadLetterTopics: { entry: "entry-dlq", task: "task-dlq" },
    entitlement: { apiUrl: null, mode: "enforce" as const, token: null },
    healthPort: 3002,
    logLevel: "info",
    maxRedeliverCount: 5,
    pulsar: { serviceUrl: null, token: null },
    roles,
    runtime: {
      capabilityMaxRetryDelayMs: 300_000,
      capabilityRetryDelayMs: 5_000,
      capabilityTimeoutMs: 15_000,
      batchSize: 100,
      dispatchTimeoutMs: 300_000,
      historyCleanupBatchSize: 1_000,
      historyCleanupIntervalMs: 3_600_000,
      inferenceConcurrency: 10,
      inferenceHeartbeatIntervalMs: 15_000,
      inferenceIntervalMs: 1_000,
      inferenceLeaseDurationMs: 60_000,
      inferenceMaxAttempts: 5,
      inferenceMaxRetryDelayMs: 300_000,
      inferenceRetryDelayMs: 5_000,
      inferenceTotalTimeoutMs: 600_000,
      inboxCleanupBatchSize: 1_000,
      leaseDurationMs: 60_000,
      maxOutboxAttempts: 100,
      maxOutboxRetryDelayMs: 300_000,
      maxTaskAttempts: 5,
      outboxPublishConcurrency: 8,
      outboxIntervalMs: 1_000,
      reconcileIntervalMs: 30_000,
      readinessIntervalMs: 30_000,
      retryDelayMs: 5_000,
      runRetentionDays: 180,
      schedulerIntervalMs: 1_000,
      taskOutboxRetentionDays: 30,
    },
    subscriptions: { entry: "entry-sub", task: "task-sub" },
    topics: { entry: "entry-topic", task: "task-topic" },
  };
}
