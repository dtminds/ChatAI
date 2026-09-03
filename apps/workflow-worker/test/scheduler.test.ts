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
        return { claimed: true, dead: 0, failed: 0, hasMore: true, transitioned: 1_000 };
      }),
    };

    await expect(scheduleWorkflowTasks({
      leaseDurationMs: 60_000,
      leaseOwner: "scheduler-1",
      limit: 100,
      maxAttempts: 5,
      now: new Date("2026-07-11T00:00:00.000Z"),
      repository,
      retryDelayMs: 5_000,
    })).resolves.toEqual({
      cancelled: 1,
      dispatched: 3,
      suspended: 0,
      taskTransitionClaimed: 1,
      taskTransitionDead: 0,
      taskTransitionFailed: 0,
      taskTransitionHasMore: true,
      taskTransitioned: 1_000,
    });
    expect(repository.processTaskStatusTransitionBatch).toHaveBeenCalledWith({
      leaseExpiresAt: new Date("2026-07-11T00:01:00.000Z"),
      leaseOwner: "scheduler-1",
      limit: 1_000,
      maxAttempts: 5,
      nextAttemptAt: new Date("2026-07-11T00:00:05.000Z"),
      now: new Date("2026-07-11T00:00:00.000Z"),
    });
    expect(repository.dispatchDueTasks).toHaveBeenCalledWith({
      limit: 100,
      now: new Date("2026-07-11T00:00:00.000Z"),
    });
    expect(callOrder).toEqual(["transition", "dispatch"]);
  });

  it("dispatches due Tasks before surfacing a transition infrastructure failure", async () => {
    const failure = new Error("task transition unavailable");
    const callOrder: string[] = [];
    const repository = {
      dispatchDueTasks: vi.fn(async () => {
        callOrder.push("dispatch");
        return { cancelled: 0, dispatched: 2, suspended: 0 };
      }),
      processTaskStatusTransitionBatch: vi.fn(async () => {
        callOrder.push("transition");
        throw failure;
      }),
    };

    await expect(scheduleWorkflowTasks({
      leaseDurationMs: 60_000,
      leaseOwner: "scheduler-1",
      limit: 100,
      maxAttempts: 5,
      now: new Date("2026-07-11T00:00:00.000Z"),
      repository,
      retryDelayMs: 5_000,
    })).rejects.toBe(failure);
    expect(repository.dispatchDueTasks).toHaveBeenCalledWith({
      limit: 100,
      now: new Date("2026-07-11T00:00:00.000Z"),
    });
    expect(callOrder).toEqual(["transition", "dispatch"]);
  });

  it("preserves both errors when transition processing and due dispatch fail", async () => {
    const transitionFailure = new Error("task transition unavailable");
    const dispatchFailure = new Error("due dispatch unavailable");
    const repository = {
      dispatchDueTasks: vi.fn(async () => { throw dispatchFailure; }),
      processTaskStatusTransitionBatch: vi.fn(async () => { throw transitionFailure; }),
    };

    let caught: unknown;
    try {
      await scheduleWorkflowTasks({
        leaseDurationMs: 60_000,
        leaseOwner: "scheduler-1",
        limit: 100,
        maxAttempts: 5,
        now: new Date("2026-07-11T00:00:00.000Z"),
        repository,
        retryDelayMs: 5_000,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual([transitionFailure, dispatchFailure]);
  });
});
