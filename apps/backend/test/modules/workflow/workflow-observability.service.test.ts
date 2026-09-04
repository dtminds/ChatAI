import { describe, expect, it, vi } from "vitest";
import { WorkflowObservabilityService } from "../../../src/modules/workflow/workflow-observability.service.js";

const OBSERVED_AT = Date.parse("2026-08-28T13:00:00.000Z");

describe("workflow observability service", () => {
  it("marks a role offline after the heartbeat timeout and degraded while a tick is stalled", async () => {
    const repository = {
      getObservedAt: vi.fn(async () => OBSERVED_AT),
      listWorkerStates: vi.fn(async () => [
        {
          lastStartedAt: OBSERVED_AT - 16 * 60_000,
          lastSuccessAt: OBSERVED_AT - 20 * 60_000,
          reportedAt: OBSERVED_AT - 1_000,
          reportedBy: "worker-1",
          role: "reconciler" as const,
        },
        {
          lastSuccessAt: OBSERVED_AT - 1_000,
          reportedAt: OBSERVED_AT - 200_000,
          reportedBy: "worker-1",
          role: "scheduler" as const,
        },
      ]),
      getTaskQueueCounts: vi.fn(async () => emptyTasks()),
      getTransitionCounts: vi.fn(async () => ({ dead: 2, leased: 0, pending: 1 })),
      getOutboxPending: vi.fn(async () => ({ pending: 0 })),
      getInferenceCounts: vi.fn(async () => ({ expiredLease: 0, pending: 0, retryWait: 0 })),
    };
    const service = new WorkflowObservabilityService(repository as never);

    const summary = await service.getSummary();
    const byRole = Object.fromEntries(summary.workers.map((worker) => [worker.role, worker.health]));
    expect(byRole.reconciler).toBe("degraded");
    expect(byRole.scheduler).toBe("offline");
    expect(byRole.outbox).toBe("unknown");
    expect(summary.deadTransitionCount).toBe(2);
  });

  it("caps pageSize and keeps filter in the repository query instead of slicing in memory", async () => {
    const repository = {
      getObservedAt: vi.fn(async () => OBSERVED_AT),
      listWorkflows: vi.fn(async (query: { page: number; pageSize: number; state: string }) => {
        expect(query.pageSize).toBe(100);
        expect(query.state).toBe("dead");
        expect(query.page).toBe(2);
        return {
          items: [{
            activeRunCount: 0,
            activeTaskCount: 0,
            dueBacklogCount: 0,
            name: "暂停失败",
            runtimeStatus: "paused",
            totalRunCount: 1,
            uid: 9,
            workflowId: "12",
          }],
          total: 101,
        };
      }),
    };
    const service = new WorkflowObservabilityService(repository as never);

    await expect(service.listWorkflows({
      page: 2,
      pageSize: 500,
      state: "dead",
    })).resolves.toMatchObject({
      page: 2,
      pageSize: 100,
      total: 101,
      totalPages: 2,
    });
    expect(repository.listWorkflows).toHaveBeenCalledTimes(1);
  });
});

function emptyTasks() {
  return {
    dispatched: 0,
    dueBacklog: 0,
    expiredLease: 0,
    pending: 0,
    running: 0,
    stalledDispatched: 0,
    suspended: 0,
  };
}
