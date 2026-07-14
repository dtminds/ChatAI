import { describe, expect, it, vi } from "vitest";
import { reconcileWorkflowRuntime } from "../src/reconciler.js";

describe("workflow reconciler", () => {
  it("recovers task and outbox leases and advances workflow cancellation", async () => {
    const reconciler = {
      aggregateNodeMetricEvents: vi.fn(async () => 7),
      cleanupProcessedNodeMetricEvents: vi.fn(async () => 8),
      cancelUnavailableRuns: vi.fn(async () => ({ cancelled: 4, done: false, nextCursor: "88" })),
      cleanupExpiredInbox: vi.fn(async () => 5),
      cleanupWorkflowHistory: vi.fn(async () => ({
        hasMore: false,
        nodeExecutionsDeleted: 10,
        outboxDeleted: 11,
        runsDeleted: 12,
        tasksDeleted: 13,
      })),
      recoverExpiredLeases: vi.fn(async () => ({ dead: 1, recovered: 2 })),
      reconcileRunTaskConsistency: vi.fn(async () => ({
        hasMoreRuns: true,
        hasMoreTasks: false,
        inconsistentRunsFailed: 1,
        lastRunId: "91",
        lastTaskId: "103",
        runsChecked: 9,
        staleTasksCancelled: 2,
        tasksChecked: 11,
        terminalRunTasksCancelled: 3,
      })),
      republishStalledDispatchedTasks: vi.fn(async () => 6),
      recoverExpiredOutboxLeases: vi.fn(async () => 3),
    };

    await expect(reconcileWorkflowRuntime({
      afterRunId: "50",
      afterConsistencyRunId: "80",
      afterConsistencyTaskId: "100",
      consistencyGraceMs: 60_000,
      dispatchTimeoutMs: 300_000,
      inboxCleanupBatchSize: 1_000,
      historyRetention: {
        runBefore: new Date("2026-01-12T00:00:00.000Z"),
        taskOutboxBefore: new Date("2026-06-11T00:00:00.000Z"),
      },
      historyCleanupBatchSize: 1_000,
      limit: 100,
      maxTaskAttempts: 5,
      now: new Date("2026-07-11T00:00:00.000Z"),
      reconciler,
    })).resolves.toEqual({
      cancelled: 4,
      historyCleanupHasMore: false,
      inboxDeleted: 5,
      nodeExecutionsDeleted: 10,
      nextCursor: "88",
      nextConsistencyRunCursor: "91",
      nextConsistencyTaskCursor: null,
      nodeMetricEventsAggregated: 7,
      nodeMetricEventsDeleted: 8,
      stalledTasksRepublished: 6,
      outboxLeasesRecovered: 3,
      outboxDeleted: 11,
      runsDeleted: 12,
      taskLeasesDead: 1,
      taskLeasesRecovered: 2,
      tasksDeleted: 13,
      inconsistentRunsFailed: 1,
      runsChecked: 9,
      staleTasksCancelled: 2,
      tasksChecked: 11,
      terminalRunTasksCancelled: 3,
    });
    expect(reconciler.republishStalledDispatchedTasks).toHaveBeenCalledWith({
      dispatchedBefore: new Date("2026-07-10T23:55:00.000Z"),
      limit: 100,
      now: new Date("2026-07-11T00:00:00.000Z"),
    });
    expect(reconciler.reconcileRunTaskConsistency).toHaveBeenCalledWith({
      afterRunId: "80",
      afterTaskId: "100",
      inconsistentBefore: new Date("2026-07-10T23:59:00.000Z"),
      limit: 100,
      now: new Date("2026-07-11T00:00:00.000Z"),
    });
    expect(reconciler.cleanupWorkflowHistory).toHaveBeenCalledWith({
      limit: 1_000,
      runBefore: new Date("2026-01-12T00:00:00.000Z"),
      taskOutboxBefore: new Date("2026-06-11T00:00:00.000Z"),
    });
  });
});
