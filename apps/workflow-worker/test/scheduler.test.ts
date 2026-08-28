import { describe, expect, it, vi } from "vitest";
import { scheduleWorkflowTasks } from "../src/scheduler.js";

describe("workflow scheduler", () => {
  it("forwards a bounded global claim to the repository without publishing to the broker", async () => {
    const callOrder: string[] = [];
    const repository = {
      dispatchDueTasks: vi.fn(async () => {
        callOrder.push("dispatch");
        return { cancelled: 1, dispatched: 3, suspended: 0 };
      }),
      processTaskStatusTransitionBatch: vi.fn(async () => {
        callOrder.push("transition");
        return { claimed: true, hasMore: true, transitioned: 1_000 };
      }),
    };

    await expect(scheduleWorkflowTasks({
      leaseDurationMs: 60_000,
      leaseOwner: "scheduler-1",
      limit: 100,
      now: new Date("2026-07-11T00:00:00.000Z"),
      repository,
    })).resolves.toEqual({ cancelled: 1, dispatched: 3, suspended: 0 });
    expect(repository.processTaskStatusTransitionBatch).toHaveBeenCalledWith({
      leaseExpiresAt: new Date("2026-07-11T00:01:00.000Z"),
      leaseOwner: "scheduler-1",
      limit: 1_000,
      now: new Date("2026-07-11T00:00:00.000Z"),
    });
    expect(repository.dispatchDueTasks).toHaveBeenCalledWith({
      limit: 100,
      now: new Date("2026-07-11T00:00:00.000Z"),
    });
    expect(callOrder).toEqual(["transition", "dispatch"]);
  });
});
