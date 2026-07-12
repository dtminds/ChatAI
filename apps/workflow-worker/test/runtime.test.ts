import { describe, expect, it, vi } from "vitest";
import type { WorkflowBroker, WorkflowBrokerSubscription } from "../src/broker/types.js";
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

  it("updates readiness when a consumer or dependency becomes unavailable", async () => {
    const resources = createResources();
    const runtime = await startWorkflowWorkerRuntime({
      ...resources.dependencies,
      config: config(),
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
    loopClose,
    outboxPublisher,
    reconciler,
    get brokerReady() { return brokerReady; },
    set brokerReady(value: boolean) { brokerReady = value; },
    get databaseReady() { return databaseReady; },
    set databaseReady(value: boolean) { databaseReady = value; },
    runReadinessProbe: async () => {
      if (!readinessProbe) throw new Error("readiness probe not started");
      return readinessProbe();
    },
    scheduler,
    subscriptionClose,
    get subscriptionConnected() { return subscriptionConnected; },
    set subscriptionConnected(value: boolean) { subscriptionConnected = value; },
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
      batchSize: 100,
      dispatchTimeoutMs: 300_000,
      inboxCleanupBatchSize: 1_000,
      leaseDurationMs: 60_000,
      maxOutboxAttempts: 100,
      maxOutboxRetryDelayMs: 300_000,
      maxTaskAttempts: 5,
      outboxIntervalMs: 1_000,
      reconcileIntervalMs: 30_000,
      readinessIntervalMs: 30_000,
      retryDelayMs: 5_000,
      schedulerIntervalMs: 1_000,
      shardIds: Array.from({ length: 256 }, (_, index) => index),
    },
    subscriptionType: "Shared" as const,
    subscriptions: { entry: "entry-sub", task: "task-sub" },
    topics: { entry: "entry-topic", task: "task-topic" },
  };
}
