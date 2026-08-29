import { describe, expect, it, vi } from "vitest";
import {
  publishWorkflowOutbox,
  publishWorkflowOutboxBatch,
} from "../src/outbox-publisher.js";

describe("workflow outbox publisher", () => {
  it("bounds concurrent publishes and marks each successful chunk sent in one write", async () => {
    const releases: Array<() => void> = [];
    let active = 0;
    let maxActive = 0;
    const records = Array.from({ length: 10 }, (_, index) => outboxRecord({ id: `outbox-${index + 1}` }));
    const repository = repositoryFor(records);
    const broker = {
      publish: vi.fn(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>(resolve => releases.push(resolve));
        active -= 1;
        return { messageId: "broker-1" };
      }),
    };

    const publishing = publishWorkflowOutboxBatch(publisherInput({
      broker,
      publishConcurrency: 8,
      repository,
    }));
    await vi.waitFor(() => expect(broker.publish).toHaveBeenCalledTimes(8));
    expect(maxActive).toBe(8);
    expect(repository.markOutboxSentBatch).not.toHaveBeenCalled();
    releases.splice(0).forEach(release => release());
    await vi.waitFor(() => expect(broker.publish).toHaveBeenCalledTimes(10));
    releases.splice(0).forEach(release => release());

    await expect(publishing).resolves.toEqual({ claimed: 10, dead: 0, failed: 0, sent: 10 });
    expect(repository.markOutboxSentBatch).toHaveBeenNthCalledWith(1, {
      ids: records.slice(0, 8).map(record => record.id),
      leaseOwner: "publisher-1",
      sentAt: new Date("2026-07-11T00:00:00.000Z"),
    });
    expect(repository.markOutboxSentBatch).toHaveBeenNthCalledWith(2, {
      ids: records.slice(8).map(record => record.id),
      leaseOwner: "publisher-1",
      sentAt: new Date("2026-07-11T00:00:00.000Z"),
    });
  });

  it("marks successful publishes sent and schedules failed publishes independently", async () => {
    const records = [outboxRecord({ id: "outbox-1" }), outboxRecord({ id: "outbox-2" })];
    const repository = repositoryFor(records);
    const broker = {
      publish: vi.fn(async input => {
        if (input.properties?.outboxId === "outbox-2") throw new Error("broker unavailable");
        return { messageId: "broker-1" };
      }),
    };

    await expect(publishWorkflowOutboxBatch(publisherInput({
      broker,
      repository,
    }))).resolves.toEqual({ claimed: 2, dead: 0, failed: 1, sent: 1 });
    expect(repository.markOutboxSentBatch).toHaveBeenCalledWith(expect.objectContaining({
      ids: ["outbox-1"],
    }));
    expect(repository.markOutboxFailed).toHaveBeenCalledWith({
      id: "outbox-2",
      leaseOwner: "publisher-1",
      nextAttemptAt: new Date("2026-07-11T00:00:01.000Z"),
    });
  });

  it("leaves published rows leased when the batch sent fence is incomplete", async () => {
    const records = [outboxRecord({ id: "outbox-1" }), outboxRecord({ id: "outbox-2" })];
    const repository = repositoryFor(records);
    repository.markOutboxSentBatch.mockResolvedValueOnce(1);

    await expect(publishWorkflowOutboxBatch(publisherInput({
      broker: { publish: vi.fn(async () => ({ messageId: "broker-1" })) },
      repository,
    }))).rejects.toThrow("Workflow Outbox sent lease mismatch: expected 2, updated 1");
    expect(repository.markOutboxFailed).not.toHaveBeenCalled();
  });

  it("continues persisting other outcomes before reporting a lost retry lease", async () => {
    const records = [outboxRecord({ id: "outbox-1" }), outboxRecord({ id: "outbox-2" })];
    const repository = repositoryFor(records);
    repository.markOutboxFailed
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const broker = { publish: vi.fn(async () => { throw new Error("broker unavailable"); }) };

    await expect(publishWorkflowOutboxBatch(publisherInput({ broker, repository })))
      .rejects.toThrow("Workflow Outbox lease was lost while scheduling retry");
    expect(repository.markOutboxFailed).toHaveBeenCalledTimes(2);
  });

  it("marks an outbox row dead instead of retrying after the attempt limit", async () => {
    const records = [outboxRecord({ attempt: 5 })];
    const repository = repositoryFor(records);

    await expect(publishWorkflowOutboxBatch(publisherInput({
      broker: { publish: vi.fn(async () => { throw new Error("broker unavailable"); }) },
      maxAttempts: 5,
      repository,
    }))).resolves.toEqual({ claimed: 1, dead: 1, failed: 0, sent: 0 });
    expect(repository.markOutboxDead).toHaveBeenCalledWith({
      failedAt: new Date("2026-07-11T00:00:00.000Z"),
      id: "outbox-1",
      leaseOwner: "publisher-1",
    });
    expect(repository.markOutboxFailed).not.toHaveBeenCalled();
  });

  it("immediately drains full batches and stops after the first short batch", async () => {
    const batches = [
      [outboxRecord({ id: "outbox-1" }), outboxRecord({ id: "outbox-2" })],
      [outboxRecord({ id: "outbox-3" }), outboxRecord({ id: "outbox-4" })],
      [outboxRecord({ id: "outbox-5" })],
    ];
    const repository = repositoryFor([]);
    repository.claimOutboxBatch.mockImplementation(async () => batches.shift() ?? []);

    await expect(publishWorkflowOutbox(publisherInput({
      broker: { publish: vi.fn(async () => ({ messageId: "broker-1" })) },
      limit: 2,
      repository,
    }))).resolves.toEqual({ claimed: 5, dead: 0, failed: 0, sent: 5 });
    expect(repository.claimOutboxBatch).toHaveBeenCalledTimes(3);
  });

  it("yields to the role interval after ten consecutive full batches", async () => {
    let id = 0;
    const repository = repositoryFor([]);
    repository.claimOutboxBatch.mockImplementation(async () => [
      outboxRecord({ id: `outbox-${++id}` }),
    ]);

    await expect(publishWorkflowOutbox(publisherInput({
      broker: { publish: vi.fn(async () => ({ messageId: "broker-1" })) },
      limit: 1,
      repository,
    }))).resolves.toEqual({ claimed: 10, dead: 0, failed: 0, sent: 10 });
    expect(repository.claimOutboxBatch).toHaveBeenCalledTimes(10);
  });
});

