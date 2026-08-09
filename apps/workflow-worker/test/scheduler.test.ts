import { describe, expect, it, vi } from "vitest";
import { scheduleWorkflowTasks } from "../src/scheduler.js";

describe("workflow scheduler", () => {
  it("dispatches database tasks without publishing to the broker", async () => {
    const repository = {
      dispatchDueTasks: vi.fn(async () => ({ cancelled: 1, deferred: 2, dispatched: 3 })),
    };

    await expect(scheduleWorkflowTasks({
      limit: 100,
      now: new Date("2026-07-11T00:00:00.000Z"),
      repository,
      shardIds: [1, 2],
    })).resolves.toEqual({ cancelled: 1, deferred: 2, dispatched: 3 });
    expect(repository.dispatchDueTasks).toHaveBeenCalledWith({
      limit: 100,
      now: new Date("2026-07-11T00:00:00.000Z"),
      shardIds: [1, 2],
    });
  });
});
