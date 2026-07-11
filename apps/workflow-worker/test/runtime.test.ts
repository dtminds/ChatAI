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
  const subscriptionClose = vi.fn(async () => {});
  const subscription: WorkflowBrokerSubscription = { close: subscriptionClose };
  const broker = {
    close: vi.fn(async () => {}),
    publish: vi.fn(),
    subscribe: vi.fn(async () => subscription),
  } satisfies WorkflowBroker;
  const database = {
    destroy: vi.fn(async () => {}),
  };
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
      pingDatabase: vi.fn(async () => {}),
      runtimeService: { executeTask: vi.fn(), startRun: vi.fn() },
      taskConsumer: vi.fn(async input => input.broker.subscribe({
        handler: async () => {},
        subscription: input.subscription,
        topic: input.topic,
        type: "Shared",
      })),
      triggerBindingReader: { listActiveTriggerBindings: vi.fn(async () => []) },
      workerId: "worker-1",
    },
    subscriptionClose,
  };
}

function config() {
  return {
    broker: "fake" as const,
    databaseUrl: "mysql://localhost/workflow",
    deadLetterTopics: { entry: "entry-dlq", task: "task-dlq" },
    environment: "dev" as const,
    healthPort: 3002,
    logLevel: "info",
    maxRedeliverCount: 5,
    pulsar: { serviceUrl: null, token: null },
    roles: new Set(["entry-consumer", "task-consumer"] as const),
    subscriptionType: "Shared" as const,
    subscriptions: { entry: "entry-sub", task: "task-sub" },
    topics: { entry: "entry-topic", task: "task-topic" },
  };
}
