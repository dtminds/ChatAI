import { describe, expect, it, vi } from "vitest";
import { publishWorkflowOutboxBatch } from "../src/outbox-publisher.js";

describe("workflow outbox publisher", () => {
  it("publishes with the run key and marks sent only after broker success", async () => {
    const calls: string[] = [];
    const repository = {
      claimOutboxBatch: vi.fn(async () => [outboxRecord()]),
      markOutboxFailed: vi.fn(),
      markOutboxSent: vi.fn(async () => { calls.push("sent"); return true; }),
    };
    const broker = {
      publish: vi.fn(async (input) => {
        calls.push("published");
        expect(input.key).toBe("run-1");
        return { messageId: "broker-1" };
      }),
    };

    await expect(publishWorkflowOutboxBatch({
      broker,
      leaseDurationMs: 60_000,
      leaseOwner: "publisher-1",
      limit: 10,
      maxAttempts: 100,
      maxRetryDelayMs: 300_000,
      now: () => new Date("2026-07-11T00:00:00.000Z"),
      repository,
      retryDelayMs: 1_000,
      topic: "task-topic",
    })).resolves.toEqual({ claimed: 1, dead: 0, failed: 0, sent: 1 });
    expect(calls).toEqual(["published", "sent"]);
  });

  it("leaves a published row leased when marking sent fails so recovery can redeliver it", async () => {
    const repository = {
      claimOutboxBatch: vi.fn(async () => [outboxRecord()]),
      markOutboxFailed: vi.fn(),
      markOutboxSent: vi.fn(async () => { throw new Error("database unavailable"); }),
    };
    const broker = { publish: vi.fn(async () => ({ messageId: "broker-1" })) };

    await expect(publishWorkflowOutboxBatch({
      broker,
      leaseDurationMs: 60_000,
      leaseOwner: "publisher-1",
      limit: 10,
      maxAttempts: 100,
      maxRetryDelayMs: 300_000,
      now: () => new Date("2026-07-11T00:00:00.000Z"),
      repository,
      retryDelayMs: 1_000,
      topic: "task-topic",
    })).rejects.toThrow("database unavailable");
    expect(repository.markOutboxFailed).not.toHaveBeenCalled();
  });

  it("fails the batch when the outbox lease is lost while scheduling a retry", async () => {
    const repository = {
      claimOutboxBatch: vi.fn(async () => [outboxRecord({ attempt: 1 })]),
      markOutboxDead: vi.fn(),
      markOutboxFailed: vi.fn(async () => false),
      markOutboxSent: vi.fn(),
    };
    const broker = { publish: vi.fn(async () => { throw new Error("broker unavailable"); }) };

    await expect(publishWorkflowOutboxBatch({
      broker,
      leaseDurationMs: 60_000,
      leaseOwner: "publisher-1",
      limit: 10,
      maxAttempts: 100,
      maxRetryDelayMs: 300_000,
      now: () => new Date("2026-07-11T00:00:00.000Z"),
      repository,
      retryDelayMs: 1_000,
      topic: "task-topic",
    })).rejects.toThrow("Workflow Outbox lease was lost while scheduling retry");
  });

  it("marks an outbox row dead instead of retrying after the attempt limit", async () => {
    const repository = {
      claimOutboxBatch: vi.fn(async () => [outboxRecord({ attempt: 5 })]),
      markOutboxDead: vi.fn(async () => true),
      markOutboxFailed: vi.fn(),
      markOutboxSent: vi.fn(),
    };
    const broker = { publish: vi.fn(async () => { throw new Error("broker unavailable"); }) };

    await expect(publishWorkflowOutboxBatch({
      broker,
      leaseDurationMs: 60_000,
      leaseOwner: "publisher-1",
      limit: 10,
      maxAttempts: 5,
      maxRetryDelayMs: 300_000,
      now: () => new Date("2026-07-11T00:00:00.000Z"),
      repository,
      retryDelayMs: 1_000,
      topic: "task-topic",
    })).resolves.toEqual({ claimed: 1, dead: 1, failed: 0, sent: 0 });
    expect(repository.markOutboxDead).toHaveBeenCalledWith({
      id: "outbox-1",
      leaseOwner: "publisher-1",
    });
    expect(repository.markOutboxFailed).not.toHaveBeenCalled();
  });
});

function outboxRecord(overrides: { attempt?: number } = {}) {
  return {
    attempt: overrides.attempt ?? 0,
    eventType: "workflow.task.ready",
    id: "outbox-1",
    leaseExpiresAt: new Date("2026-07-11T00:01:00.000Z"),
    leaseOwner: "publisher-1",
    nextAttemptAt: new Date("2026-07-11T00:00:00.000Z"),
    payload: {
      messageId: "workflow-task:task-1:v1",
      occurredAt: "2026-07-11T00:00:00.000Z",
      runId: "run-1",
      shardId: 7,
      taskId: "task-1",
      taskVersion: 1,
      uid: "9",
    },
    sentAt: null,
    status: "leased" as const,
    taskVersion: 1,
    uid: 9,
  };
}