function publisherInput(overrides: Record<string, unknown> = {}) {
  return {
    broker: { publish: vi.fn(async () => ({ messageId: "broker-1" })) },
    leaseDurationMs: 60_000,
    leaseOwner: "publisher-1",
    limit: 10,
    maxAttempts: 100,
    maxRetryDelayMs: 300_000,
    now: () => new Date("2026-07-11T00:00:00.000Z"),
    publishConcurrency: 8,
    repository: repositoryFor([]),
    retryDelayMs: 1_000,
    topic: "task-topic",
    ...overrides,
  } as Parameters<typeof publishWorkflowOutboxBatch>[0];
}

function repositoryFor(records: ReturnType<typeof outboxRecord>[]) {
  return {
    claimOutboxBatch: vi.fn(async () => records),
    markOutboxDead: vi.fn(async () => true),
    markOutboxFailed: vi.fn(async () => true),
    markOutboxSentBatch: vi.fn(async input => input.ids.length),
  };
}

function outboxRecord(overrides: { attempt?: number; id?: string } = {}) {
  const id = overrides.id ?? "outbox-1";
  return {
    attempt: overrides.attempt ?? 1,
    eventType: "workflow.task.ready",
    id,
    leaseExpiresAt: new Date("2026-07-11T00:01:00.000Z"),
    leaseOwner: "publisher-1",
    nextAttemptAt: new Date("2026-07-11T00:00:00.000Z"),
    payload: {
      messageId: `workflow-task:${id}:v1`,
      occurredAt: "2026-07-11T00:00:00.000Z",
      runId: `run-${id}`,
      shardId: 7,
      taskId: `task-${id}`,
      taskVersion: 1,
      uid: "9",
    },
    sentAt: null,
    status: "leased" as const,
    taskVersion: 1,
    uid: 9,
  };
}
