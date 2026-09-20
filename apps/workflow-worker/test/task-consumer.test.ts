import type { WorkflowTaskMessage } from "@chatai/contracts";
import { WorkflowRuntimeError } from "@chatai/workflow-runtime";
import { describe, expect, it, vi } from "vitest";
import {
  createTaskConsumerHandler,
  startTaskConsumer,
} from "../src/task-consumer.js";
import type {
  WorkflowBroker,
  WorkflowBrokerSubscribeInput,
} from "../src/broker/types.js";
import { createBrokerMessage } from "./helpers/broker-message.js";

describe("workflow task consumer", () => {
  it("waits for capacity without touching MySQL or acknowledging the message", async () => {
    vi.useFakeTimers();
    try {
      const now = new Date("2026-09-19T00:00:00.000Z");
      const lease = { leaseId: "9|7|3", token: "lease-token" };
      let attempts = 0;
      const taskCapacityPort = {
        acquire: vi.fn(async () => {
          attempts += 1;
          return attempts === 1
            ? {
                kind: "deferred" as const,
                reasonCode: "WORKFLOW_TASK_TENANT_CAPACITY_LIMITED" as const,
                retryAt: new Date(Date.now() + 250),
              }
            : { kind: "allowed" as const, lease };
        }),
        availability: vi.fn(async () => ({ available: 1, kind: "available" as const })),
        release: vi.fn(async () => {}),
        releaseReservation: vi.fn(async () => {}),
        renew: vi.fn(async () => {}),
        reserve: vi.fn(),
      };
      const executeTask = vi.fn(async () => undefined);
      const message = createBrokerMessage(taskMessage());
      const handler = createTaskConsumerHandler({
        capacityLeaseDurationMs: 60_000,
        now: () => now,
        runtimeService: { executeTask },
        taskCapacityPort,
        workerId: "worker-1",
      });

      const execution = handler(message);
      expect(taskCapacityPort.acquire).toHaveBeenCalledTimes(1);
      expect(executeTask).not.toHaveBeenCalled();
      expect(message.ack).not.toHaveBeenCalled();
      expect(message.negativeAck).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(250);
      await execution;

      expect(executeTask).toHaveBeenCalledWith(expect.objectContaining({
        capacityLease: lease,
        capacityLeaseDurationMs: 60_000,
      }));
      expect(message.ack).toHaveBeenCalledTimes(1);
      expect(message.negativeAck).not.toHaveBeenCalled();
      expect(taskCapacityPort.release).toHaveBeenCalledWith({ lease, uid: 9 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops waiting without ACK or NACK when the consumer is closed", async () => {
    const capacityWaitController = new AbortController();
    const taskCapacityPort = {
      acquire: vi.fn(async () => ({
        kind: "deferred" as const,
        reasonCode: "WORKFLOW_TASK_CAPACITY_UNAVAILABLE" as const,
        retryAt: new Date(Date.now() + 30_000),
      })),
      availability: vi.fn(async () => ({ kind: "unavailable" as const })),
      release: vi.fn(async () => {}),
      releaseReservation: vi.fn(async () => {}),
      renew: vi.fn(async () => {}),
      reserve: vi.fn(),
    };
    const executeTask = vi.fn(async () => undefined);
    const message = createBrokerMessage(taskMessage());
    const handler = createTaskConsumerHandler({
      capacityWaitSignal: capacityWaitController.signal,
      runtimeService: { executeTask },
      taskCapacityPort,
      workerId: "worker-1",
    });

    const execution = handler(message);
    capacityWaitController.abort();
    await execution;

    expect(executeTask).not.toHaveBeenCalled();
    expect(message.ack).not.toHaveBeenCalled();
    expect(message.negativeAck).not.toHaveBeenCalled();
  });

  it("releases a lease granted during shutdown before starting the runtime", async () => {
    const capacityWaitController = new AbortController();
    const lease = { leaseId: "9|7|3", token: "lease-token" };
    let resolveAdmission!: (value: { kind: "allowed"; lease: typeof lease }) => void;
    const admission = new Promise<{ kind: "allowed"; lease: typeof lease }>(resolve => {
      resolveAdmission = resolve;
    });
    const taskCapacityPort = {
      acquire: vi.fn(() => admission),
      availability: vi.fn(async () => ({ available: 1, kind: "available" as const })),
      release: vi.fn(async () => {}),
      releaseReservation: vi.fn(async () => {}),
      renew: vi.fn(async () => {}),
      reserve: vi.fn(),
    };
    const executeTask = vi.fn(async () => undefined);
    const message = createBrokerMessage(taskMessage());
    const handler = createTaskConsumerHandler({
      capacityWaitSignal: capacityWaitController.signal,
      runtimeService: { executeTask },
      taskCapacityPort,
      workerId: "worker-1",
    });

    const execution = handler(message);
    expect(taskCapacityPort.acquire).toHaveBeenCalledTimes(1);
    capacityWaitController.abort();
    resolveAdmission({ kind: "allowed", lease });
    await execution;

    expect(executeTask).not.toHaveBeenCalled();
    expect(message.ack).not.toHaveBeenCalled();
    expect(message.negativeAck).not.toHaveBeenCalled();
    expect(taskCapacityPort.release).toHaveBeenCalledWith({ lease, uid: 9 });
  });

  it("backs off capacity availability probes while Redis is unavailable", async () => {
    vi.useFakeTimers();
    try {
      let subscriptionInput: WorkflowBrokerSubscribeInput | undefined;
      const subscription = {
        close: vi.fn(async () => {}),
        isConnected: vi.fn(() => true),
      };
      const broker: WorkflowBroker = {
        checkHealth: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
        publish: vi.fn(async () => ({ messageId: "message-1" })),
        subscribe: vi.fn(async (input: WorkflowBrokerSubscribeInput) => {
          subscriptionInput = input;
          return subscription;
        }),
      };
      const availability = vi.fn()
        .mockResolvedValueOnce({ kind: "unavailable" as const })
        .mockResolvedValueOnce({ available: 1, kind: "available" as const });
      const taskCapacityPort = {
        acquire: vi.fn(),
        availability,
        release: vi.fn(async () => {}),
        releaseReservation: vi.fn(async () => {}),
        renew: vi.fn(async () => {}),
        reserve: vi.fn(),
      };

      const consumer = await startTaskConsumer({
        broker,
        maxInFlight: 1,
        runtimeService: { executeTask: vi.fn(async () => undefined) },
        taskCapacityPort,
        subscription: "task-subscription",
        topic: "task-topic",
        workerId: "worker-1",
      });

      const beforeReceive = subscriptionInput?.beforeReceive;
      expect(beforeReceive).toBeDefined();
      await expect(beforeReceive!()).resolves.toBe(false);
      await expect(beforeReceive!()).resolves.toBe(false);
      expect(availability).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(30_000);
      await expect(beforeReceive!()).resolves.toBe(true);
      expect(availability).toHaveBeenCalledTimes(2);

      await consumer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("backs off capacity availability probes while all capacity is occupied", async () => {
    vi.useFakeTimers();
    try {
      let subscriptionInput: WorkflowBrokerSubscribeInput | undefined;
      const subscription = {
        close: vi.fn(async () => {}),
        isConnected: vi.fn(() => true),
      };
      const broker: WorkflowBroker = {
        checkHealth: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
        publish: vi.fn(async () => ({ messageId: "message-1" })),
        subscribe: vi.fn(async (input: WorkflowBrokerSubscribeInput) => {
          subscriptionInput = input;
          return subscription;
        }),
      };
      const availability = vi.fn()
        .mockResolvedValueOnce({ available: 0, kind: "available" as const, reserved: 0 })
        .mockResolvedValueOnce({ available: 1, kind: "available" as const, reserved: 0 });
      const taskCapacityPort = {
        acquire: vi.fn(),
        availability,
        release: vi.fn(async () => {}),
        releaseReservation: vi.fn(async () => {}),
        renew: vi.fn(async () => {}),
        reserve: vi.fn(),
      };

      const consumer = await startTaskConsumer({
        broker,
        maxInFlight: 1,
        runtimeService: { executeTask: vi.fn(async () => undefined) },
        taskCapacityPort,
        subscription: "task-subscription",
        topic: "task-topic",
        workerId: "worker-1",
      });

      const beforeReceive = subscriptionInput?.beforeReceive;
      expect(beforeReceive).toBeDefined();
      await expect(beforeReceive!()).resolves.toBe(false);
      await expect(beforeReceive!()).resolves.toBe(false);
      expect(availability).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(4_999);
      await expect(beforeReceive!()).resolves.toBe(false);
      expect(availability).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      await expect(beforeReceive!()).resolves.toBe(true);
      expect(availability).toHaveBeenCalledTimes(2);

      await consumer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renews a granted capacity lease while Runtime is still in preflight", async () => {
    vi.useFakeTimers();
    try {
      const lease = { leaseId: "9|7|3", token: "lease-token" };
      let releaseRuntime!: () => void;
      const runtimeReleased = new Promise<void>(resolve => { releaseRuntime = resolve; });
      const taskCapacityPort = {
        acquire: vi.fn(async () => ({ kind: "allowed" as const, lease })),
        availability: vi.fn(async () => ({ available: 1, kind: "available" as const })),
        release: vi.fn(async () => {}),
        releaseReservation: vi.fn(async () => {}),
        renew: vi.fn(async () => {}),
        reserve: vi.fn(),
      };
      let capacitySignal: AbortSignal | undefined;
      let runtimeStarted!: () => void;
      const runtimeStartedPromise = new Promise<void>(resolve => { runtimeStarted = resolve; });
      const executeTask = vi.fn(async (input: { capacitySignal?: AbortSignal }) => {
        capacitySignal = input.capacitySignal;
        runtimeStarted();
        await runtimeReleased;
      });
      const message = createBrokerMessage(taskMessage());
      const handler = createTaskConsumerHandler({
        capacityLeaseDurationMs: 60_000,
        runtimeService: { executeTask },
        taskCapacityPort,
        workerId: "worker-1",
      });

      const execution = handler(message);
      await runtimeStartedPromise;
      expect(capacitySignal).toBeDefined();

      await vi.advanceTimersByTimeAsync(30_000);
      expect(taskCapacityPort.renew).toHaveBeenCalledWith({
        lease,
        leaseDurationMs: 60_000,
        uid: 9,
      });
      expect(capacitySignal?.aborted).toBe(false);

      releaseRuntime();
      await execution;
      expect(message.ack).toHaveBeenCalledTimes(1);
      expect(taskCapacityPort.release).toHaveBeenCalledWith({ lease, uid: 9 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops renewing after the first capacity lease renewal failure", async () => {
    vi.useFakeTimers();
    try {
      const lease = { leaseId: "9|7|3", token: "lease-token" };
      let releaseRuntime!: () => void;
      const runtimeReleased = new Promise<void>(resolve => { releaseRuntime = resolve; });
      const taskCapacityPort = {
        acquire: vi.fn(async () => ({ kind: "allowed" as const, lease })),
        availability: vi.fn(async () => ({ available: 1, kind: "available" as const })),
        release: vi.fn(async () => {}),
        releaseReservation: vi.fn(async () => {}),
        renew: vi.fn(async () => { throw new Error("Redis unavailable"); }),
        reserve: vi.fn(),
      };
      let runtimeStarted!: () => void;
      const runtimeStartedPromise = new Promise<void>(resolve => { runtimeStarted = resolve; });
      const executeTask = vi.fn(async () => {
        runtimeStarted();
        await runtimeReleased;
      });
      const message = createBrokerMessage(taskMessage());
      const handler = createTaskConsumerHandler({
        capacityLeaseDurationMs: 60_000,
        runtimeService: { executeTask },
        taskCapacityPort,
        workerId: "worker-1",
      });

      const execution = handler(message);
      await runtimeStartedPromise;

      await vi.advanceTimersByTimeAsync(30_000);
      expect(taskCapacityPort.renew).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(taskCapacityPort.renew).toHaveBeenCalledTimes(1);

      releaseRuntime();
      await execution;
      expect(taskCapacityPort.release).toHaveBeenCalledWith({ lease, uid: 9 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("continues receiving when reserved leases are the only available capacity", async () => {
    let subscriptionInput: WorkflowBrokerSubscribeInput | undefined;
    const subscription = {
      close: vi.fn(async () => {}),
      isConnected: vi.fn(() => true),
    };
    const broker: WorkflowBroker = {
      checkHealth: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      publish: vi.fn(async () => ({ messageId: "message-1" })),
      subscribe: vi.fn(async (input: WorkflowBrokerSubscribeInput) => {
        subscriptionInput = input;
        return subscription;
      }),
    };
    const taskCapacityPort = {
      acquire: vi.fn(),
      availability: vi.fn(async () => ({ available: 0, kind: "available" as const, reserved: 1 })),
      release: vi.fn(async () => {}),
      releaseReservation: vi.fn(async () => {}),
      renew: vi.fn(async () => {}),
      reserve: vi.fn(),
    };

    const consumer = await startTaskConsumer({
      broker,
      maxInFlight: 1,
      runtimeService: { executeTask: vi.fn(async () => undefined) },
      taskCapacityPort,
      subscription: "task-subscription",
      topic: "task-topic",
      workerId: "worker-1",
    });

    expect(subscriptionInput?.beforeReceive).toBeDefined();
    await expect(subscriptionInput!.beforeReceive!()).resolves.toBe(true);
    await consumer.close();
  });

  it("executes a valid task and ACKs only after the runtime service resolves", async () => {
    const order: string[] = [];
    const executeTask = vi.fn(async () => { order.push("commit"); });
    const message = createBrokerMessage(taskMessage(), {
      onAck: () => order.push("ack"),
    });
    const handler = createTaskConsumerHandler({
      now: () => new Date("2026-07-12T00:00:00.000Z"),
      runtimeService: { executeTask },
      workerId: "worker-1",
    });

    await handler(message);

    expect(executeTask).toHaveBeenCalledWith(expect.objectContaining({
      messageId: "message-1",
      now: new Date("2026-07-12T00:00:00.000Z"),
      taskId: "7",
      taskVersion: 3,
      uid: 9,
      workerId: "worker-1",
    }));
    expect(order).toEqual(["commit", "ack"]);
  });

  it.each([
    "WORKFLOW_RUNTIME_PAUSED",
    "WORKFLOW_MESSAGE_SENDING_WINDOW_DEFERRED",
    "WORKFLOW_RUNTIME_NODE_UNSUPPORTED",
    "WORKFLOW_RUNTIME_UNAVAILABLE",
    "WORKFLOW_TASK_STALE",
    "WORKFLOW_TASK_ALREADY_PROCESSED",
    "WORKFLOW_TASK_NOT_FOUND",
  ])("ACKs the persisted or terminal boundary %s", async (code) => {
    const message = createBrokerMessage(taskMessage());
    const handler = createTaskConsumerHandler({
      runtimeService: {
        executeTask: vi.fn(async () => { throw new WorkflowRuntimeError(code, code); }),
      },
      workerId: "worker-1",
    });

    await handler(message);

    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.negativeAck).not.toHaveBeenCalled();
  });

  it("NACKs malformed messages and transient runtime failures", async () => {
    const malformed = createBrokerMessage({ taskId: "invalid" });
    const transient = createBrokerMessage(taskMessage());
    const observe = vi.fn();
    const handler = createTaskConsumerHandler({
      observe,
      runtimeService: { executeTask: vi.fn(async () => { throw new Error("database unavailable"); }) },
      workerId: "worker-1",
    });

    await handler(malformed);
    await handler(transient);

    expect(malformed.negativeAck).toHaveBeenCalledTimes(1);
    expect(transient.negativeAck).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenNthCalledWith(1, malformed, {
      code: "invalid_task_message",
      disposition: "nack",
    });
    expect(observe).toHaveBeenNthCalledWith(2, transient, expect.objectContaining({
      code: "temporary_failure",
      command: { runId: "5", taskId: "7", taskVersion: 3, uid: "9" },
      disposition: "nack",
      error: expect.any(Error),
    }));
  });

  it("records and ACKs a persisted seat rate-limit deferral", async () => {
    const observe = vi.fn();
    const message = createBrokerMessage(taskMessage());
    const retryAt = new Date("2026-09-18T00:00:05.000Z");
    const handler = createTaskConsumerHandler({
      observe,
      runtimeService: {
        executeTask: vi.fn(async () => ({
          kind: "deferred",
          reasonCode: "WORKFLOW_MESSAGE_RATE_LIMITED",
          retryAt,
        })),
      },
      workerId: "worker-1",
    });

    await handler(message);

    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.negativeAck).not.toHaveBeenCalled();
    expect(observe).toHaveBeenCalledWith(message, {
      code: "rate_limited",
      command: { runId: "5", taskId: "7", taskVersion: 3, uid: "9" },
      disposition: "ack",
      retryAt,
    });
  });

  it("records non-rate-limit deferrals separately", async () => {
    const observe = vi.fn();
    const message = createBrokerMessage(taskMessage());
    const retryAt = new Date("2026-09-18T00:00:05.000Z");
    const handler = createTaskConsumerHandler({
      observe,
      runtimeService: {
        executeTask: vi.fn(async () => ({
          kind: "deferred",
          reasonCode: "WORKFLOW_MESSAGE_SENDING_WINDOW_DEFERRED",
          retryAt,
        })),
      },
      workerId: "worker-1",
    });

    await handler(message);

    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledWith(message, {
      code: "deferred",
      command: { runId: "5", taskId: "7", taskVersion: 3, uid: "9" },
      disposition: "ack",
      retryAt,
    });
  });

  it.each([
    ["WORKFLOW_TASK_TENANT_CAPACITY_LIMITED", "tenant_capacity_limited"],
    ["WORKFLOW_TASK_CAPACITY_UNAVAILABLE", "capacity_unavailable"],
  ])("classifies %s without counting it as message rate limited", async (reasonCode, code) => {
    const observe = vi.fn();
    const message = createBrokerMessage(taskMessage());
    const retryAt = new Date("2026-09-18T00:01:00.000Z");
    const handler = createTaskConsumerHandler({
      observe,
      runtimeService: {
        executeTask: vi.fn(async () => ({ kind: "deferred", reasonCode, retryAt })),
      },
      workerId: "worker-1",
    });

    await handler(message);

    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledWith(message, expect.objectContaining({ code, retryAt }));
  });

  it.each([
    {
      event: "workflow.capability.retry.scheduled",
      result: {
        errorCode: "DOWNSTREAM_TEMPORARY",
        failureKind: "unknown",
        kind: "retry-scheduled",
        retryAt: new Date("2026-07-12T00:00:05.000Z"),
        task: { attempt: 1 },
      },
    },
    {
      event: "workflow.capability.failed",
      result: {
        diagnosticMessage: "Java messaging API returned 503",
        errorCode: "DOWNSTREAM_REJECTED",
        failureKind: "terminal",
        kind: "failed",
        task: { attempt: 1 },
      },
    },
    {
      event: "workflow.node.failed",
      result: {
        diagnosticMessage: "Workflow node-output was 8206 bytes; limit is 8192 bytes",
        errorCode: "WORKFLOW_NODE_OUTPUT_TOO_LARGE",
        kind: "node-failed",
        nodeId: "branch",
        nodeKind: "branch",
      },
    },
  ])("logs and ACKs the persisted $event outcome", async ({ event, result }) => {
    const observe = vi.fn();
    const message = createBrokerMessage(taskMessage());
    const handler = createTaskConsumerHandler({
      observe,
      runtimeService: { executeTask: vi.fn(async () => result) },
      workerId: "worker-1",
    });

    await handler(message);

    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.negativeAck).not.toHaveBeenCalled();
    expect(observe).toHaveBeenCalledWith(message, expect.objectContaining({
      code: event === "workflow.capability.retry.scheduled"
        ? "retry_scheduled"
        : event === "workflow.node.failed"
          ? "node_failed"
          : "capability_failed",
      command: { runId: "5", taskId: "7", taskVersion: 3, uid: "9" },
      ...(result.diagnosticMessage ? { diagnosticMessage: result.diagnosticMessage } : {}),
      disposition: "ack",
      errorCode: result.errorCode,
      ...("failureKind" in result ? { failureKind: result.failureKind } : {}),
      ...("nodeId" in result ? { nodeId: result.nodeId } : {}),
      ...("nodeKind" in result ? { nodeKind: result.nodeKind } : {}),
    }));
  });
});

function taskMessage(): WorkflowTaskMessage {
  return {
    messageId: "message-1",
    occurredAt: "2026-07-11T00:00:00.000Z",
    runId: "5",
    shardId: 1,
    taskId: "7",
    taskVersion: 3,
    uid: "9",
  };
}
