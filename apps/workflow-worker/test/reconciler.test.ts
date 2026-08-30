import { describe, expect, it, vi } from "vitest";
import {
  reconcileWorkflowEntitlements,
  reconcileWorkflowRuntime,
} from "../src/reconciler.js";

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
      deactivateUnentitledWorkflows: vi.fn(async () => ({
        checksUnavailable: 1,
        hasMore: true,
        lastUid: 108,
        tenantsChecked: 3,
        workflowsDeactivated: 2,
      })),
      recoverExpiredLeases: vi.fn(async () => ({ dead: 1, recovered: 2 })),
      processRevisionCleanups: vi.fn(async () => ({
        cancelled: 14,
        claimed: 15,
        failed: 1,
        obsolete: 2,
      })),
      reconcileEventSubscriptions: vi.fn(async () => ({
        cancelled: 2,
        checked: 12,
        hasMore: true,
        lastSubscriptionId: "77",
      })),
      reconcileRunTaskConsistency: vi.fn(async () => ({
        hasMoreRuns: true,
        hasMoreTasks: false,
        inconsistentRunsFailed: 1,
        lastRunId: "91",
        lastTaskId: "103",
        runsChecked: 9,
        staleTasksCancelled: 2,
        taskStatusesReconciled: 4,
        tasksChecked: 11,
        terminalRunTasksCancelled: 3,
      })),
      reconcileTenantCapacityCounts: vi.fn(async () => ({
        checked: 100,
        corrected: 2,
        hasMore: true,
        lastUid: 109,
      })),
      republishStalledDispatchedTasks: vi.fn(async () => 6),
      recoverExpiredOutboxLeases: vi.fn(async () => 3),
    };

    await expect(reconcileWorkflowRuntime({
      afterEventSubscriptionId: "70",
      afterCapacityUid: 9,
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
      leaseDurationMs: 30_000,
      leaseOwner: "reconciler-1",
      maxTaskAttempts: 5,
      now: new Date("2026-07-11T00:00:00.000Z"),
      reconciler,
      retryDelayMs: 5_000,
    })).resolves.toEqual({
      cancelled: 4,
      capacityCountsChecked: 100,
      capacityCountsCorrected: 2,
      historyCleanupHasMore: false,
      inboxDeleted: 5,
      eventSubscriptionsCancelled: 2,
      eventSubscriptionsChecked: 12,
      nodeExecutionsDeleted: 10,
      nextCursor: "88",
      nextEventSubscriptionCursor: "77",
      nextConsistencyRunCursor: "91",
      nextConsistencyTaskCursor: null,
      nextCapacityCursor: 109,
      nodeMetricEventsAggregated: 7,
      nodeMetricEventsDeleted: 8,
      stalledTasksRepublished: 6,
      outboxLeasesRecovered: 3,
      outboxDeleted: 11,
      runsDeleted: 12,
      revisionCleanupCancelled: 14,
      revisionCleanupClaimed: 15,
      revisionCleanupFailed: 1,
      revisionCleanupObsolete: 2,
      taskLeasesDead: 1,
      taskLeasesRecovered: 2,
      taskStatusesReconciled: 4,
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
    expect(reconciler.reconcileEventSubscriptions).toHaveBeenCalledWith({
      afterSubscriptionId: "70",
      limit: 100,
    });
    expect(reconciler.reconcileTenantCapacityCounts).toHaveBeenCalledWith({
      afterUid: 9,
      limit: 100,
    });
    expect(reconciler.processRevisionCleanups).toHaveBeenCalledWith({
      leaseDurationMs: 30_000,
      leaseOwner: "reconciler-1",
      limit: 100,
      maxAttempts: 5,
      now: new Date("2026-07-11T00:00:00.000Z"),
      retryDelayMs: 5_000,
    });
    expect(reconciler.cleanupWorkflowHistory).toHaveBeenCalledWith({
      limit: 1_000,
      runBefore: new Date("2026-01-12T00:00:00.000Z"),
      taskOutboxBefore: new Date("2026-06-11T00:00:00.000Z"),
    });
  });

  it("reconciles entitlements independently from runtime recovery", async () => {
    const deactivateUnentitledWorkflows = vi.fn(async () => ({
      checksUnavailable: 1,
      hasMore: true,
      lastUid: 108,
      tenantsChecked: 3,
      workflowsDeactivated: 2,
    }));

    await expect(reconcileWorkflowEntitlements({
      afterUid: 8,
      limit: 100,
      reconciler: { deactivateUnentitledWorkflows },
    })).resolves.toEqual({
      entitlementChecksUnavailable: 1,
      entitlementTenantsChecked: 3,
      entitlementWorkflowsDeactivated: 2,
      nextEntitlementCursor: 108,
    });
  });
});
