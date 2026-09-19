import { describe, expect, it, vi } from "vitest";
import { scheduleWorkflowTasks } from "../src/scheduler.js";

describe("workflow scheduler", () => {
  it.each([
    { availability: { kind: "unavailable" as const } },
    { availability: { available: 0, kind: "available" as const } },
  ])("does not query due Tasks without Redis capacity availability", async ({ availability }) => {
    const repository = {
      dispatchReservedTasks: vi.fn(),
      listDueTaskCandidates: vi.fn(),
      processTaskStatusTransitionBatch: vi.fn(async () => ({
        claimed: false,
        dead: 0,
        failed: 0,
        hasMore: false,
        transitioned: 0,
      })),
    };
    const taskCapacityPort = createCapacityPort({
      availability: vi.fn(async () => availability),
    });

    await expect(scheduleWorkflowTasks({
      ...schedulerInput(repository, taskCapacityPort),
    })).resolves.toMatchObject({ dispatched: 0 });
    expect(repository.listDueTaskCandidates).not.toHaveBeenCalled();
    expect(repository.dispatchReservedTasks).not.toHaveBeenCalled();
  });

  it("reserves capacity before dispatching and releases reservations not dispatched", async () => {
    const callOrder: string[] = [];
    const candidates = [
      { taskId: "task-1", taskVersion: 3, uid: 9 },
      { taskId: "task-2", taskVersion: 7, uid: 10 },
    ];
    const repository = {
      dispatchReservedTasks: vi.fn(async () => {
        callOrder.push("dispatch");
        return { cancelled: 0, dispatched: [candidates[0]!], suspended: 0 };
      }),
      listDueTaskCandidates: vi.fn(async () => {
        callOrder.push("list");
        return candidates;
      }),
      processTaskStatusTransitionBatch: vi.fn(async () => ({
        claimed: false,
        dead: 0,
        failed: 0,
        hasMore: false,
        transitioned: 0,
      })),
    };
    const taskCapacityPort = createCapacityPort({
      availability: vi.fn(async () => {
        callOrder.push("availability");
        return { available: 2, kind: "available" as const };
      }),
      reserve: vi.fn(async input => {
        callOrder.push(`reserve:${input.taskId}`);
        return {
          kind: "reserved" as const,
          lease: { leaseId: `${input.uid}|${input.taskId}|${input.taskVersion}`, token: input.taskId },
        };
      }),
      releaseReservation: vi.fn(async input => {
        callOrder.push(`release:${input.lease.leaseId}`);
      }),
    });

    await expect(scheduleWorkflowTasks({
      ...schedulerInput(repository, taskCapacityPort),
      limit: 10,
    })).resolves.toMatchObject({ dispatched: 1 });

    expect(taskCapacityPort.reserve).toHaveBeenNthCalledWith(1, expect.objectContaining({
      taskId: "task-1",
      taskVersion: 4,
      uid: 9,
    }));
    expect(taskCapacityPort.reserve).toHaveBeenNthCalledWith(2, expect.objectContaining({
      taskId: "task-2",
      taskVersion: 8,
      uid: 10,
    }));
    expect(callOrder).toEqual([
      "availability",
      "list",
      "reserve:task-1",
      "reserve:task-2",
      "dispatch",
      "release:10|task-2|8",
    ]);
  });

  it("releases every reservation when database dispatch fails", async () => {
    const failure = new Error("dispatch unavailable");
    const candidates = [
      { taskId: "task-1", taskVersion: 3, uid: 9 },
      { taskId: "task-2", taskVersion: 7, uid: 10 },
    ];
    const repository = {
      dispatchReservedTasks: vi.fn(async () => { throw failure; }),
      listDueTaskCandidates: vi.fn(async () => candidates),
      processTaskStatusTransitionBatch: vi.fn(async () => ({
        claimed: false,
        dead: 0,
        failed: 0,
        hasMore: false,
        transitioned: 0,
      })),
    };
    const taskCapacityPort = createCapacityPort({
      availability: vi.fn(async () => ({ available: 2, kind: "available" as const })),
      reserve: vi.fn(async input => ({
        kind: "reserved" as const,
        lease: { leaseId: `${input.uid}|${input.taskId}|${input.taskVersion}`, token: input.taskId },
      })),
    });

    await expect(scheduleWorkflowTasks({
      ...schedulerInput(repository, taskCapacityPort),
    })).rejects.toBe(failure);
    expect(taskCapacityPort.releaseReservation).toHaveBeenCalledTimes(2);
  });

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

function schedulerInput(repository: object, taskCapacityPort: ReturnType<typeof createCapacityPort>) {
  return {
    leaseDurationMs: 60_000,
    leaseOwner: "scheduler-1",
    limit: 100,
    maxAttempts: 5,
    now: new Date("2026-07-11T00:00:00.000Z"),
    repository,
    retryDelayMs: 5_000,
    taskCapacityPort,
  };
}

function createCapacityPort(overrides: Partial<{
  availability: ReturnType<typeof vi.fn>;
  releaseReservation: ReturnType<typeof vi.fn>;
  reserve: ReturnType<typeof vi.fn>;
}>) {
  return {
    availability: overrides.availability ?? vi.fn(async () => ({ available: 1, kind: "available" as const })),
    acquire: vi.fn(),
    release: vi.fn(),
    releaseReservation: overrides.releaseReservation ?? vi.fn(),
    renew: vi.fn(),
    reserve: overrides.reserve ?? vi.fn(async () => ({
      kind: "reserved" as const,
      lease: { leaseId: "lease", token: "token" },
    })),
  };
}
