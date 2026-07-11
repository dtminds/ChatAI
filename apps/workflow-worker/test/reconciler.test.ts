import { describe, expect, it, vi } from "vitest";
import { reconcileWorkflowRuntime } from "../src/reconciler.js";

describe("workflow reconciler", () => {
  it("recovers task and outbox leases and advances workflow cancellation", async () => {
    const reconciler = {
      cancelUnavailableRuns: vi.fn(async () => ({ cancelled: 4, done: false, nextCursor: "88" })),
      cleanupExpiredInbox: vi.fn(async () => 5),
      recoverExpiredLeases: vi.fn(async () => ({ dead: 1, recovered: 2 })),
      republishStalledDispatchedTasks: vi.fn(async () => 6),
      recoverExpiredOutboxLeases: vi.fn(async () => 3),
    };

    await expect(reconcileWorkflowRuntime({
      afterRunId: "50",
      dispatchTimeoutMs: 300_000,
      inboxCleanupBatchSize: 1_000,
      limit: 100,
      maxTaskAttempts: 5,
      now: new Date("2026-07-11T00:00:00.000Z"),
      reconciler,
    })).resolves.toEqual({
      cancelled: 4,
      inboxDeleted: 5,
      nextCursor: "88",
      stalledTasksRepublished: 6,
      outboxLeasesRecovered: 3,
      taskLeasesDead: 1,
      taskLeasesRecovered: 2,
    });
    expect(reconciler.republishStalledDispatchedTasks).toHaveBeenCalledWith({
      dispatchedBefore: new Date("2026-07-10T23:55:00.000Z"),
      limit: 100,
      now: new Date("2026-07-11T00:00:00.000Z"),
    });
  });
});
