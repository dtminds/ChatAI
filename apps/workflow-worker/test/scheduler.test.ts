import { describe, expect, it, vi } from "vitest";
import { scheduleWorkflowTasks } from "../src/scheduler.js";

describe("workflow scheduler", () => {
  it("forwards a bounded global claim to the repository without publishing to the broker", async () => {
    const repository = {
      dispatchDueTasks: vi.fn(async () => ({ cancelled: 1, dispatched: 3, suspended: 0 })),
    };

    await expect(scheduleWorkflowTasks({
      limit: 100,
      now: new Date("2026-07-11T00:00:00.000Z"),
      repository,
    })).resolves.toEqual({ cancelled: 1, dispatched: 3, suspended: 0 });
    expect(repository.dispatchDueTasks).toHaveBeenCalledWith({
      limit: 100,
      now: new Date("2026-07-11T00:00:00.000Z"),
    });
  });
});
